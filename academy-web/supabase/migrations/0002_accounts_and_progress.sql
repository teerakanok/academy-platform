-- 0002_accounts_and_progress.sql — บัญชีผู้ใช้ + ความคืบหน้าที่ผูกกับบัญชี (M3)
--
-- ตามมติ ADR single-account (founder เคาะ 2026-08-01, docs/adr/ADR-draft-single-account.md):
--   · issuer เดียวของ ecosystem = GoTrue บน Pool A
--   · identity key ภายในทุก product = (issuer, subject) — **ห้ามใช้ email เป็น join key**
--     เหตุผลที่ห้ามเด็ดขาด: email เปลี่ยนได้ ใช้ซ้ำได้ และ Forge เคยพลาดตรงนี้มาแล้ว;
--     ยิ่งมีแผนออก certification เอง ตัวตนยิ่งต้องผูกกับสิ่งที่ไม่เปลี่ยนตามอีเมล
--   · บัญชีนี้เป็น "บัญชี CYBERSKILLS" ไม่ใช่บัญชี Academy — ตารางนี้จึงเก็บเฉพาะ
--     ส่วนที่ Academy ต้องใช้ ส่วนตัวตนกลางอยู่ที่ issuer
--
-- ขั้นตอน prod เหมือน 0001 ทุกประการ (external checkpoint — ห้ามรันจาก dev session)

-- ── บัญชี ─────────────────────────────────────────────────────────────────────
create table academy.users (
  id uuid primary key default gen_random_uuid(),

  -- ตัวตนจาก issuer กลาง — คู่นี้คือ key จริง
  issuer text not null constraint users_issuer_not_blank check (btrim(issuer) <> ''),
  subject text not null constraint users_subject_not_blank check (btrim(subject) <> ''),

  -- อีเมลที่ยืนยันแล้ว ณ เวลาสมัคร: เก็บไว้ "แสดงผล + ผูก waitlist ครั้งเดียว"
  -- ไม่ใช่ key และห้ามใช้ join ข้ามตาราง (ดูเหตุผลด้านบน)
  email text not null
    constraint users_email_normalized check (email = lower(btrim(email))),

  -- ชื่อที่จะขึ้นบนใบรับรอง — แก้ได้ก่อนออกใบ เพราะพิมพ์ผิดแล้วออกไปแล้วแก้ยาก
  -- ปล่อยว่างได้ตอนสมัคร แล้วค่อยขอตอนจะออกใบ (อย่ากั้นการสมัครด้วยฟิลด์นี้)
  display_name text
    constraint users_display_name_len check (display_name is null or char_length(btrim(display_name)) between 1 and 120),

  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index users_issuer_subject_unique on academy.users (issuer, subject);
-- index บน email เพื่อ "ค้นหาตอนผูก lead" เท่านั้น — จงใจไม่ unique เพราะ email
-- ไม่ใช่ key และการบังคับ unique จะแอบทำให้มันกลายเป็น key โดยปริยาย
create index users_email_idx on academy.users (email);

-- ── ผูก waitlist เดิมเข้ากับบัญชี ─────────────────────────────────────────────
-- ผูก "ครั้งเดียว ณ เวลาสมัคร" ด้วย verified email ไม่ใช่ join ถาวร
alter table academy.leads
  add column user_id uuid references academy.users (id) on delete set null;
create index leads_user_id_idx on academy.leads (user_id);

-- ── ความคืบหน้าต่อบทเรียน ────────────────────────────────────────────────────
-- หนึ่งแถวต่อ (คน × คอร์ส × บท) แทนที่จะยัดทั้งคอร์สเป็น JSON ก้อนเดียว
-- เพราะการอัปเดตบทเดียวต้องไม่เขียนทับความคืบหน้าบทอื่นที่อาจมาจากอีกอุปกรณ์
create table academy.node_progress (
  user_id uuid not null references academy.users (id) on delete cascade,
  course_slug text not null,
  node_id text not null,

  -- ตรงกับ NodeStatus ฝั่ง app — 'available'/'locked' เป็นค่าที่คำนวณได้จาก DAG
  -- จึงไม่เก็บ (เก็บแล้วจะมีสองแหล่งความจริงที่ขัดกันได้)
  status text not null
    constraint node_progress_status_allowed
    check (status in ('in-progress', 'completed', 'tested-out', 'skipped')),

  -- ผลรายข้อ: questionId → ถูก/ผิด (checkpoint) และ cueId → ถูก/ผิด (คำถามกลางวิดีโอ)
  checkpoint_results jsonb not null default '{}'::jsonb,
  video_cue_results jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, course_slug, node_id)
);

create index node_progress_user_course_idx on academy.node_progress (user_id, course_slug);

-- ── RLS: เปิดและไม่มี policy = default deny (แบบเดียวกับ 0001) ────────────────
-- ทางเข้าเดียวคือ service_role ผ่าน server route; browser ไม่คุย DB ตรง
alter table academy.users enable row level security;
alter table academy.node_progress enable row level security;

grant all on academy.users to service_role;
grant all on academy.node_progress to service_role;
