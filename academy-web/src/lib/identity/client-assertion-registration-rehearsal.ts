import {
  createIdentityClientAssertionProvider,
  type AcademyIdentityClientAssertionProvider,
} from './client-assertion-provider'
import { createIdentityClientAssertionJtiSource } from './client-assertion-jti-source'
import { createIdentityClientAssertionWebCryptoSigner } from './client-assertion-webcrypto-signer'

const CLIENT_ID = 'academy-web'
const SERVICE_ID = 'academy'
const AUDIENCE = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const WRONG_CLIENT_ID = 'academy-web-mismatch'
const WRONG_AUDIENCE = 'https://accounts.example.test/v1/code/exchange'
const NOW_SECONDS = 1_786_000_000
const PRODUCER_SOURCE_REVISION = 'f0e1cc5dd89271ca2a1a78fd4b3c7b825bf61c1e'
const ACTIVATED_AT = Object.freeze([
  '2026-08-20T00:00:00.000Z',
  '2026-08-20T00:05:00.000Z',
  '2026-08-20T00:10:00.000Z',
])

export type AcademyClientAssertionRehearsalPublicJwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  use: 'sig'
  key_ops: ['verify']
}

export type AcademyClientAssertionRehearsalKey = {
  clientId: string
  keyId: string
  algorithm: 'ES256'
  publicKeyReference: string
  state: 'active' | 'overlap' | 'retired'
  activatedAt: string
  publicJwk: AcademyClientAssertionRehearsalPublicJwk
}

type AcademyClientAssertionBootstrapKey = Omit<AcademyClientAssertionRehearsalKey, 'clientId'>

export type AcademyClientAssertionRehearsalRegistry = {
  audience: string
  nowSeconds: number
  keys: AcademyClientAssertionRehearsalKey[]
}

export type AcademyClientAssertionRegistrationSequence = {
  producerBinding: {
    sourceRevision: string
    bootstrapContractPath: string
    runtimeContractPath: string
    controlContractPath: string
  }
  bootstrapClient: {
    schema: 'identity-control-bootstrap-client/v1'
    clientId: string
    serviceId: string
    audience: string
    activationPolicy: 'unavailable'
    enabled: false
    configRevision: 1
    redirectUris: [string]
    verificationKey: AcademyClientAssertionBootstrapKey
  }
  snapshots: Array<{
    phase: 'active' | 'overlap' | 'retired'
    registrations: AcademyClientAssertionRehearsalKey[]
    runtimePublicKeys: Record<string, AcademyClientAssertionRehearsalPublicJwk>
    freeze: {
      bootstrapClient: { sha256: string }
      activeKeyIds: string[]
      overlapKeyIds: string[]
    }
  }>
}

type RehearsalAuthenticator = {
  authenticate(clientId: string, assertion: string): Promise<boolean>
}

type RehearsalControlRegistry = {
  register(clientId: string, key: ControlKey): void
  rotate(clientId: string, key: ControlKey): void
  retire(clientId: string, keyId: string): void
  snapshot(clientId: string): { keys: Array<ControlKey & { state: AcademyClientAssertionRehearsalKey['state'] }> }
}

type ControlKey = Pick<AcademyClientAssertionRehearsalKey,
  'keyId' | 'algorithm' | 'publicKeyReference'>

export type AcademyClientAssertionRegistrationRehearsalOptions = {
  createAuthenticator(registry: AcademyClientAssertionRehearsalRegistry): RehearsalAuthenticator
  createControlRegistry(): RehearsalControlRegistry
}

type EphemeralAssertionKey = {
  keyId: string
  activatedAt: string
  publicJwk: AcademyClientAssertionRehearsalPublicJwk
  providerForAudience(audience: string): AcademyIdentityClientAssertionProvider
}

