import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import type { IdentityLifecyclePullRequest } from '@/lib/identity/lifecycle-pull-request'
import {
  createIdentityLifecyclePullTransport,
  IdentityLifecyclePullTransportFailure,
  type IdentityLifecyclePullTransportOptions,
} from '@/lib/identity/lifecycle-pull-transport'
import { IdentityLifecycleVerifiedPageTransportFailure } from '@/lib/identity/lifecycle-verified-page-transport'

const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const VERIFICATION_TIME = new Date('2026-08-09T02:01:00.000Z')

function envelopePolicy() {
  return {
    expectedIssuer: 'https://identity.example.test/',
    expectedAudience: 'https://consumer.example.test/auth/events',
    clockSkewSeconds: 30,
    maximumLifetimeSeconds: 180,
    key: {
      keyId: 'identity-events-conformance-v1',
      algorithm: 'ES256' as const,
      publicJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'oWKIvOzecbm5Zwg3fVWCoYamzbO6Sdd97DAMX5qxwiU',
        y: 'c3R-MRMG7D3BUaVJE3Ap6gvxKvOgJG7itnZOx95ezKQ',
      },
    },
  }
}

function jsonResponse(value: string): Response {
  return new Response(value, {
    headers: { 'content-type': 'application/json' },
  })
}

function createOptions(
  responseTransport: {
    execute(request: IdentityLifecyclePullRequest): Promise<Response>
  },
): IdentityLifecyclePullTransportOptions {
  const clientAssertionProvider = {
    async createClientAssertion(input: { consumerId: string; audience: string }) {
      expect(this).toBe(clientAssertionProvider)
      expect(input).toEqual({
        consumerId: 'academy-web',
        audience: 'https://accounts.example.test/v1/lifecycle/pull',
      })
      return ASSERTION
    },
  }
  const responseReader = {
    async read(response: Response) {
      expect(this).toBe(responseReader)
      return readStrictJsonResponse(response, {
        maxBytes: 512,
        maxDepth: 8,
        timeoutMs: 1_000,
      })
    },
  }
  return {
    consumerId: 'academy-web',
    clientAssertionAudience: 'https://accounts.example.test/v1/lifecycle/pull',
    requestedLimit: 2,
    clientAssertionProvider,
    responseTransport,
    responseReader,
    envelopePolicy: envelopePolicy(),
  }
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected pull transport failure')
  } catch (error) {
    return error as Error
  }
}

