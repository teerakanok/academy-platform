import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET as callbackRoute } from '@/app/(site)/auth/callback/route'
import { POST as startRoute } from '@/app/(site)/api/auth/identity/start/route'
import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from '@/lib/identity/consumer-policy'
import { resetIdentityAdapterForTest } from '@/lib/identity/registry'
import {
  AcademyIdentityRuntimeCompletionFailure,
  AcademyIdentityRuntimeUnavailableError,
  createAcademyIdentityRuntimeCompletion,
} from '@/lib/identity/runtime-completion'
import {
  AcademyIdentityProfileActivationStore,
  type IdentityProfileActivationCommit,
} from '@/lib/identity/profile-activation-store'
import {
  FileIdentitySessionStore,
  type IdentitySessionClaims,
} from '@/lib/identity/session-store'
import { FileIdentityTransactionStore } from '@/lib/identity/transaction'

const roots: string[] = []
const client = {
  clientId: 'academy-web-fixture',
  redirectUri: 'https://academy.example/auth/callback',
  serviceId: 'academy',
  audience: 'https://academy.example',
  expectedIssuer: 'https://identity.example/issuer',
  clientAssertionAudience: 'https://identity.example/v1/code/exchange',
}
const state = 'state_1234567890abcdef'
const code = 'code_1234567890abcdef'
const browserBinding = 'browser_binding_1234567890'
const nonce = 'nonce_1234567890abcdef'
const assertion = `${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(16)}`
const accountId = '123e4567-e89b-42d3-a456-426614174000'
const freshState = 'state_fresh_1234567890abcdef'

