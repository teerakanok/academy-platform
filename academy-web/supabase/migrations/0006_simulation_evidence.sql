-- 0006_simulation_evidence.sql — หลักฐานของด่านจำลอง (W1)
--
-- ทำไมไม่ยัดรวมใน checkpoint_results: คอลัมน์นั้นเก็บ "ถูก/ผิด" ต่อข้อ ซึ่งพอสำหรับ
-- MCQ แต่ไม่พอสำหรับโจทย์จำลอง · ใบรับรอง (W4) จะอ้างอิงหลักฐานนี้และต้องตรวจ
-- ย้อนหลังได้ว่า **ผ่านด้วยอะไร** — requirement ไหนผ่าน ตอนไหน และโจทย์เวอร์ชันใด
-- (แผน 2026-08-02 §5 W1 ข้อ 4)
--
-- รูปที่เก็บ: { "<checkpointItemId>": { passed, requirements: [{id, met}],
--               challengeVersion, at } }

alter table academy.node_progress
  add column simulation_evidence jsonb not null default '{}'::jsonb;

comment on column academy.node_progress.simulation_evidence is
  'หลักฐานรายด่านจำลอง: ผลราย requirement + เวอร์ชันโจทย์ + เวลา — ใบรับรองอ้างอิงข้อมูลนี้';

-- ฟังก์ชันบันทึกต้องรับหลักฐานใหม่ด้วย โดยรวมกับของเดิมแบบเดียวกับ checkpoint_results
-- (request หลังส่งมาแค่บางส่วนต้องไม่ลบของที่เคยทำไว้)
create or replace function academy.record_node_progress(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_status text,
  p_checkpoint_results jsonb default null,
  p_video_cue_results jsonb default null,
  p_simulation_evidence jsonb default null
)
returns void
language sql
security invoker
as $$
  insert into academy.node_progress as np
    (user_id, course_slug, node_id, status, checkpoint_results, video_cue_results, simulation_evidence, updated_at)
  values (
    p_user_id, p_course_slug, p_node_id, p_status,
    coalesce(p_checkpoint_results, '{}'::jsonb),
    coalesce(p_video_cue_results, '{}'::jsonb),
    coalesce(p_simulation_evidence, '{}'::jsonb),
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
    simulation_evidence = np.simulation_evidence || coalesce(p_simulation_evidence, '{}'::jsonb),
    updated_at = now();
$$;

-- ลบ signature เดิมทิ้งก่อน — ไม่งั้นจะมีสองทางเข้าที่ทำงานต่างกัน และคำสั่งที่อ้าง
-- ชื่อฟังก์ชันโดยไม่ระบุ argument จะกำกวมทันที
drop function if exists academy.record_node_progress(uuid, text, text, text, jsonb, jsonb);

comment on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb) is
  'บันทึกสถานะบทเรียนแบบ atomic — กันสถานะถอยหลังและกันผลเดิมถูกทับ (ดูเหตุผลใน 0003) · รับหลักฐานด่านจำลองตั้งแต่ 0006';

grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb) to service_role;
revoke all on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
