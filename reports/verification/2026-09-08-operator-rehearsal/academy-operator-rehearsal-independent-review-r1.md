# Academy operator rehearsal — independent bounded review

Verdict: PASS — ไม่พบ unresolved blocker ใน 9-file candidate ที่ freeze ไว้
Reviewed read-only on 2026-09-08; reviewer ไม่ใช่ root/GLM author และไม่แก้ source หรือเชื่อมต่อ DB
Source: `/private/tmp/academy-operator-rehearsal-cde63a58`, base `e092c5ca2e44570600d51d2ce38df940dabca53d`
Worker patch SHA256 `676edb94c3a3720724772269136baf44a583824511b2a65f027be93f77a65f7a`; controller correction ตาม `academy-operator-controller-correction-route-r1.json`
Final manifest: `academy-operator-rehearsal-review-manifest-r2.json`, SHA256 `65310f0ec760614401840d83a5aadcd0aa22867f33069b15c9796c267a28c029`

## Findings และ disposition
- CLOSED: audit callers bind mismatch — `scripts/manage-staff-role.mjs:47–52` และ `scripts/manage-course-entitlement.mjs:99–104` ส่ง actor/target/scope ครบ 3 parameters ต่อ `$1,$2,$3`
- Real causal RED `academy-operator-candidate-first-owner-red-r1.json`: exit 1, SQLSTATE `08P01`, “bind message supplies 2 parameters … requires 3”; strict fake จับเหตุเดียวกันในทั้งสอง scripts
- CLOSED: first-owner rehearsal เข้า RPC สำเร็จแล้วถูก verifier ปฏิเสธ false→true — RED r2 exit 1 `in-transaction authorization verification failed`
- `manage-staff-role.mjs:98` คาด actorAuthorized=true เฉพาะ enable owner ให้ actor เอง; การตัดสินสิทธิ์ยังอยู่ใน `set_staff_role` เดิม ไม่ใช่ flag นี้
- `0018_staff_authorization.sql:183–204` lock + owner check + bootstrap self-only + self-owner-revoke refusal คงเดิม; `0030_least_privilege_course_entitlement.sql:169–177` owner/target locks คงเดิม
- ไม่มีการแก้ mutation RPCs, canonical issuer/subject resolution, runtime permissions หรือ product entitlement semantics ใน patch นี้

## Transaction correctness
- `scripts/admin-rehearsal.mjs:1–3`: `--apply` กับ `--rehearse` mutually exclusive; default ยัง inspect และตรวจ modes ก่อน connect
- `:22–47`: snapshot → BEGIN → RPC เดียวกับ apply → inspect state/audit ใน transaction → ROLLBACK → inspect restoration → success output
- Mutation/verification failure ถูก rollback และ rethrow; script finally ปิด client; ไม่มี COMMIT ใน rehearsal path
- `:30–39`: ตรวจ actor authorization/expected active, effective change ตรวจ action/reference ของ latest audit, no-op ตรวจ audit snapshot ไม่เปลี่ยน
- `:43–46`: เปรียบเทียบ state projection และ latest-audit projection หลัง rollback; ไม่อ้างว่า CLI เปรียบเทียบทุก historical row หรือทุก column
- Apply path คง BEGIN→RPC→COMMIT เดิม; staff คง post-commit state/reference verification เดิม; inspect/apply ไม่ต้องเรียก audit0036 จึงยังใช้ได้ก่อนติดตั้ง seam
- Rehearsal ก่อนมี0036 fail ตอน beforeAudit ก่อนเริ่ม mutation; ไม่ fallback ไป apply
- Baseline/post-rollback reads อยู่นอก transaction; concurrent administrative changes อาจทำให้ restoration check fail conservatively ไม่ได้ทำให้ scriptเขียนทับ foreign state
- Rehearsal เป็น transient DB mutation และอาจกิน sequence IDs ซึ่ง PostgreSQL ไม่ rollback; restoration claim จำกัด rows/projections ไม่ใช่ read-only หรือ sequence-byte identity

