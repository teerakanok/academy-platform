import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  createAcademyClientKeyRegistrationEvidenceSubmission,
  runAcademyClientAssertionRegistrationRehearsal,
  validateAcademyClientAssertionRegistrationSequence,
  type AcademyClientAssertionRegistrationSequence,
  type AcademyClientAssertionRehearsalRegistry,
} from '@/lib/identity/client-assertion-registration-rehearsal'

describe('Academy client-assertion public-key registration rehearsal', () => {
  it('accepts active/overlap and refuses retired, unknown, tampered, or mismatched assertions', async () => {
    const observedRegistries: AcademyClientAssertionRehearsalRegistry[] = []
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()

    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator(registry) {
        observedRegistries.push(structuredClone(registry))
        return identityControlAuthenticator(registry, Authenticator)
      },
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
    expect(result.passed).toBe(true)
    expect(observedRegistries.some(({ keys }) => keys.some(({ state }) => state === 'active'))).toBe(true)
    expect(observedRegistries.some(({ keys }) => keys.some(({ state }) => state === 'overlap'))).toBe(true)
    expect(observedRegistries.some(({ keys }) => keys.some(({ state }) => state === 'retired'))).toBe(true)
  })

  it('returns public-only local evidence and keeps every production flag false', async () => {
    const observedRegistries: AcademyClientAssertionRehearsalRegistry[] = []
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()
    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator(registry) {
        observedRegistries.push(structuredClone(registry))
        return identityControlAuthenticator(registry, Authenticator)
      },
    })

    expect(result).toMatchObject({
      schema: 'academy-client-assertion-registration-rehearsal/v1',
      mode: 'local-ephemeral',
      enabled: false,
      runtimeWired: false,
      releaseApproval: false,
      productionEvidence: false,
      passed: true,
    })
    expect(result.registrations).toHaveLength(2)
    expect(result.sequence.bootstrapClient.serviceId).toBe('academy')
    expect(result.registrations.every(({ publicJwkSha256 }) => /^[a-f0-9]{64}$/.test(publicJwkSha256))).toBe(true)
    expect(Reflect.ownKeys(result.sequence.bootstrapClient.verificationKey).sort()).toEqual([
      'activatedAt', 'algorithm', 'keyId', 'publicJwk', 'publicKeyReference', 'state',
    ])

    const rendered = JSON.stringify({ result, observedRegistries })
    expect(rendered).not.toMatch(/"d"\s*:|privateJwk|PRIVATE KEY|BEGIN EC/i)
    expect(rendered).not.toMatch(/"(?:enabled|runtimeWired|releaseApproval|productionEvidence)":true/)
    for (const registry of observedRegistries) {
      for (const key of registry.keys) {
        expect(Reflect.ownKeys(key.publicJwk).sort()).toEqual(['crv', 'key_ops', 'kty', 'use', 'x', 'y'])
      }
    }
    expect(result.sequence.snapshots.map(({ phase }) => phase)).toEqual([
      'active', 'overlap', 'retired',
    ])
    expect(result.sequence.snapshots.map(({ registrations }) => (
      registrations.map(({ state }) => state)
    ))).toEqual([
      ['active'],
      ['overlap', 'active'],
      ['retired', 'active'],
    ])
    for (const snapshot of result.sequence.snapshots) {
      expect(snapshot.registrations.some(({ state }) => state === 'active')).toBe(true)
      for (const registration of snapshot.registrations) {
        expect(registration.keyId).toMatch(/^academy-[a-f0-9]{40}$/)
        expect(registration.publicKeyReference).toBe(
          `config://client-keys/academy-web/${registration.keyId}`,
        )
      }
    }
    const swapped = structuredClone(result.sequence)
    const overlap = swapped.snapshots[1]!
    const [oldKey, newKey] = overlap.registrations
    overlap.registrations = [
      { ...newKey!, state: 'overlap' },
      { ...oldKey!, state: 'active' },
    ]
    overlap.freeze.activeKeyIds = [oldKey!.keyId]
    overlap.freeze.overlapKeyIds = [newKey!.keyId]
    await expect(validateAcademyClientAssertionRegistrationSequence(swapped)).rejects.toThrow(
      /rotation identity/i,
    )
  })

  it.each([
    ['bad reference', (value: AcademyClientAssertionRegistrationSequence) => {
      value.snapshots[0]!.registrations[0]!.publicKeyReference = 'config://client-keys/academy-web/wrong'
    }],
    ['bad activatedAt', (value: AcademyClientAssertionRegistrationSequence) => {
      value.snapshots[0]!.registrations[0]!.activatedAt = '2026-08-20T00:00:00Z'
    }],
    ['private key material', (value: AcademyClientAssertionRegistrationSequence) => {
      Object.assign(value.snapshots[0]!.registrations[0]!.publicJwk, { d: 'A'.repeat(43) })
    }],
    ['runtime material mismatch', (value: AcademyClientAssertionRegistrationSequence) => {
      const [reference] = Object.keys(value.snapshots[1]!.runtimePublicKeys)
      value.snapshots[1]!.runtimePublicKeys[reference!] = {
        ...value.snapshots[1]!.runtimePublicKeys[reference!]!,
        x: 'A'.repeat(43),
      }
    }],
    ['illegal transition order', (value: AcademyClientAssertionRegistrationSequence) => {
      value.snapshots.reverse()
    }],
    ['no active key', (value: AcademyClientAssertionRegistrationSequence) => {
      value.snapshots[1]!.registrations.forEach((key) => { key.state = 'overlap' })
    }],
  ])('rejects producer-incompatible registration input: %s', async (_label, mutate) => {
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()
    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator: (registry) => identityControlAuthenticator(registry, Authenticator),
    })
    const invalid = structuredClone(result.sequence)
    mutate(invalid)
    await expect(validateAcademyClientAssertionRegistrationSequence(invalid)).rejects.toThrow()
  })

  it('builds a public-only source-bound submission with exact registration metadata', async () => {
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()
    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator: (registry) => identityControlAuthenticator(registry, Authenticator),
    })
    const submission = await createAcademyClientKeyRegistrationEvidenceSubmission(result)

    expect(submission).toMatchObject({
      schema: 'academy-client-public-key-registration-evidence-submission/v1',
      submissionState: 'submitted-for-independent-review',
      blockerId: 'client-public-key-registration-and-rotation-rehearsal',
      blockerStatus: 'open',
      preparationOnly: true,
      boundary: {
        productionReadiness: false,
        releaseApproval: false,
        productionAuthority: 'NONE',
        registryMutationAuthority: 'NONE',
        runtimeWired: false,
        trafficEnabled: false,
        privateKeyPersisted: false,
        requestedOperations: [],
      },
    })
    const registrationEvidence = submission.evidence[0]
    const rehearsalEvidence = submission.evidence[1]
    if (!registrationEvidence || !('registrations' in registrationEvidence)
      || !Array.isArray(registrationEvidence.registrations)
      || !rehearsalEvidence || !('rehearsal' in rehearsalEvidence)
      || !rehearsalEvidence.rehearsal) {
      throw new Error('Evidence order drifted')
    }
    const registrations = registrationEvidence.registrations
    expect(registrations).toHaveLength(2)
    for (const registration of registrations) {
      expect(registration.algorithm).toBe('ES256')
      expect(registration.keyId).toBe(`academy-${registration.publicJwkSha256.slice(0, 40)}`)
      expect(registration.publicKeyReference).toBe(
        `config://client-keys/academy-web/${registration.keyId}`,
      )
    }
    expect(rehearsalEvidence.rehearsal.phases.map(({ phase, states }) => ({ phase, states }))).toEqual([
      { phase: 'active', states: ['active'] },
      { phase: 'overlap', states: ['overlap', 'active'] },
      { phase: 'retired', states: ['retired', 'active'] },
    ])
    expect(JSON.stringify(submission)).not.toMatch(/\"d\"\s*:|privateJwk|PRIVATE KEY|BEGIN EC/i)
  })

  it('rejects drifted public digest and every enabled production boundary', async () => {
    const { Authenticator, ClientControlRegistry } = await loadIdentityControlContracts()
    const result = await runAcademyClientAssertionRegistrationRehearsal({
      createControlRegistry: () => new ClientControlRegistry(),
      createAuthenticator: (registry) => identityControlAuthenticator(registry, Authenticator),
    })
    const drifted = structuredClone(result)
    drifted.registrations[0]!.publicJwkSha256 = '0'.repeat(64)
    await expect(createAcademyClientKeyRegistrationEvidenceSubmission(drifted)).rejects.toThrow(
      /public registration binding/i,
    )

    const substituted = structuredClone(result)
    const replacementDigest = 'a'.repeat(64)
    substituted.registrations[0] = {
      ...substituted.registrations[0]!,
      keyId: `academy-${replacementDigest.slice(0, 40)}`,
      publicKeyReference: `config://client-keys/academy-web/academy-${replacementDigest.slice(0, 40)}`,
      publicJwkSha256: replacementDigest,
    }
    await expect(createAcademyClientKeyRegistrationEvidenceSubmission(substituted)).rejects.toThrow(
      /public registration binding/i,
    )

    for (const field of ['enabled', 'runtimeWired', 'releaseApproval', 'productionEvidence'] as const) {
      const widened = structuredClone(result)
      Reflect.set(widened, field, true)
      await expect(createAcademyClientKeyRegistrationEvidenceSubmission(widened)).rejects.toThrow(
        /passing disabled local rehearsal/i,
      )
    }
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

type IdentityControlRegistry = {
  register(clientId: string, key: { keyId: string; algorithm: 'ES256'; publicKeyReference: string }): void
  rotate(clientId: string, key: { keyId: string; algorithm: 'ES256'; publicKeyReference: string }): void
  retire(clientId: string, keyId: string): void
  snapshot(clientId: string): { keys: Array<{
    keyId: string
    algorithm: 'ES256'
    publicKeyReference: string
    state: 'active' | 'overlap' | 'retired'
  }> }
}

type IdentityControlRegistryConstructor = new () => IdentityControlRegistry

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
