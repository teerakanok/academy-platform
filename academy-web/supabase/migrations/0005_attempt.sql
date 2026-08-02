-- 0005_attempt.sql — โครง attempt: ความพยายามหนึ่งครั้งที่เซิร์ฟเวอร์เป็นคนออกและถือโจทย์เอง (W0-0)
--
-- ทำไมต้องมี: วันนี้เฉลยฝังอยู่ในหน้า (F1) และการตรวจคำตอบไม่มีบริบทว่า "ความพยายาม
-- ครั้งไหน" — ใครก็ยิงคำตอบซ้ำได้เรื่อยๆ · attempt คือหน่วยที่ทำให้เซิร์ฟเวอร์พูดได้ว่า
-- "โจทย์ชุดนี้ ของคนนี้ บทนี้ ใช้ได้ครั้งเดียว หมดอายุเมื่อไร" โดยตารางแปลงเฉลย
-- (remap key) อยู่ใน params ฝั่งเซิร์ฟเวอร์ฝ่ายเดียว — client ไม่มีวันเห็น
--
-- ตารางนี้ยังเป็น "ตัวนับครั้งแบบถาวร" ในตัว: โควตา (3 ครั้ง/30 นาที ต่อ user×node)
-- นับจากแถวที่ออกไปจริงใน DB ไม่ใช่ตัวนับใน memory — บน Workers แต่ละ isolate มี
-- memory แยกกัน ตัวนับใน memory จึงเท่ากับไม่จำกัดอะไรเลย และรีสตาร์ตแล้วต้องไม่รีเซ็ต

create table academy.attempt (
  -- คีย์ของความพยายามครั้งนี้ — gen_random_uuid() (สุ่ม 122 bit) เดาไม่ได้
  attempt_id uuid primary key default gen_random_uuid(),

  -- ผูกว่าเป็นของใคร บทไหน โจทย์ตัวไหน — ส่ง attempt ของคนอื่น/บทอื่นมาใช้ไม่ได้
  user_id uuid not null references academy.users (id) on delete cascade,
  course_slug text not null,
  node_id text not null,
  challenge_id text not null,

  -- ชุดข้อที่สุ่ม + ตาราง remap key ของตัวเลือก — เซิร์ฟเวอร์ถือฝ่ายเดียว
  params jsonb not null,

  -- เวอร์ชันของโจทย์ ณ ตอนออก attempt — ใบรับรอง (W4) อ้างถึงย้อนหลังได้
  challenge_version text not null,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- ใช้แล้วใช้ซ้ำไม่ได้ (กัน replay) — null = ยังไม่ถูกใช้
  consumed_at timestamptz
);

-- ทั้งโควตา (นับต่อ user×course×node ในหน้าต่างเวลา) และการไล่ดู attempt ของบทหนึ่ง
-- ใช้ prefix เดียวกัน — index เดียวพอ
create index attempt_user_node_idx
  on academy.attempt (user_id, course_slug, node_id, created_at desc);

-- สำหรับงานกวาดแถวหมดอายุ (retention) — ตารางนี้โตขึ้นเรื่อยๆ (params ~1KB/แถว)
-- ตัว job กวาดจริงยังไม่ตั้ง (ต้องเลือกกลไก cron ซึ่งเป็น infra decision) แต่ index
-- ต้องมีตั้งแต่วันแรก ไม่งั้นวันที่ตั้ง job การ delete จะ scan ทั้งตาราง
create index attempt_expires_idx on academy.attempt (expires_at);

