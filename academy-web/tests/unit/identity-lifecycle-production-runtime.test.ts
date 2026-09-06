import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createAcademyIdentityLifecyclePullCycleRuntime,
  runAcademyIdentityLifecyclePull,
  projectAcademyIdentityLifecycleProductionConfig,
} from '@/lib/identity/lifecycle-production-runtime'

const ROOT = join(__dirname, '..', '..')
const LIFECYCLE_MIGRATION = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0032_identity_lifecycle_runtime_enforcement.sql'),
  'utf8',
)
const LIFECYCLE_ROLLBACK = readFileSync(
  join(ROOT, 'supabase', 'rollbacks', '0032_identity_lifecycle_runtime_enforcement.rollback.sql'),
  'utf8',
)
const PRIVATE_JWK = await (async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', (pair as CryptoKeyPair).privateKey)
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })
})()
const KEY_SET = await (async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', (pair as CryptoKeyPair).publicKey)
  return JSON.stringify({
    issuer: 'https://supabase.cyberskills.co.th/auth/v1',
    revision: 1,
    keys: [{
      keyId: 'identity-lifecycle-production-test',
      algorithm: 'ES256',
      publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      state: 'active',
    }],
    retiredKeyFingerprints: [],
    retiredKeyIds: [],
  })
})()

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    IDENTITY_LIFECYCLE_ENABLED: 'true',
    IDENTITY_LIFECYCLE_PUBLISHER_ENDPOINT: 'https://identity.example.test/v1/lifecycle/events/pull',
    IDENTITY_LIFECYCLE_CLIENT_ASSERTION_AUDIENCE: 'https://identity.example.test/v1/lifecycle/events/pull',
    IDENTITY_LIFECYCLE_EVENT_AUDIENCE: 'https://academy.cyberskills.co.th/lifecycle/events',
    IDENTITY_LIFECYCLE_CLIENT_ASSERTION_KEY_ID: 'academy-lifecycle-test',
    IDENTITY_LIFECYCLE_CLIENT_ASSERTION_PRIVATE_JWK: PRIVATE_JWK,
    IDENTITY_LIFECYCLE_VERIFICATION_KEY_SET_DOCUMENT: KEY_SET,
    IDENTITY_LIFECYCLE_REQUEST_LIMIT: '50',
    IDENTITY_LIFECYCLE_LEASE_DURATION_MS: '30000',
    IDENTITY_LIFECYCLE_WORKER_ID: 'academy-lifecycle-production-1',
    ...overrides,
  }
}

function dependencies() {
  return {
    academyDb: vi.fn().mockReturnValue({ rpc: vi.fn() }),
    fetch: vi.fn(),
    createSigner: vi.fn().mockResolvedValue({
      clientId: 'academy-web',
      purpose: 'lifecycle_pull',
      keyId: 'academy-lifecycle-test',
      sign: vi.fn(),
    }),
    now: vi.fn(() => new Date('2026-09-06T00:00:00Z')),
  }
}