export async function runAcademyClientAssertionRegistrationRehearsal(
  options: AcademyClientAssertionRegistrationRehearsalOptions,
) {
  if (!options || typeof options.createAuthenticator !== 'function'
    || typeof options.createControlRegistry !== 'function') {
    throw new TypeError('Academy client-assertion rehearsal requires authenticator and control factories')
  }

  const [oldKey, newKey, unknown] = await Promise.all([
    createEphemeralAssertionKey(ACTIVATED_AT[0]!),
    createEphemeralAssertionKey(ACTIVATED_AT[1]!),
    createEphemeralAssertionKey(ACTIVATED_AT[2]!),
  ])
  const control = options.createControlRegistry()
  control.register(CLIENT_ID, controlKey(oldKey))
  const active = snapshot('active', control.snapshot(CLIENT_ID).keys, [oldKey, newKey])
  control.rotate(CLIENT_ID, controlKey(newKey))
  const overlap = snapshot('overlap', control.snapshot(CLIENT_ID).keys, [oldKey, newKey])
  control.retire(CLIENT_ID, oldKey.keyId)
  const retired = snapshot('retired', control.snapshot(CLIENT_ID).keys, [oldKey, newKey])

  const bootstrapClient = {
    schema: 'identity-control-bootstrap-client/v1' as const,
    clientId: CLIENT_ID,
    serviceId: SERVICE_ID,
    audience: AUDIENCE,
    activationPolicy: 'unavailable' as const,
    enabled: false as const,
    configRevision: 1 as const,
    redirectUris: ['https://academy.example.test/auth/callback'] as [string],
    verificationKey: bootstrapKey(active.registrations[0]!),
  }
  const bootstrapDigest = await digestCanonical(bootstrapClient)
  const sequence: AcademyClientAssertionRegistrationSequence = {
    producerBinding: {
      sourceRevision: PRODUCER_SOURCE_REVISION,
      bootstrapContractPath: 'scripts/dark-deploy/bootstrap-client.sh',
      runtimeContractPath: 'apps/control-api/src/production-config.ts',
      controlContractPath: 'packages/core/src/client-control.ts',
    },
    bootstrapClient,
    snapshots: [active, overlap, retired].map((value) => ({
      ...value,
      freeze: {
        ...value.freeze,
        bootstrapClient: { sha256: bootstrapDigest },
      },
    })),
  }
  await validateAcademyClientAssertionRegistrationSequence(sequence)

  const oldAssertion = await assertion(oldKey, AUDIENCE)
  const newAssertion = await assertion(newKey, AUDIENCE)
  const unknownAssertion = await assertion(unknown, AUDIENCE)
  const wrongAudienceAssertion = await assertion(oldKey, WRONG_AUDIENCE)
  const mismatched = registry(overlap.registrations.map((key) => (
    key.keyId === oldKey.keyId
      ? { ...key, publicJwk: structuredClone(newKey.publicJwk) }
      : key
  )))

  const checks = {
    activeAccepted: await authenticate(options, registry(overlap.registrations), CLIENT_ID, newAssertion),
    overlapAccepted: await authenticate(options, registry(overlap.registrations), CLIENT_ID, oldAssertion),
    retiredRefused: !await authenticate(options, registry(retired.registrations), CLIENT_ID, oldAssertion),
    unknownRefused: !await authenticate(options, registry(overlap.registrations), CLIENT_ID, unknownAssertion),
    tamperedRefused: !await authenticate(options, registry(overlap.registrations), CLIENT_ID, tamper(oldAssertion)),
    wrongClientRefused: !await authenticate(options, registry(overlap.registrations), WRONG_CLIENT_ID, oldAssertion),
    wrongAudienceRefused: !await authenticate(options, registry(overlap.registrations), CLIENT_ID, wrongAudienceAssertion),
    keyMaterialMismatchRefused: !await authenticate(options, mismatched, CLIENT_ID, oldAssertion),
  }

  return {
    schema: 'academy-client-assertion-registration-rehearsal/v1' as const,
    mode: 'local-ephemeral' as const,
    enabled: false as const,
    runtimeWired: false as const,
    releaseApproval: false as const,
    productionEvidence: false as const,
    registrations: await Promise.all([oldKey, newKey].map(registrationEvidence)),
    sequence,
    checks,
    passed: Object.values(checks).every(Boolean),
  }
}

