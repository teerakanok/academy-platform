export type ProductionAdmissionArtifact = Readonly<{
  artifactPath: string
  artifactSha256: string
}>

export type ProductionAdmissionDecision = Readonly<
  | { status: 'rejected' }
  | {
      status: 'admissible_for_authorized_operation'
      candidateId: string
      evidence: Readonly<{
        sourceRevision: ProductionAdmissionArtifact
        migrationInventory: ProductionAdmissionArtifact & Readonly<{
          entries: ReadonlyArray<Readonly<{
            migrationId: string
            artifactPath: string
            artifactSha256: string
          }>>
        }>
        runtimeConfigProjection: ProductionAdmissionArtifact
        visualEvidenceIndex: ProductionAdmissionArtifact
        operatorAuthorizationReceipt: ProductionAdmissionArtifact
        deployedSmokeResult: ProductionAdmissionArtifact
        rollbackRehearsal: ProductionAdmissionArtifact
        freezeManifest: ProductionAdmissionArtifact
      }>
    }
>

const GATES = [
  'sourceRevision',
  'migrationInventory',
  'runtimeConfigProjection',
  'visualEvidenceIndex',
  'operatorAuthorizationReceipt',
  'deployedSmokeResult',
  'rollbackRehearsal',
  'freezeManifest',
] as const
const PACKET_KEYS = ['candidateId', 'evidence'] as const
const GATE_KEYS = ['gate', 'candidateId', 'accepted', 'artifactPath', 'artifactSha256'] as const
const MIGRATION_GATE_KEYS = [...GATE_KEYS, 'entries'] as const
const MIGRATION_KEYS = ['migrationId', 'artifactPath', 'artifactSha256'] as const
const SHA256 = /^[0-9a-f]{64}$/
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/
const REJECTED = Object.freeze({ status: 'rejected' as const })

/**
 * Structural gate only. A positive result still requires a separate authorized
 * operation to verify and use the referenced artifacts.
 */
export function evaluateProductionAdmissionEvidence(input: unknown): ProductionAdmissionDecision {
  const packet = snapshotRecord(input, PACKET_KEYS)
  if (!packet || !isSafeId(packet.candidateId)) return REJECTED

  const evidence = snapshotArray(packet.evidence, GATES.length)
  if (!evidence || evidence.length !== GATES.length) return REJECTED

  const paths = new Set<string>()
  const snapshots: unknown[] = []
  for (let index = 0; index < GATES.length; index += 1) {
    const expectedGate = GATES[index]
    const gate = snapshotRecord(
      evidence[index],
      expectedGate === 'migrationInventory' ? MIGRATION_GATE_KEYS : GATE_KEYS,
    )
    if (
      !gate
      || gate.gate !== expectedGate
      || gate.candidateId !== packet.candidateId
      || gate.accepted !== true
      || !isSafePath(gate.artifactPath)
      || !isSha256(gate.artifactSha256)
      || paths.has(gate.artifactPath)
    ) return REJECTED
    paths.add(gate.artifactPath)

    if (expectedGate !== 'migrationInventory') {
      snapshots.push(artifact(gate.artifactPath, gate.artifactSha256))
      continue
    }

    const entries = snapshotArray(gate.entries, 512)
    if (!entries || entries.length === 0) return REJECTED
    const migrationIds = new Set<string>()
    const migrationPaths = new Set<string>()
    const migrationSnapshots = []
    let priorId: string | null = null
    for (const value of entries) {
      const entry = snapshotRecord(value, MIGRATION_KEYS)
      if (
        !entry
        || !isSafeId(entry.migrationId)
        || !isSafePath(entry.artifactPath)
        || !isSha256(entry.artifactSha256)
        || migrationIds.has(entry.migrationId)
        || migrationPaths.has(entry.artifactPath)
        || paths.has(entry.artifactPath)
        || (priorId !== null && entry.migrationId.localeCompare(priorId, 'en') <= 0)
      ) return REJECTED
      migrationIds.add(entry.migrationId)
      migrationPaths.add(entry.artifactPath)
      paths.add(entry.artifactPath)
      priorId = entry.migrationId
      migrationSnapshots.push({
        migrationId: entry.migrationId,
        artifactPath: entry.artifactPath,
        artifactSha256: entry.artifactSha256,
      })
    }
    snapshots.push({
      ...artifact(gate.artifactPath, gate.artifactSha256),
      entries: migrationSnapshots,
    })
  }

  return deepFreeze({
    status: 'admissible_for_authorized_operation' as const,
    candidateId: packet.candidateId,
    evidence: {
      sourceRevision: snapshots[0],
      migrationInventory: snapshots[1],
      runtimeConfigProjection: snapshots[2],
      visualEvidenceIndex: snapshots[3],
      operatorAuthorizationReceipt: snapshots[4],
      deployedSmokeResult: snapshots[5],
      rollbackRehearsal: snapshots[6],
      freezeManifest: snapshots[7],
    },
  }) as ProductionAdmissionDecision
}

function artifact(artifactPath: unknown, artifactSha256: unknown) {
  return { artifactPath, artifactSha256 }
}

function snapshotRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): Record<Keys[number], unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return null
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.length !== keys.length || ownKeys.some((key, index) => key !== keys[index])) return null
    const snapshot = Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !('value' in descriptor)) return null
      snapshot[key] = descriptor.value
    }
    return snapshot as Record<Keys[number], unknown>
  } catch {
    return null
  }
}

function snapshotArray(value: unknown, maximumLength: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximumLength) return null
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index))
    expectedKeys.push('length')
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.length !== expectedKeys.length
      || ownKeys.some((key, index) => key !== expectedKeys[index])) return null
    const snapshot = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !('value' in descriptor)) return null
      snapshot.push(descriptor.value)
    }
    return snapshot
  } catch {
    return null
  }
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

function isSafePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) return false
  const segments = value.split('/')
  return segments.length <= 32
    && segments.every((segment) => SAFE_PATH_SEGMENT.test(segment))
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value)
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}
