# Learner Course Skill-Map Checkpoint — 2026-08-09

## User Outcome

An entitled learner can see a topic-coverage map on the protected
`/courses/{slug}/learn` overview. It shows which course topics are represented
by lessons they finished. It explicitly is not a score, assessment, or measure
of proficiency; skipped lessons do not increase coverage. Required-checkpoint
evidence remains separate in the Learning record card.

The map is prepared for both English and Thai learner routes. Production use
still awaits the separate Identity Control runtime: this checkpoint does not
open accounts, lessons, progress, media, or enrollment to public visitors.

## Contract and Boundaries

- `GET /api/courses/{slug}/skill-map` first requires a current user, then the
  existing activation and course-entitlement authorization, and only then reads
  progress. It returns a derived `id`, localized `label`, `value`, and
  `notStarted` DTO.
- The endpoint never returns skill weights, global weights, lesson bodies,
  media paths, cues, answer keys, assessment evidence, or raw progress. Every
  response uses `Cache-Control: private, no-store`.
- The protected learner page now passes the same `toPublicCourse` roadmap
  allowlist into its client overview as the public route. The skill map remains
  behind its own authorized endpoint, so route protection does not become a
  reason to broaden the Flight payload.
- The client distinguishes session expiry (`401`), enrollment/access loss
  (`403`), and an unavailable map. Session or access loss removes the existing
  learner record from view; unavailable data shows a localized retry state.
- The public course route never requests the map, including when the browser
  reports a signed-in account, and the public projection remains unchanged.

## Verification

- New unit tests cover endpoint authentication, entitlement, missing course,
  derived-only response, no-store caching, malformed data, session expiry,
  access loss, network failure, UI presentation states, Thai strings, and the
  protected-page Flight prop boundary.
- Full unit suite: `464/464` passed across `66` files.
- Production Next build passed. `/api/courses/[slug]/skill-map` is dynamic and
  `/learn` remains a protected dynamic route; public localized pages remain
  static.
- Public production-build E2E: `24/24` passed on desktop and mobile, including
  the no-progress and no-skill-map request boundary for public pages.
- Lint/typecheck passed with one existing generated-registry unused-disable
  warning and no errors. `git diff --check` passed.

## Independent Review In Loop

- Code/debt reviewer (Sol high): `C0 / H0 / M0 / L0` after two corrective
  loops. It verified the Flight allowlist and separate `401`/`403` contract.
- Security reviewer: `C0 / H0 / M0 / L0`. It verified authorization ordering,
  no-store responses, derived data minimization, and non-public middleware
  behavior.
- UX/accessibility reviewer: `C0 / H0 / M0 / L1`. It verified Thai copy,
  loading/unavailable/retry states, SVG accessible text, table alternative, and
  responsive chart constraints.

## Residual Work

No browser test can currently render an entitled `/learn` map at 320px and
390px without enabling the unfinished Identity runtime or a local identity
fixture backed by the learner store. When that runtime is ready, add a direct
entitled learner E2E that verifies English and Thai maps, map retry/access-loss
states, reset/locale transitions, and no horizontal overflow at both widths.

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
