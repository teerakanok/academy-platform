# Academy — Owner And External Gates

> รายการนี้มีเฉพาะสิ่งที่ยังต้องใช้ founder decision, founder identity, legal review
> หรือหลักฐานจาก external system. งานที่ทำและตรวจจบแล้วไม่อยู่ในรายการนี้.
> สถานะ code และ release gates ล่าสุดอยู่ใน `plans/active_plan.md`.

## 1) Owner-Present Sign-In Journey On The Deployed Callback Fix

Deployed 2026-09-04 01:5x (+07): Worker version `1c8cc388-3a9f-4e14-bfe6-39d5a9e651fd`
at `100%` = source `157736d`. Rollback ladder: `bf36900f…@100` (diagnostics, old issuer) →
`313465d5…@100` → `f4cc7530…@100`.

Root cause of the 2026-09-03 18:03Z `result_verification` failure: Academy expected
`result.issuer = https://accounts.cyberskills.co.th/auth/v1`, but the canonical lifecycle
principal issuer (ecosystem contract ID-01) is the verified issuer minted by Pool A GoTrue,
`https://supabase.cyberskills.co.th/auth/v1`, which Identity echoes. Fixed in `157736d`
(one constant; `academy.users` was empty so no data migration). Secrets
`IDENTITY_CODE_EXCHANGE_TIMEOUT_MS=5000` and the live result key set
(kid `identity-result-prod-2026-08`, thumbprint `VLvOF…8LM`) remain pinned. Everything before
result verification is proven on the real path; the verify path is proven on workerd
(`scripts/workerd-signer-check.mjs`, 10/10). If the next attempt still fails, the Worker logs
`[identity-result-verification] rejected …` (key names, kid, match booleans, time deltas only).

Earlier findings this session: the exchange fetch used `redirect: 'error'`, which workerd rejects
with a `TypeError` before any I/O (fixed `8c57a2e`; proven by synthetic callbacks reaching
Identity, `404` for a fake code = client assertion admitted; no rotation needed).

Earlier owner-present findings: Safari sends no `Sec-Fetch-User` (fixed `aa0149d`); callback
failures rendered raw JSON (fixed `7d3cc6c`, now `/sign-in?notice=identity-unavailable`).

ต้องใช้ founder ทำเองใน browser (agent ห้ามอ่าน mailbox/กรอกรหัสแทน):

1. เปิด `https://academy.cyberskills.co.th/sign-in` → ผ่าน Cloudflare Access (browser
   login) → กด sign-in ด้วย CYBERSKILLS account → Account Center ส่งรหัสทาง email →
   กรอกรหัส → ต้องกลับมาที่ Academy `/auth/callback` แล้ว redirect ไป dashboard โดยไม่เจอ
   `sign-in?notice=identity-unavailable`.
2. ตรวจ dashboard และ `/courses` แสดงผลด้วย account ที่ sign in แล้ว.
3. คอร์ส `setup-and-environment` เป็น `syllabus-preview` — บทเรียนจะขึ้น not-entitled จนกว่า
   จะมี `academy.course_entitlement` (`source='grant'`) ให้ account นั้น; ไม่มี UI/RPC ให้
   grant เอง ต้องเป็น DB write ที่ founder อนุมัติหลัง sign-in ครั้งแรก (มี rollback ด้วย
   `revoked_at`).
4. หลัง entitlement: เปิดบทเรียน, ทำ progress หนึ่งขั้น, reload แล้ว progress ยังอยู่, ดูที่
   viewport `412x915`, แล้ว sign-out.

ถ้าข้อ 1 ล้มเหลว ให้เก็บเฉพาะ path/status ที่เห็น (ไม่เอา query string) แล้วส่งกลับ; ห้าม
resend รหัสซ้ำก่อนตรวจ Worker logs.

**Staff bootstrap หลัง sign-in ครั้งแรก** (`academy.users` ต้องมี 1 แถวก่อน):
issuer ของ Academy = `https://supabase.cyberskills.co.th/auth/v1`; subject = ค่า `subject`
ในแถว `academy.users` ของ founder (อ่านจาก DB host ด้วย `psql -d postgres`, พิมพ์เฉพาะ
count/issuer). dry-run:

```bash
DATABASE_URL='<operator connection, never printed>' node scripts/manage-staff-role.mjs \
  --enable --role owner \
  --actor-issuer https://supabase.cyberskills.co.th/auth/v1 --actor-subject <founder-subject> \
  --target-issuer https://supabase.cyberskills.co.th/auth/v1 --target-subject <founder-subject> \
  --reference 'staff-bootstrap founder 2026-09-03'
```

ต่อเมื่อ dry-run พิมพ์ `dry_run=true action=enable role=owner currently_active=false` จึงเพิ่ม
`--apply` (migration `0018` อนุญาต first-owner bootstrap ที่ actor = target). ห้ามใช้ email
หรือ UUID ที่สร้างขึ้นแทน identity.

## 2) Keep The Current Exposure Decision Explicit

- `academy.cyberskills.co.th` ผูกกับ Worker แล้ว และ Cloudflare Access ป้องกัน canonical
  routes อยู่; unauthenticated probes ของ `/`, `/courses` และ `/auth/callback` ถูก redirect
  ไป Access gate.
- สถานะนี้ยังเป็น preview/internal. การเปิด public launch ต้องมี authorization แยกและ
  ต้องทบทวน Zero Trust policy ก่อนเปลี่ยน exposure.
- ห้ามถือว่าการ deploy Worker preview เท่ากับอนุมัติ public launch.

## 3) Complete Legal And Restricted-Case Gates

- ให้ผู้มีอำนาจทบทวนข้อความภาษาไทยสำหรับ privacy, retention และ appeal.
- กำหนด owner/access ของ restricted case system ก่อนเปิดช่องทาง privacy request หรือ
  appeal ให้ผู้เรียน.

## 4) Verify Deployed Privacy And Media Flow With An Approved Session

source และ Worker version ปัจจุบัน deploy แล้ว แต่ proof ต่อไปต้องใช้ session จริง:

- private-media delivery ต้องมี clean URL, cookie issuance/renewal, video range,
  captions และ PDF proof บน environment จริง;
- ทบทวนก่อน public launch ว่า CAS-005 fixture ยังคง INTERNAL ONLY และ `/player`
  ไม่ถูกเปิดสู่สาธารณะ.

## 5) Retention Cron: Wait For The First Scheduled Event

ไม่ต้องและห้ามเรียก production purge RPC ด้วยมือเพื่อเร่งผล. หลัง schedule รันจริง ให้
ตรวจ Worker Trigger Events/logs ว่ามี `retention.purge_complete` ครบทั้งห้างาน หรือมี
`retention.purge_failed` ที่ surfaced ชัดเจน.

**หลักฐาน rollout:**
[`reports/academy-retention-api-rollout-2026-08-06.md`](reports/academy-retention-api-rollout-2026-08-06.md).

## Completed External Work

- Pool A migrations `0001`–`0019`, Academy schema profile, dedicated runtime data API,
  private R2 media binding และ rollback evidence ผ่านแล้ว.
- `RATE_LIMIT_KEY_SECRET` ถูกตั้งโดยไม่บันทึกค่า; Worker version
  `b85b7a6d-ceaa-4708-81fd-0d8096462251` ใช้ Durable Object rate limit แล้ว.
  Harmless invalid lead requests ให้ `400` สิบครั้ง และ `429` พร้อม `Retry-After`
  ในครั้งที่ 11; Worker tail ของ invalid auth verification ระบุ invocation `Ok`.
- Academy product commits และ director submodule pointers ถูก push แล้ว.
