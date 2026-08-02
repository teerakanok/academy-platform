-- 0011_attempt_retention.sql — กวาด attempt ที่หมดประโยชน์แล้ว โดยไม่ลบหลักฐาน
--
-- ตาราง `attempt` โตทางเดียว: หนึ่งแถวต่อหนึ่งชุดโจทย์ที่ออกให้ และ `params` เก็บ
-- โจทย์ทั้งชิ้น (MCQ ที่เรนเดอร์ได้ + ด่านจำลองหลังแทนค่า) ประมาณ 1–2 KB/แถว
-- รวม heap + index ราว 2–3 KB · 100k attempts ≈ 200–300 MB ก่อน WAL/backup/bloat
-- (RIL cross-model รอบ W1 ข้อ 9 ประเมินไว้ที่ระดับเดียวกัน)
--
-- ⚠️ สิ่งที่ห้ามลบ: แถวที่ยัง "มีชีวิต" (ยังไม่ถูกใช้ ยังไม่หมดอายุ) — ผู้เรียนอาจ
-- กำลังทำอยู่ · และ **สมุดนับโควตา**: แถวที่ยังอยู่ในหน้าต่างเวลาต้องอยู่ต่อ ไม่งั้น
-- การกวาดจะกลายเป็นการคืนโควตาให้ฟรี ซึ่งคือบั๊กเดียวกับที่ `/api/progress/reset`
-- เคยทำแล้วถูก RIL จับ
--
-- ทำไมลบได้โดยไม่กระทบใบรับรอง: 0008 เก็บ `passed_attempt_id` +
-- `passed_challenge_version` ไว้ที่ `node_progress` และ **ตั้งใจไม่ผูก FK** ·
-- หลักฐานที่ใบรับรองอ้างถึงคือ `simulation_evidence` ซึ่งอยู่ที่ node_progress
-- เช่นกัน — แถว attempt เป็นของใช้ระหว่างทาง ไม่ใช่ที่เก็บหลักฐาน

create or replace function academy.purge_expired_attempts(
  -- เก็บของที่หมดอายุไว้อีกกี่วันก่อนกวาด — เผื่อเวลาไล่ปัญหาย้อนหลัง
  p_retain_days int default 30,
  -- เพดานต่อรอบ กัน DELETE ก้อนโตล็อกตารางนาน (เรียกซ้ำได้จนกว่าจะคืน 0)
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
  'กวาด attempt ที่หมดอายุเกินระยะเก็บรักษา — ไม่แตะแถวที่ยังใช้ได้และไม่แตะช่วงที่โควตายังนับอยู่ · คืนจำนวนที่ลบ เรียกซ้ำจนได้ 0';

grant execute on function academy.purge_expired_attempts(int, int) to service_role;
revoke all on function academy.purge_expired_attempts(int, int) from public, anon, authenticated;

-- ⚠️ ยังไม่มีตัวตั้งเวลาเรียกฟังก์ชันนี้ — การเลือกกลไก (pg_cron บนเซิร์ฟเวอร์ที่
-- โฮสต์เอง vs cron ฝั่ง Cloudflare vs สั่งมือตอน maintenance) เป็นการตัดสินใจระดับ
-- infra ที่ต้องให้เจ้าของระบบเคาะ · ฟังก์ชันถูกเขียนให้เรียกซ้ำได้อย่างปลอดภัย
-- (idempotent, มีเพดานต่อรอบ) เพื่อให้เสียบกับกลไกไหนก็ได้โดยไม่ต้องแก้อะไรอีก
--
-- ค่าเริ่มต้น 30 วันเลือกจาก: attempt อายุ 60 นาที + หน้าต่างโควตา 30 นาที ·
-- 30 วันจึงเผื่อการไล่ปัญหาย้อนหลังไว้เกินพอ โดยยังไม่ให้ตารางโตไม่มีที่สิ้นสุด
