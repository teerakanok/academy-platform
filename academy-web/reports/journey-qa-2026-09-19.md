# Journey-QA Playtest — CyberSkills Academy (local, deep ตามขอบเขตที่เปิด)

**วันที่:** 2026-09-19 · **Surface:** `next dev` :3000 + local supabase stack (kong 54321 / db 54322 / inbucket 54324) ที่รันอยู่ก่อนแล้ว · **งบ:** $0

## การเตรียม (สิ่งที่ต้องทำจริงกว่าจะได้ journey)

1. local stack รันอยู่แต่ **DB ว่าง** (ไม่มี schema `academy` เลย) → รัน `supabase db reset` → ได้ 21 ตาราง แล้ว**ชน ERROR กลางคัน**: `LOCK TABLE can only be used in transaction blocks` ที่ statement `lock table academy.identity_session…` → chain หยุดประมาณ migration 0033/0034 ของ 40 (ตาราง `courses`/`offers` จาก migration หลัง ๆ จึงไม่เกิด)
2. หมายเหตุความโปร่งใส: การ reset นี้เขียนทับ local dev DB ของ stack นี้ (ก่อนหน้าไม่มีตาราง academy ใด ๆ — สภาพหลัง reset = 21 ตารางเปล่า + migrations ถึง ~0033)

## Journey log

1. `/` → home EN เต็มรูปแบบ (course previews ขับด้วย content registry — ไม่ต้องพึ่ง DB)
2. `/courses/assembly/en` → หน้าคอร์สเต็ม: คำอธิบาย + roadmap บทเรียน + **"Start for free"**
3. กด Start → redirect ไป `/sign-in` — **build local ปิดการสมัครโดยเจตนา**: "Accounts are not open yet. You can read the course pages in this build. Sign-in opens when the platform launches." (+ ลิงก์พากลับไปเรียกชมฟรี — empty-state ทำดีมาก)
4. สลับไทย: ปุ่ม ไทย ไม่เปลี่ยน content ของหน้า /en (content เปลี่ยนผ่านลิงก์เฉพาะ) → กด "View this syllabus in Thai" → `/courses/assembly/th` **เนื้อหาไทยครบจริงทุกหัวข้อบท**

## Findings

| ID | ชนิด | ระดับ | รายละเอียด | Evidence |
|---|---|---|---|---|
| ACD-J1 | dev-onboarding | **medium** | `supabase db reset` พังกลาง chain ด้วย `LOCK TABLE` ระดับบนสุดนอก transaction (migration ~0033/0034) — dev คนใหม่ไม่มีทางได้ DB ครบ 40 migrations ผ่านเส้นทางมาตรฐาน local (production apply ผ่าน runner อื่นจึงไม่เจอ) ควรห่อ statement ชุดนั้นใน BEGIN/COMMIT หรือแก้ให้รันได้กับ supabase CLI | reset log + psql ตรวจตาราง |
| ACD-J2 | UX ย่อย | low | hostname กระโดดกลาง journey: เริ่มที่ `127.0.0.1:3000` แต่หลัง sign-in redirect กลายเป็น `localhost:3000` (env ผสม) — ใน production ไม่มีอาการนี้ แต่ dev อาจงง session/origin | URL trajectory |
| ACD-J3 | ผ่าน | — | sign-in wall มีข้อความเหมาะสม + ทางออกชัด ("read without account") · content TH/EN ครบคู่จริง · course previews ทำงานโดยไม่ต้อง DB | ทั้ง journey |
| ACD-J4 | ขอบเขต (ตรงไปตรงมา) | — | **enrolment journey จริงทดสอบไม่ได้ใน local** สองชั้น: sign-in ถูกปิดโดยเจตนาของ build + ตาราง offers (migration 0040) ไม่ถูกสร้างเพราะ ACD-J1 — ต้องทดสอบบน production หลัง CF Access หรือ staging เท่านั้น | — |

## Evidence

- DOM snapshots ตลอด journey (trajectory ของ session)

## Wiring

- ACD-J1 → คิว dev-infra ของ Academy (แก้แล้ว `supabase db reset` จะกลายเป็นเส้นทาง setup มาตรฐานที่ใช้ได้จริง)
- ACD-J4 → เสริมเหตุผลเดิมใน wave SUMMARY ว่า Academy production journey ต้องใช้สิทธิ์ CF Access