describe('Academy Identity lifecycle pull transport composition', () => {
  it('composes one exact initial request through strict parsing and page verification', async () => {
    const responseTransport = {
      async execute(request: IdentityLifecyclePullRequest) {
        expect(this).toBe(responseTransport)
        expect(request).toEqual({
          consumerId: 'academy-web',
          clientAssertion: ASSERTION,
          limit: 2,
        })
        return jsonResponse(JSON.stringify({
          envelopes: [],
          nextCursor: null,
          configRevision: 1,
        }))
      },
    }
    const transport = createIdentityLifecyclePullTransport(createOptions(responseTransport))

    await expect(transport.pullVerifiedPage({
      cursor: null,
      verificationTime: VERIFICATION_TIME,
    })).resolves.toEqual({
      nextCursor: null,
      configRevision: 1,
      events: [],
    })
  })

  it('preserves a continued cursor and one shared request limit across every layer', async () => {
    const execute = vi.fn(async (request: IdentityLifecyclePullRequest) => {
      expect(request.cursor).toEqual({ sequence: '41' })
      expect(request.limit).toBe(2)
      return jsonResponse(JSON.stringify({
        envelopes: [],
        nextCursor: { sequence: '41' },
        configRevision: 1,
      }))
    })
    const transport = createIdentityLifecyclePullTransport(createOptions({ execute }))

    await expect(transport.pullVerifiedPage({
      cursor: '41',
      verificationTime: VERIFICATION_TIME,
    })).resolves.toEqual({
      nextCursor: '41',
      configRevision: 1,
      events: [],
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('snapshots every public composition option exactly once', async () => {
    const execute = vi.fn(async () => jsonResponse(JSON.stringify({
      envelopes: [],
      nextCursor: null,
      configRevision: 1,
    })))
    const target = createOptions({ execute })
    const reads = new Map<PropertyKey, number>()
    const input = new Proxy(target, {
      get(object, key, receiver) {
        const count = (reads.get(key) ?? 0) + 1
        reads.set(key, count)
        if (count > 1) throw new Error(`composition option re-read: ${String(key)}`)
        return Reflect.get(object, key, receiver)
      },
    })
    const transport = createIdentityLifecyclePullTransport(input)

    await expect(transport.pullVerifiedPage({
      cursor: null,
      verificationTime: VERIFICATION_TIME,
    })).resolves.toEqual({
      nextCursor: null,
      configRevision: 1,
      events: [],
    })
    expect(Object.fromEntries(reads)).toEqual({
      consumerId: 1,
      clientAssertionAudience: 1,
      requestedLimit: 1,
      clientAssertionProvider: 1,
      responseTransport: 1,
      responseReader: 1,
      envelopePolicy: 1,
    })
  })

  it('fails closed when strict parsing rejects duplicate semantic keys', async () => {
    const transport = createIdentityLifecyclePullTransport(createOptions({
      async execute() {
        return jsonResponse(
          '{"envelopes":[],"nextCursor":null,"configRevision":1,"configRevision":2}',
        )
      },
    }))
    const error = await captureFailure(transport.pullVerifiedPage({
      cursor: null,
      verificationTime: VERIFICATION_TIME,
    }))

    expect(error).toBeInstanceOf(IdentityLifecycleVerifiedPageTransportFailure)
    expect(error.message).toBe('Identity lifecycle verified-page transport failed')
    expect(Object.keys(error)).toEqual([])
  })

  it('fails closed when the parsed page is not bound to the request cursor', async () => {
    const transport = createIdentityLifecyclePullTransport(createOptions({
      async execute() {
        return jsonResponse(JSON.stringify({
          envelopes: [],
          nextCursor: { sequence: '42' },
          configRevision: 1,
        }))
      },
    }))

    await expect(transport.pullVerifiedPage({
      cursor: '41',
      verificationTime: VERIFICATION_TIME,
    })).rejects.toBeInstanceOf(IdentityLifecycleVerifiedPageTransportFailure)
  })

  it('uses one detail-free initialization failure and performs no port work', () => {
    const execute = vi.fn()
    const input = new Proxy(createOptions({ execute }), {
      get(target, key, receiver) {
        if (key === 'requestedLimit') throw new Error('credential=TOP_SECRET')
        return Reflect.get(target, key, receiver)
      },
    })

    expect(() => createIdentityLifecyclePullTransport(input)).toThrow(
      IdentityLifecyclePullTransportFailure,
    )
    try {
      createIdentityLifecyclePullTransport(input)
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityLifecyclePullTransportFailure)
      expect((error as Error).message).toBe('Identity lifecycle pull transport failed')
      expect([String(error), (error as Error).stack ?? '', JSON.stringify(error)].join('\n'))
        .not.toContain('TOP_SECRET')
      expect(Object.keys(error as object)).toEqual([])
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([0, 101, 1.5, Number.NaN])(
    'rejects request limit %s before reading either response port method',
    (requestedLimit) => {
      const responseGet = vi.fn(() => {
        throw new Error('response port must not be read')
      })
      const readerGet = vi.fn(() => {
        throw new Error('reader port must not be read')
      })
      const options = createOptions(new Proxy({}, { get: responseGet }) as {
        execute(request: IdentityLifecyclePullRequest): Promise<Response>
      })
      options.responseReader = new Proxy({}, { get: readerGet }) as typeof options.responseReader
      options.requestedLimit = requestedLimit

      expect(() => createIdentityLifecyclePullTransport(options)).toThrow(
        IdentityLifecyclePullTransportFailure,
      )
      expect(responseGet).not.toHaveBeenCalled()
      expect(readerGet).not.toHaveBeenCalled()
    },
  )

  it('stays framework, network, logger, registry, and runtime wiring free', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/lifecycle-pull-transport.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/\b(?:fetch|Request|Response|console|logger)\b/)
    expect(source).not.toContain('registry')
    expect(source).not.toContain('wrangler')
    expect(source).not.toContain('process.env')
  })
})