export type AcademyClientAssertionRegistrationRehearsalResult = Awaited<
  ReturnType<typeof runAcademyClientAssertionRegistrationRehearsal>
>

const EVIDENCE_SOURCE = Object.freeze({
  academyRevision: '0d44d22b311af64078cf6d9dda9fc3f4713c3918',
  identityRevision: 'bf663fa72003fd12fccc90a8ff93b37e29732f6d',
  identityRuntimeContracts: Object.freeze([
    Object.freeze({
      path: 'packages/core/src/client-assertion.ts',
      sha256: '6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6',
      bytes: 5938,
    }),
    Object.freeze({
      path: 'packages/core/src/client-control.ts',
      sha256: '5c3544a6b8056f95021f0dc871ca465d16235cad482984646b3b5b3a9455063c',
      bytes: 2363,
    }),
  ]),
  receiptContract: Object.freeze({
    path: 'evidence/identity-control/academy-production-blocker-receipt-submission-contract.v1.json',
    sha256: '3cda4c9ad0db04ecd63dc2734ad97bcee84f6d431f67c2d35dd10b4e3fd66836',
    bytes: 4426,
  }),
  rehearsalFreeze: Object.freeze({
    path: 'reports/reviews/academy-identity-client-assertion-registration-rehearsal-closure-freeze-20260823.json',
    sha256: '772ebecd76d3fc6bf65eba8387810ebaa427741c341416cb4a5f80e8b9b7e691',
    bytes: 3276,
  }),
})

