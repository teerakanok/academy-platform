# RIL — วงจรชีวิตของ attempt (migration 0008–0012 + cron)

**วันที่:** 2026-08-02 · **commit ที่รีวิว:** `1dc3de9` · **ผลที่ปิดแล้ว:** `347660b`

รีวิวสองเลนอิสระ ผู้ให้บริการเดียวกันแต่คนละมุมมองและคนละระดับความพยายาม —
`gemini` CLI ใช้ไม่ได้ (Google ยกเลิก free tier ของ Gemini Code Assist ตัวนี้ ต้องย้ายไป
Antigravity) และ `gpt-5.1-codex-max` ก็ใช้ไม่ได้กับบัญชี ChatGPT จึงยังไม่ใช่
multiprovider เต็มรูป — บันทึกไว้ตรงๆ เพื่อไม่ให้อ้างเกินจริง

**สามข้อที่ทั้งสองเลนชี้ตรงกัน** (น้ำหนักสูงสุด): claim ที่ไม่ต่ออายุ · ผลรายข้อถูกทับ
ได้แม้ผ่านแล้ว · ตัวกวาดลบใบที่เป็นหลักฐาน — ปิดครบใน migration 0012

รายงานเต็มของแต่ละเลนอยู่ด้านล่างตามที่ผู้รีวิวเขียน (ไม่ตัดต่อ)

## เลน A — reviewer (xhigh)

1. **blocker — stale claim ทำให้หนึ่ง quota slot ถูก grade หลายครั้งได้**  
   ไฟล์: [0009_attempt_finalize.sql:55](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0009_attempt_finalize.sql:55), [progress/route.ts:204](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/app/api/progress/route.ts:204), [progress/route.ts:300](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/app/api/progress/route.ts:300)

   Failure scenario: ส่ง submission ที่มี answer ID ขาด/เกินด้วย `attemptId` ที่ถูกต้อง ตัว route consume สำเร็จก่อนแล้วจึงตอบ 400 ทำให้ `outcome=null`. รอ 31 วินาทีแล้ว fan-out valid submissions หลายชุดพร้อมกัน ทุกชุดผ่าน stale predicate เพราะ `consumed_at = coalesce(consumed_at, now())` ไม่ต่ออายุ timestamp เดิม แม้ PostgreSQL จะ serialize row update แต่เงื่อนไขยังจริงทุกครั้ง จึง grade และเขียน progress ได้หลายรอบ

   ถ้า request แรกช้ากว่า 30 วินาทีก็เกิดแบบเดียวกัน: request A อาจบันทึก pass ขณะที่ B finalize fail ก่อน ทำให้ `node_progress` กับ `attempt.outcome` ขัดกัน และแต่ละ response คืนผลของตนเอง

   Smallest fix: ปิด stale-reclaim ชั่วคราวเพื่อรักษา integrity. Fix ที่สมบูรณ์คือต่ออายุ claim พร้อม `claim_token/generation` และรวม progress + outcome ไว้ใน transactional `complete_attempt` RPC เดียว; loser ต้องเขียนไม่ได้และต้องได้ canonical stored outcome กลับมา การเปลี่ยนเป็น `consumed_at = now()` อย่างเดียวยังไม่กัน slow original request

2. **blocker — pointer ถูก freeze แต่ evidence ที่ pointer อ้างยังถูกทับได้**  
   ไฟล์: [0008_passing_attempt.sql:66](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0008_passing_attempt.sql:66), [0007_evidence_never_regresses.sql:28](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0007_evidence_never_regresses.sql:28)

   Failure scenario: attempt A/v1 ผ่านและตั้ง pointer เป็น A/v1 จากนั้น attempt B ตอบผิด `checkpoint_results = old || incoming` จะทับผลของ A เป็น `false` ขณะที่สถานะและ pointer ยังบอกว่าผ่านด้วย A. ถ้า B/v2 ผ่าน simulation แบบ pass→pass ฟังก์ชัน merge ยอมให้ evidence ของ B/v2 ทับ แต่ pointer ยังเป็น A/v1

   ผลคือแถว certificate evidence ผสม pointer จาก attempt แรกกับ MCQ/simulation evidence จาก attempt หลัง

   Smallest fix: สร้าง immutable `passed_evidence` ที่เขียนครั้งเดียวพร้อม pointer แบบ atomic หรือ freeze checkpoint/simulation evidence ทันทีเมื่อ `passed_attempt_id` มีค่า แยกจาก “ผลล่าสุด” ที่ยังแก้ได้

