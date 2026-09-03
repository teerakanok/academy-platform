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
  isRetryableAcademyIdentityRuntimeCompletionFailure,
} from '@/lib/identity/runtime-completion'
import {
  AcademyIdentityProfileActivationStore,
  type IdentityProfileActivationCommit,
} from '@/lib/identity/profile-activation-store'
import {
  FileIdentitySessionStore,
  type IdentitySessionClaims,
} from '@/lib/identity/session-store'
import { IdentityTransactionError, type PendingIdentityTransaction } from '@/lib/identity/transaction'

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

    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint', 'activation', 'session', 'finalize',
    ])
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
    expect(fixture.calls).toEqual(['claim', 'assertion', 'exchange', 'release:code_exchange'])
    expect(fixture.sessionCreates()).toBe(0)
  })

  it('keeps a transient claim failure retryable without touching downstream capabilities', async () => {
    const fixture = await createFixture({ claimFailures: 1 })
    const input = { callbackUrl: callbackUrl(), browserBinding }

    const failure = await captureCompletionFailure(fixture.runtime.complete(input))
    expect(isRetryableAcademyIdentityRuntimeCompletionFailure(failure)).toBe(true)
    await expect(fixture.runtime.complete(input)).resolves.toMatchObject({ accountId })
    expect(fixture.calls).toEqual([
      'claim',
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint', 'activation', 'session', 'finalize',
    ])
  })

  it.each([
    ['client binding', { transactionClientId: 'different-client' }, ['claim', 'release:client_binding']],
    ['client assertion', { assertionFailures: 1 }, ['claim', 'assertion', 'release:client_assertion']],
  ] as const)('records the fixed %s pre-exchange stage without consuming state', async (
    _label,
    options,
    expectedCalls,
  ) => {
    const fixture = await createFixture(options)

    const failure = await captureCompletionFailure(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    }))

    expect(isRetryableAcademyIdentityRuntimeCompletionFailure(failure)).toBe(true)
    expect(fixture.calls).toEqual(expectedCalls)
    expect(fixture.sessionCreates()).toBe(0)
  })

  it('does not activate a profile or create a session when signed-result verification fails', async () => {
    const fixture = await createFixture({ resultVerificationFailure: true })

    await expect(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    })).rejects.toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
    expect(fixture.calls).toEqual(['claim', 'assertion', 'exchange', 'verify', 'release:result_verification'])
    expect(fixture.activationCommits()).toBe(0)
    expect(fixture.sessionCreates()).toBe(0)
  })

  it('retries local activation without exchanging the one-time provider code twice', async () => {
    const fixture = await createFixture({ activationFailures: 1 })
    const input = { callbackUrl: callbackUrl(), browserBinding }

    await expect(fixture.runtime.complete(input)).rejects.toBeInstanceOf(
      AcademyIdentityRuntimeCompletionFailure,
    )
    await expect(fixture.runtime.complete(input)).resolves.toMatchObject({ accountId })
    await expect(fixture.runtime.complete(input)).resolves.toMatchObject({ accountId })
    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint', 'activation', 'release:profile_activation',
      'claim', 'activation', 'session', 'finalize',
      'claim',
    ])
    expect(fixture.sessionCreates()).toBe(1)
    expect(fixture.exchanges()).toBe(1)
  })

  it.each([
    ['issuer', { issuer: 'https://identity.example/other' }],
    ['audience', { audience: 'https://other.example' }],
    ['service', { serviceId: 'other-service' }],
    ['nonce', { nonce: 'other_nonce_1234567890' }],
  ] as const)('rejects a checkpointed result with mismatched %s before local activation', async (
    _label,
    mutation,
  ) => {
    const fixture = await createFixture({
      checkpointedResult: { ...verifiedResult(), ...mutation },
    })

    await expectFixedCompletionFailure(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    }))
    expect(fixture.calls).toEqual(['claim', 'release:client_binding'])
    expect(fixture.activationCommits()).toBe(0)
    expect(fixture.sessionCreates()).toBe(0)
    expect(fixture.exchanges()).toBe(0)
  })

  it('recovers a lost checkpoint response from the durable verified result', async () => {
    const fixture = await createFixture({ checkpointFailures: 1 })
    const input = { callbackUrl: callbackUrl(), browserBinding }

    await expectFixedCompletionFailure(fixture.runtime.complete(input))
    await expect(fixture.runtime.complete(input)).resolves.toMatchObject({ accountId })

    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint', 'release:result_checkpoint',
      'claim', 'activation', 'session', 'finalize',
    ])
    expect(fixture.exchanges()).toBe(1)
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
    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint',
      'activation', 'release:profile_activation',
    ])
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
    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint',
      'activation', 'session', 'release:session_creation',
    ])
  })

  it('retains the same authorization when session creation fails and finalizes exactly once after retry', async () => {
    const fixture = await createFixture({ sessionFailures: 1 })
    const first = { callbackUrl: callbackUrl(), browserBinding }

    await expectFixedCompletionFailure(fixture.runtime.complete(first))
    const recovered = await fixture.runtime.complete(first)
    await expect(fixture.runtime.complete(first)).resolves.toMatchObject({ accountId })

    expect(recovered.accountId).toBe(accountId)
    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint',
      'activation', 'session', 'release:session_creation',
      'claim', 'activation', 'session', 'finalize',
      'claim',
    ])
    expect(fixture.activationCommits()).toBe(2)
    expect(fixture.sessionCreates()).toBe(2)
    expect(fixture.exchanges()).toBe(1)
  })

  it('records transaction_finalize and retains state when finalization fails after session activation', async () => {
    const fixture = await createFixture({ finalizeFailures: 1 })

    const failure = await captureCompletionFailure(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    }))

    expect(isRetryableAcademyIdentityRuntimeCompletionFailure(failure)).toBe(true)
    await expect(fixture.runtime.complete({
      callbackUrl: callbackUrl(),
      browserBinding,
    })).resolves.toMatchObject({ accountId })
    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint', 'activation', 'session',
      'finalize', 'release:transaction_finalize',
      'claim',
    ])
    expect(fixture.sessionCreates()).toBe(1)
    expect(fixture.exchanges()).toBe(1)
  })

  it('reuses the stable session after a committed create response is lost', async () => {
    const fixture = await createFixture({ sessionResponseLosses: 1 })
    const input = { callbackUrl: callbackUrl(), browserBinding }

    await expectFixedCompletionFailure(fixture.runtime.complete(input))
    const recovered = await fixture.runtime.complete(input)

    expect(fixture.calls).toEqual([
      'claim', 'assertion', 'exchange', 'verify', 'checkpoint',
      'activation', 'session', 'release:session_creation',
      'claim', 'activation', 'session', 'finalize',
    ])
    expect(fixture.sessionStore.get(recovered.sessionId)).not.toBeNull()
    expect(fixture.exchanges()).toBe(1)
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
    expect(callback.status).toBe(303)
    expect(new URL(callback.headers.get('location') ?? '').searchParams.get('notice')).toBe('identity-unavailable')
    expect(callback.headers.get('set-cookie')).toBeNull()
  })
})