export async function createAcademyClientKeyRegistrationEvidenceSubmission(
  result: AcademyClientAssertionRegistrationRehearsalResult,
) {
  if (!result || result.schema !== 'academy-client-assertion-registration-rehearsal/v1'
    || result.mode !== 'local-ephemeral' || result.enabled !== false
    || result.runtimeWired !== false || result.releaseApproval !== false
    || result.productionEvidence !== false || result.passed !== true) {
    throw new Error('Client-key evidence requires one passing disabled local rehearsal')
  }
  await validateAcademyClientAssertionRegistrationSequence(result.sequence)
  if (!Array.isArray(result.registrations) || result.registrations.length !== 2) {
    throw new Error('Client-key evidence requires exactly two public registration records')
  }
  const rehearsedRegistrations = [
    result.sequence.snapshots[0]?.registrations[0],
    result.sequence.snapshots[1]?.registrations[1],
  ]
  const registrations = await Promise.all(result.registrations.map(async (registration, index) => {
    exactKeys(registration, [
      'activatedAt', 'algorithm', 'clientId', 'keyId', 'publicJwkSha256', 'publicKeyReference',
    ], 'evidence registration')
    const rehearsed = rehearsedRegistrations[index]
    if (registration.clientId !== CLIENT_ID || registration.algorithm !== 'ES256'
      || !/^[a-f0-9]{64}$/.test(registration.publicJwkSha256)
      || registration.keyId !== `academy-${registration.publicJwkSha256.slice(0, 40)}`
      || registration.publicKeyReference !== publicKeyReference(registration.keyId)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(registration.activatedAt)
      || !Number.isFinite(Date.parse(registration.activatedAt))
      || !rehearsed
      || registration.keyId !== rehearsed.keyId
      || registration.algorithm !== rehearsed.algorithm
      || registration.publicKeyReference !== rehearsed.publicKeyReference
      || registration.activatedAt !== rehearsed.activatedAt
      || registration.publicJwkSha256 !== await digestCanonical(rehearsed.publicJwk)) {
      throw new Error('Client-key evidence public registration binding mismatch')
    }
    return Object.freeze({ ...registration })
  }))
  if (Date.parse(registrations[1]!.activatedAt) <= Date.parse(registrations[0]!.activatedAt)) {
    throw new Error('Client-key evidence activation order mismatch')
  }
  const phases = result.sequence.snapshots.map(({ phase, registrations: keys }) => ({
    phase,
    states: keys.map(({ state }) => state),
    keyIds: keys.map(({ keyId }) => keyId),
  }))
  if (JSON.stringify(phases.map(({ phase, states }) => ({ phase, states }))) !== JSON.stringify([
    { phase: 'active', states: ['active'] },
    { phase: 'overlap', states: ['overlap', 'active'] },
    { phase: 'retired', states: ['retired', 'active'] },
  ])) {
    throw new Error('Client-key evidence rotation phase mismatch')
  }
  const expectedChecks = {
    activeAccepted: true,
    overlapAccepted: true,
    retiredRefused: true,
    unknownRefused: true,
    tamperedRefused: true,
    wrongClientRefused: true,
    wrongAudienceRefused: true,
    keyMaterialMismatchRefused: true,
  }
  if (JSON.stringify(result.checks) !== JSON.stringify(expectedChecks)) {
    throw new Error('Client-key evidence rehearsal checks mismatch')
  }
  const submission = {
    schema: 'academy-client-public-key-registration-evidence-submission/v1' as const,
    revision: 1 as const,
    submissionState: 'submitted-for-independent-review' as const,
    blockerId: 'client-public-key-registration-and-rotation-rehearsal' as const,
    blockerStatus: 'open' as const,
    preparationOnly: true as const,
    sourceBindings: EVIDENCE_SOURCE,
    evidence: [
      {
        requirement: 'Reviewed public-key reference digest, algorithm, key identifier, and activation metadata',
        registrations,
      },
      {
        requirement: 'Isolated active-overlap-retired rotation rehearsal receipt',
        rehearsal: {
          mode: result.mode,
          phases,
          checks: Object.freeze({ ...result.checks }),
          passed: true as const,
        },
      },
    ],
    boundary: {
      productionReadiness: false as const,
      releaseApproval: false as const,
      productionAuthority: 'NONE' as const,
      registryMutationAuthority: 'NONE' as const,
      runtimeWired: false as const,
      trafficEnabled: false as const,
      privateKeyPersisted: false as const,
      requestedOperations: Object.freeze([]),
    },
  }
  const rendered = JSON.stringify(submission)
  if (/\"d\"\s*:|privateJwk|PRIVATE KEY|BEGIN EC/i.test(rendered)) {
    throw new Error('Client-key evidence contains private key material')
  }
  return Object.freeze(submission)
}