3. **blocker — retention ลบ task snapshot ที่ certificate ต้องใช้อธิบายผล**  
   ไฟล์: [0011_attempt_retention.sql:31](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0011_attempt_retention.sql:31), [attempt.ts:20](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/course/attempt.ts:20)

   Failure scenario: ผู้เรียนผ่าน capstone ด้วย attempt A วันที่ 2 สิงหาคม แต่ใบรับรองออกหลัง retention cutoff. Cron ลบ A แล้วเหลือเพียง UUID ที่ชี้ไปยังแถวซึ่งไม่มีอยู่, course version, booleans และ simulation fingerprint; remapped MCQ, prompt/choices, answer snapshot, resolved simulation targets และ grading rules ถูกลบหมด จึงพิสูจน์ย้อนหลังไม่ได้ว่าผู้เรียนเห็นและถูกตรวจจากอะไร

   Smallest fix: เพิ่ม `NOT EXISTS` กันการ purge attempt ที่ถูก `node_progress.passed_attempt_id` อ้างถึง จนกว่า certificate/assessment table จะเก็บ immutable task + result snapshot แล้ว จึงค่อยลบ attempt ต้นทาง

4. **should-fix — cron failure ถูกนับเป็น success**  
   ไฟล์: [worker.ts:35](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/worker.ts:35), [worker.ts:55](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/worker.ts:55), [worker.ts:74](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/worker.ts:74)

   Failure scenario: key ถูก revoke หรือ schema `academy` ยังไม่เปิด ทำให้ RPC ตอบ 401/406. โค้ด log error แล้ว resolve `{deleted:0}` จากนั้น log ต่อว่า “ลบ 0 แถว”; `waitUntil` ไม่ reject จึงทำให้ Cron invocation ถูกบันทึกว่าสำเร็จแม้งานเสียทุกวัน

   Smallest fix: throw เมื่อ secret ขาดหรือ response ไม่ใช่ 2xx และ log success เฉพาะเส้นทางสำเร็จ อาจแนบ response detail ที่ sanitize และจำกัดความยาว

สิ่งที่ตรวจแล้วถูกต้อง:

- สอง fresh submissions พร้อมกัน: มีเพียงหนึ่ง `consume` ที่ผ่านก่อน 30 วินาที
- สอง `issue_attempt` พร้อมกัน: advisory transaction lock ทำให้ได้ attempt/task set เดียว และ route ใช้ stored params
- purge ด้วยค่าปัจจุบัน 30 วัน, TTL 60 นาที และ quota window 30 นาที ไม่คืน quota
- wrapper ส่งต่อ OpenNext `fetch` และ named exports ครบ; RPC URL, parameters และ schema-profile headers ถูกต้อง
- การเรียก PostgREST ตรงจาก scheduled handler เป็น seam ที่เหมาะสมกว่าเปิด public route

### Test quality

Hollow tests ที่ยังเขียวได้แม้ behavior สำคัญถอยหลัง:

- [attempt-db.test.ts:457](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/integration/attempt-db.test.ts:457) ทดสอบ stale reclaim เพียงครั้งเดียว ไม่ตรวจว่า timestamp ถูกต่ออายุ ไม่ยิง concurrent reclaim หลัง stale และไม่ fence slow writer
- [attempt-db.test.ts:408](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/integration/attempt-db.test.ts:408) ส่ง later pointer เป็น `null` เท่านั้น; implementation แบบ `coalesce(new, old)` ยังปล่อยให้ later passing attempt ทับ pointer ได้ และไม่ตรวจว่า evidence ผูกกับ pointer เดียวกัน
- [attempt-db.test.ts:560](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/integration/attempt-db.test.ts:560) ประกาศว่า certificate evidence ยังอยู่ แต่ตรวจเพียง dangling UUID/version/summary หลัง task snapshot ถูกลบแล้ว
- [attempt-db.test.ts:114](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/integration/attempt-db.test.ts:114) concurrent issue ใช้ params เหมือนกันทุก request และตรวจเฉพาะ ID จึงไม่จับ DB ที่คืน fresh params ผิดชุด
- [attempt-simulation.test.ts:88](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/integration/attempt-simulation.test.ts:88) จำลอง grading เอง ไม่เรียก `/api/progress`; route สามารถ bypass `simulationsToGrade()` แล้วไฟล์นี้ยังเขียว
- ไม่มี test ของ `scheduled`/RPC transport เลย การลบ schema header, เปลี่ยนชื่อ parameter หรือกลืน 401 จึงไม่ทำให้ suite ปัจจุบันแดง

