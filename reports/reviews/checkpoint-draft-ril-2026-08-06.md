# Checkpoint draft RIL

**Date:** 2026-08-06  
**Scope:** preserve learner-entered checkpoint work across a browser reload, but
only within the same server-issued attempt.

## Frozen inventory

- `academy-web/src/lib/course/checkpoint-draft.ts` adds a versioned, attempt-scoped
  browser draft store and allow-list sanitization.
- `academy-web/src/components/course/CheckpointQuiz.tsx` restores that draft only
  after client mount, blocks interaction while restoring, saves only after
  hydration, and clears it on pass or replacement.
- `academy-web/src/components/course/LessonView.tsx` clears the superseded draft
  before requesting a replacement attempt after a consumed/expired attempt.
- `academy-web/tests/unit/checkpoint-draft.test.ts` covers round trip, scope
  isolation, malformed/out-of-contract data, targeted clearing, and denied
  storage.
- `academy-web/e2e/attempt-ux.spec.ts` covers reload restoration and clearing on
  pass, learner-requested replacement, and automatic `409` replacement.
- `plans/active_plan.md` and `plans/completed_log.md` record the closed learner
  issue and its evidence.

No schema, production service, credential, course answer key, or authorization
contract changes are in this checkpoint.

## Regression evidence

- Red: the new draft test did not resolve before the draft module existed.
- Green: `npm run test:unit` passed: 46 files, 400 tests.
- `npm run lint` passed with no errors; one pre-existing warning remains in
  `src/lib/content/registry.generated.ts` for an unused disable directive.
- `npm run build:cf` passed.
- The new Playwright assertions are present but were not executed locally. The
  local Supabase bootstrap stops before test setup because an existing migration
  references the absent `academy_runtime` role (`SQLSTATE 42704`). This is outside
  the draft scope; no migration was changed or production purge invoked. Rerun
  `attempt-ux.spec.ts` after the local database bootstrap issue is independently
  repaired.

## Independent review loop

Initial independent code/debt, security, and UX reviews found Medium issues:

1. browser storage access/removal could throw under restrictive browser policy;
2. hydration could overwrite a saved draft before restoration, and prior-attempt
   work could survive an automatic replacement;
3. the persistent live region repeated visible `role=alert` failures, and retry
   copy did not state that the task is fresh;
4. the completed-log test count did not match the current suite.

The implementation now guards browser storage access, hydrates before saving,
clears the old attempt before every replacement path, uses only one announcement
for error/validation states, makes the replacement explicit, and records the
verified 400-test result.

Final independent reruns:

- Code/debt: `C0/H0/M0/L0` - pass. The automatic `409` replacement test now
  captures the old draft key and polls for its removal after the replacement
  attempt arrives.
- Security: `C0/H0/M0/L1` - pass with the owned browser-residue item below.
  The review found no credential, answer-key, attempt-isolation, or replacement
  race regression.
- UX/premium: `C0/H0/M0/L0` - pass. Hydration locks controls, error alerts are
  announced once, and the retry copy no longer contradicts the attempt quota.

## Bounded residual risk

An abandoned, unsubmitted draft can remain in the learner's local browser until
that browser clears site storage. It contains only the learner's answers and
public issued-task state, never a credential, answer key, grading rule, or server
authority. **Owner:** Academy platform workstream. **Removal trigger:** before
opening account runtime or public launch, introduce bounded expiry and
opportunistic pruning for `academy.checkpoint-draft:v1`, with unit coverage for
stale-key removal.

## Final verdict

**PASS.** Every applicable lane is `C0/H0/M0`; the retained Low item has an
owner, a removal trigger, and a closing verification requirement. The browser
E2E evidence gap described in the original review is closed by the follow-up
execution below.

## Follow-up execution and repair

The original browser-evidence gap was closed after a clean local Supabase start
and `db reset` applied migrations `0001` through `0020`. `supabase/roles.sql`
now supplies only local migration-compatibility roles; it does not grant
`BYPASSRLS` or replace the separate privileged production bootstrap.
The local rehearsal runbook removes the CLI-generated `postgres` membership
edges before applying the privileged scripts, so their production fail-closed
membership check remains meaningful in a disposable local stack.

For the browser proof, a disposable local dedicated PostgREST container used
loopback-only transport and ephemeral credentials. It was removed, its
authenticator password cleared, and the local Supabase stack stopped after the
run. No shared database, production credential, retention action, or production
service was accessed.

The first real E2E run found that a prior render's queued save could recreate an
old draft after `discardDraft()` during automatic attempt replacement. The code
now uses a synchronous ref guard before deleting the key. The synthetic `409`
fixture also models the production invariant that an invalid attempt is replaced
with a distinct attempt ID; without that, the real API correctly reuses the
still-active server attempt and restoring its scoped draft is expected.

- `npm run test:unit`: 46 files, 400 tests passed.
- `npm run lint`: no errors; one pre-existing generated-registry warning.
- `npm run build`: passed.
- `npm run test:e2e -- e2e/attempt-ux.spec.ts`: 9/9 passed.

The follow-up source remained subject to the same final independent review
criteria before its commit. Those reruns completed after the fixture wording and
local-role operational boundary were made explicit:

- Code/debt: `C0/H0/M0/L0` - pass.
- Security: `C0/H0/M0/L1` - pass. The local-role deployment ambiguity is closed;
  the only retained Low is the bounded device-local draft residue documented
  above with its owner and removal trigger.
- UX/premium: `C0/H0/M0/L0` - pass. The `409` fixture now states precisely that
  it proves replacement identity, remount, and old-draft removal, rather than a
  complete replacement task submission.
