-- 0008_passing_attempt.sql — บันทึกว่า "ผ่านด้วยความพยายามครั้งไหน โจทย์เวอร์ชันไหน"
--
-- 🔴 ช่องว่างที่ปิด (RIL cross-model รอบ 2): `node_progress` เก็บแค่ว่าผ่านแล้วและ
-- ผลรายข้อ · ผู้เรียนคนหนึ่ง consume attempt หลายครั้งคร่อมเนื้อหาสองเวอร์ชันได้
-- แล้วไม่มีอะไรบอกว่า **attempt ไหน** ที่ทำให้ผ่าน และตอนนั้นกติกาเป็นเวอร์ชันอะไร
-- แถวใน `attempt` ทุกแถวมี `consumed_at` เหมือนกันหมด จับคู่ย้อนหลังไม่ได้
--
-- ทำไมสำคัญ: ใบรับรอง (W4) **snapshot หลักฐาน ณ วันออก** ไม่ใช่สถานะปัจจุบัน ·
-- ถ้ามีคนถามว่า "ใบนี้ออกจากอะไร" คำตอบต้องชี้ไปที่แถวเดียวได้ ไม่ใช่ "ก็บทนี้
-- completed อยู่" ซึ่งไม่ตอบอะไรเลย
--
-- ทำไมเก็บบน node_progress ไม่ใช่ตารางใหม่: หลักฐานของบทหนึ่งอยู่แถวเดียวอยู่แล้ว
-- (สถานะ + ผลรายข้อ + หลักฐานด่านจำลอง) การเพิ่มสองคอลัมน์ทำให้ทุกอย่างที่ใบรับรอง
-- ต้องใช้อยู่ที่เดียว · ประวัติทุกครั้งที่พยายามเป็นงานคนละก้อน (ต้องมีตารางของตัวเอง
-- + นโยบายเก็บรักษา) และไม่ใช่สิ่งที่ใบรับรองอ้างถึง

alter table academy.node_progress
  -- attempt ที่ทำให้บทนี้ผ่าน — null = ยังไม่เคยผ่านแบบมี attempt (บทสอนทั่วไป)
  add column if not exists passed_attempt_id uuid,
  -- เวอร์ชันของโจทย์ ณ ตอนที่ผ่าน (มาจาก attempt.challenge_version)
  add column if not exists passed_challenge_version text;

comment on column academy.node_progress.passed_attempt_id is
  'attempt ที่ทำให้บทนี้ผ่าน — ใบรับรอง (W4) ชี้กลับมาที่แถวนี้ได้ว่าออกจากอะไร';

-- ⚠️ ตั้งใจ **ไม่** ใส่ foreign key ไปที่ academy.attempt
--
-- ตาราง attempt มีนโยบายกวาดของหมดอายุ (retention) ที่จะตั้งก่อนเปิด traffic จริง ·
-- ถ้าผูก FK ไว้ การกวาดจะลบหลักฐานของใบรับรองไปด้วย (หรือกวาดไม่ได้เลย) · ค่าที่
-- เก็บไว้จึงเป็น "ตัวชี้ที่ยังอ่านได้แม้แถวต้นทางถูกกวาด" — ตัว challenge_version
-- ที่เก็บคู่กันทำให้ยังตอบได้ว่าผ่านด้วยกติกาชุดไหนแม้ attempt หายไปแล้ว

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
    checkpoint_results = np.checkpoint_results || coalesce(p_checkpoint_results, '{}'::jsonb),
    video_cue_results = np.video_cue_results || coalesce(p_video_cue_results, '{}'::jsonb),
    -- หลักฐานก็เลื่อนขึ้นได้อย่างเดียวเหมือนกัน (0007)
    simulation_evidence = academy.merge_simulation_evidence(np.simulation_evidence, p_simulation_evidence),
    -- ⚠️ ตัวชี้ของการผ่านต้องไม่ถูกทับด้วยการส่งครั้งหลังที่ไม่ได้ทำให้ผ่าน
    -- (route ส่งค่านี้มาเฉพาะตอนผ่านเท่านั้น แต่กติกาต้องอยู่ใน DB ด้วย —
    --  ข้อตกลงระดับโค้ดเรียกคืนไม่ได้เมื่อมีคนเรียกฟังก์ชันนี้จากที่อื่น)
    passed_attempt_id = coalesce(np.passed_attempt_id, p_passed_attempt_id),
    passed_challenge_version = coalesce(np.passed_challenge_version, p_passed_challenge_version),
    updated_at = now();
$$;

grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  to service_role;
revoke all on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;

-- รุ่นเก่า (7 อาร์กิวเมนต์) ยังอยู่ได้เพราะ default ทำให้เรียกแบบเดิมได้ — แต่ต้อง
-- ถอด grant ของรุ่นเก่าออก ไม่งั้นจะมีสองทางเข้าที่พฤติกรรมต่างกัน
drop function if exists academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb);
