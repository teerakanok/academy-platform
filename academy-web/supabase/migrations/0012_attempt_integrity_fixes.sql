-- 0012_attempt_integrity_fixes.sql — ปิดสามรูที่ RIL สองเลนชี้ตรงกัน (2026-08-02)
--
-- ทั้งสามเกิดจากความคิดเดียวกันที่ผิด: "เขียนกติกาไว้ในโค้ดฝั่งแอปแล้วถือว่าจริง"
-- ของจริงคือทุกกติกาที่หลักฐานพึ่งพา ต้องอยู่ในคำสั่งของฐานข้อมูล
--
-- ── 1. claim ที่ไม่ต่ออายุ ทำให้ attempt เดียวถูกตรวจได้หลายครั้ง ────────────────
-- 0009 ยอมให้ยึด attempt ที่ค้างไม่มีผลเกิน 30 วินาทีกลับมาใช้ (กู้จากการล้มกลางทาง)
-- แต่เขียน `consumed_at = coalesce(consumed_at, now())` ซึ่ง **ไม่ต่ออายุของเดิม** ·
-- พอเลย 30 วินาที ทุกคำขอที่ยิงพร้อมกันจึงผ่านเงื่อนไขหมด → ตรวจได้หลายชุดคำตอบจาก
-- โควตาช่องเดียว และ response ของแต่ละเส้นก็ต่างกัน (RIL ทั้งสองเลนเดินเคสให้ดู)
--
-- ── 2. ผลรายข้อถูกทับได้แม้บทผ่านไปแล้ว ────────────────────────────────────────
-- สถานะกับตัวชี้ถูกกันไม่ให้ถอย แต่ `checkpoint_results` ยังใช้ `||` (ขวาชนะ) ·
-- ผ่านแล้วขอ attempt ใหม่แล้วตอบมั่ว = บทที่ระบบบอกว่าผ่าน มีผลรายข้อบอกว่าผิดหมด
-- ขัดกันเอง — บั๊กชนิดเดียวกับที่ 0007 แก้ให้ `simulation_evidence` ไปแล้ว
--
-- กติกาที่ตั้ง: **หลักฐานของการผ่านถูกแช่แข็งพร้อมกันทั้งชุด** เมื่อ `passed_attempt_id`
-- ถูกเขียนครั้งแรก · การทำซ้ำหลังจากนั้นไม่เปลี่ยนอะไรในแถวนี้อีก (ยังทำเพื่อฝึกได้
-- แต่ไม่เขียนทับหลักฐาน) — ใบรับรองอ้างถึง "การผ่านครั้งที่ทำให้ผ่าน" ไม่ใช่ครั้งล่าสุด
--
-- ── 3. ตัวกวาดลบ attempt ที่เป็นหลักฐานของการผ่าน ─────────────────────────────
-- 0011 กวาดตามอายุอย่างเดียว · attempt ที่ `passed_attempt_id` ชี้อยู่จึงหายได้
-- เหลือแต่ UUID ที่ชี้ไปยังแถวที่ไม่มีอยู่ = ตอบไม่ได้ว่าผ่านด้วยโจทย์ชุดไหน
-- ซึ่งเป็นเหตุผลทั้งหมดที่ 0008 มีอยู่

-- ── 1 ────────────────────────────────────────────────────────────────────────
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
  return query
  update academy.attempt a
     -- ต่ออายุ claim ทุกครั้งที่ยึดสำเร็จ — คำขอถัดไปที่รอ row lock อยู่จะเห็น claim
     -- สดแล้วถูกปฏิเสธ · เดิมใช้ coalesce จึงคง timestamp เก่าไว้ ทำให้ทุกเส้นที่ยิง
     -- พร้อมกันหลังพ้น 30 วินาทีผ่านได้หมด
     set consumed_at = now()
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and (
       a.consumed_at is null
       or (a.outcome is null and a.consumed_at < now() - interval '30 seconds')
     )
     and a.expires_at > now()
  returning a.params, a.challenge_version, a.outcome;

  if found then
    return;
  end if;

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
  'ใช้ attempt — UPDATE เดียว เงื่อนไขครบใน WHERE · ยึดสำเร็จแล้วต่ออายุ claim เสมอ (กันสองเส้นยึดพร้อมกันหลัง claim ค้าง) · จบแล้วคืนผลเดิม';