export async function validateAcademyClientAssertionRegistrationSequence(
  sequence: AcademyClientAssertionRegistrationSequence,
): Promise<void> {
  exactKeys(sequence, ['bootstrapClient', 'producerBinding', 'snapshots'], 'sequence')
  exactKeys(sequence.producerBinding, [
    'bootstrapContractPath', 'controlContractPath', 'runtimeContractPath', 'sourceRevision',
  ], 'producer binding')
  if (sequence.producerBinding.sourceRevision !== PRODUCER_SOURCE_REVISION
    || sequence.producerBinding.bootstrapContractPath !== 'scripts/dark-deploy/bootstrap-client.sh'
    || sequence.producerBinding.runtimeContractPath !== 'apps/control-api/src/production-config.ts'
    || sequence.producerBinding.controlContractPath !== 'packages/core/src/client-control.ts') {
    throw new Error('Registration sequence producer revision mismatch')
  }
  validateBootstrap(sequence.bootstrapClient)
  if (!Array.isArray(sequence.snapshots) || sequence.snapshots.length !== 3) {
    throw new Error('Registration sequence requires exactly three snapshots')
  }
  const expected = [
    { phase: 'active', states: ['active'], active: 1, overlap: 0 },
    { phase: 'overlap', states: ['overlap', 'active'], active: 1, overlap: 1 },
    { phase: 'retired', states: ['retired', 'active'], active: 1, overlap: 0 },
  ] as const
  const bootstrapDigest = await digestCanonical(sequence.bootstrapClient)
  const materialByKey = new Map<string, string>()

  for (const [index, current] of sequence.snapshots.entries()) {
    const rule = expected[index]!
    exactKeys(current, ['freeze', 'phase', 'registrations', 'runtimePublicKeys'], `snapshot ${index}`)
    exactKeys(current.freeze, [
      'activeKeyIds', 'bootstrapClient', 'overlapKeyIds',
    ], `snapshot ${index} freeze`)
    exactKeys(current.freeze.bootstrapClient, ['sha256'], `snapshot ${index} bootstrap digest`)
    if (current.phase !== rule.phase
      || current.registrations.map(({ state }) => state).join(',') !== rule.states.join(',')) {
      throw new Error(`Registration sequence order/state mismatch at ${rule.phase}`)
    }
    const activeKeys = current.registrations.filter(({ state }) => state === 'active')
    const overlapKeys = current.registrations.filter(({ state }) => state === 'overlap')
    if (activeKeys.length !== rule.active || overlapKeys.length !== rule.overlap) {
      throw new Error(`Registration sequence active/overlap invariant failed at ${rule.phase}`)
    }
    if (current.freeze.bootstrapClient.sha256 !== bootstrapDigest
      || !sameStrings(current.freeze.activeKeyIds, activeKeys.map(({ keyId }) => keyId))
      || !sameStrings(current.freeze.overlapKeyIds, overlapKeys.map(({ keyId }) => keyId))) {
      throw new Error(`Registration sequence freeze binding mismatch at ${rule.phase}`)
    }
    const verifiable = current.registrations.filter(({ state }) => state !== 'retired')
    if (!sameStrings(Object.keys(current.runtimePublicKeys), verifiable.map(({ publicKeyReference }) => publicKeyReference))) {
      throw new Error(`Registration sequence runtime reference mismatch at ${rule.phase}`)
    }
    for (const registration of current.registrations) {
      validateRegistration(registration)
      if (registration.keyId !== await derivedKeyId(registration.publicJwk)) {
        throw new Error('Registration sequence key id is not derived from public key material')
      }
      const material = JSON.stringify({ ...registration, state: 'normalized' })
      const prior = materialByKey.get(registration.keyId)
      if (prior && prior !== material) throw new Error('Registration sequence key material drift')
      materialByKey.set(registration.keyId, material)
      if (registration.state !== 'retired'
        && JSON.stringify(current.runtimePublicKeys[registration.publicKeyReference])
          !== JSON.stringify(registration.publicJwk)) {
        throw new Error('Registration sequence runtime public-key material mismatch')
      }
    }
  }

  const [initialActive] = sequence.snapshots[0]!.registrations
  const [overlapOld, overlapNew] = sequence.snapshots[1]!.registrations
  const [finalRetired, finalActive] = sequence.snapshots[2]!.registrations
  if (!initialActive || !overlapOld || !overlapNew || !finalRetired || !finalActive
    || initialActive.keyId !== overlapOld.keyId
    || initialActive.keyId !== finalRetired.keyId
    || overlapNew.keyId !== finalActive.keyId
    || overlapNew.keyId === initialActive.keyId
    || JSON.stringify(sequence.bootstrapClient.verificationKey) !== JSON.stringify(bootstrapKey(initialActive))
    || Date.parse(finalActive.activatedAt) <= Date.parse(finalRetired.activatedAt)) {
    throw new Error('Registration sequence rotation identity/timestamp mismatch')
  }
}