-- ── ออก attempt แบบนับโควตาในคำสั่งเดียวกัน ─────────────────────────────────────
-- ทำไมเป็นฟังก์ชัน: "นับก่อนแล้วค่อย insert" ฝั่ง app ไม่ atomic — สอง request พร้อมกัน
-- นับได้ 2 เท่ากันแล้ว insert ทั้งคู่ = โควตาทะลุ (บั๊กชนิดเดียวกับ record_node_progress
-- ที่แก้ด้วยการย้าย guard ลง DB) · ที่นี่ใช้ advisory xact lock ต่อ (user, course, node)
-- ให้การนับ+insert ของคีย์เดียวกันเข้าคิวกัน — คีย์ต่างกันไม่ต้องรอกัน
--
-- คืน 0 แถว = โควตาเต็ม (ตัวฟังก์ชันไม่ตัดสินข้อความ error — เป็นหน้าที่ของ route)
create or replace function academy.issue_attempt(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text,
  p_params jsonb,
  p_challenge_version text,
  p_ttl_minutes int default 60,
  p_max_per_window int default 3,
  p_window_minutes int default 30
)
returns table (attempt_id uuid, expires_at timestamptz)
language plpgsql
security invoker
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_course_slug || '|' || p_node_id, 0)
  );

  if (
    select count(*)
      from academy.attempt a
     where a.user_id = p_user_id
       and a.course_slug = p_course_slug
       and a.node_id = p_node_id
       and a.created_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_max_per_window then
    return; -- โควตาเต็ม — คืน 0 แถว
  end if;

  return query
  insert into academy.attempt
    (user_id, course_slug, node_id, challenge_id, params, challenge_version, expires_at)
  values
    (p_user_id, p_course_slug, p_node_id, p_challenge_id, p_params, p_challenge_version,
     now() + make_interval(mins => p_ttl_minutes))
  returning academy.attempt.attempt_id, academy.attempt.expires_at;
end;
$$;

comment on function academy.issue_attempt is
  'ออก attempt พร้อมนับโควตาต่อ (user, course, node) ในหน้าต่างเวลา — advisory lock กันนับแข่งกัน · คืน 0 แถว = โควตาเต็ม';

-- ── consume: คำสั่งเดียว เงื่อนไขครบใน WHERE เดียวกัน ────────────────────────────
-- ห้ามแตกเป็น "อ่านก่อนแล้วค่อยเขียน" เด็ดขาด: สอง request ที่ยิง attempt_id เดียวกัน
-- พร้อมกันจะผ่านทั้งคู่ · และห้ามย้าย ownership ออกไปตรวจนอก WHERE ไม่งั้นคนอื่น
-- consume attempt ของเราทิ้งได้ (แผน 2026-08-02 §5 W0-0 ล็อกรูปคำสั่งนี้ไว้)
--
-- คืน 0 แถว = ปฏิเสธ (ไม่ว่าจะเพราะไม่ใช่ของเรา / คนละบท / ใช้ไปแล้ว / หมดอายุ)
-- โดยตั้งใจไม่แยกเหตุผล — การบอกเหตุผลละเอียดคือ oracle ให้คนเดา attempt_id
create or replace function academy.consume_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text
)
returns table (params jsonb, challenge_version text)
language sql
security invoker
as $$
  update academy.attempt a
     set consumed_at = now()
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.consumed_at is null
     and a.expires_at > now()
  returning a.params, a.challenge_version;
$$;

comment on function academy.consume_attempt is
  'ใช้ attempt หนึ่งครั้ง — atomic UPDATE เดียว เงื่อนไข ownership/context/replay/expiry อยู่ใน WHERE เดียวกันทั้งหมด · คืน 0 แถว = ปฏิเสธ';

-- ── RLS: เปิดและไม่มี policy = default deny (แบบเดียวกับทุกตารางในสคีมานี้) ──────
-- ทางเข้าเดียวคือ service_role ผ่าน server route; browser ไม่คุย DB ตรง
alter table academy.attempt enable row level security;

grant all on academy.attempt to service_role;
grant execute on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int) to service_role;
grant execute on function academy.consume_attempt(uuid, uuid, text, text, text) to service_role;

-- ── ถอนสิทธิ์ execute ที่ Postgres แจก PUBLIC ให้ฟังก์ชันใหม่โดยปริยาย ─────────────
-- RIL จับ: function ใหม่ใน Postgres ได้ EXECUTE จาก PUBLIC อัตโนมัติ — วันนี้ยังไม่
-- ทะลุเพราะ anon/authenticated ไม่มีสิทธิ์บนตาราง (RLS + ไม่มี grant) แต่เป็นการพึ่ง
-- แนวป้องกันชั้นเดียว · ถอนทั้งสคีมา (รวมฟังก์ชันจาก 0003/0004 ที่เป็นรูเดียวกัน)
revoke all on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int) from public, anon, authenticated;
revoke all on function academy.consume_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function academy.status_rank(text) from public, anon, authenticated;
revoke all on function academy.has_course_entitlement(uuid, text) from public, anon, authenticated;
