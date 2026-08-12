import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  verifyIdentityLifecycleEnvelope,
  type IdentityLifecycleEnvelopeVerificationPolicy,
} from '@/lib/identity/lifecycle-envelope-verifier'

const PRODUCER_VECTOR = {
  schema: 'identity-consumer-lifecycle-envelope-vector/v1',
  fixtureOnly: true,
  verification: {
    expectedIssuer: 'https://identity.example.test/',
    expectedAudience: 'https://consumer.example.test/auth/events',
    verificationTime: '2026-08-09T02:01:00.000Z',
    clockSkewSeconds: 30,
    maximumLifetimeSeconds: 180,
    key: {
      keyId: 'identity-events-conformance-v1',
      algorithm: 'ES256',
      publicJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'oWKIvOzecbm5Zwg3fVWCoYamzbO6Sdd97DAMX5qxwiU',
        y: 'c3R-MRMG7D3BUaVJE3Ap6gvxKvOgJG7itnZOx95ezKQ',
      },
    },
  },
  expectedEvent: {
    eventId: '00000000-0000-4000-8000-000000000501',
    kind: 'account.lifecycle.changed',
    issuer: 'https://accounts.example.test/auth/v1',
    subject: 'consumer-conformance-subject',
    state: 'disabled',
    revision: 2,
    occurredAt: '2026-08-09T01:59:00.000Z',
    reason: 'account_disabled',
  },
  envelope: [
    'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LWV2ZW50cy1jb25mb3JtYW5jZS12MSIsInR5cCI6ImlkZW50aXR5LWV2ZW50K2p3dCJ9',
    'eyJhdWQiOiJodHRwczovL2NvbnN1bWVyLmV4YW1wbGUudGVzdC9hdXRoL2V2ZW50cyIsImV2ZW50Ijp7ImV2ZW50SWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDA1MDEiLCJraW5kIjoiYWNjb3VudC5saWZlY3ljbGUuY2hhbmdlZCIsImlzc3VlciI6Imh0dHBzOi8vYWNjb3VudHMuZXhhbXBsZS50ZXN0L2F1dGgvdjEiLCJzdWJqZWN0IjoiY29uc3VtZXItY29uZm9ybWFuY2Utc3ViamVjdCIsInN0YXRlIjoiZGlzYWJsZWQiLCJyZXZpc2lvbiI6Miwib2NjdXJyZWRBdCI6IjIwMjYtMDgtMDlUMDE6NTk6MDAuMDAwWiIsInJlYXNvbiI6ImFjY291bnRfZGlzYWJsZWQifSwiZXhwIjoxNzg2MjQwOTIwLCJpYXQiOjE3ODYyNDA4MDAsImlzcyI6Imh0dHBzOi8vaWRlbnRpdHkuZXhhbXBsZS50ZXN0LyIsImp0aSI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDUwMSJ9',
    'Q0lBRfk_FsYr9zzdmPDuE4Q59IcbXt-8nAwb5NowqX_9tAuK5wgD9kZhgg6A40dQwUXAWY9rGV9XxjJsUpZsEQ',
  ].join('.'),
} as const

function policy(
  overrides: Partial<IdentityLifecycleEnvelopeVerificationPolicy> = {},
): IdentityLifecycleEnvelopeVerificationPolicy {
  return {
    expectedIssuer: PRODUCER_VECTOR.verification.expectedIssuer,
    expectedAudience: PRODUCER_VECTOR.verification.expectedAudience,
    verificationTime: new Date(PRODUCER_VECTOR.verification.verificationTime),
    clockSkewSeconds: PRODUCER_VECTOR.verification.clockSkewSeconds,
    maximumLifetimeSeconds: PRODUCER_VECTOR.verification.maximumLifetimeSeconds,
    key: structuredClone(PRODUCER_VECTOR.verification.key),
    ...overrides,
  }
}

function tamperSegment(
  envelope: string,
  segment: 0 | 1,
  mutate: (value: Record<string, unknown>) => void,
): string {
  const parts = envelope.split('.')
  const value = JSON.parse(Buffer.from(parts[segment]!, 'base64url').toString('utf8')) as Record<string, unknown>
  mutate(value)
  parts[segment] = Buffer.from(JSON.stringify(value)).toString('base64url')
  return parts.join('.')
}

async function createSignedEnvelopeFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const issuedAt = 1_786_240_800

  return {
    policy: policy({
      verificationTime: new Date(issuedAt * 1_000 + 60_000),
      key: {
        keyId: 'identity-events-contract-parity',
        algorithm: 'ES256',
        publicJwk,
      },
    }),
    sign: async (event: Record<string, unknown>) => {
      const header = Buffer.from(JSON.stringify({
        alg: 'ES256',
        kid: 'identity-events-contract-parity',
        typ: 'identity-event+jwt',
      })).toString('base64url')
      const claims = Buffer.from(JSON.stringify({
        aud: PRODUCER_VECTOR.verification.expectedAudience,
        event,
        exp: issuedAt + 120,
        iat: issuedAt,
        iss: PRODUCER_VECTOR.verification.expectedIssuer,
        jti: event.eventId,
      })).toString('base64url')
      const signingInput = `${header}.${claims}`
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        Buffer.from(signingInput),
      )
      return `${signingInput}.${Buffer.from(signature).toString('base64url')}`
    },
  }
}

