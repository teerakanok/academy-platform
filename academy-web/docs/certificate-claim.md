# Academy certificate claim

Decision approved by the founder on 2026-08-05.

## Canonical claim

**Certificate of Course Completion: [Course]**

> Completed all course requirements and passed every required assessed checkpoint.
> This is not a professional certification.

The title, achievement statement, and disclaimer are a single product contract. Issued
artifacts, verification pages, and exports must use the canonical constants in
`src/lib/course/certificate-claim.ts` verbatim. Learner-facing previews may use the
state-specific preview constants from the same module so the message leads with the
learner's current value while preserving the same evidence boundary.

## What it means

- Every required lesson was finished. This is course progress, not assessed evidence.
- Every required capstone was passed through an assessed attempt.
- The issued record will identify the course and evidence version used at issuance.

It does not claim mastery, job readiness, professional certification, observed hands-on
performance, or alignment to a competency framework. Current simulation evidence proves
that the learner submitted the required final state for a randomized attempt; it does not
prove observed execution in a real lab.

## Issuance gate

The claim is approved, but issuance remains closed until W4:

1. validates eligibility from the underlying passing evidence, not progress status alone;
2. snapshots course version, assessment criteria, checkpoint identity/results, and the
   privacy-safe evidence summary;
3. creates an idempotent issued record with issuer, date, unpredictable ID, and status;
4. provides privacy-controlled public verification, revocation, no-index, and no-cache.

Do not call the future artifact an Open Badge unless Academy later emits a conformant,
signed OpenBadgeCredential. A public verification page alone is not that standard.
