-- 0003_record_node_progress.sql — บันทึกความคืบหน้าแบบ atomic ป้องกันสถานะถอยหลัง
--
-- ปัญหาที่เจอจริง (e2e จับได้ 2026-08-01): ตอนเปิดบทเรียนเรายิง 'in-progress' แบบ
-- ไม่รอผล พอผู้เรียนทำจบเร็วกว่าที่ request แรกจะถึง DB คำสั่งสองอันนี้จะแข่งกัน
-- และตัว guard ที่เขียนไว้ฝั่ง app เป็นแบบ "อ่านก่อนแล้วค่อยเขียน" ซึ่งไม่ atomic:
--   T1 อ่าน (ไม่มีแถว) → T2 อ่าน (ไม่มีแถว) → T2 เขียน completed → T1 เขียน in-progress
-- ผลคือบทที่เรียนจบแล้วกลับไปเป็น "กำลังเรียน" — และใบรับรองหายไปเฉยๆ
--
-- แข่งกันแบบเดียวกันนี้เกิดข้ามเครื่องได้ด้วย (เปิดสองอุปกรณ์) การย้าย guard ลงมา
-- อยู่ในคำสั่งเดียวของฐานข้อมูลจึงเป็นที่เดียวที่แก้ได้จริง

create or replace function academy.status_rank(status text)
returns int
language sql
immutable
as $$
  select case status
    when 'in-progress' then 1
    when 'skipped'     then 2
    when 'completed'   then 3
    when 'tested-out'  then 3
    else 0
  end;
$$;

comment on function academy.status_rank(text) is
  'ลำดับความ "หนักแน่น" ของสถานะ — ใช้กันไม่ให้สถานะถอยหลัง; completed กับ tested-out เท่ากันเพราะทั้งคู่คือพิสูจน์แล้ว';

create or replace function academy.record_node_progress(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_status text,
  p_checkpoint_results jsonb default null,
  p_video_cue_results jsonb default null
)
returns void
language sql
security invoker
as $$
  insert into academy.node_progress as np
    (user_id, course_slug, node_id, status, checkpoint_results, video_cue_results, updated_at)
  values (
    p_user_id, p_course_slug, p_node_id, p_status,
    coalesce(p_checkpoint_results, '{}'::jsonb),
    coalesce(p_video_cue_results, '{}'::jsonb),
    now()
  )
  on conflict (user_id, course_slug, node_id) do update set
    -- สถานะเลื่อนขึ้นได้อย่างเดียว ไม่มีทางถอย
    status = case
      when academy.status_rank(excluded.status) >= academy.status_rank(np.status)
      then excluded.status else np.status
    end,
    -- ผลรายข้อรวมกัน ไม่ทับของเดิม — คำตอบที่เคยทำไว้ต้องไม่หายเพราะ request หลัง
    -- ส่งมาแค่บางส่วน
    checkpoint_results = np.checkpoint_results || coalesce(p_checkpoint_results, '{}'::jsonb),
    video_cue_results = np.video_cue_results || coalesce(p_video_cue_results, '{}'::jsonb),
    updated_at = now();
$$;

comment on function academy.record_node_progress is
  'บันทึกสถานะบทเรียนแบบ atomic — กันสถานะถอยหลังและกันคำตอบเดิมถูกทับ (ดูเหตุผลใน migration)';

grant execute on function academy.status_rank(text) to service_role;
grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb) to service_role;
