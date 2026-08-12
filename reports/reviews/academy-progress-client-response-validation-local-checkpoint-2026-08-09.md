# Academy Progress Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** preliminary independent review `FAIL C0/H0/M2/L0`; M-01/M-02
remediated locally; independent re-review pending

## Outcome

The protected lesson progress client now owns an exact response-boundary
validator and projector. It accepts a successful learner record only when the
response wrapper and record have their exact approved keys, every array and
nested map matches the local schema, and the record slug exactly matches the
requested course. It then returns newly projected arrays and maps rather than
the untrusted response object. Malformed and foreign-course records use the
established fail-closed results: `unavailable` for progress loading and `unknown`
for reset reconciliation.

Valid exact-course records keep the existing success behavior. This checkpoint
changes no response schema, API route, persistence, database, Identity boundary,
configuration, deployment, or production state. The pre-existing dirty
`progress.ts` is explicitly outside this slice: it was neither edited nor
imported by the source or focused test.

## TDD Evidence

The focused RED run passed `9` existing/positive cases and failed all `4` new
negative cases:

- progress loading accepted a malformed empty object as a learner record;
- progress loading accepted a valid-shaped record for another course;
- reset reconciliation accepted a malformed empty object as proof of success;
- reset reconciliation accepted another course's record as proof of success.

After the bounded source change, the focused suite passed `13/13` with no type
errors. Positive cases prove exact-course progress loading and reset
reconciliation remain successful.

The preliminary independent review returned `C0/H0/M2/L0`:

- M-01 found that the reused guard allowed extra record fields, did not validate
  nested simulation maps, and returned the untrusted object itself.
- M-02 found that the implementation and evidence depended on a pre-existing
  dirty `progress.ts` export.

The remediation RED run passed `16` cases and failed `3`: an extra record field,
an array in place of a simulation-evidence map, and identity reuse of the
untrusted record. Other malformed nested arrays/maps were already rejected and
remained explicit cases. After replacing the dependency with the local exact
projector, remediation GREEN passed `19/19` with no type errors.

## Verification

| Gate | Result |
|---|---|
| Focused RED | 4 failed / 9 passed; all four failures reproduced unchecked response acceptance |
| Initial focused GREEN | 1 file / 13 tests passed; no type errors |
| Preliminary independent review | `FAIL C0/H0/M2/L0`; M-01/M-02 remediated, re-review pending |
| Remediation RED | 3 failed / 16 passed; exact keys, nested simulation map, and defensive projection defects reproduced |
| Remediation GREEN | 1 file / 19 tests passed; no type errors |
| Full unit regression | 73 files / 499 tests passed |
| Node 24 lint and typechecks | Passed; one existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte `.open-next/worker.js` |
| Visual | N/A: this pure response-validation boundary changes no layout, style, copy, or UI state; rejected responses use the existing unavailable/unknown flows |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | Tracked `git diff --check` passed. Untracked report check returned content-diff exit 1 with no whitespace diagnostics; staged index remained clean. |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

## Exact Slice Inventory

- `academy-web/src/lib/course/progress-client.ts`
- `academy-web/tests/unit/progress-client.test.ts`
- `reports/reviews/academy-progress-client-response-validation-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md` (narrow checkpoint update within a pre-existing dirty file)
- `plans/completed_log.md` (narrow checkpoint update within a pre-existing dirty file)

`academy-web/src/lib/course/progress.ts` was dirty before this checkpoint and is
excluded from the inventory. This slice neither edits nor imports it.

## Remaining Risk

This checkpoint supplies local client-contract evidence only. It has no
DB-backed, Identity-runtime, deployed-network, or authenticated-browser evidence;
those remain with their separately authorized gates. The existing Identity,
sharp compatibility, private-media, CSP, legal, case-system,
retention-runtime, and public-exposure release gates are unchanged.

Final code/security closure belongs to the independent re-reviewer; this report
is remediation author evidence only.
