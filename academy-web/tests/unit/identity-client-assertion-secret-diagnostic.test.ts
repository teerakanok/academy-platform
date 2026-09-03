import { createHash, generateKeyPairSync, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createIdentityClientAssertionSecretDiagnosticWorker,
  IDENTITY_SECRET_DIAGNOSTIC,
  runIdentityClientAssertionSecretDiagnostic,
} from '../../worker/identity-client-assertion-secret-diagnostic'

const VERSION_ID = '11111111-1111-4111-8111-111111111111'
const DIAGNOSTIC_NONCE = 'N'.repeat(43)
const NOW = new Date('2026-09-03T00:00:00.000Z')
const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const exported = pair.privateKey.export({ format: 'jwk' })
const privateJwk = JSON.stringify({
  kty: exported.kty,
  crv: exported.crv,
  x: exported.x,
  y: exported.y,
  d: exported.d,
})
const publicJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: exported.x,
  y: exported.y,
  use: 'sig',
  key_ops: ['verify'],
}
const publicFingerprint = createHash('sha256').update(JSON.stringify(sortObject(publicJwk))).digest('hex')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Worker-resident Identity client assertion secret diagnostic', () => {
  it('proves import, exact fingerprint, local signature, and one admission request', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const publicKey = await webcrypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    let calls = 0
    const marker = await runIdentityClientAssertionSecretDiagnostic(privateJwk, {
      expectedPublicJwkSha256: publicFingerprint,
      now: () => NOW,
      randomOpaque: sequence('A'.repeat(43), 'B'.repeat(43)),
      fetchPort: async (url, init) => {
        calls += 1
        expect(url).toBe('https://accounts.cyberskills.co.th/v1/code/exchange')
        expect(init?.method).toBe('POST')
        expect(init?.redirect).toBe('manual')
        const body = JSON.parse(String(init?.body))
        expect(Object.keys(body).sort()).toEqual([
          'clientAssertion', 'clientId', 'code', 'codeVerifier', 'redirectUri',
        ])
        expect(body).toMatchObject({
          clientId: 'academy-web',
          redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
          code: 'A'.repeat(43),
          codeVerifier: 'B'.repeat(43),
        })
        const [header, claims, signature] = body.clientAssertion.split('.')
        expect(decodeJson(header)).toEqual({ alg: 'ES256', kid: 'academy-prod-2026-08', typ: 'JWT' })
        expect(decodeJson(claims)).toEqual({
          aud: 'https://accounts.cyberskills.co.th/v1/code/exchange',
          exp: 1_788_393_720,
          iat: 1_788_393_600,
          iss: 'academy-web',
          jti: 'academy-custody-recovery-20260903-admission-v1',
          sub: 'academy-web',
        })
        expect(await webcrypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          publicKey,
          Buffer.from(signature, 'base64url'),
          new TextEncoder().encode(`${header}.${claims}`),
        )).toBe(true)
        return response(404, { error: 'code_not_found' })
      },
    })
    expect(marker).toBe('PASS_CODE_NOT_FOUND')
    expect(calls).toBe(1)
  })

  it.each([
    ['missing binding', undefined, 'FAIL_BINDING'],
    ['noncanonical input', `${privateJwk}\n\n`, 'FAIL_IMPORT'],
    ['wrong registered fingerprint', privateJwk, 'FAIL_FINGERPRINT'],
  ])('fails at %s without provider traffic', async (_label, value, expected) => {
    vi.stubGlobal('crypto', webcrypto)
    const fetchPort = vi.fn()
    expect(await runIdentityClientAssertionSecretDiagnostic(value, {
      expectedPublicJwkSha256: expected === 'FAIL_FINGERPRINT' ? '0'.repeat(64) : publicFingerprint,
      fetchPort,
    })).toBe(expected)
    expect(fetchPort).not.toHaveBeenCalled()
  })

  it('classifies a syntactically valid key with a foreign scalar as an import failure', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })
    const mismatched = JSON.stringify({ ...JSON.parse(privateJwk), d: other.d })
    const fetchPort = vi.fn()
    expect(await runIdentityClientAssertionSecretDiagnostic(mismatched, {
      expectedPublicJwkSha256: publicFingerprint,
      fetchPort,
    })).toBe('FAIL_IMPORT')
    expect(fetchPort).not.toHaveBeenCalled()
  })

  it('distinguishes sign/verify failure and assertion construction without traffic', async () => {
    const subtle = {
      digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
      importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
      sign: webcrypto.subtle.sign.bind(webcrypto.subtle),
      verify: async () => false,
    } as unknown as SubtleCrypto
    vi.stubGlobal('crypto', { subtle })
    const fetchPort = vi.fn()
    expect(await runIdentityClientAssertionSecretDiagnostic(privateJwk, {
      expectedPublicJwkSha256: publicFingerprint,
      fetchPort,
    })).toBe('FAIL_SIGN_VERIFY')
    expect(fetchPort).not.toHaveBeenCalled()

    vi.stubGlobal('crypto', webcrypto)
    expect(await runIdentityClientAssertionSecretDiagnostic(privateJwk, {
      expectedPublicJwkSha256: publicFingerprint,
      randomOpaque: () => 'invalid',
      fetchPort,
    })).toBe('FAIL_ASSERTION')
    expect(fetchPort).not.toHaveBeenCalled()
  })

  it('accepts only exact 404 code_not_found and never retries or reflects a response', async () => {
    vi.stubGlobal('crypto', webcrypto)
    for (const providerResponse of [
      response(401, { error: 'client_authentication_failed' }),
      response(404, { error: 'code_not_found', detail: 'forbidden' }),
      response(500, { error: 'internal_error' }),
      response(404, 'x'.repeat(513)),
    ]) {
      let calls = 0
      expect(await runIdentityClientAssertionSecretDiagnostic(privateJwk, {
        expectedPublicJwkSha256: publicFingerprint,
        randomOpaque: sequence('C'.repeat(43), 'D'.repeat(43)),
        fetchPort: async () => {
          calls += 1
          return providerResponse
        },
      })).toBe('FAIL_ADMISSION')
      expect(calls).toBe(1)
    }

    let calls = 0
    expect(await runIdentityClientAssertionSecretDiagnostic(privateJwk, {
      expectedPublicJwkSha256: publicFingerprint,
      randomOpaque: sequence('E'.repeat(43), 'F'.repeat(43)),
      fetchPort: async () => {
        calls += 1
        throw new Error('sensitive-provider-detail-must-not-escape')
      },
    })).toBe('FAIL_ADMISSION')
    expect(calls).toBe(1)
  })

  it('admits only a bodyless same-origin Access request bound to its candidate version', async () => {
    const run = vi.fn(async () => 'PASS_CODE_NOT_FOUND' as const)
    const worker = createIdentityClientAssertionSecretDiagnosticWorker(run)
    const valid = request()
    const environment = {
      IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: 'protected-value-not-inspected-by-handler-test',
      ACADEMY_IDENTITY_DIAGNOSTIC_NONCE: DIAGNOSTIC_NONCE,
      CF_VERSION_METADATA: { id: VERSION_ID },
    }
    const accepted = await worker.fetch(valid, environment, {})
    expect(accepted.status).toBe(200)
    expect(await accepted.text()).toBe('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=PASS_CODE_NOT_FOUND\n')
    expect(run).toHaveBeenCalledTimes(1)

    for (const rejected of [
      request({ url: `https://cyberskills-academy.example.workers.dev${IDENTITY_SECRET_DIAGNOSTIC.path}` }),
      request({ headers: { 'cf-access-jwt-assertion': '' } }),
      request({ headers: { 'x-academy-diagnostic-nonce': '' } }),
      request({ headers: { 'x-academy-diagnostic-nonce': 'M'.repeat(43) } }),
      request({ headers: { 'x-academy-diagnostic-version': '22222222-2222-4222-8222-222222222222' } }),
      request({ headers: { origin: 'https://example.invalid' } }),
      request({ headers: { 'sec-fetch-site': 'cross-site' } }),
      request({ body: 'not-empty' }),
      new Request(`https://academy.cyberskills.co.th${IDENTITY_SECRET_DIAGNOSTIC.path}`, { method: 'GET' }),
    ]) {
      const denied = await worker.fetch(rejected, environment, {})
      expect(denied.status).toBe(404)
      expect(await denied.text()).toBe('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=DENIED\n')
    }
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('uses a bodyless HEAD marker for candidate readiness without reading the JWK or calling Identity', async () => {
    const run = vi.fn(async () => 'PASS_CODE_NOT_FOUND' as const)
    const worker = createIdentityClientAssertionSecretDiagnosticWorker(run)
    const environment = {
      IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: 'protected-value-not-inspected-by-handler-test',
      ACADEMY_IDENTITY_DIAGNOSTIC_NONCE: DIAGNOSTIC_NONCE,
      CF_VERSION_METADATA: { id: VERSION_ID },
    }

    const ready = await worker.fetch(request({ method: 'HEAD' }), environment, {})
    expect(ready.status).toBe(204)
    expect(ready.body).toBeNull()
    expect(ready.headers.get('cache-control')).toBe('no-store')
    expect(ready.headers.get('x-academy-identity-diagnostic-ready')).toBe('v1')
    expect(run).not.toHaveBeenCalled()

    const denied = await worker.fetch(request({
      method: 'HEAD',
      headers: { 'x-academy-diagnostic-nonce': 'M'.repeat(43) },
    }), environment, {})
    expect(denied.status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps the candidate least-privilege, non-preview, non-observable, and secret-only', () => {
    const config = JSON.parse(readFileSync(new URL(
      '../../wrangler.identity-client-assertion-diagnostic.jsonc',
      import.meta.url,
    ), 'utf8'))
    expect(config).toMatchObject({
      main: 'worker/identity-client-assertion-secret-diagnostic-entry.ts',
      name: 'cyberskills-academy',
      compatibility_flags: ['global_fetch_strictly_public'],
      limits: { cpu_ms: 500 },
      preview_urls: false,
      observability: { enabled: false },
      version_metadata: { binding: 'CF_VERSION_METADATA' },
      secrets: { required: [
        'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK',
        'ACADEMY_IDENTITY_DIAGNOSTIC_NONCE',
      ] },
    })
    for (const forbidden of [
      'assets', 'd1_databases', 'durable_objects', 'hyperdrive', 'kv_namespaces',
      'queues', 'r2_buckets', 'routes', 'services', 'vars',
    ]) expect(config).not.toHaveProperty(forbidden)
  })

  it('has fixed markers and no logging or secret-bearing response construction', () => {
    const source = readFileSync(new URL(
      '../../worker/identity-client-assertion-secret-diagnostic.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/console\.|\.stack|error\.message|JSON\.stringify\(privateJwk|privateJwkText\}/)
    expect(source).toContain('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=${marker}')
    expect(source).toContain("'cache-control': 'no-store'")
  })

  it('preserves the existing Durable Object class export without adding a diagnostic binding', () => {
    const entrypoint = readFileSync(new URL(
      '../../worker/identity-client-assertion-secret-diagnostic-entry.ts',
      import.meta.url,
    ), 'utf8')
    const durableObject = readFileSync(new URL(
      '../../worker/edge-rate-limiter-do.ts',
      import.meta.url,
    ), 'utf8')
    const config = JSON.parse(readFileSync(new URL(
      '../../wrangler.identity-client-assertion-diagnostic.jsonc',
      import.meta.url,
    ), 'utf8'))

    expect(entrypoint).toBe(
      "export { EdgeRateLimiter } from './edge-rate-limiter-do'\n"
      + "export { default } from './identity-client-assertion-secret-diagnostic'\n",
    )
    expect(durableObject).toMatch(/export class EdgeRateLimiter extends DurableObject/)
    expect(config).not.toHaveProperty('durable_objects')
  })
})

function request(overrides: {
  url?: string
  method?: 'GET' | 'HEAD' | 'POST'
  headers?: Record<string, string>
  body?: string
} = {}): Request {
  return new Request(
    overrides.url ?? `https://academy.cyberskills.co.th${IDENTITY_SECRET_DIAGNOSTIC.path}`,
    {
      method: overrides.method ?? 'POST',
      headers: {
        origin: 'https://academy.cyberskills.co.th',
        'sec-fetch-site': 'same-origin',
        'cf-access-jwt-assertion': 'eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJhY2FkZW15In0.c2lnbmF0dXJl',
        'x-academy-diagnostic-version': VERSION_ID,
        'x-academy-diagnostic-operation': IDENTITY_SECRET_DIAGNOSTIC.requestMarker,
        'x-academy-diagnostic-nonce': DIAGNOSTIC_NONCE,
        ...overrides.headers,
      },
      body: overrides.body,
    },
  )
}

function response(status: number, body: unknown, contentType = 'application/json'): Response {
  const result = new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  })
  Object.defineProperty(result, 'url', {
    value: 'https://accounts.cyberskills.co.th/v1/code/exchange',
  })
  return result
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function sequence(...values: string[]): () => string {
  return () => {
    const value = values.shift()
    if (!value) throw new Error('sequence exhausted')
    return value
  }
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, part]) => [key, sortObject(part)]))
  }
  return value
}
