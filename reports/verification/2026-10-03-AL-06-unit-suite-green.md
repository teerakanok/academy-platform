# AL-06 — unit suite green (2026-10-03)

ชุด unit ของ academy-web เขียวครบแล้ว: `npx vitest run --project unit` จบด้วย exit 0
(163 files · 3159 passed · 2 skipped · 0 failed). ทุกข้อแก้ที่ **test** — product code ถูกอยู่แล้ว

## Baseline (ก่อนแก้, worktree เปล่า)

15 failed: 13 ข้อที่ card ระบุ + 2 ข้อ timeout ที่ไม่อยู่ในรายการเดิม

## สาเหตุและการแก้

| Test | ผิดที่ | สาเหตุ | แก้ |
|---|---|---|---|
| identity-client-assertion-conformance ×1, -registration-rehearsal ×10 | test | import ซอร์ส producer จาก `/private/tmp/identity-security-correction-cde63a58` ที่ไม่มีแล้ว (AC-SEC-11) เมื่อหา repo พี่น้องไม่เจอ (เช่นใน worktree) | ตรึงสำเนา `client-assertion.ts` + `client-control.ts` ของ identity-control@05bc278 (byte-identical, ตรวจ sha256) ไว้ที่ `academy-web/tests/fixtures/identity-control-producer/`; loader เลือก `ACADEMY_IDENTITY_CONTROL_ROOT` → repo พี่น้อง → สำเนาตรึง ตามลำดับ. สองไฟล์ตรึงถูก exclude จาก tsconfig (ใช้ @types/node คนละรุ่นกับ producer) |
| public-lesson `tasksFromAttempt` ×1 | test | course KTB สร้างตัวเลือกจากแถวตารางในบทเรียน ข้อความตัวเลือกจึงอยู่ในเนื้อหาโดยชอบธรรม test เดิมห้ามข้อความนั้นทั้งหน้า | ห้ามข้อความตัวเลือกใน `checkpoint` เสมอ, ห้าม prompt ทั้งหน้า, และห้ามข้อความตัวเลือกในหน้าเฉพาะเมื่อไม่ได้มาจากเนื้อหาบทเรียน |
| sign-out-route production branch ×1 | test | route เพิ่ม `ssoSignoutUrl` ตั้งแต่ `0fecdba` (F-1) แต่ test ยังคาด shape เก่าและใช้ `projectSignOutResponse` ที่ไม่มีใน src ใช้แล้ว | คาด `ssoSignoutUrl` และตรวจผ่าน `projectSignOutResponseWithSso` ที่ `AccountMenu` ใช้จริง |
| adversarial-sandbox `assertPristine` ×1 | test | รัน git จริงหลายคำสั่ง; เครื่องนี้ git init+commit ~3 วินาที แยกรันแล้วใช้ 5004ms | timeout ระบุ 30s |
| static-asset-boundary build contract ×1 | test | spawn `build-cloudflare.sh` จริง; แยกรัน 2.9s แต่ใต้โหลดทั้งชุดเกิน 5s | timeout ระบุ 30s |

## Evidence states

- Source PASS: `npx vitest run --project unit` → exit 0 (log ระหว่าง session `/tmp/al06-unit.log`)
- Source PASS: identity tests กับ producer จริง `ACADEMY_IDENTITY_CONTROL_ROOT=<director>/products/cyberskills/identity-control` → 12/12
- Source PASS: `npx tsc --noEmit -p tsconfig.json`, `eslint` บนไฟล์ที่แก้
- ไม่มี skip/todo เพิ่ม: 2 skipped คือ `describe.skipIf(!databaseUrl)` เดิมใน `identity-session-digest-migration.test.ts` (ต้องมี PostgreSQL) ไม่ได้แตะ

## Residual

- สำเนาตรึงของ producer ต้องอัปเดตเมื่อ identity-control เปลี่ยนสองไฟล์นี้ (ดู README ในโฟลเดอร์); เครื่องที่มี repo พี่น้องจะทดสอบกับของจริงอยู่แล้ว
