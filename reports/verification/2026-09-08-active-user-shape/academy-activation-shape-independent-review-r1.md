# Academy activation response shape — independent review

Result: **PASS** for the exact two-file source patch. No changes required in the bounded scope.
Reviewer is independent of the author; read-only source/evidence inspection only, no source edits or live actions.
Session `ws-cde63a58-f932-47e3-bd65-df549781e118`; existing selected native review route.
Source `/private/tmp/academy-csp-cde63a58`; reviewed base `ac1d32709515211bb0db15ae35728fd3a0fdde19`.
Root committed the unchanged reviewed bytes as `fe4220a1850d277d542cd5e30f38360776df4b15`; two-file manifest `academy-activation-shape-review-manifest-r1.json` matches.

## Exact custody

Patch `/Users/teerakanok/.local/state/cyberskills/model-team-implement/run-uvhbc8/worker-results/run-073335484284ef3f62ea131933aee501/changes.patch`.
Patch SHA256 `d5ff9854057300a94ec1017fa9d8895210713c898c0b7ca3b0c057e9d3d0c887` matched before/after review.
- `academy-web/src/lib/account/users.ts` SHA256 `7d70aa0dce05431221b017c03b70dddb8fb6dd1c99533305acff837fc87fa7e7`.
- `academy-web/tests/unit/account-active-user-activation.test.ts` SHA256 `c40fb233f0e55036b3a5fa6c278b3b12dd55d6e16684e15cb8f48941b3c93abc`.
`rtk proxy git apply --reverse --check <exact-patch-path-above>` → exit 0, stdout empty.
`rtk proxy git diff --check` → exit 0; status listed only the two candidate paths.
Final independent read-only SHA256 verification → exit 0; both files and patch matched the recorded bytes.

## Cause and correction

`academy-post0035-activation-shape-r1.json` records root's actual dedicated PostgREST GET projection `service_activation(status)` only.
Observed HTTP 200, one row, activationShape=object, activationStatus=active; no identifiers/email or credential values in the receipt output.
The previous `findActiveUser` required an array, so that valid one-to-one object was rejected as null.
`users.ts:131` treats the embed as unknown; `:132`–`:134` selects the sole array item or the object itself.
`:135`–`:139` require a non-null object and exact status 'active' before returning the account.
A single active object and a single-item active array are accepted; empty/multi-item arrays, null/undefined, primitive values, missing/wrong-type status and inactive status are refused.
Array length >1 is refused even when all entries are active; the implementation does not choose an arbitrary relation.
Only activation response normalization changes; no SQL, row mutation, provisioning, session lifetime or authorization grant is added.

## Identity and request-path boundary

`users.ts:120`–`:121` retain existing issuer-form and subject validation; `:125`–`:126` filter by exact issuer and subject.
There is no email lookup/fallback; email is projected account data, not the identity key.
Existing query-error/missing-account refusal at `users.ts:129` is unchanged.
`auth/session.ts:57` resolves verified durable-session claims through findActiveUser and returns null on missing account/error.
The new production currentUser test follows the real resolver with a mocked session port and database; it does not mock findActiveUser itself.
The request path remains read-only and cannot recreate or rebind an erased account through this change.

## Observed executable evidence

Receipts below are in `/private/tmp/cyberskills-prod-cde63a58/records/` and were read by reviewer.
`academy-activation-shape-root-red-r1.json`: `npx vitest run --project unit tests/unit/account-active-user-activation.test.ts` on old source → exit 1, 2 failed / 5 passed.
The two causal failures are actual-object resolver acceptance and production currentUser resolution, both returning null before the source fix.
`academy-activation-shape-root-unit-r1.json`: `npx vitest run --project unit` after exact patch → exit 0, 2459 passed / 2 skipped, including all 7 new cases.
Unit log SHA256 `d72817c4ace6f64f57c61473cf329a214b7182d1bf99191924f47be5ca37e299`.
`academy-activation-shape-root-lint-r1.json`: `npm run lint` → exit 1, unchanged 3 baseline errors / 17 warnings; exact prior log SHA256 `510aefd3d40c22d452bca45920e6245b9720752bc7e9213b56a55b2efe8be6c7`.
`academy-activation-shape-root-types-r1.json`: `npx tsc --noEmit` → exit 0.
`academy-activation-shape-root-worker-types-r1.json`: `npx tsc -p tsconfig.worker.json` → exit 0.
`academy-activation-shape-root-retention-types-r1.json`: `npx tsc -p ops/academy-retention-worker/tsconfig.json` → exit 0.
`academy-activation-shape-build-r1.json`: `npm run build:cf` → exit 0; cache sync 64, asset guard passed, real workerd initialized and raw-host HTTP 404 with outbound blocked.
Build log SHA256 `978347c1c1847e6ade1071f110508052241556b95f3a5cb00ff08b42d37af119`.

## Claim limits

PASS covers this parser correction, canonical query preservation and observed tests. It is not a release-allocation or browser-acceptance claim.
The production GET proves the relation shape only; it does not identify the owner account or prove that a browser session reaches the dashboard.
The mocked production currentUser case proves composition, not live session validation, OTP delivery, Academy/Crux SSO or protected course/staff access.
Root retains candidate checks, guarded allocation and immediate normal owner-browser verification with predecessor rollback custody.
No cookie extraction, Safari settings change, founder canary mutation, new DB write or unrelated account-code review was performed.
ส่งคืน bounded review scope ให้ root พร้อม exact hashes ข้างต้น.