ส่วน mutation ที่ระบุว่ารันแล้วแดงมี assertion รองรับจริง แต่ยังไม่ exhaustive: snapshot helper, immediate first replay, stored params ผ่าน refresh e2e และ retention-window ต่างมี coverage ที่มีความหมาย

ผมพยายามรัน targeted Vitest เพิ่ม แต่ read-only sandbox ปฏิเสธการสร้าง temporary directory (`EPERM`) จึงไม่อ้างผล test run ใหม่ในรายงานนี้

**Verdict:** ยังไม่ sound พอให้ certificate จาก evidence ชุดนี้ผ่านการตรวจสอบอย่างจริงจัง แม้ issuance/snapshot path และ fresh concurrency จะดีขึ้นมาก แต่ stale reclaim ยังทำให้ attempt เดียวได้หลาย graded submissions, passing evidence ยังผสมข้าม attempt ได้ และ retention ลบ task set ที่ใช้พิสูจน์ย้อนหลัง จึงต้องปิด blocker ทั้งสามก่อนถือว่า certificate evidence มี integrity ครับ


## เลน B — red-team (high)

## 1. High — stale claim ใช้ attempt เดียวตรวจได้หลายครั้ง และทำให้ outcome แยกจาก progress

**สถานะ: ใช้ได้**

ต้นเหตุอยู่ที่ [`0009_attempt_finalize.sql`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0009_attempt_finalize.sql:55): เมื่อ reclaim หลัง 30 วินาที ฟังก์ชันใช้

```sql
set consumed_at = coalesce(a.consumed_at, now())
```

ดังนั้น timestamp เก่ายังอยู่ หลัง claim แรก stale แล้ว มันจะ stale ตลอดไปจนมี outcome

ขั้นโจมตี:

1. ขอ attempt:

```http
POST /api/attempts
{"slug":"content-formats-demo","nodeId":"formats-hands-on"}
```

เก็บ `attemptId=A`

2. ทำให้ claim stale โดยไม่ต้องรอระบบล้ม:

```http
POST /api/progress
{
  "action":"checkpoint",
  "slug":"content-formats-demo",
  "nodeId":"formats-hands-on",
  "mode":"learn",
  "attemptId":"A",
  "answers":{"cp-1":[],"cp-2":[],"cp-3":[],"bogus":[]},
  "simulations":{}
}
```

Route consume ก่อน แล้วค่อยพบ `bogus` และตอบ 400 ที่ [`progress/route.ts`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/app/api/progress/route.ts:239) โดยไม่ finalize

3. รอมากกว่า 30 วินาที แล้วส่งสอง request พร้อมกัน:

- Request W: IDs ถูกต้อง แต่ `cp-1..3` เป็น `[]` และ simulation ว่าง — ผล `passed:false`
- Request C: ใช้ client keys ที่ตรงกับ choice ถูกใน response ของ attempt และตั้ง `sim-1` เป็น:

```json
{
  "addressMode": "static",
  "ipv4": "<targetIp จากโจทย์>",
  "subnet": "255.255.255.0",
  "gateway": "192.168.10.1",
  "applied": true
}
```

SQL interleaving ที่ผิด:

```text
W consume → UPDATE ผ่าน เพราะ consumed_at เก่ากว่า 30s; timestamp ไม่เปลี่ยน
C consume → UPDATE ผ่านด้วยเหตุผลเดียวกัน
W record in-progress → finalize {passed:false}
C record completed → finalize no-op เพราะ outcome ถูกเขียนแล้ว
```

