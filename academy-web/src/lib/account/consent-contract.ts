import { z } from 'zod'

// Consumer projection of Identity consumer-consent-v1; fixtures pin the producer bytes.
export const consentTypeSchema = z.enum(['research_statistics', 'marketing_email'])
export type ConsentType = z.infer<typeof consentTypeSchema>
export const consentRevisionSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(value => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'))
export const consentWithdrawalSchema = z.strictObject({
  type: consentTypeSchema, operationId: z.uuid(), expectedRevision: consentRevisionSchema,
})
export type ConsentWithdrawal = z.infer<typeof consentWithdrawalSchema>
export const consentStateSchema = z.strictObject({
  version: z.literal(1),
  consents: z.array(z.strictObject({
    type: consentTypeSchema, status: z.enum(['granted', 'withdrawn', 'not_granted']),
    documentVersion: z.string().regex(/^v[0-9]{1,3}$/),
    grantedAt: z.iso.datetime().nullable(), withdrawnAt: z.iso.datetime().nullable(), revision: consentRevisionSchema,
  })).length(2).refine(rows => new Set(rows.map(row => row.type)).size === 2),
})
export type ConsentState = z.infer<typeof consentStateSchema>
export const consentConflictSchema = z.strictObject({ error: z.literal('consent_revision_conflict'), state: consentStateSchema })