## Audit seam0036: justified และ bounded
- Existing `inspect_staff_role` คืนเพียง active/actorAuthorized/lastAuditReference; entitlement inspect ไม่มี audit จึงพิสูจน์ latest event restoration อย่างมี event identity ไม่ได้
- Migration เพิ่มเพียงสอง `STABLE SECURITY DEFINER` JSON projections พร้อม `search_path=pg_catalog,academy`; static qualified SQL, target+role/course filter, `ORDER BY event_id DESC LIMIT 1`
- ส่งคืน audit fields ที่จำเป็นต่อ operator check ไม่มี email, credential, dynamic SQL หรือ table mutation; ไม่สร้าง role/table หรือเพิ่ม broad SELECT grant
- `0036_admin_rehearsal_audit_projection.sql:76–83`: revoke PUBLIC/anon/authenticated/service_role/runtime/cross-operator; EXECUTE ให้เฉพาะ staff_admin หรือ entitlement_operator ตามประเภท
- `p_actor_account_id` เป็น bounded input ไม่ใช่ผู้พิสูจน์ตัวตนของ read RPC; trusted DB-role ACL เป็น read boundary เหมือน existing inspectors และรองรับ pre-owner bootstrap inspection
- ไม่เปลี่ยน actor authorization ของ write RPC; unauthorized mutation ยังคง SQLSTATE42501 ใน root real-PostgreSQL evidence
- Rollback file ถอน EXECUTE แล้ว drop เฉพาะสอง functions ใน transaction; ไม่มี CASCADE, role/table/data rewrite; production packet ต้อง bind absence/ownership ของชื่อใหม่ก่อนใช้

## Executable evidence ที่ตรวจ
- `academy-operator-controller-unit-red-r1.json`: 5 failed/1 passed ก่อน correction; `...green-r1.json`: exit 0, 6/6 passed รวม first-owner และ strict bind-count regression
- `academy-operator-real-postgres-acceptance-r1.json`: 6/6 cases pass — first-owner/entitlement rehearsal, subsequent apply, existing-grant no-op rehearsals
- ทุก rehearsal ใน receipt นั้น exit 0 และ staff/staffAudit/entitlement/entitlementAudit row digests เท่าเดิม; apply cases เปลี่ยน rows ตามจริง ไม่ถูกนับเป็น restoration
- `academy-operator-real-postgres-denial-r1.json`: unauthorized staff/entitlement ทั้ง 2 cases exit 1, SQLSTATE42501, rows unchanged
- `academy-operator-root-unit-r1.log`: 155 files pass, 2466 tests passed/2 skipped; independent log SHA match `5745f91fd21c4fca7f8fbe31a2afaff7f53e18050527c8ba0403b031a049f389`
- Lint exit 1 เป็น 3 baseline require-import errors/17 warnings ตาม receipt; log SHA match `75de1688170e27d5487ec76287cff0a155588a30aecebd8550fb2dcef4ae2814`; ไม่เรียก lint GREEN
- อ่าน actual SQL/scripts/tests และ root-owned local PG receipts; reviewer ไม่ rerun DB หรือขยายไป unrelated application review

## Exact final file bindings (academy-web/ prefix)
- `docs/course-entitlement-operator.md` — `fcf5325ddc3d40d9446cbc07bb5f2a1dd737d76a3c545d222a435d75aa5bcb07`
- `docs/staff-authorization.md` — `c21395976223c2cf77349d3ba02338cf1c224e6e8ca94bd91527d9b24930ba1a`
- `scripts/admin-rehearsal.mjs` — `1e493340ce4e6cc326a898783c562965c6e69fdf3f6d4870757bf89af792c38e`
- `scripts/manage-course-entitlement.mjs` — `df490a0b349a56e82695d66a2cfb1938bb1e03fccbb295f1d6eed863e6456fc7`
- `scripts/manage-staff-role.mjs` — `c62983e239793f64616b2d152e5a00240953e13cf3a19d9877bbfd125adf5286`
- `supabase/migrations/0036_admin_rehearsal_audit_projection.sql` — `93ae2bb111bb94730907d788e7f89654b60c33be29d9aa8fb50da2fd50a0195a`
- `supabase/rollbacks/0036_admin_rehearsal_audit_projection.rollback.sql` — `b6cd84d7c11978f0ea160afa87aeb89c1ceb411c2b71e12fb7fee9dd727aab02`
- `tests/unit/admin-rehearsal-audit-seam.test.ts` — `c549541a3155db2820c1d6bcf5062b8c1fbfaa9409a96c64d76364a2a029ec91`
- `tests/unit/admin-rehearsal-scripts.test.ts` — `acb01e80da15d659f027082a3494572c75babb8eeada2d8a5d25ebdd45c5a1e9`
- `rtk proxy python3` manifest SHA256 verification: 9/9 matches before/after review; `git status --short` มีเฉพาะ 9 paths นี้

## Useful gate limits
- PASS เป็น source/local-rehearsal approval; source และ SQL0036 ยังไม่ production และ dedicated operator login input ยังไม่มีตาม root scope
- ไม่รับรอง production credentials, production ACL effective state, production bootstrap/grant หรือ learner/staff UI journey
- ก่อน live ต้องใช้ exact reviewed operational packet และ protected dedicated-role inputs; ห้ามใช้ application runtime/shared role แทน
