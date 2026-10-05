# Academy multi-provider pilot — internal surface contract

Status: `in_progress` · Date: 2026-09-20 · Parent: director `MPE-20260920`

## Outcome

When `INTERNAL_SURFACES` is disabled, Academy returns a 404 before authentication for both `/admin` and `/player` route families. When enabled, this gate does not grant staff access; existing page/API authorization remains responsible for that.

This resolves the mismatch between the checked-in operator contract in `academy-web/wrangler.jsonc` and `isInternalSurface()` found in the Academy 2026-09-19 security review. It is a code/test pilot only. It does not change a Cloudflare variable, deploy a Worker, run a production request, or claim production acceptance.

## Scope

Allowed source boundary:

- `academy-web/src/lib/internal-surface.ts`
- `academy-web/tests/unit/internal-surface.test.ts`
- a focused middleware test only if the existing unit test cannot prove the 404 boundary

Not in scope: admin data authorization, `/player` content authorization, rate limits, free enrolment, Supabase migrations, UI redesign, production configuration, deploy, or any earlier security finding.

## Provider split and budget

| Role | Binding | Limit |
| --- | --- | --- |
| Author/controller | Codex Terra, current session Medium | one direct implementation pass |
| Reviewer | GLM-5.3 Max | one distinct read-only review of the frozen diff and acceptance claim |
| Correction | original author | only for confirmed in-scope finding; at most two correction passes total |
| Astra | none | not needed unless the GLM review leaves a material, named unresolved question |

Stop `blocked` if the behavior cannot be proven locally without production configuration. Stop `exhausted` if the correction bound is reached. Do not send a second author merely because a test or review fails.

## Acceptance

1. `/admin`, `/admin/…`, `/player`, and `/player/…` are recognized as internal; `/adminx`, `/playerx`, public course routes, and APIs are not.
2. The existing strict toggle behavior remains: only trimmed `on` enables the family.
3. A focused unit test passes from `academy-web`.
4. Lint/type/build are not required for this one-module correction unless the focused check reveals an integration question.
5. GLM review is bound to the final diff and this file; any finding outside scope is recorded as a follow-up, not implemented.

## Taste and user impact

This pilot preserves Academy's existing light classroom and blue-brand decisions. The learner-visible behavior is deliberately quiet: disabled internal routes 404 rather than advertise an administrative surface. No model decides visual taste in this pilot.

## Evidence and final disposition

Record the final base/head, changed paths, focused test command and exit, GLM verdict, in-scope correction count, and residual findings in the parent P1 report or the final implementation report. Commit/deploy is not accepted-work evidence by itself.