async function createEphemeralAssertionKey(activatedAt: string): Promise<EphemeralAssertionKey> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const exported = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  if (exported.kty !== 'EC' || exported.crv !== 'P-256'
    || typeof exported.x !== 'string' || typeof exported.y !== 'string'
    || typeof exported.d !== 'string') {
    throw new Error('Ephemeral rehearsal key export failed')
  }
  const publicJwk: AcademyClientAssertionRehearsalPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x,
    y: exported.y,
    use: 'sig',
    key_ops: ['verify'],
  }
  const keyId = await derivedKeyId(publicJwk)
  const signer = await createIdentityClientAssertionWebCryptoSigner({
    clientId: CLIENT_ID,
    purpose: 'code_exchange',
    keyId,
    privateJwk: JSON.stringify({
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
      d: exported.d,
    }),
  })
  return {
    keyId,
    activatedAt,
    publicJwk,
    providerForAudience: (audience) => createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: 'code_exchange',
      audience,
      keyId,
      lifetimeSeconds: 60,
      clock: { now: () => new Date(NOW_SECONDS * 1_000) },
      jtiSource: createIdentityClientAssertionJtiSource(),
      signer,
    }),
  }
}

function snapshot(
  phase: AcademyClientAssertionRegistrationSequence['snapshots'][number]['phase'],
  keys: Array<ControlKey & { state: AcademyClientAssertionRehearsalKey['state'] }>,
  materials: EphemeralAssertionKey[],
): AcademyClientAssertionRegistrationSequence['snapshots'][number] {
  const registrations = keys.map((key) => registration(
    materials.find(({ keyId }) => keyId === key.keyId)!, key.state,
  ))
  const runtimePublicKeys = Object.fromEntries(registrations
    .filter(({ state }) => state !== 'retired')
    .map(({ publicKeyReference, publicJwk }) => [publicKeyReference, structuredClone(publicJwk)]))
  return {
    phase,
    registrations,
    runtimePublicKeys,
    freeze: {
      bootstrapClient: { sha256: '' },
      activeKeyIds: registrations.filter(({ state }) => state === 'active').map(({ keyId }) => keyId),
      overlapKeyIds: registrations.filter(({ state }) => state === 'overlap').map(({ keyId }) => keyId),
    },
  }
}

function registration(
  key: EphemeralAssertionKey,
  state: AcademyClientAssertionRehearsalKey['state'],
): AcademyClientAssertionRehearsalKey {
  return {
    clientId: CLIENT_ID,
    keyId: key.keyId,
    algorithm: 'ES256',
    publicKeyReference: publicKeyReference(key.keyId),
    state,
    activatedAt: key.activatedAt,
    publicJwk: structuredClone(key.publicJwk),
  }
}

function controlKey(key: EphemeralAssertionKey): ControlKey {
  return {
    keyId: key.keyId,
    algorithm: 'ES256',
    publicKeyReference: publicKeyReference(key.keyId),
  }
}

function bootstrapKey(key: AcademyClientAssertionRehearsalKey): AcademyClientAssertionBootstrapKey {
  return structuredClone({
    keyId: key.keyId,
    algorithm: key.algorithm,
    publicKeyReference: key.publicKeyReference,
    state: key.state,
    activatedAt: key.activatedAt,
    publicJwk: key.publicJwk,
  })
}

function registry(keys: AcademyClientAssertionRehearsalKey[]): AcademyClientAssertionRehearsalRegistry {
  return { audience: AUDIENCE, nowSeconds: NOW_SECONDS, keys: structuredClone(keys) }
}

async function registrationEvidence(key: EphemeralAssertionKey) {
  return {
    clientId: CLIENT_ID,
    keyId: key.keyId,
    algorithm: 'ES256' as const,
    publicKeyReference: publicKeyReference(key.keyId),
    activatedAt: key.activatedAt,
    publicJwkSha256: await digestCanonical(key.publicJwk),
  }
}