-- ── 2 ────────────────────────────────────────────────────────────────────────
create or replace function academy.record_node_progress(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_status text,
  p_checkpoint_results jsonb default null,
  p_video_cue_results jsonb default null,
  p_simulation_evidence jsonb default null,
  p_passed_attempt_id uuid default null,
  p_passed_challenge_version text default null
)
returns void
language sql
security invoker
as $$
  insert into academy.node_progress as np
    (user_id, course_slug, node_id, status, checkpoint_results, video_cue_results, simulation_evidence,
     passed_attempt_id, passed_challenge_version, updated_at)
  values (
    p_user_id, p_course_slug, p_node_id, p_status,
    coalesce(p_checkpoint_results, '{}'::jsonb),
    coalesce(p_video_cue_results, '{}'::jsonb),
    coalesce(p_simulation_evidence, '{}'::jsonb),
    p_passed_attempt_id,
    p_passed_challenge_version,
    now()
  )
  on conflict (user_id, course_slug, node_id) do update set
    -- สถานะเลื่อนขึ้นได้อย่างเดียว ไม่มีทางถอย (เหตุผลเต็มอยู่ใน 0003)
    status = case
      when academy.status_rank(excluded.status) >= academy.status_rank(np.status)
      then excluded.status else np.status
    end,
    -- ⚠️ หลักฐานของการผ่านถูกแช่แข็งทั้งชุดเมื่อมีตัวชี้แล้ว (0012)
    -- ทำซ้ำเพื่อฝึกได้ แต่เขียนทับสิ่งที่ใบรับรองอ้างถึงไม่ได้
    checkpoint_results = case
      when np.passed_attempt_id is not null then np.checkpoint_results
      else np.checkpoint_results || coalesce(p_checkpoint_results, '{}'::jsonb)
    end,
    simulation_evidence = case
      when np.passed_attempt_id is not null then np.simulation_evidence
      else academy.merge_simulation_evidence(np.simulation_evidence, p_simulation_evidence)
    end,
    -- คำถามกลางวิดีโอเป็น formative ไม่ใช่หลักฐาน — อัปเดตได้ตลอด
    video_cue_results = np.video_cue_results || coalesce(p_video_cue_results, '{}'::jsonb),
    passed_attempt_id = coalesce(np.passed_attempt_id, p_passed_attempt_id),
    passed_challenge_version = coalesce(np.passed_challenge_version, p_passed_challenge_version),
    updated_at = now();
$$;

grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  to service_role;
revoke all on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;

-- ── 3 ────────────────────────────────────────────────────────────────────────
-- ตัวกวาดต้องหาให้เร็วว่า attempt ใบไหนถูกอ้างเป็นหลักฐาน — ไม่มี index จะ scan
-- ทั้งตาราง node_progress ต่อการกวาดหนึ่งก้อน
create index if not exists node_progress_passed_attempt_idx
  on academy.node_progress (passed_attempt_id)
  where passed_attempt_id is not null;

create or replace function academy.purge_expired_attempts(
  p_retain_days int default 30,
  p_limit int default 5000
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  with doomed as (
    select a.attempt_id
      from academy.attempt a
     where a.expires_at < now() - make_interval(days => p_retain_days)
       -- ⚠️ ห้ามลบใบที่เป็นหลักฐานของการผ่าน — ตัวชี้ใน node_progress ตั้งใจไม่มี FK
       -- (retention ต้องกวาดได้) กติกาจึงต้องอยู่ที่นี่แทน ไม่งั้นเหลือแต่ UUID
       -- ที่ชี้ไปยังแถวที่ไม่มีอยู่ = ตอบไม่ได้ว่าผ่านด้วยโจทย์ชุดไหน
       and not exists (
         select 1
           from academy.node_progress np
          where np.passed_attempt_id = a.attempt_id
       )
     order by a.expires_at
     limit p_limit
  )
  delete from academy.attempt a
   using doomed d
   where a.attempt_id = d.attempt_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function academy.purge_expired_attempts is
  'กวาด attempt ที่หมดอายุเกินระยะเก็บรักษา — ไม่แตะของที่ยังใช้ได้ ไม่แตะช่วงที่โควตายังนับ และไม่แตะใบที่เป็นหลักฐานของการผ่าน';

grant execute on function academy.purge_expired_attempts(int, int) to service_role;
revoke all on function academy.purge_expired_attempts(int, int) from public, anon, authenticated;
