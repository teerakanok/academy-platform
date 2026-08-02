-- 0009_attempt_finalize.sql — ส่งคำตอบแล้วระบบล้มกลางทาง ต้องไม่กินสิทธิ์ผู้เรียน
--
-- 🔴 ช่องว่างที่ปิด (RIL cross-model รอบ W1 ข้อ 6): การส่งคำตอบหนึ่งครั้งมีสองขั้น
-- ที่ไม่ atomic ต่อกัน — `consume_attempt` (ทำเครื่องหมายว่าใช้แล้ว) แล้วจึง
-- `record_node_progress` (บันทึกผล) · ถ้าขั้นหลังล้ม (worker ตาย / DB สะดุด)
-- ผู้เรียนได้ 500 · ความคืบหน้าไม่ถูกบันทึก · และ attempt นั้นใช้ซ้ำไม่ได้แล้ว
-- เท่ากับเสียสิทธิ์หนึ่งครั้งจาก 3 ครั้ง/30 นาที โดยไม่ได้อะไรเลย
--
-- ทางแก้: attempt จำ "ผลสุดท้าย" ของตัวเองไว้ · การส่งซ้ำด้วย attempt เดิมจึงมี
-- ความหมายสองแบบที่แยกกันชัดเจน
--   · ใช้ไปแล้วและ **มีผลแล้ว** → คืนผลเดิม (idempotent) ไม่ตรวจใหม่ ไม่เขียนซ้ำ
--   · ใช้ไปแล้ว **ยังไม่มีผล และค้างมานานพอ** → คือกรณีที่ล้มกลางทาง ให้ตรวจใหม่ได้
--
-- ⚠️ ทำไมต้องมี "ค้างมานานพอ" (STALE_CLAIM_SECONDS) ไม่ใช่ปล่อยให้ส่งซ้ำได้ทันที:
-- ถ้าเงื่อนไขเป็นแค่ "ยังไม่มีผล" คนที่ยิงสองคำขอ**พร้อมกัน**จะ consume ผ่านทั้งคู่
-- (ทั้งคู่เห็น outcome เป็น null) แล้วตรวจคนละชุดคำตอบด้วย attempt ใบเดียว =
-- ได้สิทธิ์สองครั้งจากโควตาหนึ่งช่อง · การกันเวลาไว้ทำให้ "ล้มจริง" (ซึ่งกินเวลาแน่ๆ)
-- แยกออกจาก "ยิงซ้ำพร้อมกัน" (ซึ่งเกิดในเสี้ยววินาที) ได้โดยไม่ต้องมีสถานะเพิ่ม
--
-- ⚠️ สิ่งที่คืนต้องเป็น `{passed}` เท่านั้นเหมือนสัญญาเดิมของโหมดวัดผล — การคืนผล
-- เดิมต้องไม่กลายเป็นช่องใหม่ที่บอกอะไรมากกว่าตอนส่งครั้งแรก (W0-1)

alter table academy.attempt
  -- ผลสุดท้ายของ attempt นี้ · null = ยังไม่มีผล (ยังไม่ส่ง หรือส่งแล้วล้มกลางทาง)
  add column if not exists outcome jsonb;

comment on column academy.attempt.outcome is
  'ผลสุดท้ายของ attempt — มีค่าแล้ว = จบสมบูรณ์ · null ทั้งที่ consumed_at ไม่ null = ล้มกลางทาง ให้ตรวจใหม่ได้';

