-- 0007_evidence_never_regresses.sql — หลักฐานที่ผ่านแล้วต้องไม่ถูกทับด้วยผลที่แย่ลง
--
-- 🔴 บั๊กที่แก้ (RIL cross-model จับ): 0006 รวมหลักฐานด้วย `||` ซึ่งให้ค่าฝั่งขวาชนะ
-- เสมอ · สถานะบทถูกกันไม่ให้ถอยหลังอยู่แล้ว (status_rank) แต่ **หลักฐานไม่ถูกกัน**
-- แปลว่า:
--   ผู้เรียนผ่าน capstone → status = completed, evidence = {passed:true}
--   แล้วกลับมากดเล่นแบบผิดๆ → status ยัง completed (ถูกต้อง) แต่ evidence กลายเป็น
--   {passed:false} → บทที่ระบบบอกว่า "ผ่าน" มีหลักฐานบอกว่า "ไม่ผ่าน" ขัดกันเอง
--   และใบรับรอง (W4) อ้างอิงหลักฐานชุดนี้
--
-- กติกาที่ตั้ง: **หลักฐานเลื่อนขึ้นได้อย่างเดียว เหมือนสถานะ** — ด่านที่เคยผ่านแล้ว
-- จะถูกทับได้ด้วยผลที่ผ่านเหมือนกันเท่านั้น (เช่น ทำใหม่ให้ดีขึ้น/โจทย์เวอร์ชันใหม่)
-- ส่วนผลที่ไม่ผ่านจะถูกบันทึกก็ต่อเมื่อด่านนั้นยังไม่เคยผ่าน
--
-- ทำไมไม่เก็บทุกครั้งแบบ append-only: ประวัติทั้งหมดเป็นของที่มีค่า แต่เป็นงานคนละ
-- ก้อน (ต้องมีตารางของตัวเอง + นโยบายเก็บรักษา) · สิ่งที่ต้องถูกวันนี้คือ "หลักฐาน
-- ที่ใบรับรองอ้างถึงต้องไม่ขัดกับสถานะ" ซึ่งแก้ได้ที่นี่โดยไม่ต้องรื้อโครง

create or replace function academy.merge_simulation_evidence(existing jsonb, incoming jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      key,
      case
        -- ด่านที่เคยผ่านแล้ว: รับของใหม่เฉพาะเมื่อมันก็ผ่านเหมือนกัน
        when coalesce((existing -> key ->> 'passed')::boolean, false)
             and not coalesce((incoming -> key ->> 'passed')::boolean, false)
        then existing -> key
        else coalesce(incoming -> key, existing -> key)
      end
    ),
    '{}'::jsonb
  )
  from (
    select jsonb_object_keys(coalesce(existing, '{}'::jsonb) || coalesce(incoming, '{}'::jsonb)) as key
  ) keys;
$$;

comment on function academy.merge_simulation_evidence is
  'รวมหลักฐานด่านจำลองแบบไม่ถอยหลัง — ด่านที่ผ่านแล้วจะไม่ถูกทับด้วยผลที่ไม่ผ่าน (ดูเหตุผลใน 0007)';

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
    -- หลักฐานก็เลื่อนขึ้นได้อย่างเดียวเหมือนกัน (0007)
    simulation_evidence = academy.merge_simulation_evidence(np.simulation_evidence, p_simulation_evidence),
    updated_at = now();
$$;

grant execute on function academy.merge_simulation_evidence(jsonb, jsonb) to service_role;
revoke all on function academy.merge_simulation_evidence(jsonb, jsonb) from public, anon, authenticated;
grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb) to service_role;
revoke all on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
