import { createHash } from 'node:crypto'

type Environment = 'production' | 'staging' | 'test' | 'unknown'
type ActorRole = 'learner' | 'ta' | 'staff' | 'test' | 'unknown'

/** Stored with the server-owned attempt; never accepted from a browser request. */
export interface AttemptProfileSnapshot {
  version: 1
  principal: { issuer: string; subject: string }
  mode: 'assessment' | 'practice'
  environment: Environment
  actorRole: ActorRole
  testActivity: boolean | null
  policyRevision: number | null
  integrityEnforced: boolean
  assistance: 'independent' | 'guided' | 'unknown'
  definitionId: string
  definitionVersion: string
  title: string
}

const opaque = (prefix: string, value: string) =>
  `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`

export function captureAttemptProfileSnapshot(input: {
  principal: { issuer: string; subject: string }
  courseSlug: string; nodeId: string; courseVersion: string; assessed: boolean
  integrityEnforced?: boolean
  environment: string | undefined
}): AttemptProfileSnapshot {
  return {
    version: 1, principal: { issuer: input.principal.issuer, subject: input.principal.subject },
    mode: input.assessed ? 'assessment' : 'practice',
    environment: input.environment === 'production' || input.environment === 'staging' || input.environment === 'test'
      ? input.environment : 'unknown',
    // Authentication and course entitlement do not establish this activity's purpose.
    actorRole: 'unknown', testActivity: null, policyRevision: null,
    integrityEnforced: input.assessed && input.integrityEnforced === true,
    // Integrity guards establish server grading, not whether anyone assisted.
    assistance: 'unknown',
    definitionId: opaque('acm', `${input.courseSlug}\0${input.nodeId}`),
    definitionVersion: opaque('acv', input.courseVersion), title: input.nodeId,
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
const principalPart = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 255 && !/[\s\u0000-\u001f\u007f]/.test(value)

export type ProfileProjection =
  | { ok: false; reason: 'invalid_source' | 'identity_untrusted' | 'practice' | 'context_unproven' }
  | { ok: true; event: {
    schemaVersion: '1'; product: 'academy'; principal: { issuer: string; subject: string }
    resultId: string; revision: 0 | 1; scope: string; state: 'active' | 'revoked'
    assessment: { definitionId: string; version: string; title: string; kind: 'module' }
    context: { environment: 'production'; actorRole: 'learner'; attribution: 'individual'; verification: 'server_verified'; assistance: 'unknown' }
    outcome: { score: number; maxScore: 1 } | null; assessedAt: string; verificationReference: string | null
  } }

/** Only rows from commit_attempt_result's immutable ledger may reach this boundary. */
export function projectAttemptProfileResult(row: unknown, trustedIssuer: string): ProfileProjection {
  if (!record(row) || !id(row.attempt_id) || typeof row.passed !== 'boolean'
    || typeof row.recorded_at !== 'string' || !Number.isFinite(Date.parse(row.recorded_at))
    || !record(row.snapshot) || (row.state !== undefined && row.state !== 'active' && row.state !== 'revoked')) return { ok: false, reason: 'invalid_source' }
  const s = row.snapshot
  if (s.version !== 1 || !record(s.principal) || !principalPart(s.principal.issuer)
    || !principalPart(s.principal.subject) || !id(s.definitionId) || !id(s.definitionVersion)
    || typeof s.title !== 'string' || s.title.trim().length < 1 || s.title.length > 200) {
    return { ok: false, reason: 'invalid_source' }
  }
  if (!trustedIssuer || s.principal.issuer !== trustedIssuer) return { ok: false, reason: 'identity_untrusted' }
  if (s.mode === 'practice') return { ok: false, reason: 'practice' }
  if (s.mode !== 'assessment' || s.environment !== 'production' || s.actorRole !== 'learner'
    || s.testActivity !== false || s.integrityEnforced !== true || s.assistance !== 'unknown'
    || typeof s.policyRevision !== 'number' || !Number.isSafeInteger(s.policyRevision) || s.policyRevision < 1) {
    return { ok: false, reason: 'context_unproven' }
  }
  return { ok: true, event: {
    schemaVersion: '1', product: 'academy', principal: { issuer: s.principal.issuer, subject: s.principal.subject },
    resultId: opaque('aca', row.attempt_id), revision: row.state === 'revoked' ? 1 : 0,
    scope: opaque('acs', s.definitionId), state: row.state === 'revoked' ? 'revoked' : 'active',
    assessment: { definitionId: s.definitionId, version: s.definitionVersion, title: s.title, kind: 'module' },
    context: { environment: 'production', actorRole: 'learner', attribution: 'individual', verification: 'server_verified', assistance: 'unknown' },
    outcome: row.state === 'revoked' ? null : { score: row.passed ? 1 : 0, maxScore: 1 }, assessedAt: new Date(row.recorded_at).toISOString(),
    verificationReference: row.state === 'revoked' ? null : opaque('acp', row.attempt_id),
  } }
}
