import { createHash, webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityClientAssertionJtiSource,
} from '@/lib/identity/client-assertion-jti-source'
import {
  createIdentityClientAssertionProvider,
  IdentityClientAssertionProviderFailure,
} from '@/lib/identity/client-assertion-provider'
import {
  createIdentityClientAssertionWebCryptoSigner,
} from '@/lib/identity/client-assertion-webcrypto-signer'
import {
  runAcademyClientAssertionRegistrationRehearsal,
  type AcademyClientAssertionRehearsalRegistry,
} from '@/lib/identity/client-assertion-registration-rehearsal'

const CLIENT_ID = 'academy-web'
const PURPOSE = 'code_exchange' as const
const KEY_ID = 'academy-code-exchange-2026-08'
const AUDIENCE = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const NOW_SECONDS = 1_786_000_000
const JTIS = [
  '018f0c65-4e3f-4ce4-8e64-4efcdd7b5b91',
  '34a49b39-2030-44bb-8bd5-fbd40928cc0a',
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Academy Identity client-assertion conformance', () => {
  it('binds a fresh signed assertion to the exact exchange client and audience', async () => {
    let jtiIndex = 0
    const randomUUID = vi.fn(() => JTIS[jtiIndex++] ?? JTIS[1])
    const runtimeCrypto = Object.create(webcrypto) as Crypto
    Object.defineProperties(runtimeCrypto, {
      randomUUID: { value: randomUUID, enumerable: true },
      subtle: { value: webcrypto.subtle, enumerable: true },
    })
    vi.stubGlobal('crypto', runtimeCrypto)

    const keys = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair
    const exported = await webcrypto.subtle.exportKey('jwk', keys.privateKey)
    const signer = await createIdentityClientAssertionWebCryptoSigner({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      keyId: KEY_ID,
      privateJwk: JSON.stringify({
        kty: exported.kty,
        crv: exported.crv,
        x: exported.x,
        y: exported.y,
        d: exported.d,
      }),
    })
    const provider = createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      audience: AUDIENCE,
      keyId: KEY_ID,
      lifetimeSeconds: 60,
      clock: { now: () => new Date(NOW_SECONDS * 1_000) },
      jtiSource: createIdentityClientAssertionJtiSource(),
      signer,
    })

    const first = await provider.createClientAssertion({ audience: AUDIENCE })
    const second = await provider.createClientAssertion({ audience: AUDIENCE })

    expect(first).not.toBe(second)
    expect(randomUUID).toHaveBeenCalledTimes(2)
    await expectAssertion(first, JTIS[0], keys.publicKey)
    await expectAssertion(second, JTIS[1], keys.publicKey)

    await expect(provider.createClientAssertion({
      audience: 'https://accounts.cyberskills.co.th/v1/code/exchange/other',
    })).rejects.toBeInstanceOf(IdentityClientAssertionProviderFailure)
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it('rehearses active/overlap registration against the exact producer verifier', async () => {
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()
    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator: (registry) => identityControlAuthenticator(registry, Authenticator),
    })

    expect(result.checks).toEqual({
      activeAccepted: true,
      overlapAccepted: true,
      retiredRefused: true,
      unknownRefused: true,
      tamperedRefused: true,
      wrongClientRefused: true,
      wrongAudienceRefused: true,
      keyMaterialMismatchRefused: true,
    })
    expect(result).toMatchObject({
      mode: 'local-ephemeral',
      enabled: false,
      runtimeWired: false,
      releaseApproval: false,
      productionEvidence: false,
      passed: true,
    })
    expect(JSON.stringify(result)).not.toMatch(/"d"\s*:|privateJwk|PRIVATE KEY|BEGIN EC/i)
  })
})