function validateBootstrap(value: AcademyClientAssertionRegistrationSequence['bootstrapClient']): void {
  exactKeys(value, [
    'activationPolicy', 'audience', 'clientId', 'configRevision', 'enabled',
    'redirectUris', 'schema', 'serviceId', 'verificationKey',
  ], 'bootstrap client')
  if (value.schema !== 'identity-control-bootstrap-client/v1'
    || value.clientId !== CLIENT_ID || value.serviceId !== SERVICE_ID
    || value.audience !== AUDIENCE || value.activationPolicy !== 'unavailable'
    || value.enabled !== false || value.configRevision !== 1
    || !Array.isArray(value.redirectUris) || value.redirectUris.length !== 1
    || !value.redirectUris[0]!.startsWith('https://')) {
    throw new Error('Registration sequence local-disabled bootstrap mismatch')
  }
  exactKeys(value.verificationKey, [
    'activatedAt', 'algorithm', 'keyId', 'publicJwk', 'publicKeyReference', 'state',
  ], 'bootstrap verification key')
  validateRegistration({ clientId: CLIENT_ID, ...value.verificationKey })
  if (value.verificationKey.state !== 'active') {
    throw new Error('Registration sequence bootstrap key must be active')
  }
}

function validateRegistration(value: AcademyClientAssertionRehearsalKey): void {
  exactKeys(value, [
    'activatedAt', 'algorithm', 'clientId', 'keyId', 'publicJwk', 'publicKeyReference', 'state',
  ], 'registration')
  exactKeys(value.publicJwk, ['crv', 'key_ops', 'kty', 'use', 'x', 'y'], 'public JWK')
  if (value.clientId !== CLIENT_ID || value.algorithm !== 'ES256'
    || value.publicKeyReference !== publicKeyReference(value.keyId)
    || !/^academy-[a-f0-9]{40}$/.test(value.keyId)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.activatedAt)
    || !Number.isFinite(Date.parse(value.activatedAt))
    || value.publicJwk.kty !== 'EC' || value.publicJwk.crv !== 'P-256'
    || value.publicJwk.use !== 'sig'
    || !Array.isArray(value.publicJwk.key_ops)
    || value.publicJwk.key_ops.length !== 1 || value.publicJwk.key_ops[0] !== 'verify'
    || !/^[A-Za-z0-9_-]{43}$/.test(value.publicJwk.x)
    || !/^[A-Za-z0-9_-]{43}$/.test(value.publicJwk.y)) {
    throw new Error('Registration sequence key contract mismatch')
  }
}

function exactKeys(value: unknown, keys: string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`Registration sequence ${label} fields mismatch`)
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

async function derivedKeyId(publicJwk: AcademyClientAssertionRehearsalPublicJwk): Promise<string> {
  return `academy-${(await digestCanonical(publicJwk)).slice(0, 40)}`
}

async function digestCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => (
      [key, canonicalize((value as Record<string, unknown>)[key])]
    )))
  }
  return value
}

function publicKeyReference(keyId: string): string {
  return `config://client-keys/${CLIENT_ID}/${keyId}`
}

function assertion(key: EphemeralAssertionKey, audience: string): Promise<string> {
  return key.providerForAudience(audience).createClientAssertion({ audience })
}

function authenticate(
  options: AcademyClientAssertionRegistrationRehearsalOptions,
  rehearsalRegistry: AcademyClientAssertionRehearsalRegistry,
  clientId: string,
  value: string,
) {
  return options.createAuthenticator(structuredClone(rehearsalRegistry)).authenticate(clientId, value)
}

function tamper(value: string): string {
  const segments = value.split('.')
  if (segments.length !== 3) throw new Error('Ephemeral rehearsal assertion is malformed')
  const signature = segments[2]!
  const replacement = signature.endsWith('A') ? 'B' : 'A'
  return `${segments[0]}.${segments[1]}.${signature.slice(0, -1)}${replacement}`
}
