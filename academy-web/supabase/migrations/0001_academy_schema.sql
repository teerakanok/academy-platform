-- 0001_academy_schema.sql — schema `academy` + ตาราง leads (waitlist + PDPA consent)
--
-- ขั้นตอน prod (external checkpoint — ดู PENDING_USER_ACTION.md; ห้ามรันจาก dev session):
--   (ก) backup point ก่อน apply
--   (ข) apply ผ่าน ssh-db ตาม ecosystem/SHARED_INFRA_ACCESS.md (schema academy เท่านั้น)
--   (ค) เพิ่ม 'academy' เข้า PGRST_DB_SCHEMAS ของ Pool A แล้ว restart PostgREST
--       (cross-product change — ตรวจ consumer อื่น + เตรียม rollback เป็นค่าเดิม)
--   (ง) NOTIFY pgrst, 'reload schema'  -- refresh cache (ใช้แทนข้อ (ค) ไม่ได้)
--   (จ) verify: REST schema academy ผ่าน + anon ยังถูกปฏิเสธ + schema อื่นตอบปกติ

create schema if not exists academy;

-- email = identity key ตั้งแต่วันแรก — app normalize (trim + lowercase) ก่อน insert;
-- CHECK ยืนยันว่า normalized จริง กัน insert จากช่องทางอื่นทำ unique พังความหมาย
create table academy.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null
    constraint leads_email_normalized check (email = lower(btrim(email))),
  consent_at timestamptz not null,
  consent_text_version text not null
    -- จำกัดค่า version ที่ยอมรับ — ต้องตรงกับ CONSENT_VERSIONS ใน src/lib/consent.ts
    -- (เพิ่ม version ใหม่ = migration ใหม่ + ไฟล์ consent ใหม่พร้อมกัน; มี unit test คุม)
    constraint leads_consent_version_allowed check (consent_text_version in ('v1')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  created_at timestamptz not null default now()
);

-- idempotency: email ซ้ำ = unique violation (23505) → API ตอบสำเร็จโดยไม่สร้าง row ซ้ำ
create unique index leads_email_unique on academy.leads (email);

-- RLS: เปิด และ *ไม่มี policy ใดๆ* = default deny สำหรับทุก role ที่ไม่ bypass
-- (service_role ของ Supabase มี BYPASSRLS — เป็นช่องทางเขียน/อ่านเพียงทางเดียว
--  ผ่าน server route เท่านั้น); จำนวน policy ที่ประกาศ = 0 — มี test assert ตรงนี้
alter table academy.leads enable row level security;

-- Grants: เฉพาะ service_role — เจตนา *ไม่* grant usage/สิทธิ์ใดๆ ให้ anon/authenticated
-- (REST อ่าน/เขียนโดย anon ต้องถูกปฏิเสธ — มี negative tests แยกอ่าน/เขียนคุม)
grant usage on schema academy to service_role;
grant all on academy.leads to service_role;
