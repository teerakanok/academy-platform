# Academy — Owner And External Gates

> รายการนี้มีเฉพาะสิ่งที่ยังต้องใช้ founder decision, founder identity, legal review
> หรือหลักฐานจาก external system. งานที่ทำและตรวจจบแล้วไม่อยู่ในรายการนี้.
> สถานะ code และ release gates ล่าสุดอยู่ใน `plans/active_plan.md`.

## 1) Complete The Authenticated Production Journey And Bootstrap The First Owner

Academy runtime data boundary ทำงานแล้วโดยใช้ dedicated Academy credential;
Worker ไม่มีและห้ามเพิ่ม shared Pool A `SUPABASE_SERVICE_ROLE_KEY`.

- signed Identity authority ยืนยันว่า Academy client เปิดใช้งานและ result signer active;
  Academy Worker version `bd4aea53-9137-4d49-a5f4-3a74be959736` รับ traffic `100%`
  และผูก production Identity bindings ครบ.
- shared Identity release `8db80f2c98d7d3adfcda9f8a738c810688615666` active แล้ว โดย
  Account Center บังคับ Turnstile คนละ challenge สำหรับ authorization และการส่งรหัส,
  GoTrue `v2.186.0` บังคับ CAPTCHA ฝั่ง server และ Google Workspace relay ผ่าน
  TLS/envelope admission โดยไม่ส่งข้อความทดสอบ. Direct request ที่ไม่มี challenge ถูก
  ปฏิเสธก่อนเรียก mail provider และไม่สร้าง user.
- full authenticated journey ยังต้องใช้ browser session ที่ผ่าน Cloudflare Access อยู่แล้ว
  และ existing disposable canary ที่ owner อนุมัติ ห้ามส่ง credential value ในเอกสารหรือ
  chat. ยังไม่มีการส่งรหัสหลัง activation เพราะ owner ไม่อยู่หน้าจอ; callback result,
  enrollment, lesson progress, assessment, completion และ sign-out จึงยังไม่ผ่าน
  production playtest.
- next action มีเพียงหนึ่งครั้ง: เมื่อ owner อยู่หน้าจอ ให้เปิด canonical Account Center,
  กรอก identity ใน browser, ทำ fresh Turnstile และกดส่งรหัสครั้งเดียว แล้วตรวจ provider
  outcome แบบ sanitized ก่อนเดิน journey ต่อ. ห้าม agent อ่านหรือกรอก email/รหัสแทน.
- หลัง full authenticated journey ผ่าน founder ต้อง sign in หนึ่งครั้งด้วย identity จริง เพื่อสร้าง
  `academy.users` จาก `(issuer, subject)`.
- จากนั้นรัน `scripts/manage-staff-role.mjs` แบบ dry-run แล้ว apply ตาม
  staff-bootstrap contract. ห้ามใช้ email หรือ UUID ที่สร้างขึ้นแทน identity.

**หลักฐานปัจจุบัน:** dedicated data API, least-privilege `academy_runtime` และ Worker
runtime deployment อยู่ใน
[`reports/sessions/academy-dedicated-data-api-2026-08-05.md`](reports/sessions/academy-dedicated-data-api-2026-08-05.md).

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