ผลสุดท้ายอาจเป็น:

```text
attempt.outcome = {"passed":false}
node_progress.status = completed
node_progress.passed_attempt_id = A
```

ทั้งสอง submission ถูกตรวจจาก quota slot เดียว และ response ของ W/C ต่างกันเป็น false/true

**แก้เล็กที่สุด:** เปลี่ยน reclaim ให้ต่ออายุ claim:

```sql
set consumed_at = now()
```

เมื่อ request ถัดไปรอ row lock แล้วตรวจเงื่อนไขใหม่ มันจะเห็น claim สดและถูกปฏิเสธ ควรเพิ่ม integration test “stale claim สองเส้นพร้อมกันผ่านได้ไม่เกินหนึ่งเส้น”; tests ปัจจุบันครอบเฉพาะ immediate race และ stale reclaim ทีละเส้น

## 2. High — ส่งผิดหลังผ่านแล้วทำให้หลักฐาน MCQ กลายเป็น “ผิด” แต่สถานะยัง completed

**สถานะ: ใช้ได้แบบ deterministic ไม่ต้อง race**

หลังผ่าน capstone แล้ว ผู้เรียนยังยิง `/api/attempts` ตรงได้ เพราะ route ไม่ตรวจ progress ก่อนออกใบใหม่ที่ [`attempts/route.ts`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/app/api/attempts/route.ts:99)

ขั้นโจมตี:

1. ผ่าน `formats-hands-on` ด้วย attempt A
2. ขอ attempt A2 จาก endpoint เดิม
3. ส่ง submission ที่ structurally valid แต่ผิดแน่:

```json
{
  "action": "checkpoint",
  "slug": "content-formats-demo",
  "nodeId": "formats-hands-on",
  "mode": "learn",
  "attemptId": "A2",
  "answers": {"cp-1": [], "cp-2": [], "cp-3": []},
  "simulations": {}
}
```

4. ตรวจ SQL:

```sql
select status, checkpoint_results, passed_attempt_id
from academy.node_progress
where user_id = :U
  and course_slug = 'content-formats-demo'
  and node_id = 'formats-hands-on';
```

ผล:

- `status` ยัง `completed`
- `passed_attempt_id` ยัง A
- แต่ `checkpoint_results` ของ `cp-1..3` ถูกทับเป็น `false`

เพราะ [`0008_passing_attempt.sql`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0008_passing_attempt.sql:66) merge ด้วย `np.checkpoint_results || incoming` ซึ่งฝั่งขวาชนะ ขณะที่ status/pointer ถูกกันไม่ให้ถอย

**แก้เล็กที่สุด:** เมื่อ `np.passed_attempt_id is not null` ห้าม submission ที่ไม่ผ่านแก้ `checkpoint_results` อีก เช่นคงค่าเดิมหาก incoming ไม่มี `p_passed_attempt_id` การปฏิเสธออก attempt หลัง completed ช่วย UX แต่ guard ต้องอยู่ใน DB เพื่อกัน race และ caller อื่น

## 3. High — purge ลบ task set/grading rules ของ attempt ที่ถูกบันทึกว่าเป็นหลักฐานผ่าน

**สถานะ: ใช้ได้**

`passed_attempt_id` ไม่มี FK โดยตั้งใจ แต่ purge ไม่ยกเว้น attempt ที่ถูกอ้างถึง [`0011_attempt_retention.sql`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0011_attempt_retention.sql:31)

ขั้นพิสูจน์บน test DB:

```sql
-- A คือ attempt ที่ทำให้ capstone ผ่าน
update academy.attempt
set expires_at = now() - interval '31 days'
where attempt_id = :A;

select academy.purge_expired_attempts(30, 5000);

select params, outcome
from academy.attempt
where attempt_id = :A;             -- 0 rows

select passed_attempt_id
from academy.node_progress
where passed_attempt_id = :A;      -- ยังได้ A
```

