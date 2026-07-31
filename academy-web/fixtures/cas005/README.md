# CAS-005 dev fixture — INTERNAL ONLY

**ห้าม deploy public / ห้ามแจก** — การเอา CAS-005 bank ออก public เป็น founder
decision แยกในอนาคต (founder ตัด gate ออกจากแผน 2026-07-31 เพราะยังไม่ focus
course ใด); fixture นี้มีไว้เป็น dev fixture ของ course player เท่านั้น

## ที่มา

- คัดลอกจาก Crucible (read-only) commit `640c8613` วันที่ 2026-07-31:
  `products/personal/crucible-studio/courses/comptia-securityx/exam-versions/`
  `cas-005/archive/legacy-output/v4.1/practice-tests/student-version-2/`
- ตรวจ copy integrity ด้วย md5 ต่อไฟล์ — ตรงกับ source ทุกไฟล์

## เนื้อหา (นับจริงจากไฟล์ ณ วันคัดลอก)

| ส่วน | จำนวน |
|---|---|
| `module-banks/module-1-governance-risk-compliance/` | 15 part files · **150 MCQ** (questionRange 1–150) |
| `full-length/cas005-full-practice-02.json` | 85 MCQ + 5 PBQ · 21 PBQ fields · kinds {checks, select, order} · PBQ-009 มี exhibit |
| `manifest.json` | trimmed — เหลือเฉพาะ entry ที่ fixture ใช้ + provenance |

> หมายเหตุ discrepancy: แผน one-shot (`plans/platform-build-oneshot-2026-07-31.md` §3)
> ระบุ 165 MCQ แต่การนับจริง ณ วันคัดลอก (ทั้ง source, สำเนานี้ และ `manifest.json`
> ของ source เอง) = **150 MCQ** — เลข 165 ในแผนเป็นความคลาดเคลื่อนของรอบวางแผน;
> fixture integrity test ยึดเลขจริง 150 (ดู `tests/unit/fixture-integrity.test.ts`)

## ข้อจำกัดที่รู้

- MCQ 35 ข้อมี field `visual` อ้างอิงไฟล์ SVG ใน `assets/figures/` ของ source
  ซึ่ง **ไม่ได้คัดลอกเข้า fixture** (นอกสโคปแผน §3) — loader เก็บ metadata ไว้
  แต่ player รุ่นนี้ไม่ render diagram; ถ้าอนาคตต้องใช้ ให้คัดลอก assets เพิ่ม
  พร้อม decision แยก

## กติกาใช้งาน

- ส่วนอื่นของ app ห้าม import shape ดิบจาก fixture ตรงๆ — ต้องผ่าน loader
  (`src/lib/content/`) ที่แปลงเป็น `CourseContent` เท่านั้น
- `manifest.services` เป็น marketing metadata — ห้ามป้อนเข้า video/media slot
