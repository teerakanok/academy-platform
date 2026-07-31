# PENDING_USER_ACTION — Academy (หลัง one-shot build 2026-07-31)

> External steps ที่ต้องทำโดย founder / session ที่มี founder เท่านั้น
> (one-shot run ห้าม mutate external service ทุกชนิด — ตามแผน
> `plans/platform-build-oneshot-2026-07-31.md` §5)
> เรียงตามลำดับที่ต้องเกิด

## 1) Vercel — สร้าง project

- สร้าง project + ผูก repo `github.com/teerakanok/academy-platform`
  (ต้อง push ก่อน — ดูข้อ 6)
- **Root Directory = `academy-web`** · framework Next.js · region `sin1`
- Node ตาม `academy-web/.nvmrc` (= 24; `engines.node = 24.x` ใน package.json
  ชี้เวอร์ชันให้ Vercel อยู่แล้ว — ตรวจใน dashboard ว่าตรง)
- ตั้ง env vars ตามรายชื่อใน `academy-web/.env.example`:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ค่า prod Pool A — ใส่เมื่อทำข้อ 3
  แล้วเท่านั้น; `TEST_*` ไม่ต้องใส่บน Vercel)
- **ยังไม่เปิด public**

## 2) Cloudflare — CNAME + Zero Trust

- CNAME `academy.cyberskills.co.th` → ค่าที่ Vercel ให้ตอน add custom domain
- Zero Trust Access app **ครอบทุก path** (allowlist email founder/ทีม)
- ตรวจ free-tier seat ตอน setup

## 3) DB prod (Pool A) — due-care เต็ม

ลำดับตามแผน §5-3 (ทำผ่าน `ssh-db` ตาม `ecosystem/SHARED_INFRA_ACCESS.md`):
1. Backup point ก่อน
2. Apply `academy-web/supabase/migrations/0001_academy_schema.sql`
   (schema `academy` เท่านั้น)
3. เพิ่ม `academy` เข้า `PGRST_DB_SCHEMAS` ของ Pool A แล้ว restart PostgREST —
   **cross-product change**: ตรวจ consumer อื่น (star/forge/crux/phalanx/angler/
   helm/crucible) ก่อน + เตรียม rollback เป็นค่าเดิม
4. `NOTIFY pgrst, 'reload schema'` (refresh cache — ใช้แทนข้อ 3 ไม่ได้)
5. Verify: REST query schema `academy` ผ่าน + anon อ่าน/เขียน `academy.leads`
   ถูกปฏิเสธ + สุ่มเช็ค product schema อื่นยังตอบปกติ

## 4) เคาะ ADR single-account → ปลดล็อก M3

- Draft พร้อมแล้ว: `docs/adr/ADR-draft-single-account.md`
  (คำแนะนำ: Option A — formalize Pool A GoTrue + identity contract + JWKS
  asymmetric ซึ่งปลดบล็อก STAR getClaims ไปพร้อมกัน)
- เมื่อเคาะแล้ว: ยกขึ้นเป็น ecosystem ADR ระดับ director ก่อนเริ่ม build auth จริง

## 5) M4+ / M5 (ยังไม่ถึงเวลา — บันทึกไว้ตามแผน)

- (M4) GCP project แยกสำหรับ Academy lab + budget alarm
- (M5) DD payment gateway ไทย + ยืนยัน CF Stream + ราคา ณ วันใช้จริง
- ก่อน public release: **edge rate-limit จริง** แทน in-memory per-IP ของ
  `/api/leads` (ของปัจจุบันพอสำหรับหลัง Zero Trust เท่านั้น) + ทบทวนการเอา
  CAS-005 fixture ออกจาก deploy (ตอนนี้ INTERNAL ONLY — `/player` ห้าม public)

## 6) Push + submodule pointer (รอ authorization)

- academy-platform ahead ~26 commits (แผน + one-shot ทั้งหมด) ยังไม่ push
- Crucible `640c8613` (answer-key fixes) ยัง local เช่นกัน
- Director submodule pointer bump ต้องทำตอนอยู่บน director branch ที่ถูกต้อง
  (ตอน run นี้ director อยู่ branch ของ workstream อื่น — ห้ามแตะ)

## 7) งาน director repo ที่แตะจาก run นี้ไม่ได้ (บันทึกแทน)

- เพิ่ม key `academy` ใน canonical tokens
  (`cyberskills-website/cyberskills-web/packages/tokens/products.js`) —
  ตอนนี้ academy-web vendored tokens ใช้ preset key `website` ไปก่อน

## 8) ⚠️ สุขภาพเครื่อง dev (พบระหว่าง run — ควรจัดการ)

- **Disk เกือบเต็ม**: ตอนเริ่ม run เหลือ 120MB จาก 460GB ทำให้ Docker พัง
  (image/snapshot corruption — กู้แล้ว + เคลียร์ docker image เก่าที่ไม่ใช้
  ได้คืน ~9GB) ปัจจุบันยังใช้อยู่ ~98% — แนะนำหาที่เคลียร์เพิ่ม
  (ผู้ต้องสงสัยหลัก: Docker Desktop data 53GB → เหลือ ~46GB หลังเคลียร์,
  Library/Caches ~5GB)
