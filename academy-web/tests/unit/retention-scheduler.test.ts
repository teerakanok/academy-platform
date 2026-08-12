import { describe, expect, it, vi } from 'vitest'
import retentionWorker from '../../ops/academy-retention-worker/worker'
import {
  MAX_ROUNDS,
  issueRetentionToken,
  retentionApiBase,
  runPurgeJob,
  runRetention,
  type PurgeJob,
} from '../../ops/academy-retention-worker/retention'

const secret = 'retention-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz'
const env = {
  ACADEMY_RETENTION_API_URL: 'http://127.0.0.1:3102',
  ACADEMY_RETENTION_API_JWT_SECRET: secret,
}
const attempts: PurgeJob = { name: 'attempts', rpc: 'run_retention_attempts' }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function byteStream(source: UnderlyingByteSource): ReadableStream<Uint8Array> {
  const ByteReadableStream = ReadableStream as unknown as {
    new (underlyingSource: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  return new ByteReadableStream(source)
}

describe('Academy retention scheduler', () => {
  it('mints only the retention role and audience', async () => {
    const token = await issueRetentionToken(secret, new Date('2026-08-05T00:00:00.000Z'))
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    expect(payload).toMatchObject({ role: 'academy_retention', aud: 'academy-retention-api', iat: 1_785_888_000 })
    expect(payload.exp).toBe(payload.iat + 60)
  })

  it('accepts only exact HTTPS origins or local loopback', () => {
    expect(retentionApiBase('https://academy-retention.cyberskills.co.th').origin).toBe('https://academy-retention.cyberskills.co.th')
    expect(retentionApiBase('http://127.0.0.1:3102').port).toBe('3102')
    for (const raw of ['http://example.test', 'https://academy-retention.cyberskills.co.th/path', 'https://user@example.test', 'https://example.test?x=1']) {
      expect(() => retentionApiBase(raw)).toThrow()
    }
  })

  it('uses canonical no-argument wrapper RPCs and stops at zero', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(2))
      .mockResolvedValueOnce(json(0))
    await expect(runPurgeJob(env, attempts, { fetcher })).resolves.toEqual({ rounds: 2, deleted: 2 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit]
    expect(url.pathname).toBe('/rpc/run_retention_attempts')
    expect(init.body).toBe('{}')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' })
  })

  it('fails on a timeout or non-integer API result', async () => {
    const timedOutFetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await expect(runPurgeJob(env, attempts, { fetcher: timedOutFetcher, timeoutMs: 1 })).rejects.toThrow('request timed out')
    await expect(runPurgeJob(env, attempts, { fetcher: vi.fn().mockResolvedValue(json('1')) })).rejects.toThrow('invalid deletion count')
  })

  it('keeps the deadline active while reading the response body', async () => {
    let cancels = 0
    const response = new Response(byteStream({
      type: 'bytes',
      pull() {
        // Headers arrived, but the body never makes progress or closes.
      },
      cancel() {
        cancels += 1
      },
    }), { headers: { 'content-type': 'application/json' } })

    const outcome = await Promise.race([
      runPurgeJob(env, attempts, {
        fetcher: vi.fn().mockResolvedValue(response),
        timeoutMs: 5,
      }).then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({
          kind: 'rejected' as const,
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
      new Promise<{ kind: 'pending' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'pending' }), 80)
      }),
    ])

    expect(outcome).toMatchObject({ kind: 'rejected', message: expect.stringContaining('request timed out') })
    expect(cancels).toBe(1)
    expect(response.body?.locked).toBe(false)
  })

  it.each([
    ['oversized body', new Response(`${' '.repeat(65)}0`, { headers: { 'content-type': 'application/json' } })],
    ['wrong media type', new Response('0', { headers: { 'content-type': 'text/plain' } })],
  ])('rejects an invalid bounded deletion-count response: %s', async (_label, response) => {
    await expect(runPurgeJob(env, attempts, {
      fetcher: vi.fn().mockResolvedValue(response),
    })).rejects.toThrow('invalid deletion count')
  })

  it('continues independent jobs, then exposes aggregate failure', async () => {
    const completed = vi.fn()
    const warned = vi.fn()
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(input.toString()).pathname
      return Promise.resolve(path.endsWith('/first') ? json({ error: 'nope' }, 503) : json(0))
    })
    await expect(runRetention(env, { fetcher, logger: { log: completed, warn: warned } }, [
      { name: 'first', rpc: 'first' },
      { name: 'second', rpc: 'second' },
    ])).rejects.toThrow('first:')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(completed).toHaveBeenCalledWith(expect.stringContaining('"job":"second"'))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('"event":"retention.purge_failed"'))
  })

  it('fails an unfinished bounded backlog and keeps the scheduler worker closed to fetch traffic', async () => {
    const warn = vi.fn()
    const fetcher = vi.fn(() => Promise.resolve(json(1)))
    await expect(runPurgeJob(env, attempts, { fetcher, logger: { log: vi.fn(), warn } })).rejects.toThrow(
      `backlog remains after ${MAX_ROUNDS} rounds and ${MAX_ROUNDS} deletions`,
    )
    expect(fetcher).toHaveBeenCalledTimes(MAX_ROUNDS)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retention.backlog_remaining'))
    expect(retentionWorker.fetch(new Request('https://worker.test/'))).toMatchObject({ status: 404 })
  })

  it('continues after backlog exhaustion but never reports that job as complete', async () => {
    const completed = vi.fn()
    const warned = vi.fn()
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(input.toString()).pathname
      return Promise.resolve(path.endsWith('/first') ? json(1) : json(0))
    })

    await expect(runRetention(env, { fetcher, logger: { log: completed, warn: warned } }, [
      { name: 'first', rpc: 'first' },
      { name: 'second', rpc: 'second' },
    ])).rejects.toThrow('first:')

    expect(fetcher).toHaveBeenCalledTimes(MAX_ROUNDS + 1)
    expect(completed.mock.calls.map(([event]) => JSON.parse(event as string))).toEqual([
      { event: 'retention.purge_complete', job: 'second', rounds: 1, deleted: 0 },
    ])
    expect(warned.mock.calls.map(([event]) => JSON.parse(event as string))).toEqual([
      { event: 'retention.backlog_remaining', job: 'first', deleted: MAX_ROUNDS, rounds: MAX_ROUNDS },
      {
        event: 'retention.purge_failed',
        job: 'first',
        error: `[retention/first] backlog remains after ${MAX_ROUNDS} rounds and ${MAX_ROUNDS} deletions`,
      },
    ])
  })
})