afterEach(async () => {
  vi.unstubAllEnvs()
  resetIdentityAdapterForTest()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Academy Identity runtime completion seam', () => {
  it('commits profile activation before creating one Academy session', async () => {
    const fixture = await createFixture()
    const result = await fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    })

    expect(fixture.calls).toEqual(['consume', 'assertion', 'exchange', 'verify', 'activation', 'session'])
    expect(result).toEqual({
      accountId,
      sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{32,160}$/),
      returnPath: '/dashboard',
    })
    expect(fixture.sessionStore.get(result.sessionId)).toEqual(expect.objectContaining({
      issuer: client.expectedIssuer,
      subject: 'principal-subject',
      verifiedEmail: 'learner@example.com',
      activation: { status: 'active', revision: 3 },
    }))
  })

  it('does not activate a profile or create a session when exchange fails', async () => {
    const fixture = await createFixture({ exchangeFailure: true })

    await expect(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    })).rejects.toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
    expect(fixture.calls).toEqual(['consume', 'assertion', 'exchange'])
    expect(fixture.sessionCreates()).toBe(0)
  })

  it('does not activate a profile or create a session when signed-result verification fails', async () => {
    const fixture = await createFixture({ resultVerificationFailure: true })

    await expect(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    })).rejects.toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
    expect(fixture.calls).toEqual(['consume', 'assertion', 'exchange', 'verify'])
    expect(fixture.activationCommits()).toBe(0)
    expect(fixture.sessionCreates()).toBe(0)
  })

  it('keeps the consumed callback one-time when activation fails and never creates a session', async () => {
    const fixture = await createFixture({ activationFailure: true })
    const input = { callbackUrl: callbackUrl(), browserBinding }

    await expect(fixture.runtime.complete(input)).rejects.toBeInstanceOf(
      AcademyIdentityRuntimeCompletionFailure,
    )
    await expect(fixture.runtime.complete(input)).rejects.toBeInstanceOf(
      AcademyIdentityRuntimeCompletionFailure,
    )
    expect(fixture.calls).toEqual([
      'consume', 'assertion', 'exchange', 'verify', 'activation',
      'consume',
    ])
    expect(fixture.sessionCreates()).toBe(0)
  })

  it.each([
    ['issuer', { issuer: 'https://identity.example/other' }],
    ['subject', { subject: 'other-subject' }],
    ['verified email', { verifiedEmail: 'other@example.com' }],
    ['activation status', { activation: { status: 'suspended', revision: 3 } }],
    ['activation revision', { activation: { status: 'active', revision: 4 } }],
  ] as const)('rejects an activation commit with mismatched %s before session creation', async (
    _label,
    mutation,
  ) => {
    const expected = canonicalActivationCommit()
    const fixture = await createFixture({
      activationCommit: {
        ...expected,
        ...mutation,
      } as IdentityProfileActivationCommit,
    })

    await expectFixedCompletionFailure(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    }))
    expect(fixture.calls).toEqual(['consume', 'assertion', 'exchange', 'verify', 'activation'])
    expect(fixture.sessionCreates()).toBe(0)
  })

  it.each([
    ['mismatched claims', (receipt: SessionReceipt) => ({
      ...receipt,
      claims: { ...receipt.claims, subject: 'other-subject' },
    })],
    ['malformed claims', (receipt: SessionReceipt) => ({ id: receipt.id, claims: null })],
  ] as const)('rejects a session receipt with %s', async (_label, mutateReceipt) => {
    const fixture = await createFixture({ sessionReceipt: mutateReceipt })

    await expectFixedCompletionFailure(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    }))
    expect(fixture.calls).toEqual(['consume', 'assertion', 'exchange', 'verify', 'activation', 'session'])
  })

  it('preserves the activation commit when session creation fails and permits only fresh authorization recovery', async () => {
    const fixture = await createFixture({ sessionFailures: 1 })
    const first = { callbackUrl: callbackUrl(), browserBinding }

    await expectFixedCompletionFailure(fixture.runtime.complete(first))
    await expectFixedCompletionFailure(fixture.runtime.complete(first))
    fixture.seedTransaction(freshState)
    const recovered = await fixture.runtime.complete({
      callbackUrl: callbackUrl(freshState),
      browserBinding,
    })

    expect(recovered.accountId).toBe(accountId)
    expect(fixture.calls).toEqual([
      'consume', 'assertion', 'exchange', 'verify', 'activation', 'session',
      'consume',
      'consume', 'assertion', 'exchange', 'verify', 'activation', 'session',
    ])
    expect(fixture.activationCommits()).toBe(2)
    expect(fixture.sessionCreates()).toBe(2)
  })

  it('rejects disabled admission before reading or invoking downstream capabilities', () => {
    let capabilityReads = 0
    const unavailable = () => ({
      get consume() {
        capabilityReads += 1
        throw new Error('must not read')
      },
    })

    expect(() => createAcademyIdentityRuntimeCompletion({
      admission: { enabled: false, runtimeWired: false, releaseApproval: false },
      transactionStore: unavailable(),
      codeExchangePort: unavailable(),
      codeExchangeResultVerifier: unavailable(),
      profileActivationStore: unavailable(),
      sessionStore: unavailable(),
      client,
      clientAssertionProvider: unavailable(),
    })).toThrow(AcademyIdentityRuntimeUnavailableError)
    expect(capabilityReads).toBe(0)
  })

  it('leaves the accepted registry disabled and production routes fail closed', async () => {
    expect(APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.client.enabled).toBe(false)
    expect(APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.client.releaseBlockers).toContain(
      'separate-production-authorization',
    )
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE', '')

    const start = await startRoute(new Request('https://academy.example/api/auth/identity/start', {
      method: 'POST',
    }))
    expect(start.status).toBe(404)

    vi.stubEnv('IDENTITY_ADAPTER', 'identity-control')
    resetIdentityAdapterForTest()
    const callback = await callbackRoute(new Request(callbackUrl().toString()))
    expect(callback.status).toBe(503)
    expect(callback.headers.get('set-cookie')).toBeNull()
  })
})