describe('lifecycle.envelope-cryptographic-verification', () => {
  it('accepts the exact fixture-only producer vector', async () => {
    expect(createHash('sha256').update(PRODUCER_VECTOR.envelope).digest('hex'))
      .toBe('8768d5258b9cfa2ae602ff24ddf273b37b48f26075bbeb2d5b6498c6d2b0b730')
    await expect(verifyIdentityLifecycleEnvelope(PRODUCER_VECTOR.envelope, policy()))
      .resolves.toEqual(PRODUCER_VECTOR.expectedEvent)
  })

  it('fails closed for a tampered signature, algorithm, key ID, or strict event schema', async () => {
    const signatureTamper = `${PRODUCER_VECTOR.envelope.slice(0, -1)}A`
    const algorithmTamper = tamperSegment(PRODUCER_VECTOR.envelope, 0, (header) => {
      header.alg = 'HS256'
    })
    const keyIdTamper = tamperSegment(PRODUCER_VECTOR.envelope, 0, (header) => {
      header.kid = 'identity-events-conformance-v2'
    })
    const schemaTamper = tamperSegment(PRODUCER_VECTOR.envelope, 1, (claims) => {
      ;(claims.event as Record<string, unknown>).unexpected = true
    })

    for (const envelope of [signatureTamper, algorithmTamper, keyIdTamper, schemaTamper]) {
      await expect(verifyIdentityLifecycleEnvelope(envelope, policy())).resolves.toBeNull()
    }
  })

  it('fails closed for issuer, audience, verification time/skew, or lifetime policy mismatch', async () => {
    const policies = [
      policy({ expectedIssuer: 'https://wrong-issuer.example.test/' }),
      policy({ expectedAudience: 'https://wrong-consumer.example.test/auth/events' }),
      policy({ key: { ...PRODUCER_VECTOR.verification.key, keyId: 'identity-events-conformance-v2' } }),
      policy({ key: { ...PRODUCER_VECTOR.verification.key, algorithm: 'RS256' } }),
      policy({ verificationTime: new Date('2026-08-09T02:02:00.000Z') }),
      policy({ verificationTime: new Date('2026-08-09T01:59:29.000Z') }),
      policy({ maximumLifetimeSeconds: 119 }),
    ]

    for (const candidate of policies) {
      await expect(verifyIdentityLifecycleEnvelope(PRODUCER_VECTOR.envelope, candidate)).resolves.toBeNull()
    }
  })

  it('fails closed for malformed key input and malformed compact JWS input', async () => {
    const malformedKey = policy({
      key: {
        ...PRODUCER_VECTOR.verification.key,
        publicJwk: { ...PRODUCER_VECTOR.verification.key.publicJwk, x: 'not-a-coordinate' },
      },
    })
    const arrayLikeKeyOps = policy({
      key: {
        ...PRODUCER_VECTOR.verification.key,
        publicJwk: {
          ...PRODUCER_VECTOR.verification.key.publicJwk,
          key_ops: { 0: 'verify', length: 1 } as unknown as string[],
        },
      },
    })

    await expect(verifyIdentityLifecycleEnvelope(PRODUCER_VECTOR.envelope, malformedKey)).resolves.toBeNull()
    await expect(verifyIdentityLifecycleEnvelope(PRODUCER_VECTOR.envelope, arrayLikeKeyOps)).resolves.toBeNull()
    await expect(verifyIdentityLifecycleEnvelope('not.a.valid.compact-jws', policy())).resolves.toBeNull()
  })

  it('rejects signed events outside the producer principal contract', async () => {
    const fixture = await createSignedEnvelopeFixture()
    for (const event of [
      { ...PRODUCER_VECTOR.expectedEvent, issuer: 'https://a.1/' },
      { ...PRODUCER_VECTOR.expectedEvent, issuer: 'https://xn--a.example/' },
      { ...PRODUCER_VECTOR.expectedEvent, issuer: 'https://identity-control.example.test/' },
      { ...PRODUCER_VECTOR.expectedEvent, subject: '\ud800' },
      { ...PRODUCER_VECTOR.expectedEvent, subject: '\udc00' },
    ]) {
      await expect(verifyIdentityLifecycleEnvelope(
        await fixture.sign(event),
        fixture.policy,
      )).resolves.toBeNull()
    }
  })
})