describe('Academy Identity lifecycle production pull runtime', () => {
  it('uses supplied Worker database bindings without process.env population', async () => {
    vi.stubEnv('ACADEMY_DATA_API_URL', undefined)
    vi.stubEnv('ACADEMY_DATA_API_JWT_SECRET', undefined)
    try {
      const deps = dependencies()
      const runtime = await createAcademyIdentityLifecyclePullCycleRuntime({
        environment: environment({
          ACADEMY_DATA_API_URL: 'https://academy-data.example.test',
          ACADEMY_DATA_API_JWT_SECRET: 'test-only-signing-secret-with-at-least-32-bytes',
        }),
        dependencies: { createSigner: deps.createSigner, fetch: deps.fetch, now: deps.now },
      })
      expect(runtime).toBeTypeOf('function')
      expect(deps.fetch).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('does not fall back to ambient database credentials when supplied bindings are absent', async () => {
    vi.stubEnv('ACADEMY_DATA_API_URL', 'https://ambient.example.test')
    vi.stubEnv('ACADEMY_DATA_API_JWT_SECRET', 'test-only-ambient-secret-with-at-least-32-bytes')
    try {
      const deps = dependencies()
      await expect(createAcademyIdentityLifecyclePullCycleRuntime({
        environment: environment(),
        dependencies: { createSigner: deps.createSigner, fetch: deps.fetch, now: deps.now },
      })).rejects.toThrow('Identity lifecycle runtime initialization failed')
      expect(deps.fetch).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('fails closed until every exact producer-approved runtime value is present', () => {
    for (const key of [
      'IDENTITY_LIFECYCLE_ENABLED',
      'IDENTITY_LIFECYCLE_PUBLISHER_ENDPOINT',
      'IDENTITY_LIFECYCLE_CLIENT_ASSERTION_AUDIENCE',
      'IDENTITY_LIFECYCLE_EVENT_AUDIENCE',
      'IDENTITY_LIFECYCLE_CLIENT_ASSERTION_KEY_ID',
      'IDENTITY_LIFECYCLE_CLIENT_ASSERTION_PRIVATE_JWK',
      'IDENTITY_LIFECYCLE_VERIFICATION_KEY_SET_DOCUMENT',
      'IDENTITY_LIFECYCLE_WORKER_ID',
    ]) {
      expect(projectAcademyIdentityLifecycleProductionConfig(environment({ [key]: undefined }))).toBeNull()
    }
  })

  it('pins the canonical producer issuer and rejects a mismatched verification set', () => {
    const config = projectAcademyIdentityLifecycleProductionConfig(environment())
    expect(config?.envelopePolicy.expectedIssuer).toBe('https://supabase.cyberskills.co.th/auth/v1')

    const mismatched = JSON.parse(KEY_SET) as Record<string, unknown>
    mismatched.issuer = 'https://attacker.example/'
    expect(projectAcademyIdentityLifecycleProductionConfig(environment({
      IDENTITY_LIFECYCLE_VERIFICATION_KEY_SET_DOCUMENT: JSON.stringify(mismatched),
    }))).toBeNull()
  })

  it('composes the durable store, leased cycle, purpose-bound assertion, and strict transport', async () => {
    const deps = dependencies()
    const runtime = await createAcademyIdentityLifecyclePullCycleRuntime({
      environment: environment(),
      dependencies: deps,
    })

    expect(runtime).not.toBeNull()
    expect(deps.academyDb).toHaveBeenCalledTimes(1)
    expect(deps.createSigner).toHaveBeenCalledWith({
      clientId: 'academy-web',
      purpose: 'lifecycle_pull',
      keyId: 'academy-lifecycle-test',
      privateJwk: PRIVATE_JWK,
    })
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('reconciles the source-pinned approved config revision before claiming a pull lease', async () => {
    const deps = dependencies()
    const rpc = vi.fn(async (
      functionName: string,
      _parameters: Record<string, unknown>,
    ) => {
      void _parameters
      if (functionName === 'approve_identity_lifecycle_config_revision') {
        return { data: false, error: null }
      }
      if (functionName === 'claim_identity_lifecycle_pull_lease') {
        return { data: null, error: null }
      }
      throw new Error('unexpected RPC')
    })
    deps.academyDb.mockReturnValue({ rpc })
    const runtime = await createAcademyIdentityLifecyclePullCycleRuntime({
      environment: environment(),
      dependencies: deps,
    })

    await expect(runtime?.()).resolves.toEqual({ outcome: 'lease_busy' })
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual([
      'approve_identity_lifecycle_config_revision',
      'claim_identity_lifecycle_pull_lease',
    ])
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_approved_revision: 1 })
  })

  it('makes an explicit enabled-but-incomplete production schedule fail loudly and closed', async () => {
    await expect(runAcademyIdentityLifecyclePull(environment({
      IDENTITY_LIFECYCLE_EVENT_AUDIENCE: undefined,
    }))).rejects.toThrow('Identity lifecycle production configuration is incomplete')
  })

  it('keeps an absent rollout flag disabled without constructing dependencies', async () => {
    const deps = dependencies()
    await expect(createAcademyIdentityLifecyclePullCycleRuntime({
      environment: environment({ IDENTITY_LIFECYCLE_ENABLED: undefined }),
      dependencies: deps,
    })).resolves.toBeNull()
    expect(deps.academyDb).not.toHaveBeenCalled()
    expect(deps.createSigner).not.toHaveBeenCalled()
  })

  it('surfaces sanitized enabled-runtime initialization failures', async () => {
    const signerFailure = dependencies()
    signerFailure.createSigner.mockRejectedValueOnce(
      new Error('private-key-material-must-never-escape'),
    )
    await expect(createAcademyIdentityLifecyclePullCycleRuntime({
      environment: environment(),
      dependencies: signerFailure,
    })).rejects.toThrow('Identity lifecycle runtime initialization failed')

    const databaseFailure = dependencies()
    databaseFailure.academyDb.mockImplementationOnce(() => {
      throw new Error('database-credential-must-never-escape')
    })
    await expect(createAcademyIdentityLifecyclePullCycleRuntime({
      environment: environment(),
      dependencies: databaseFailure,
    })).rejects.toThrow('Identity lifecycle runtime initialization failed')
  })

  it('keeps lifecycle authorization enforcement fail-closed during rollback', () => {
    expect(LIFECYCLE_MIGRATION).toMatch(/p_configuration_health = 'ready'/)
    expect(LIFECYCLE_ROLLBACK).toMatch(/raise exception[^]*rollback[^]*blocked/i)
    expect(LIFECYCLE_ROLLBACK).not.toMatch(/on conflict \(issuer, subject\) do update/i)
    expect(LIFECYCLE_ROLLBACK).not.toMatch(
      /drop function if exists academy\.identity_lifecycle_allows_profile_activation/i,
    )
  })

  it('wires the production Worker schedule without retaining the deletion capability in the app Worker', () => {
    const worker = readFileSync(join(ROOT, 'worker.ts'), 'utf8')
    const config = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')

    expect(worker).toContain('runAcademyIdentityLifecyclePull')
    expect(worker).toContain('async scheduled(')
    expect(worker).not.toContain('ACADEMY_RETENTION_API_JWT_SECRET')
    expect(config).toContain('"crons": ["*/5 * * * *"]')
  })
})
