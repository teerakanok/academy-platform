# RIL Record — One-Shot Build Plan (2026-07-31)

**Artifact ที่ review:** `plans/platform-build-oneshot-2026-07-31.md`
**คำสั่ง founder:** วางแผนยาวสำหรับ one-shot execution + "RIL แผนกับ codex + claude ก่อนจบ"
**Lanes:** codex exec (read-only sandbox, อิสระ) + claude managed reviewer (อิสระ, read-only)

## ผลต่อรอบ

| รอบ | Lane | Verdict | สาระ |
|---|---|---|---|
| r1 | codex (effort high) | **FAIL** | 15 MUST-FIX — ใหญ่สุด: governance conflict (AGENTS.md ยัง "PLANNING/no build"), `PGRST_DB_SCHEMAS` ไม่มี `academy`, access model/RLS ไม่ระบุ, PBQ discriminator `kind`, reproducibility (lockfile/Node/SBOM), PDPA notice, Vercel Root Directory, timebox false-green, provider-neutral review lane |
| r1 | claude | **PASS-WITH-FIXES** | 2 MUST-FIX (dead memory-file reference → runbook ต้อง self-contained; PBQ `kind` + field sub-structure) + `.env.example` โดน `.gitignore`, fixture granularity |
| แก้ | — | rev 2–3 | commit `3ae8109` (rev 2) + rev 3 edits |
| r2 | codex (effort high) | **PASS-WITH-FIXES** | 9 MUST-FIX ละเอียดขึ้น — governance sweep ยังไม่หมด, consent version CHECK, supabase CLI pin + init cwd, RLS test ต้อง assert relrowsecurity, security tests เข้า acceptance, scoring attribution (PBQ ไม่มี moduleId / objective หลายค่า), `exhibit` ใน PBQ-009, critical=INCOMPLETE+rerun, fixture integrity machine-check |
| r2 | claude | **PASS** | ไม่มี MUST-FIX/SHOULD-FIX; NOTE: ตาราง AGENTS.md (แก้ไปแล้วใน rev 4 ก่อน review เสร็จ — verify แล้ว), แนะ split fast/full-acceptance test suite (รับ — ใส่ในแผนแล้ว) |
| แก้ | — | rev 4 | commit `21932b3`; นับ fixture จริง: module-1 = **165** MCQ (ไม่ใช่ 150 ตามที่ reviewer ประเมิน — ยืนยันด้วย script) |
| r3 | codex (scoped diff confirm) | technical **clear** / governance **FAIL** | การแก้เชิงเทคนิคทั้งหมด "ครบ ไม่พบความขัดแย้งใหม่"; เหลือ validate-first ตกค้าง 5 จุดใน active_plan → แก้หมด commit `a2a8e6f` |
| ปิด | — | commit `40d54b4` | เพิ่ม test split + ปิดรอบ |

## สถานะสุดท้าย

- ทั้งสอง lane converge: claude r2 = PASS; codex r3 = technical clear + governance
  findings แก้ครบใน commit เดียวกับรอบปิด
- ทุกตัวเลข/shape ในแผน verify จากไฟล์จริง (fixture counts, PBQ kinds, `exhibit`,
  stack versions, tokens pattern, lab-plane path)
- หมายเหตุ replication: codex full-plan pass ที่ effort high ใช้เวลา ~7–10 นาที;
  รอบ 3 ใช้ scoped-diff prompt + effort medium เพื่อเลี่ยง timeout 10 นาที
