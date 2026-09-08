# Academy activation SQL correction — independent review

Result: **PASS** — ไม่พบ changes required ใน exact candidate 3 ไฟล์และหลักฐานที่ระบุด้านล่าง.
Reviewer ไม่ใช่ผู้เขียน patch; อ่านอย่างเดียว ไม่มี source edit, SQL execution, host/provider action หรือ shared-role mutation.
Session `ws-cde63a58-f932-47e3-bd65-df549781e118`; existing native review route; root เป็นผู้รัน local PostgreSQL oracles.
Source `/private/tmp/academy-csp-cde63a58`; base/HEAD `aead1a1b101eef5b7d11851c9aff486d35a3f599`.
Patch `/Users/teerakanok/.local/state/cyberskills/model-team-implement/run-00Gc0D/worker-results/run-1cfb184519ff2671d3f81c6db56a99f4/changes.patch`.
Patch SHA256 `8c4a24806d3d60640fd40c39c4c49edb3bd88471b5a6987fbf44bf3ef9a7013c` verified before/after.
Paths ต่อไปนี้ relative ต่อ source root; receipts อยู่ใน `/private/tmp/cyberskills-prod-cde63a58/records/`.

## Exact candidate custody

- `academy-web/supabase/migrations/0035_service_activation_runtime_definer.sql` SHA256 `2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4`.
- `academy-web/tests/integration/identity-lifecycle-enforcement.test.ts` SHA256 `9b40a6c16cbfbab05b1e33293c9dc80001ffbc72802dc2bf2b638c89d22b95c6`.
- `academy-web/tests/unit/service-activation-runtime-definer.test.ts` SHA256 `f00179dbd3524b10a63bb9521671bfb7827314a381ce29fae202fd0e560c8aaa`.
`rtk proxy git apply --reverse --check <patch-path-above>` → exit 0, stdout empty; applied files match candidate.
`rtk proxy git diff --check` → exit 0, stdout empty; `rtk proxy git status --short` named only these 3 candidate paths.
Final read-only Node SHA256 verification → exit 0, all 3 hashes matched and patchMatches=true.

## Security and behavior review

`0035:5` refuses any existing role-name collision; it does not adopt or alter a pre-existing shared role.
`0035:9` creates NOLOGIN/NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS with null password.
`0035:18`/`:19` give schema USAGE and activation SELECT/INSERT/UPDATE only; no schema CREATE, DELETE, entitlement, staff, or role membership grant.
`0035:24` policy applies only to academy_activation_writer on service_activation; FOR ALL does not bypass absent DELETE ACL.
RLS remains enabled (`0004_activation_and_entitlement.sql:66`); the non-owner writer needs and receives this explicit policy.
`0035:31` SECURITY DEFINER switches execution to the bounded owner; search_path is pinned to pg_catalog, academy.
`0013_integrity_batch.sql:438`/`:444`/`:452`/`:457` use schema-qualified rowtype and table references; no dynamic SQL or caller-selected relation.
`0035:37` revokes shared/public/anonymous/authenticated/operator/staff execution; `:40` grants only the intended academy_runtime caller.
Existing API anonymous/authenticator/retention roles had no function grant after 0019/0020; this ALTER does not create default PUBLIC EXECUTE.
academy_runtime remains a trusted backend role with its existing BYPASSRLS design; migration does not alter that role or expand its table-write ACL.
`0030_least_privilege_course_entitlement.sql:48` direct authorization writes stay revoked; its `:321` explicitly preserves the monotonic RPC contract.

`0035` uses ALTER FUNCTION only: signature, return type, OID and function body stay unchanged.
`0013_integrity_batch.sql:440` validates status/revision; `:456` higher revision updates; `:463` equal-revision mismatch raises; stale/same matching returns false.
`0032_identity_lifecycle_runtime_enforcement.sql:498` retains canonical lifecycle guard before profile activation; profile identity remains exact issuer+subject.
`0032:514`/`:531` still call the same monotonic RPC; stale activation/email protection, erasure fencing, and session functions are not edited.
`rtk proxy git diff --exit-code aead1a1 -- academy-web/scripts/academy-bound-worker-executor.cjs academy-web/supabase/migrations/0013_integrity_batch.sql academy-web/supabase/migrations/0032_identity_lifecycle_runtime_enforcement.sql` → exit 0, stdout empty.

## Harness and deployment compatibility

`identity-lifecycle-enforcement.test.ts:145`–`:157` loads every sorted .sql migration, so 0035 is included automatically, then rehearses BEGIN/ROLLBACK before BEGIN/COMMIT.
`scripts/test-identity-lifecycle-page-store-postgres.mjs:497` runs both integration files sequentially inside its newly owned disposable PostgreSQL container.
Role creation is deliberately one-shot/collision-refusing; rollback rehearsal leaves no role, so the subsequent commit bootstrap can create it.
Added integration case uses SET ROLE academy_runtime for actual profile calls and write refusals; source review confirms it covers the formerly hidden invoker privilege failure.
Normal migration apply must use authorized role-creation/function-owner authority and one transaction, matching root's successful local rehearsal.
No Worker/API signature or environment change is required by this patch; it repairs the existing SQL capability.
Do not reapply 0035 after commit without inspecting migration/role state; do not rerun old grant migrations as a recovery shortcut.

## Observed executable evidence

`academy-owner-activation-privilege-r1.json`: root production READ ONLY query → exit 0; runtime INSERT/UPDATE=false, SELECT=true; old sync function security_definer=false.
`academy-activation-runtime-root-red-r1.json`: root local SET LOCAL ROLE academy_runtime oracle → exit 3 / SQLSTATE 42501 at service_activation INSERT.
`academy-activation-runtime-root-green-r1.json`: exact migration + same oracle in BEGIN/ROLLBACK → exit 0, runtime_activation_succeeds=t; migration hash matches reviewed file.
`academy-activation-runtime-boundaries-r1.json`: local psql → exit 0; same-revision conflict refused, higher revision accepted, stale ignored, direct runtime UPDATE denied.
That receipt also observes runtime entitlement/staff INSERT=false; writer login/super/BYPASSRLS=false; shared service EXECUTE=false; writer DELETE=false; final ROLLBACK.
`academy-activation-runtime-session-r1.json`: local actual-runtime chain → exit 0; profile_created=t, session_created=created, session_read=active; final ROLLBACK.
`academy-activation-root-unit-r1.json`: `npx vitest run --project unit` → exit 0, 2452 passed / 2 skipped; includes new unit file 2/2.
`academy-activation-root-lint-r1.json`: `npm run lint` → exit 1, 3 baseline require-import errors / 17 warnings; error file unchanged against base (command above).
Lint stopped before its chained tsc commands; this report does not claim those commands or the full Docker integration harness ran.

## Remaining boundary

PASS covers the SQL correction and observed local oracles. Root retains production apply preflight, transaction/recovery custody and post-apply effective-role verification.
No production migration, real owner sign-in, OTP/email receipt, shared-session browser journey or entitlement/staff grant is claimed complete by this review.
ไม่มี source change โดย reviewer; ส่งคืน review scope ให้ root พร้อม frozen hashes ข้างต้น.