async function createFixture(options: {
  exchangeFailure?: boolean
  claimFailures?: number
  assertionFailures?: number
  checkpointFailures?: number
  checkpointedResult?: ReturnType<typeof verifiedResult>
  finalizeFailures?: number
  transactionClientId?: string
  resultVerificationFailure?: boolean
  activationFailures?: number
  activationCommit?: IdentityProfileActivationCommit
  sessionFailures?: number
  sessionResponseLosses?: number
  sessionReceipt?: (receipt: SessionReceipt) => unknown
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'academy-identity-runtime-completion-'))
  roots.push(root)
  const calls: string[] = []
  let sessionCreateCount = 0
  let exchangeCount = 0
  let activationCommitCount = 0
  let activationFailures = options.activationFailures ?? 0
  let claimFailures = options.claimFailures ?? 0
  let assertionFailures = options.assertionFailures ?? 0
  let checkpointFailures = options.checkpointFailures ?? 0
  let finalizeFailures = options.finalizeFailures ?? 0
  const transactions = new Map<string, PendingIdentityTransaction>()
  const activeClaims = new Set<string>()
  const checkpointedResults = new Map<string, ReturnType<typeof verifiedResult>>()
  const completedReceipts = new Map<string, {
    accountId: string; sessionId: string; returnPath: string
  }>()
  const seedTransaction = (transactionState: string) => transactions.set(transactionState, {
    state: transactionState,
    codeVerifier: 'v'.repeat(43), nonce,
    browserBindingDigest: sha256Base64Url(browserBinding),
    client: { ...client, clientId: options.transactionClientId ?? client.clientId },
    returnPath: '/dashboard',
    expiresAt: 301_000,
  })
  seedTransaction(state)
  if (options.checkpointedResult) checkpointedResults.set(state, options.checkpointedResult)
  const sessionStore = new FileIdentitySessionStore(join(root, 'sessions.json'), {
    now: () => 2_000,
  })
  const runtime = createAcademyIdentityRuntimeCompletion({
    admission: { enabled: true, runtimeWired: true, releaseApproval: true },
    transactionStore: {
      claim(callbackState: string, binding: string) {
        calls.push('claim')
        if (claimFailures > 0) {
          claimFailures -= 1
          throw new Error('claim transport detail must not escape')
        }
        const transaction = transactions.get(callbackState)
        if (!transaction) throw new IdentityTransactionError('unknown', 'unknown_state')
        if (sha256Base64Url(binding) !== transaction.browserBindingDigest) {
          throw new IdentityTransactionError('binding', 'browser_mismatch')
        }
        const completed = completedReceipts.get(callbackState)
        if (completed) return { status: 'completed' as const, receipt: { ...completed } }
        if (activeClaims.has(callbackState)) {
          throw new IdentityTransactionError('busy', 'claim_in_progress')
        }
        activeClaims.add(callbackState)
        return {
          status: 'claimed' as const,
          claimToken: 'c'.repeat(43),
          sessionId: sha256Base64Url(`session:${callbackState}`),
          exchangeResult: checkpointedResults.get(callbackState) ?? null,
          transaction: { ...transaction, client: { ...transaction.client } },
        }
      },
      checkpoint(claim: { transaction: PendingIdentityTransaction }, result: ReturnType<typeof verifiedResult>) {
        calls.push('checkpoint')
        checkpointedResults.set(claim.transaction.state, result)
        if (checkpointFailures > 0) {
          checkpointFailures -= 1
          throw new Error('checkpoint response lost')
        }
      },
      release(claim: { transaction: PendingIdentityTransaction }, stage: string) {
        calls.push(`release:${stage}`)
        activeClaims.delete(claim.transaction.state)
      },
      finalize(
        claim: { transaction: PendingIdentityTransaction },
        receipt: { accountId: string; sessionId: string; returnPath: string },
      ) {
        calls.push('finalize')
        completedReceipts.set(claim.transaction.state, { ...receipt })
        activeClaims.delete(claim.transaction.state)
        if (finalizeFailures > 0) {
          finalizeFailures -= 1
          throw new Error('finalize response lost')
        }
      },
    },
    codeExchangePort: {
      async exchangeCode() {
        calls.push('exchange')
        exchangeCount += 1
        if (options.exchangeFailure) throw new Error('exchange detail must not escape')
        if (exchangeCount > 1) throw new Error('one-time provider code replay')
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
        return verifiedResult()
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
            if (activationFailures > 0) {
              activationFailures -= 1
              return { data: null, error: { code: 'fixture' } }
            }
            return { data: accountId, error: null }
          },
        }),
    sessionStore: {
      create(input: IdentitySessionClaims, stableId: string) {
        calls.push('session')
        sessionCreateCount += 1
        if (sessionCreateCount <= (options.sessionFailures ?? 0)) {
          throw new Error('session detail must not escape')
        }
        const receipt = sessionStore.create(input, stableId)
        if (sessionCreateCount <= (options.sessionResponseLosses ?? 0)) {
          throw new Error('session response lost')
        }
        return options.sessionReceipt?.(receipt) ?? receipt
      },
    },
    client,
    clientAssertionProvider: {
      async createClientAssertion() {
        calls.push('assertion')
        if (assertionFailures > 0) {
          assertionFailures -= 1
          throw new Error('assertion detail must not escape')
        }
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
    exchanges: () => exchangeCount,
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

function verifiedResult() {
  return {
    issuer: client.expectedIssuer,
    subject: 'principal-subject',
    verifiedEmail: 'learner@example.com',
    audience: client.audience,
    serviceId: client.serviceId,
    nonce,
    activation: { status: 'active' as const, revision: 3 },
  }
}

async function expectFixedCompletionFailure(operation: Promise<unknown>): Promise<void> {
  const error = await captureCompletionFailure(operation)
  expect(error).toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
}

async function captureCompletionFailure(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation
    throw new Error('expected completion failure')
  } catch (error) {
    expect(error).toBeInstanceOf(AcademyIdentityRuntimeCompletionFailure)
    expect((error as Error).message).toBe('Academy Identity runtime completion failed')
    expect(Object.keys(error as object)).toEqual([])
    return error as Error
  }
}

function callbackUrl(callbackState = state): URL {
  return new URL(`https://academy.example/auth/callback?code=${code}&state=${callbackState}`)
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}
