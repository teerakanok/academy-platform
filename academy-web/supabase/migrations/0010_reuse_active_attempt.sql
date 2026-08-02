-- 0010_reuse_active_attempt.sql — เปิดหน้าซ้ำต้องได้โจทย์ใบเดิม ไม่ใช่กินโควตาใหม่
--
-- 🔴 ช่องว่างที่ปิด (RIL cross-model รอบ 2 ข้อ 4 · และครึ่งหลังของรอบ W1 ข้อ 7):
--   · ผู้เรียนตอบไปครึ่งทางแล้วเผลอ refresh — ทุกครั้งที่โหลดหน้า UI ขอ attempt ใหม่
--     สาม refresh ใน 30 นาทีก็ 429 ทั้งที่ยังไม่เคยกดส่งสักครั้ง
--   · `/api/attempts` insert สำเร็จแต่ response หายกลางทาง (เน็ตหลุด/worker ตาย) —
--     ผู้เรียนกดใหม่ก็ได้แถวใหม่ทุกครั้ง โควตาหมดโดยไม่เคยได้โจทย์เลย
--
-- ทางแก้: attempt ที่ยัง "มีชีวิต" (ยังไม่ถูกใช้ ยังไม่หมดอายุ) ของ (user, node,
-- challenge) เดียวกัน = ใบเดิมของงานเดิม · ขออีกกี่ครั้งก็คืนใบนั้น ไม่ออกใหม่
--
-- ⚠️ นี่ไม่ใช่การผ่อนโควตา แต่ทำให้มันนับสิ่งที่ถูกต้อง: หนึ่งช่องโควตา = **หนึ่งชุด
-- โจทย์ที่ถูกออกให้จริง** ไม่ใช่ "จำนวนครั้งที่เปิดหน้า" · และผลพลอยได้ที่สำคัญคือ
-- ผู้เรียนหมุนโจทย์ทิ้งโดยไม่ต้องส่งคำตอบไม่ได้อีก — เดิมกด refresh จนกว่าจะได้โจทย์
-- ที่ถูกใจก็ทำได้ ซึ่งกินโควตาแต่ไม่กินอะไรอย่างอื่นเลย
--
-- การขอโจทย์ชุดใหม่จริงๆ ยังทำได้ตามเดิมหลัง **ส่งคำตอบแล้ว** (attempt ถูก consume
-- ไปแล้ว ใบต่อไปจึงเป็นใบใหม่) ซึ่งเป็นจุดที่ตั้งใจให้เสียโควตาหนึ่งช่อง

-- ⚠️ drop ก่อน — คอลัมน์ที่คืนเพิ่มมาหนึ่ง (Postgres เปลี่ยน return type ด้วย
-- `create or replace` ไม่ได้: 42P13)
drop function if exists academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int);

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
-- คืน `params` มาด้วยเสมอ: ถ้าเป็นใบเดิม ผู้เรียกต้องเรนเดอร์โจทย์จาก params ที่
-- **เก็บไว้** ไม่ใช่ชุดที่เพิ่งสุ่มขึ้นมาใหม่ ไม่งั้นหน้าจะแสดงโจทย์ใหม่คู่กับเฉลยเก่า
returns table (attempt_id uuid, expires_at timestamptz, params jsonb)
language plpgsql
security invoker
as $$
declare
  v_active_id uuid;
  v_active_expires timestamptz;
  v_active_params jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_course_slug || '|' || p_node_id, 0)
  );

  -- ใบที่ยังมีชีวิตอยู่ = งานเดิมที่ยังทำค้างอยู่ · คืนใบนั้น ไม่ออกใหม่ ไม่กินโควตา
  --
  -- อยู่ใน advisory lock เดียวกับการนับ+insert จึงไม่มีทางที่สองคำขอพร้อมกันจะ
  -- ออกใบใหม่คนละใบ (เดิมสองแท็บได้คนละใบและกินสองช่อง)
  select a.attempt_id, a.expires_at, a.params
    into v_active_id, v_active_expires, v_active_params
    from academy.attempt a
   where a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.consumed_at is null
     and a.expires_at > now()
   order by a.created_at desc
   limit 1;

  if v_active_id is not null then
    attempt_id := v_active_id;
    expires_at := v_active_expires;
    params := v_active_params;
    return next;
    return;
  end if;

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
  returning academy.attempt.attempt_id, academy.attempt.expires_at, academy.attempt.params;
end;
$$;

comment on function academy.issue_attempt is
  'ออก attempt — คืนใบที่ยังไม่ถูกใช้และยังไม่หมดอายุถ้ามี (เปิดหน้าซ้ำไม่กินโควตา) · ไม่มีจึงออกใหม่พร้อมนับโควตาใน advisory lock เดียวกัน · คืน 0 แถว = โควตาเต็ม';

grant execute on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int)
  to service_role;
revoke all on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int)
  from public, anon, authenticated;
