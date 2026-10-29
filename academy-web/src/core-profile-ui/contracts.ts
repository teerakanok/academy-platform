/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 50146947e4b401d0706a9f5ed74ff462b9252fd8eb3cc27287ebd76a553e0ed2 */
// Browser-facing learning-profile contract (schemaVersion '1').
// Consumed verbatim by the Crux web app and served by the Crux BFF, which
// proxies Core. Field names are pinned; change only with a new schemaVersion.
import { z } from 'zod/v3'

export const SCHEMA_VERSION = '1' as const

const iso = z.string().datetime({ offset: true })
const id = z.string().min(1).max(200)
export const skillLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export const nullableLevelSchema = skillLevelSchema.nullable()
export const targetLevelSchema = z.enum(['entry', 'intermediate', 'advanced'])
export const historyMonthsSchema = z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)])
export const evidenceStatusSchema = z.enum(['eligible', 'practice', 'unmapped', 'excluded'])
export const attributionSchema = z.enum(['individual', 'team'])

export const interpretationSchema = z.object({ version: z.string().min(1), label: z.string().min(1) }).strict()

export const profileSkillSchema = z.object({
  id,
  label: z.string(),
  level: nullableLevelSchema,
  evidenceIds: z.array(id),
  assessedAt: iso.nullable(),
}).strict()

export const historyPointSchema = z.object({
  monthsAgo: historyMonthsSchema,
  asOf: iso,
  skills: z.array(z.object({ id, level: nullableLevelSchema }).strict()),
}).strict()

export const evidenceSchema = z.object({
  id,
  product: z.string().min(1).max(40),
  assessmentId: z.string().min(1).max(200),
  title: z.string().max(200),
  kind: z.string().min(1).max(40),
  attribution: attributionSchema,
  assessedAt: iso,
  status: evidenceStatusSchema,
  reason: z.string().max(200).nullable(),
  skillIds: z.array(id),
  verificationReference: z.string().max(200).nullable(),
}).strict()

export const requirementSchema = z.object({ skillId: id, level: skillLevelSchema }).strict()
const roleLevelSchema = z.object({ requirements: z.array(requirementSchema) }).strict()
export const roleSchema = z.object({
  id,
  title: z.string(),
  levels: z.object({ entry: roleLevelSchema, intermediate: roleLevelSchema, advanced: roleLevelSchema }).strict(),
}).strict()

export const goalSchema = z.object({ roleId: id.nullable(), level: targetLevelSchema }).strict()

export const shareSummarySchema = z.object({
  id,
  createdAt: iso,
  expiresAt: iso,
  revokedAt: iso.nullable(),
  skillIds: z.array(id),
  includeRoleComparison: z.boolean(),
  /** Present only on a grant made before identity-bound names: its name was
   *  browser-typed, so it is no longer served publicly. */
  invalidReason: z.literal('name_unverified').optional(),
}).strict()

/** The name a new share would carry, read server-side from the Identity Control
 *  account profile. `ready`: displayName is that account name (self-declared, not a
 *  verified legal name). `name_missing`: the account has no name set. `unavailable`:
 *  no source configured, account not linked, or a transient outage. Never a session
 *  nickname or browser value. */
export const shareIdentitySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready'), displayName: z.string().min(1).max(120) }).strict(),
  z.object({ state: z.literal('name_missing'), displayName: z.null() }).strict(),
  z.object({ state: z.literal('unavailable'), displayName: z.null() }).strict(),
])

/** GET /learning-profile (authenticated self only). No principal, email or raw answers. */
export const privateProfileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  asOf: iso,
  interpretation: interpretationSchema,
  skills: z.array(profileSkillSchema),
  history: z.array(historyPointSchema),
  evidence: z.array(evidenceSchema),
  roles: z.array(roleSchema),
  goal: goalSchema,
  shares: z.array(shareSummarySchema),
  shareIdentity: shareIdentitySchema,
}).strict()

/** PUT /learning-profile/goal */
export const setGoalCommandSchema = z.object({
  requestId: z.string().uuid(),
  roleId: id,
  level: targetLevelSchema,
}).strict()

/** Cosmetic share styling from a closed whitelist: no URLs, markup, CSS or assets. */
export const shareSceneSchema = z.enum(['mountain', 'canyon', 'islands'])
export const shareThemeSchema = z.enum(['classic', 'halloween'])
export const sharePresentationSchema = z.object({
  scene: shareSceneSchema,
  theme: shareThemeSchema,
  showRadar: z.boolean(),
}).strict()
/** Applied by Core when a command omits `presentation`, and by clients reading an older grant without one. */
export const DEFAULT_SHARE_PRESENTATION: Readonly<SharePresentation> = { scene: 'mountain', theme: 'classic', showRadar: true }