async function createFixture(options: {
  exchangeFailure?: boolean
  resultVerificationFailure?: boolean
  activationFailure?: boolean
  activationCommit?: IdentityProfileActivationCommit
  sessionFailures?: number
  sessionReceipt?: (receipt: SessionReceipt) => unknown
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'academy-identity-runtime-completion-'))
  roots.push(root)
  const calls: string[] = []
  let sessionCreateCount = 0
  let activationCommitCount = 0
  const transactionStore = new FileIdentityTransactionStore(join(root, 'transactions.json'), {
    now: () => 1_000,
  })
  const seedTransaction = (transactionState: string) => transactionStore.create({
    state: transactionState,
    codeVerifier: 'v'.repeat(43), nonce,
    browserBindingDigest: sha256Base64Url(browserBinding), client, returnPath: '/dashboard',
  })
  seedTransaction(state)
  const sessionStore = new FileIdentitySessionStore(join(root, 'sessions.json'), {
    now: () => 2_000,
  })
  const runtime = createAcademyIdentityRuntimeCompletion({
    admission: { enabled: true, runtimeWired: true, releaseApproval: true },
    transactionStore: {
      consume(callbackState: string, binding: string) {
        calls.push('consume')
        return transactionStore.consume(callbackState, binding)
      },
    },
    codeExchangePort: {
      async exchangeCode() {
        calls.push('exchange')
        if (options.exchangeFailure) throw new Error('exchange detail must not escape')
        return { signedResult: 'fixture.signed.result' }
      },
    },
    codeExchangeResultVerifier: {
      async verify(_value: unknown, binding: {
        expectedAudience: string
        expectedClientId: string
        expectedNonce: string
        expectedPrincipalIssuer: string
        expectedServiceId: string
      }) {
        calls.push('verify')
        expect(binding).toEqual({
          expectedAudience: client.audience,
          expectedClientId: client.clientId,
          expectedNonce: nonce,
          expectedPrincipalIssuer: client.expectedIssuer,
          expectedServiceId: client.serviceId,
        })
        if (options.resultVerificationFailure) throw new Error('verification detail must not escape')
        return {
          issuer: client.expectedIssuer,
          subject: 'principal-subject',
          verifiedEmail: 'Learner@example.com',
          audience: client.audience,
          serviceId: client.serviceId,
          nonce,
          activation: { status: 'active', revision: 3 },
        }
      },
    },
    profileActivationStore: options.activationCommit
      ? {
          async commit() {
            calls.push('activation')
            activationCommitCount += 1
            return options.activationCommit as IdentityProfileActivationCommit
          },
        }
      : new AcademyIdentityProfileActivationStore({
          async rpc() {
            calls.push('activation')
            activationCommitCount += 1
            return options.activationFailure
              ? { data: null, error: { code: 'fixture' } }
              : { data: accountId, error: null }
          },
        }),
    sessionStore: {
      create(input: IdentitySessionClaims) {
        calls.push('session')
        sessionCreateCount += 1
        if (sessionCreateCount <= (options.sessionFailures ?? 0)) {
          throw new Error('session detail must not escape')
        }
        const receipt = sessionStore.create(input)
        return options.sessionReceipt?.(receipt) ?? receipt
      },
    },
    client,
    clientAssertionProvider: {
      async createClientAssertion() {
        calls.push('assertion')
        return assertion
      },
    },
  })
  return {
    calls,
    runtime,
    sessionStore,
    seedTransaction,
    activationCommits: () => activationCommitCount,
    sessionCreates: () => sessionCreateCount,
  }
}

type SessionReceipt = ReturnType<FileIdentitySessionStore['create']>

function canonicalActivationCommit(): IdentityProfileActivationCommit {
  return {
    accountId,
    issuer: client.expectedIssuer,
    subject: 'principal-subject',
    verifiedEmail: 'learner@example.com',
    activation: { status: 'active', revision: 3 },
  }
}

async function expectFixedCompletionFailure(operation: Promise<unknown>): Promise<void> {
  try {
    await operation
    throw new Error('expected completion failure')
  } catch (error) {
    expect(error).toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
    expect((error as Error).message).toBe('Academy Identity runtime completion failed')
    expect(Object.keys(error as object)).toEqual([])
  }
}

function callbackUrl(callbackState = state): URL {
  return new URL(`https://academy.example/auth/callback?code=${code}&state=${callbackState}`)
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}
