# Learner Dashboard Data-Boundary Checkpoint — 2026-08-09

## User Outcome

An enrolled learner's dashboard still shows their entitled courses, lesson
progress, resume point, and cross-course lesson coverage. The dashboard no
longer sends the complete course registry to the browser before enrollment is
known. Its coverage chart now explicitly says that it describes lesson coverage,
not proficiency.

## Contract and Boundaries

- Static `/dashboard` passes no course catalog through Flight. The client starts
  with an honest loading state and receives a dashboard catalog only from
  `GET /api/progress`.
- The endpoint checks current user and service activation, then checks each
  course entitlement before it creates that course's DTO. The DTO contains only
  card/roadmap data and `globalSkillWeights` needed for the aggregate chart; it
  omits version, public availability, course skills, node weights, media, cues,
  and skill labels.
- Every GET outcome from `/api/progress` is `Cache-Control: private, no-store`.
  A shared cache cannot retain account progress or entitled-course data.
- The client reconstructs its state from a strict allowlist parser. Missing,
  extra, duplicate, or mismatched course slugs, malformed roadmap DTOs, and
  malformed progress records all fail closed to the existing unavailable/retry
  state instead of being presented as an empty enrollment.

## Verification

- Unit tests cover the Flight-shell boundary, exact DTO projection, entitlement
  filtering, no-store headers, malformed success payloads, duplicate/mismatched
  course slugs, and malformed progress records.
- Full unit suite: `474/474` passed across `71` files.
- Production Next build passed. The built dashboard RSC contained none of the
  raw course markers (`lesson-demo`, `cue-kernel`, `skillWeights`,
  `publicAvailability`, or `globalSkillWeights`).
- Public production-build E2E: `24/24` passed on desktop and mobile.
- Lint/typecheck passed with one pre-existing generated-registry unused-disable
  warning and no errors. `git diff --check` passed.

## Independent Review In Loop

- Code/debt reviewer (Sol high): `C0 / H0 / M0 / L0`.
- Security reviewer: `C0 / H0 / M0 / L0` after the follow-up below.
- UX/accessibility reviewer: `C0 / H0 / M0 / L0`.

## Residual Work

Follow-up closed on 2026-08-09: `GET /api/progress` resolves all course
entitlements before reading progress, then passes the resulting slug allowlist
to a required `loadAllProgress` parameter. The helper does not initialize a DB
query for an empty list and applies `course_slug IN (...)` for every non-empty
list. Tests cover allowed-only, all-denied no-read, unavailable entitlement
storage, empty-list no-query, and exact query filtering. Independent Sol and
security reviews both returned `C0 / H0 / M0 / L0`.

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
