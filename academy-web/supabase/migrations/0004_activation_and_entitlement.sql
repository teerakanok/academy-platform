-- 0004_activation_and_entitlement.sql — แยก "เปิดใช้บริการ" ออกจาก "มีสิทธิ์เข้าถึง"
--
-- ทิศทาง Identity Control (2026-08-01) ระบุชั้นสถานะไว้สี่ชั้น และย้ำว่าชั้นก่อนหน้า
-- ไม่ได้แปลว่าได้ชั้นถัดไป:
--
--     account exists → service activation → product entitlement → resource authorization
--
-- แปลว่า **การมีบัญชี CYBERSKILLS หรือเปิดใช้ Academy สำเร็จ ไม่ได้แปลว่าเข้าคอร์สได้**
-- ซึ่งเป็นสิ่งที่ระบบตอนนี้ทำผิด: middleware เช็คแค่ "มี user ไหม" แล้วปล่อยเข้าทุกคอร์ส
-- วันที่มีคอร์สเสียเงิน บัญชีฟรีใบเดียวจะเปิดได้ทุกคอร์ส
--
-- Academy เป็นเจ้าของ entitlement เอง (Identity Control ไม่แตะ) ส่วน activation เป็น
-- ของที่ Identity Control บอกมา เราเก็บสำเนาไว้พร้อม revision เพื่อรู้ว่าข้อมูลเก่าไหม

-- ── ชั้นที่ 2: เปิดใช้บริการ Academy แล้วหรือยัง ────────────────────────────────
-- สำเนาสถานะจาก Identity Control — Academy ไม่ได้เป็นคนตัดสิน แค่จำไว้
create table academy.service_activation (
  user_id uuid primary key references academy.users (id) on delete cascade,
  status text not null
    constraint activation_status_allowed
    check (status in ('pending', 'active', 'suspended', 'deactivated')),
  -- revision จาก Identity Control — ใช้ตรวจว่าสำเนาที่เราถืออยู่เก่ากว่าของจริงไหม
  revision integer not null default 0,
  synced_at timestamptz not null default now()
);

-- ── ชั้นที่ 3: สิทธิ์เข้าถึงคอร์ส — Academy เป็นเจ้าของเต็ม ────────────────────
create table academy.course_entitlement (
  user_id uuid not null references academy.users (id) on delete cascade,
  course_slug text not null,
  -- ที่มาของสิทธิ์ ต้องรู้เสมอว่าได้มาอย่างไร เพื่อเพิกถอนและตรวจสอบย้อนหลังได้
  source text not null
    constraint entitlement_source_allowed
    check (source in ('free', 'purchase', 'invitation', 'grant')),
  granted_at timestamptz not null default now(),
  -- null = ไม่มีวันหมดอายุ
  expires_at timestamptz,
  revoked_at timestamptz,
  primary key (user_id, course_slug)
);

create index course_entitlement_user_idx on academy.course_entitlement (user_id);

-- ── ฟังก์ชันตัดสินสิทธิ์ ─────────────────────────────────────────────────────
-- เขียนเป็นฟังก์ชันเพื่อให้มีคำตอบเดียวที่ทุกเส้นทางใช้ร่วมกัน
-- ไม่ใช่ปล่อยให้แต่ละหน้าตีความเงื่อนไขเอง แล้วหลุดไม่พร้อมกัน
create or replace function academy.has_course_entitlement(p_user_id uuid, p_course_slug text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from academy.course_entitlement e
     where e.user_id = p_user_id
       and e.course_slug = p_course_slug
       and e.revoked_at is null
       and (e.expires_at is null or e.expires_at > now())
  );
$$;

comment on function academy.has_course_entitlement is
  'สิทธิ์เข้าคอร์ส — แยกจาก service activation โดยสิ้นเชิง การเปิดใช้บริการไม่ให้สิทธิ์นี้';

-- RLS เปิดและไม่มี policy = default deny เหมือนตารางอื่นในสคีมานี้
alter table academy.service_activation enable row level security;
alter table academy.course_entitlement enable row level security;

grant all on academy.service_activation to service_role;
grant all on academy.course_entitlement to service_role;
grant execute on function academy.has_course_entitlement(uuid, text) to service_role;
