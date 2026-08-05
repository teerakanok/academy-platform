# Academy — Owner And External Gates

> รายการนี้มีเฉพาะสิ่งที่ยังต้องใช้ founder decision, founder identity, legal review
> หรือหลักฐานจาก external system. งานที่ทำและตรวจจบแล้วไม่อยู่ในรายการนี้.
> สถานะ code และ release gates ล่าสุดอยู่ใน `plans/active_plan.md`.

## 1) Activate Account Runtime And Bootstrap The First Owner

Academy runtime data boundary ทำงานแล้วโดยใช้ dedicated Academy credential;
Worker ไม่มีและห้ามเพิ่ม shared Pool A `SUPABASE_SERVICE_ROLE_KEY`.

- Identity Control ยังอยู่ที่ Gate 3 founder policy checkpoint; จนกว่าจะอนุมัติ
  production configuration ของ account runtime ห้ามเปิด Academy sign-in หรือผูก
  endpoint production เอง.
- ยืนยัน configuration ของ single-account runtime ก่อนเปิด build ที่มี
  `NEXT_PUBLIC_SUPABASE_*`; deployment ต้องพิสูจน์ว่า sign-in ใช้ issuer ที่อนุมัติ
  และ session cookie เป็น HTTPS จริง.
- หลัง runtime พร้อม founder ต้อง sign in หนึ่งครั้งด้วย identity จริง เพื่อสร้าง
  `academy.users` จาก `(issuer, subject)`.
- จากนั้นรัน `scripts/manage-staff-role.mjs` แบบ dry-run แล้ว apply ตาม
  staff-bootstrap contract. ห้ามใช้ email หรือ UUID ที่สร้างขึ้นแทน identity.

**หลักฐานปัจจุบัน:** dedicated data API, least-privilege `academy_runtime` และ Worker
runtime deployment อยู่ใน
[`reports/sessions/academy-dedicated-data-api-2026-08-05.md`](reports/sessions/academy-dedicated-data-api-2026-08-05.md).

## 2) Decide Exposure: Custom Domain And Zero Trust

- ตัดสินใจว่าจะผูก `academy.cyberskills.co.th` กับ Worker และเปิด exposure ระดับใด.
- ถ้ายังเป็น preview/internal ให้กำหนด Zero Trust Access allowlist ที่ชัดเจนก่อน.
- ห้ามถือว่าการ deploy Worker preview เท่ากับอนุมัติ public launch.

## 3) Complete Legal And Restricted-Case Gates

- ให้ผู้มีอำนาจทบทวนข้อความภาษาไทยสำหรับ privacy, retention และ appeal.
- กำหนด owner/access ของ restricted case system ก่อนเปิดช่องทาง privacy request หรือ
  appeal ให้ผู้เรียน.

## 4) Verify Deployed Privacy And Media Flow After Account Runtime Opens

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
