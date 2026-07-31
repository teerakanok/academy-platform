# Review Record — One-Shot Build (academy-web) 2026-07-31

**Artifact ที่ review:** codebase `academy-web/` ทั้งหมด (M1+M2) + migration + tests
**Lane:** codex exec (read-only sandbox, reasoning effort high, อิสระจาก lane เขียน code)
**Prompt scope:** lead-capture security → scoring correctness → loader robustness →
player state integrity → test honesty (ห้าม style nitpicks)

## Verdict ของ reviewer

**PASS-WITH-FIXES — CRITICAL 0 · HIGH 2 · MEDIUM 7 · LOW 2** (~154k tokens)

## การจัดการ findings (verify กับ source ก่อนแก้ทุกข้อ)

| # | ระดับ | Finding | การจัดการ |
|---|---|---|---|
| 1 | HIGH | consent text บน UI hardcode แยกจาก `v1.md` — หลักฐาน consent อ้างผิดฉบับ | ✅ แก้: landing render จาก `consentText()` ไฟล์เดียวกับที่ API บันทึก; privacy ใช้ `CURRENT_CONSENT_VERSION`; e2e assert DOM ตรงไฟล์ |
| 2 | HIGH | attempt หมดเวลาระหว่างปิดหน้า → reload เด้ง intro ทั้งที่ storage ค้าง in-progress | ✅ แก้: finalize เป็น submitted (submittedAt = endsAt) ตอนโหลด + e2e ใหม่ |
| 3 | MED | 201 vs 200 เปิด enumeration ว่า email เคยลงทะเบียน | ✅ แก้: ตอบ 200 + body เดียวกันทั้งสอง path + e2e assert เท่ากัน |
| 4 | MED | unique(email) บล็อกบันทึก re-consent เวอร์ชันใหม่ | 📝 known-issue พร้อมเหตุผล: มี consent เวอร์ชันเดียว + ยังไม่ public; ตอน migration v2 ให้เพิ่ม `consent_events` (คอมเมนต์ใน 0001 + PENDING) |
| 5 | MED | คำตอบสมาชิกซ้ำ (['A','A']) หลอก set comparison เป็นถูก | ✅ แก้: sameSet dedupe สองฝั่ง + tests |
| 6 | MED | source loader รับ content ตกไฟล์แบบเงียบ (ไม่ตรวจ manifest) | ✅ แก้: `assertManifestContract` — จำนวนต่อ module/full-length ต้องตรง manifest + tests |
| 7 | MED | loader ไม่ตรวจ semantic invariants (correct∉choices, single หลายคำตอบ, id ซ้ำ) | ✅ แก้: superRefine ครบชุด + tests (fixture จริงผ่านทั้งหมด) |
| 8 | MED | progress validator ตื้น — `answers.mcq=null` ผ่านแล้ว crash ใน player | ✅ แก้: deep validation ทุกชั้นถึงคำตอบรายตัว + tests 5 รูปแบบ corrupt |
| 9 | MED | `reuseExistingServer:true` เสี่ยง acceptance เขียวกับ server/build เก่า | ✅ แก้: false (fail-closed ถ้า port ถูกยึด) |
| 10 | LOW | rate-limit: XFF spoof ได้ + Map โตไม่จำกัด | ✅ แก้บางส่วน: เพดาน key + sweep; XFF/edge-limit เป็นเงื่อนไข public อยู่แล้ว (PENDING §5) |
| 11 | LOW | visual-matrix เขียว ≠ ไม่มี visual defect | 📝 ชี้แจงใน header ของ spec: suite เก็บหลักฐานภาพเท่านั้น — การตัดสิน defect เป็น review แยก (ทำแล้วใน run นี้ โดยเปิดภาพดูจริงทุก state) |

## Rerun หลังแก้ (ตามกติกาแผน §4-หลังจบงาน-1)

- `npm run test` → vitest **70/70** (รวม regression ใหม่ 15 ข้อ)
- `npm run test:e2e` → playwright **19/19** (รวม expired-finalize + consent-binding)
- `npm run build` + `npm run lint` → เขียว
- Critical ค้าง: **0** → ผล run โดยรวม = COMPLETE ตามนิยามแผน §1

## หมายเหตุความอิสระของ lane

Reviewer ไม่เห็น/ไม่แก้ code ระหว่างเขียน (read-only sandbox) และ prompt ระบุข้อเท็จจริง
ที่ verify แล้วเท่านั้น (เช่น เลข fixture 150) — ไม่ป้อน conclusion ของผู้เขียนให้ reviewer
