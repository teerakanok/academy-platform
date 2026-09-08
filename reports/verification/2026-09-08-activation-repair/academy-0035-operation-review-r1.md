# Academy 0035 operational packet — independent review

Result: **PASS — r3 only**. Findings against earlier guards are closed by causal local RED→GREEN evidence.
Reviewer is independent of the packet author; no source/packet edits, SQL execution, host access or production mutation by reviewer.
Session `ws-cde63a58-f932-47e3-bd65-df549781e118`; affected review only, using the existing selected native route.
All packet/receipt paths below are relative to `/private/tmp/cyberskills-prod-cde63a58/records/`.

## Frozen scope

`academy-0035-packet-manifest-r3.json` SHA256 `0fe4eef75cc5041d279782062cf61ee4f1c2a4c910a77df3268f7bfd55277f13`.
- `academy-0035-precondition-r3.sql`: `e270639b371366c059da19eb82dc202759440908fa13e06824c5c25420f97422`.
- `academy-0035-postcondition-r3.sql`: `dc5627f7818693c96195fca53fe7dd0f9c180c0cf9193259ea60abdebc5eca19`.
- `academy-0035-rollback-r3.sql`: `aeb62c7320983cda1496ab59d73147bdd70fd0d2c6cd9d676d436292e90a4562`.
- `academy-0035-rehearse-r3.sql`: `f9bd98eff488f0306277d5671f1879919ec1fa0b15eeb502ef79cc454d83c74d`.
- `academy-0035-commit-r3.sql`: `86e8da83f540857f3e5f407326edf5bb002f34cd9ef4081475ee40fbb1cc0d5e`.
Embedded migration matches source-reviewed SHA256 `2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4`; source review is `academy-activation-independent-review-r1.md`.
Independent read-only Node SHA256/composition check → exit 0, manifest 5/5 matched; composite r3 files equal reviewed r1 with only exact pre/post guard substitutions.
Rehearse contains precondition×2/postcondition×1/migration×1; commit contains 1/1/1; rollback contains 1/1/0.

## Closed findings

1. Earlier postcondition used has_table_privilege(...,'SELECT,INSERT,UPDATE'), which accepts any one listed privilege.
`academy-0035-guard-red-r1.json`: local revoke INSERT/UPDATE then old guard → exit 0, BAD_ACL_ACCEPTED.
`academy-0035-guard-green-r2.json`: same causal mutation → exit 3, writer privilege, guardCorrect=true.
r3 postcondition line 7 retains the correction: each of SELECT, INSERT and UPDATE is required separately.

2. Earlier policy guard accepted matching name/role/command even when USING and WITH CHECK were false.
`academy-0035-policy-red-r2.json`: local false-policy probe → exit 0, guardCorrect=false.
`academy-0035-policy-green-r3.json`: same probe with exact r3 postcondition → exit 3, writer policy, guardCorrect=true.
r3 postcondition line 8 checks exact policy role, ALL command, permissive=true and both expressions=true; line 9 checks RLS=true/FORCE=false.
Precondition line 8 also binds the table RLS state to the observed production baseline.

## Baseline, transaction and recovery semantics

`academy-0035-preflight-readonly-r1.json`: root production BEGIN READ ONLY → exit 0; database/user postgres.
Observed baseline: owner postgres; SECURITY INVOKER; proconfig NULL; body MD5 cf1feed0de1a4fd0f9480ae07cebc4b9.
Observed ACL `{postgres=X/postgres,academy_runtime=X/postgres}`; writer-role/policy collisions 0; RLS=true/FORCE=false.
r3 precondition rejects database/capability drift, exact function/body/ACL drift, role/policy collision, missing digest-session RPC execution and direct runtime activation writes.
Each mutating packet starts BEGIN, sets lock_timeout=2s and statement_timeout=10s, and takes the same transaction advisory lock.
Rehearse applies the reviewed migration, checks postconditions, ROLLBACKs, then reasserts the exact baseline in a separate READ ONLY transaction.
Commit checks the same precondition and postcondition around the same migration before COMMIT; its success marker follows COMMIT.
Original transport binding (superseded by the correction below): `ssh -o BatchMode=yes -o ConnectTimeout=15 root@ssh-db.cyberskills.co.th 'docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres'`.
ON_ERROR_STOP is supplied by that transport; SQL errors abort execution and uncommitted changes are rolled back on connection close.

Rollback validates the applied state, transfers ownership to postgres, restores INVOKER and resets search_path.
It removes only the named new policy and writer grants, refuses remaining pg_shdepend references, then drops only the newly created role.
It reasserts the exact original owner/config/body/ACL and absence of role/policy before COMMIT; any failed assertion aborts the whole inverse transaction.
No business rows, other product schema objects, existing shared-role attributes or memberships are changed by this packet.

## Actual local recovery and backup evidence

`academy-0035-forward-reverse-local-r3.json`: root local psql → exit 0, FORWARD_AND_REVERSE_PASS; final outer ROLLBACK.
Independent receipt comparison confirms exact migration, exact r3 postcondition, exact inverse body and two copies of the baseline guard.
Only local database-name guard and synthetic starting owner are adapted, as disclosed in the receipt; this is local recovery proof, not a production COMMIT claim.
The receipt explicitly corrects its inherited r1 timestamp; review relies on the recorded r3 SQL and result, not the stale timestamp.
`academy-0035-backup-r1.json`: root backup command → exit 0; pg_dump exit 0, archive-list exit 0 / 372 lines.
Protected Academy schema archive is 271412 bytes, mode 0600, SHA256 `cb7d3cb2f8f59ba908a25ff4d16f97f64014ccc917586f9435bc42307ee3a10f`.
Archive content was not read by reviewer; archive-list validation is not a full restore test. The exact metadata inverse is the tested primary recovery here.

PASS binds only the five r3 SQL files and manifest above. Earlier r1/r2 operational guards are superseded and are not approved for execution.
Root retains current live authority, backup custody, frozen-hash checks, live ROLLBACK rehearsal and post-COMMIT verification.
No Worker redeploy is required by the reviewed SQL metadata change; real owner login/OTP/shared-session acceptance remains separate.
ส่งคืน operational review scope ให้ root; ไม่มี remaining changes required ใน r3.

## Transport correction acceptance — same r3 SQL

**PASS** for replacing only the database operator `-U postgres` with existing `-U supabase_admin`; no SQL/guard/role-grant change.
`academy-0035-production-rehearsal-r3.json`: first live attempt → exit 3 / P0001 before migration, because the superuser capability guard rejected postgres.
`academy-0035-operator-capability-r1.json`: subsequent READ ONLY proof → exit 0; postgres super=false, function still original owner/invoker/config/ACL/body and writer-role count 0.
`academy-0035-existing-operators-r1.json`: existing supabase_admin super=true/createRole=true; postgres super=false/createRole=true.
`academy-0035-effective-operator-r1.json`: actual READ ONLY connection as supabase_admin → exit 0; database=postgres, current_user=supabase_admin, super=true.
Accepted transport: `ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes root@ssh-db.cyberskills.co.th 'docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -U supabase_admin -d postgres'`.
This preserves the first live attempt's other flags; the guard remains strict. Function baseline/reverse owner remains postgres, independent of the executing superuser.
Reviewer rehashed the unchanged packet: 5/5 matched; manifest SHA256 remains `0fe4eef75cc5041d279782062cf61ee4f1c2a4c910a77df3268f7bfd55277f13`.
Root must obtain a successful live r3 ROLLBACK rehearsal with this operator before the authorized COMMIT; this amendment claims neither step completed.