-- consume: คำสั่งเดียวเหมือนเดิม แต่คืน outcome มาด้วย เพื่อให้ผู้เรียกแยกได้ว่า
-- "ครั้งแรก" หรือ "ส่งซ้ำหลังจบแล้ว"
--
-- ⚠️ รูปคำสั่งยังต้องเป็น UPDATE เดียวที่มีเงื่อนไขครบใน WHERE (0005 ล็อกไว้) ·
-- เพิ่มได้แค่ทางที่ **ยอมให้แถวที่ consume แล้วแต่ยังไม่มี outcome ผ่านเข้ามาอีกครั้ง**
-- ⚠️ ต้อง drop ก่อน: Postgres เปลี่ยน return type ของฟังก์ชันเดิมด้วย `create or
-- replace` ไม่ได้ (42P13) · ลายเซ็นพารามิเตอร์เท่าเดิม แต่คอลัมน์ที่คืนเพิ่มมาหนึ่ง
-- ⚠️ ต้อง drop ก่อน: Postgres เปลี่ยน return type ของฟังก์ชันเดิมด้วย `create or
-- replace` ไม่ได้ (42P13) · ลายเซ็นพารามิเตอร์เท่าเดิม แต่คอลัมน์ที่คืนเพิ่มมาหนึ่ง
drop function if exists academy.consume_attempt(uuid, uuid, text, text, text);

create or replace function academy.consume_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text
)
returns table (params jsonb, challenge_version text, outcome jsonb)
language plpgsql
security invoker
as $$
begin
  -- ทางหลัก: จอง attempt เป็นของคำขอนี้ — UPDATE เดียว เงื่อนไขครบใน WHERE (0005)
  return query
  update academy.attempt a
     set consumed_at = coalesce(a.consumed_at, now())
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     -- ยังไม่เคยใช้ **หรือ** ใช้แล้วแต่ค้างไม่มีผลนานเกิน 30 วินาที (ล้มกลางทาง)
     and (
       a.consumed_at is null
       or (a.outcome is null and a.consumed_at < now() - interval '30 seconds')
     )
     and a.expires_at > now()
  returning a.params, a.challenge_version, a.outcome;

  if found then
    return;
  end if;

  -- ทางรอง: จบไปแล้ว — คืนผลเดิมโดยไม่แตะแถว
  --
  -- เกิดเมื่อ response ของครั้งแรกหายกลางทางแล้วผู้เรียนกดส่งอีกครั้ง · ไม่ตรวจ
  -- expiry ตรงนี้เพราะผลถูกตัดสินไปแล้ว การหมดอายุของโจทย์ไม่ได้ลบสิ่งที่เกิดขึ้นแล้ว
  -- และไม่ใช่ oracle เพราะเป็นผลของ attempt ที่คนนี้ถืออยู่แล้ว
  return query
  select a.params, a.challenge_version, a.outcome
    from academy.attempt a
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.outcome is not null;
end;
$$;

comment on function academy.consume_attempt is
  'ใช้ attempt — atomic UPDATE เดียว เงื่อนไข ownership/context/expiry ครบใน WHERE · ยอมให้ส่งซ้ำได้เฉพาะกรณีที่ยังไม่มีผล (ล้มกลางทาง) · คืน 0 แถว = ปฏิเสธ';

-- ปิดท้าย attempt ด้วยผลที่ตรวจได้ — เรียกหลังบันทึกความคืบหน้าสำเร็จเท่านั้น
--
-- เขียนได้ครั้งเดียว (`outcome is null` อยู่ใน WHERE) เพื่อให้สองคำขอที่แข่งกัน
-- ไม่ได้ผลคนละอย่างบนแถวเดียวกัน
create or replace function academy.finalize_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_outcome jsonb
)
returns void
language sql
security invoker
as $$
  update academy.attempt a
     set outcome = p_outcome
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.outcome is null;
$$;

comment on function academy.finalize_attempt is
  'บันทึกผลสุดท้ายของ attempt หลังบันทึกความคืบหน้าสำเร็จ — เขียนได้ครั้งเดียว';

grant execute on function academy.consume_attempt(uuid, uuid, text, text, text) to service_role;
revoke all on function academy.consume_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function academy.finalize_attempt(uuid, uuid, jsonb) to service_role;
revoke all on function academy.finalize_attempt(uuid, uuid, jsonb) from public, anon, authenticated;