หลัง cron ทำงาน เหลือ dangling UUID กับ challenge version แต่โจทย์จริง, choice mapping, answer snapshot, simulation grading rules และ outcome หายหมด จึงไม่สามารถพิสูจน์ย้อนหลังได้ว่า “ผ่าน attempt ไหนและกติกาอะไร” ตามเจตนาของ [`0008`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/supabase/migrations/0008_passing_attempt.sql:8)

**แก้เล็กที่สุด:** purge เฉพาะ attempt ที่ไม่ถูกอ้าง:

```sql
and not exists (
  select 1
  from academy.node_progress np
  where np.passed_attempt_id = a.attempt_id
)
```

พร้อม index บน `node_progress(passed_attempt_id)` ทางเลือกที่สะอาดระยะยาวคือ copy immutable proof snapshot ไปตาราง evidence ก่อน purge

## 4. Medium — deploy ระหว่าง attempt ทำให้ระบบไม่ grade จาก snapshot เพียงอย่างเดียว

**สถานะ: ใช้ได้เมื่อ deploy เปลี่ยนจำนวน simulation**

ขั้นโจมตี/เหตุขัดข้อง:

1. ออก attempt จาก `formats-hands-on` ตอนมี simulation 1 ตัว
2. ภายใน TTL 60 นาที deploy เนื้อหารุ่นใหม่ที่เพิ่ม simulation เป็น 2 ตัว
3. ส่งคำตอบของ attempt เก่า

Route consume attempt สำเร็จก่อน แล้ว [`simulationsToGrade`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/course/attempt-grading.ts:26) เปรียบเทียบ snapshot 1 ตัวกับเนื้อหาปัจจุบัน 2 ตัวและตอบ 409 ที่ [`progress/route.ts`](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/app/api/progress/route.ts:268)

Attempt จึงถูก consume โดยไม่มี outcome; retry ก่อน 30 วินาทีได้ generic 409 และ retry หลัง 30 วินาทีก็เจอ mismatch เดิม ผู้เรียนต้องออกใบใหม่และเสีย quota slot หนึ่งช่อง ทั้งที่ attempt มีโจทย์และกฎครบอยู่แล้ว

**แก้เล็กที่สุด:** เมื่อมี attempt ให้ grade `params.simulations` โดยไม่อ่านหรือเทียบจำนวนกับ content ปัจจุบัน การเปลี่ยนเวอร์ชันถูกเก็บใน `challenge_version` อยู่แล้ว

## การโจมตีที่ไม่ผ่าน

- Double-submit ภายใน 30 วินาทีแรก: ไม่ผ่าน — row-level `UPDATE` claim ทำให้ผ่านได้เส้นเดียว
- ได้ `completed` โดยไม่มี submission ที่ตอบถูก: ไม่พบ — capstone ต้อง `answeredAll` และ `correctCount === totalTasks`
- อ่านหรือ consume attempt ของผู้เรียนอื่น: ไม่ผ่าน — `user_id/course/node/challenge` อยู่ใน `WHERE` เดียว และ UUID เดายาก
- Purge คืน quota ด้วยค่า cron ปัจจุบัน: ไม่ผ่าน — retention 30 วันยาวกว่าหน้าต่าง quota 30 นาทีมาก
- Cron ทำให้ normal fetch path พัง: ไม่พบ — `fetch` forward ตรงไป OpenNext และ scheduled handler ไม่มี shared mutable state
- Hidden per-item answer oracle: ไม่พบ — assessed success ใช้ status/shape เดียวและเปิดเผยเพียง aggregate `passed`; `true`/`false` ต่างขนาดหนึ่ง byte แต่ไม่ให้ข้อมูลเกิน field ที่ประกาศตรงๆ

หมายเหตุการตรวจ: review จากไฟล์จริงบน HEAD; ไม่แตะ shared DB การรัน unit tests ถูก sandbox ปฏิเสธตอน Vitest สร้าง temp directory (`EPERM`) จึงไม่ใช้ผลนั้นอ้างว่า tests ผ่านหรือไม่ผ่าน. Gate `publish-owner-update assess-trigger` ให้ `eligible:true` สำหรับ risk นี้ แต่ไม่มีการส่งภายนอกเพราะคำขอนี้อนุญาตเฉพาะ review.