/** POST /learning-profile/shares. `secret` is client-generated (32 random bytes, hex) and stored hash-only.
 *  There is no name field: Core binds the Identity Control account name of the
 *  canonical principal, or refuses with 409 `account_name_missing` / 503
 *  `identity_name_unavailable`. */
export const createShareCommandSchema = z.object({
  requestId: z.string().uuid(),
  skillIds: z.array(id).min(1).max(32),
  includeRoleComparison: z.boolean(),
  expiresInDays: z.number().int().min(1).max(90),
  secret: z.string().regex(/^[0-9a-f]{64}$/),
  presentation: sharePresentationSchema.optional(),
}).strict()

export const createShareResponseSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  share: shareSummarySchema.extend({ revokedAt: z.null() }).omit({ invalidReason: true }).strict(),
}).strict()

/** Where the public name came from: the Identity Control account profile of the
 *  owner, read server-side when the grant was made. `account_name` is a self-declared
 *  account name, NOT a verified legal name; `observedAt` is when Core read it. */
export const nameAttestationSchema = z.object({
  source: z.literal('identity-control'),
  assurance: z.literal('account_name'),
  observedAt: iso,
}).strict()

/** DELETE /learning-profile/shares/:id */
export const revokeShareCommandSchema = z.object({ requestId: z.string().uuid() }).strict()
export const revokeShareResponseSchema = z.object({ revoked: z.literal(true) }).strict()

/** Public policy only: the role's thresholds at every level and the labels of the
 *  skills they name. Carries no learner level for any skill. */
export const roleJourneySchema = z.object({
  role: roleSchema,
  skillLabels: z.array(z.object({ id, label: z.string() }).strict()),
}).strict()

export const roleComparisonSchema = z.object({
  roleId: id,
  title: z.string(),
  level: targetLevelSchema,
  /** Target-level requirements for SHARED skills only (legacy consumers). */
  requirements: z.array(requirementSchema),
  /** Present on grants created after it was added; full target counts come from `journey.role`. */
  journey: roleJourneySchema.optional(),
}).strict()

/** Public GET /learning-profile/shares/:id with `Authorization: Bearer <secret>`. */
export const publicShareSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  shareId: id,
  /** The owner's account name frozen at creation; see `nameAttestation`. */
  displayName: z.string(),
  nameAttestation: nameAttestationSchema,
  createdAt: iso,
  expiresAt: iso,
  interpretation: interpretationSchema,
  skills: z.array(profileSkillSchema),
  evidence: z.array(evidenceSchema),
  roleComparison: roleComparisonSchema.nullable(),
  /** Always present on new grants; absent on older ones (read as DEFAULT_SHARE_PRESENTATION). */
  presentation: sharePresentationSchema.optional(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export type SkillLevel = z.infer<typeof skillLevelSchema>
export type TargetLevel = z.infer<typeof targetLevelSchema>
export type HistoryMonths = z.infer<typeof historyMonthsSchema>
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>
export type Interpretation = z.infer<typeof interpretationSchema>
export type ProfileSkill = z.infer<typeof profileSkillSchema>
export type HistoryPoint = z.infer<typeof historyPointSchema>
export type Evidence = z.infer<typeof evidenceSchema>
export type Requirement = z.infer<typeof requirementSchema>
export type Role = z.infer<typeof roleSchema>
export type Goal = z.infer<typeof goalSchema>
export type ShareSummary = z.infer<typeof shareSummarySchema>
export type PrivateProfile = z.infer<typeof privateProfileSchema>
export type SetGoalCommand = z.infer<typeof setGoalCommandSchema>
export type CreateShareCommand = z.infer<typeof createShareCommandSchema>
export type CreateShareResponse = z.infer<typeof createShareResponseSchema>
export type RevokeShareCommand = z.infer<typeof revokeShareCommandSchema>
export type RevokeShareResponse = z.infer<typeof revokeShareResponseSchema>
export type ShareScene = z.infer<typeof shareSceneSchema>
export type ShareTheme = z.infer<typeof shareThemeSchema>
export type SharePresentation = z.infer<typeof sharePresentationSchema>
export type RoleJourney = z.infer<typeof roleJourneySchema>
export type RoleComparison = z.infer<typeof roleComparisonSchema>
export type PublicShare = z.infer<typeof publicShareSchema>
export type NameAttestation = z.infer<typeof nameAttestationSchema>
export type ShareIdentity = z.infer<typeof shareIdentitySchema>

/** Public share URL path. The secret travels only in the fragment: `/profile/share/:id#<secret>`. */
export const publicShareUrlPath = (shareId: string) => `/profile/share/${encodeURIComponent(shareId)}`
