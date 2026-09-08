# SEC-ACADEMY-002 — bounded independent closure review

Verdict: PASS — เกณฑ์ auth gate เดิมปิดได้จาก source, causal tests และ owner session จริง
Review date: 2026-09-08. Read-only review; ไม่แก้ checklist, source หรือ live runtime
Proposed Status: CLOSED — ORIGINAL AUTH GATE VERIFIED (SOURCE + REAL SESSION)
Proposed Checked on: 2026-09-08

## เกณฑ์ที่ตัดสิน
- ต้นฉบับ: `reports/security/2026-09-05-security-review-checklist.md:31–45`, checklist row `:452` ใน Academy
- Row กำหนด production syntactic prefilter, no-cookie API 401 JSON, authoritative `currentUser()` สำหรับ dashboard และ `/api/auth/me`, forged/expired/revoked session regressions
- ช่องว่างที่ row ยังเปิดคือ production smoke ด้วย cookie จริงและ owner-present journey; ไม่ใช่การรับรองทุก future journey
- `records/first-security-items-production-reconciliation-r1.md:43–60` ยังเปิดเพราะ returned session เข้า authenticated surface ไม่สำเร็จ; หลักฐานใหม่แก้ช่องว่างนั้นแล้ว

## Source และ causal verification
- Repository: `/private/tmp/academy-csp-cde63a58`; code `fe4220a1850d277d542cd5e30f38360776df4b15`, proof HEAD `e092c5ca2e44570600d51d2ce38df940dabca53d`
- `academy-web/src/middleware.ts:136–154`: production cookie เป็น syntax prefilter; absent cookie ให้ private API 401 JSON และ page redirect พร้อม `next`; ไม่ใช้ syntax ตัดสิน principal
- `academy-web/src/app/(site)/dashboard/page.tsx:12–13`: await `currentUser()`, null จึง redirect; `academy-web/src/app/(site)/api/auth/me/route.ts:22–26`: signedIn ผ่าน `currentUser()`
- `academy-web/src/lib/auth/session.ts:57–77`: อ่าน durable session แล้ว resolve active account; missing/error ปิดสิทธิ์
- `academy-web/src/lib/account/users.ts:119–139`: canonical issuer/subject lookup รองรับ actual PostgREST active object และ single array; malformed/null/inactive/ambiguous ไม่คืน account
- Shape causal RED: `academy-activation-shape-root-red-r1.json` exit 1, 2 failed / 5 passed ก่อน source fix; object resolver และ production currentUser เดิมคืน null
- GREEN: `academy-activation-shape-root-unit-r1.json` / `.log` — 2459 passed, 2 skipped; log SHA256 `d72817c4ace6f64f57c61473cf329a214b7182d1bf99191924f47be5ca37e299`
- ตรวจ log ด้วย `rtk proxy rg -n 'middleware-production-session|current-user-production-cookie|auth-me-route|dashboard-page|account-active-user-activation' <unit-log>` exit 0
- Output ยืนยัน suite 5 / 3 / 2 / 2 / 7 tests ตามลำดับผ่าน; อ่าน test bodies แล้ว: production prefilter, forged/expired/revoked refusal, currentUser consumers, actual relation-shape regression
- Durable-session negatives เป็น tests ของจริงที่ใช้ controlled store/RPC responses; ไม่กล่าวอ้างว่าเพิ่ง revoke owner session บน production

## Production evidence ที่เติมเกณฑ์เดิม
- `reports/verification/2026-09-08-active-user-shape/academy-shape-production-readback-r1.json`: deployment `3ecc5f51-2c30-4ce1-86c9-cdd2fb076b1a`, Worker `3830694b-bca9-4035-8bd0-e853ee6dd1fa` 100%, readback exit 0
- `academy-owner-shape-production-browser-r1.json` at `2026-09-08T04:52:37.935085+00:00`: normal native Safari, existing owner session, path `/dashboard`, queryKeys `[]`, dashboardStayed `true`
- Rendered text: My learning / Sign out / no current enrollment / Browse courses; inspected `academy-owner-dashboard-production-r1.png` and confirmed dashboard content
- Screenshot SHA256 `46d367f85b41aad474918c07853f34c2c349292bb68799538b898de5b807a348`
- `records/academy-owner-me-production-r1.json` at `2026-09-08T04:57:26.931356+00:00`: normal GET ใน Safari session เดิม, path `/api/auth/me`, queryKeys `[]`, jsonParsed `true`, signedIn `true`, emailPresent `true`
- API receipt SHA256 independently checked: `499f516b8d8b4fdb066e6992ad99165e628c7b3725c31346cb0dfd70e2e45bce`; ไม่มี email/cookie/token value ใน receipt
- Production evidence เป็น root-observed receipts ที่ reviewer อ่าน/ตรวจ hash และ screenshot; reviewer ไม่ replay live request

## Binding และข้อเสนอให้บันทึก
- `rtk proxy git diff --exit-code fe4220a1850d277d542cd5e30f38360776df4b15 HEAD -- <5 source paths and 5 named test paths>` exit 0, stdout empty: proof commit ไม่เปลี่ยน reviewed runtime/test bytes
- Python SHA256 check ของ product proof `manifest.json`: `proof_manifest_matches=21/21`; API-me receipt ใหม่ตรวจแยก ไม่อ้างว่าอยู่ใน manifest นี้
- Proposed checked-on note: “2026-09-08 — source fe4220a / Worker 3830694b at 100%; owner session stayed /dashboard at 04:52 UTC and /api/auth/me returned signedIn=true at 04:57 UTC; production auth-gate regressions passed.”
- No remaining blocker ต่อ original SEC-ACADEMY-002 auth-gate acceptance; item เดิมไม่ควรคง OPEN เพียงเพราะ journey อื่นยังรอ
- ขอบเขตไม่รวม fresh OTP issuance/delivery, ทุก provider หรือ cross-product SSO, entitlement/staff/progress/sign-out, live revocation และ lifecycle acceptance ของ SEC-ACADEMY-003/004
- ไม่รับรองทุก protected/future route หรือ blanket lint/import enforcement ที่ remediation prose เสนอ; การปิดนี้ผูกกับ original checklist auth-gate behavior และเส้นทางที่มีหลักฐานข้างต้น
- Report นี้เป็นข้อเสนอ closure เท่านั้น; checklist และ release state ไม่ได้ถูกแก้โดย reviewer