function identityControlAuthenticator(
  registry: AcademyClientAssertionRehearsalRegistry,
  Authenticator: IdentityControlAuthenticatorConstructor,
) {
  const keyResolver = {
    async resolve(clientId: string, keyId: string) {
      const key = registry.keys.find((candidate) => (
        candidate.clientId === clientId
        && candidate.keyId === keyId
        && (candidate.state === 'active' || candidate.state === 'overlap')
      ))
      return key
        ? { keyId: key.keyId, algorithm: key.algorithm, publicJwk: structuredClone(key.publicJwk) }
        : null
    },
  }
  const reservations = new Set<string>()
  const replayStore = {
    async reserve(_clientId: string, digest: string) {
      if (reservations.has(digest)) return false
      reservations.add(digest)
      return true
    },
  }
  return new Authenticator({
    audience: registry.audience,
    keyResolver,
    replayStore,
    now: () => new Date(registry.nowSeconds * 1_000),
    sha256: (value) => createHash('sha256').update(value).digest('base64url'),
    clockSkewSeconds: 30,
    maxLifetimeSeconds: 120,
  })
}

type IdentityControlAuthenticatorConstructor = new (options: {
  audience: string
  keyResolver: {
    resolve(clientId: string, keyId: string): Promise<unknown>
  }
  replayStore: {
    reserve(clientId: string, digest: string, expiresAt: Date): Promise<boolean>
  }
  now(): Date
  sha256(value: string): string
  clockSkewSeconds: number
  maxLifetimeSeconds: number
}) => {
  authenticate(clientId: string, assertion: string): Promise<boolean>
}

type IdentityControlRegistryConstructor = new () => {
  register(clientId: string, key: IdentityControlKey): void
  rotate(clientId: string, key: IdentityControlKey): void
  retire(clientId: string, keyId: string): void
  snapshot(clientId: string): { keys: Array<IdentityControlKey & {
    state: 'active' | 'overlap' | 'retired'
  }> }
}

type IdentityControlKey = {
  keyId: string
  algorithm: 'ES256'
  publicKeyReference: string
}

async function loadIdentityControlContracts(): Promise<{
  Authenticator: IdentityControlAuthenticatorConstructor
  ClientControlRegistry: IdentityControlRegistryConstructor
}> {
  const authenticatorPath = '../../../../identity-control/packages/core/src/client-assertion'
  const controlPath = '../../../../identity-control/packages/core/src/client-control'
  const [authenticator, control]: unknown[] = await Promise.all([
    import(authenticatorPath), import(controlPath),
  ])
  if (!authenticator || typeof authenticator !== 'object'
    || !('Es256ClientAssertionAuthenticator' in authenticator)
    || typeof authenticator.Es256ClientAssertionAuthenticator !== 'function'
    || !control || typeof control !== 'object'
    || !('ClientControlRegistry' in control)
    || typeof control.ClientControlRegistry !== 'function') {
    throw new Error('Identity Control rehearsal contracts are unavailable')
  }
  return {
    Authenticator: authenticator.Es256ClientAssertionAuthenticator as IdentityControlAuthenticatorConstructor,
    ClientControlRegistry: control.ClientControlRegistry as IdentityControlRegistryConstructor,
  }
}

async function expectAssertion(
  compactJws: string,
  expectedJti: string,
  publicKey: CryptoKey,
): Promise<void> {
  const segments = compactJws.split('.')
  expect(segments).toHaveLength(3)
  const [encodedHeader, encodedClaims, encodedSignature] = segments as [string, string, string]
  expect(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))).toEqual({
    alg: 'ES256',
    kid: KEY_ID,
    typ: 'JWT',
  })
  expect(JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))).toEqual({
    aud: AUDIENCE,
    exp: NOW_SECONDS + 60,
    iat: NOW_SECONDS,
    iss: CLIENT_ID,
    jti: expectedJti,
    sub: CLIENT_ID,
  })
  await expect(webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    Uint8Array.from(Buffer.from(encodedSignature, 'base64url')),
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  )).resolves.toBe(true)
}
