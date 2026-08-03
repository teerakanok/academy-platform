# CyberSkills Academy — Completed Log

> Closed items only, with outcome + evidence + residual risk. Newest first.
> Provider-neutral. See `active_plan.md` for open work.

---

## 2026-08-03 — Learner-Safety checkpoint 3: dialog + video cue accessibility

**Outcome:** ผู้เรียนใช้ image lightbox, lab expansion, reset confirmation และ video cue
ด้วยคีย์บอร์ดได้ครบ โดย focus ไม่หลุดไป background, กลับไปจุดที่มีความหมายหลังปิด และ
ผลตรวจ video cue ถูกประกาศให้ assistive technology โดยไม่แตะ production, Pool A, R2,
deploy หรือ secrets

**What changed:**
- image และ lab เปลี่ยนเป็น native modal dialog; shared focus trap รองรับทั้งวง Tab ปกติ,
  non-tabbable focus target และช่วงที่ไม่มี enabled control พร้อมคืน focus ไป opener
- reset dialog เปิดหลัง phase commit, focus status ระหว่าง slow mutation, กัน Escape ระหว่าง
  outcome ยังไม่ทราบ และคืน focus ไป trigger หรือ course title ที่ยังอยู่จริงใน terminal state
- video cue แก้ semantics จาก modal เป็น inline dialog, focus ตัวเลือกแรก, รองรับ keyboard-only
  submit/continue, ใช้ persistent live status + `aria-describedby` และคืน focus ไป video
- visual suite scroll cue เข้า viewport จริงและเก็บ image/inline-lab modal ทั้ง desktop/mobile

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **440/440** · clean production build ผ่าน · Playwright
**137 passed / 10 skipped** · focused dialog/video/reset regressions **16/16** · ตรวจภาพ
desktop/mobile ไม่พบ overflow, clipping หรือ overlap · independent Code/Security/UX
checkpoint review **C0/H0/M0/L0 ทุก lane**

**Residual risk:** Learner-Safety Batch ยังเหลือ learner-facing copy ที่อ้าง
persistence/issuance ไม่ตรง implementation; production gates ด้าน privacy/retention,
private media, dependency, durable abuse control และ least-privilege credential ยังเปิด

---

## 2026-08-03 — Learner-Safety checkpoint 2: safe course reset

**Outcome:** ผู้เรียน reset course progress ได้ผ่าน confirmation ที่บอกผลกระทบจริง;
response หาย, multi-tab write, access loss และ load failure ไม่ทำให้ UI ประกาศผลเกินหลักฐาน
หรือทับงานรอบใหม่ โดยไม่แตะ production, Pool A, R2, deploy หรือ secrets

**What changed:**
- reset ใช้ client operation ID และ DB receipt; operation เดิมเป็น no-op และ receipt ถูกจำกัด
  128 แถวต่อผู้เรียน/คอร์สพร้อม index เพื่อไม่ให้ storage โตไม่สิ้นสุด
- DB revalidate activation/entitlement ใน transaction เดียวกับ epoch increment + delete;
  revoke/suspend race ปฏิเสธ reset และ compatibility caller ได้ error จริง
- ทุก success อ่าน receipt + current canonical record ก่อนอัปเดต UI; unknown recovery เป็น
  read-only status check ไม่มี destructive retry และ copy แยก access/load outcome ตามหลักฐาน
- overview ไม่สร้าง empty progress ปลอมเมื่อ 401/403/503, reset รองรับ record ที่มีเพียง
  `inProgress`/cue/evidence และ access loss ซ่อน stale roadmap/reset trigger

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **440/440** · migration 0001–0015 จาก fresh local DB ผ่าน ·
clean production build ผ่าน · Playwright **136 passed / 10 skipped** · race regressions ครอบคลุม
response-lost, delayed 200 + new-tab write, revoke/suspend และ receipt cap · independent
Code/Security/UX checkpoint review **C0/H0/M0 ทุก lane**

**Residual risk:** receipt รับประกัน idempotency สำหรับ 128 operation ล่าสุดต่อผู้เรียน/คอร์ส;
Learner-Safety Batch ยังเหลือ dialog/video accessibility และ learner-facing copy ส่วน production
gates ด้าน privacy/retention, private media, dependency, durable abuse control และ
least-privilege credential ยังเปิด

---

## 2026-08-03 — Learner-Safety checkpoint 1: simulation readiness

**Outcome:** incomplete simulation ไม่ consume/ปิด attempt และไม่ล้างงานผู้เรียน; คำตอบที่
ทำครบแต่ผิดยังถูก grade ตามปกติ โดยไม่แตะ production, Pool A, R2, deploy หรือ secrets

**What changed:**
- readiness ใช้ public `requiredFields` แยก DHCP/static และ server ตรวจ snapshot ก่อน claim
- field edit หลัง Apply กลับเป็น unapplied; validation แสดงข้างปุ่มและคง MCQ/simulation เดิม
- active attempt รุ่นเก่าถูก normalize; supplied attempt และ assessed/redaction policy ยังยึด
  snapshot เดิมเมื่อ deploy เปลี่ยน node/simulation กลางงาน
- authoring typo ที่ชี้ field ซึ่ง surface แก้ไม่ได้ถูก loader ปฏิเสธ; mobile network form
  แสดงค่าเต็มและ touch target 44px

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **426/426** · clean production build ผ่าน · Playwright
**124 passed / 10 skipped** · independent Code/Security/UX checkpoint review **C0/H0/M0 ทุก lane**

**Residual risk:** Learner-Safety Batch ยังเหลือ reset recovery, dialog/video accessibility และ
learner-facing copy; production gates ด้าน privacy/retention, private media, dependency,
durable abuse control และ least-privilege credential ยังเปิด

---

## 2026-08-03 — Integrity Batch ปิดครบหลัง independent checkpoint

**Outcome:** ปิด race ของ attempt/progress/reset/access, ทำ activation revision ให้ monotonic
และผูก explanation กับ snapshot ของ attempt ที่ผู้เรียนทำจริง โดยไม่แตะ production, Pool A,
R2, deploy หรือ secrets

**What changed:**
- claim token เปลี่ยนทุก reclaim; current claim เท่านั้นที่ commit progress+outcome แบบ atomic
  ได้ และ concurrent matching claim ถูกแยกจาก invalid เพื่อให้ UI reconcile ก่อนออกใบใหม่
- progress epoch ครอบคลุม attempt และ generic mutations; reset เพิ่ม epochพร้อมลบ progress
  ใน transaction เดียว และ final write revalidate activation+entitlement ภายใต้ row locks
- activation sync รับเฉพาะ revision ที่สูงกว่า; equal revision ต้อง idempotent
- attempt params เก็บ explanation snapshot; review endpoint เลือกจาก `passed_attempt_id` ก่อน
  content ปัจจุบัน และ fail closed บน assessed completion ที่หลักฐานหาย

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **413/413** · clean production build ผ่าน · DB lint ไม่มี error ·
Playwright **122 passed / 10 skipped** · deterministic two-connection tests ครอบคลุม
suspend/reset interleaving · independent Code/Security/UX checkpoint review
**C0/H0/M0 ทุก lane**

**Residual risk:** ยังห้าม production traffic/certificate จนกว่าจะปิด learner-safety,
privacy/retention, private media, dependency advisories, durable abuse control และ
least-privilege production credential; งาน product ถัดไปคือ Learner-Safety Batch

---

## 2026-08-03 — Local Security Batch ปิดครบหลัง implementation audit

**Outcome:** ปิด P0 ข้อ 1–4 จาก audit ครบทั้ง auth cookie/transport,
same-origin mutation boundary, bounded JSON, activation/entitlement/prerequisite guards
และ learner-facing denied/unavailable/access-lost states โดยไม่แตะ production, Pool A,
R2, deploy หรือ secrets

**What changed:**
- รวม policy ของ auth cookie ให้เป็น `HttpOnly`, `SameSite=Lax`, `Secure` แบบ
  fail-secure และบังคับ HTTPS auth mutations บน production edge
- mutation routes ตรวจ same-origin/Fetch Metadata; JSON endpoints อ่าน body แบบมี
  byte limit; resource routes ตรวจ activation, course entitlement และ node prerequisite
- dashboard แสดงเฉพาะคอร์สที่มีสิทธิ์และแยก signed-out/inactive/unavailable; lesson และ
  course overview หยุด action เมื่อสิทธิ์หาย; sign-out ล้าง current-browser cookies แม้
  provider revoke ยืนยันไม่ได้ พร้อม visible local-only notice
- เพิ่ม regression coverage สำหรับ direct locked-node access, revoked/suspended access,
  mid-session revoke, DB non-mutation, partial entitlement, 503 retry และ sign-out fallback

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **388/388** · clean production build ผ่าน · Playwright
**121 passed / 10 skipped** · independent Code/Security/UX checkpoint review
**C0/H0/M0 ทุก lane**

**Residual risk:** ยังห้าม production traffic/certificate จนกว่าจะปิด Integrity Batch,
private `/media/*`, HTTPS runtime `Set-Cookie` proof บน topology จริง, privacy/retention,
dependency advisories และ durable abuse control; งานถัดไปคือ Integrity Batch ตาม
`active_plan.md`

---

## 2026-07-31 — One-shot build EXECUTED: M1 + M2 + M3-prep ผ่าน acceptance ครบ

**Outcome:** `academy-web/` เกิดจริงและเขียวทั้ง chain จาก clean install:
`npm ci && build && lint && test (vitest 55/55) && test:e2e (playwright 18/18)`
บน local Supabase จริง — M1 Foundation (landing + PDPA + lead capture + schema
`academy` RLS default deny), M2 Course player (loader + practice + timed exam +
PBQ checks/select/order + scoring spec + module nav + resume + axe + visual
matrix), M3-prep (ADR draft single-account)

**What changed (commit หลักของ run):**
- M1: scaffold ตรึงรุ่นตาม cyberskills-web (next 15.5.x/react 18.3.x/tailwind
  3.4.19 + lockfile + .nvmrc 24 + SBOM) · landing content-agnostic + `/privacy`
  PDPA + consent v1 versioned + CHECK constraint · `/api/leads` idempotent +
  content-type/body-size/rate-limit + DB-fail ตอบ fail จริง · migration 0001
  (RLS เปิด 0 policy, grant เฉพาะ service_role) · tests: RLS hardening จาก
  pg_catalog + anon REST read/write ถูกปฏิเสธแยก test + service-role positive
- M2: fixture CAS-005 internal (md5 ตรง source Crucible `640c8613`) + integrity
  test · loader → `CourseContent` (validation บอกไฟล์/field) · scoring ตามแผน
  §4-M2-3 ครบ edge · timer deadline-based + fake clock · progress localStorage
  versioned + corrupt reset · full-acceptance e2e: FL-02 ทั้งชุดผ่าน UI 90 ข้อ
  → 105/106 = 99.1% ตรงเป๊ะ (ตั้งใจผิด 1 MCQ), PBQ 21/21, exhibit PBQ-009,
  weakest domain ถูก module · visual matrix 7 states × {1440, 390} ไม่มี defect
- M3-prep: `docs/adr/ADR-draft-single-account.md` (DRAFT — decision matrix 5
  แกน + code evidence 4 product + migration/rollback sketch + คำแนะนำ Option A)
- `PENDING_USER_ACTION.md` ครบตามแผน §5 (Vercel/Cloudflare/DB prod/ADR/push)

**Deviation จากแผนที่ต้องรู้:**
- **Fixture module-1 = 150 MCQ ไม่ใช่ 165** — เลข 165 ในแผน/RIL รอบก่อนเป็นความ
  คลาดเคลื่อนของสคริปต์นับรอบวางแผน (source + manifest ของ source เอง = 150;
  reviewer codex ที่ประเมิน 150 ถูกแล้ว) → integrity test ยึด 150 + บันทึกใน
  `academy-web/fixtures/cas005/README.md`
- MCQ 35 ข้อมี `visual` ref ไป assets/ ที่อยู่นอกสโคป fixture — loader เก็บ
  metadata, player ไม่ render (known limitation)
- Infra เครื่อง dev: disk เต็ม (เหลือ 120MB) ทำ Docker snapshot พังกลาง run —
  กู้ด้วยการลบ lease ค้าง + re-pull + เคลียร์ image เก่า (~9GB คืน); บันทึกใน
  PENDING ข้อ 8

**Evidence:** commits ใน repo นี้ (scaffold → M1 → fixture → M2 core → M2 UI →
M2 e2e → ADR) · artifacts/oneshot-2026-07-31/{m1,m2}/ (screenshots ทุก state) ·
review lane อิสระหลัง build (ผลอยู่ใน handoff ปิด session)

**Residual risk:**
- ยังไม่ deploy จริง — external checkpoints ทั้งหมดรอ founder (PENDING §1–3)
- In-memory rate-limit พอเฉพาะหลัง Zero Trust; public ต้องมี edge rate-limit
- `/player` + fixture = INTERNAL ONLY ห้ามหลุดไป public deploy
- M3 auth จริงยังล็อกด้วย ADR gate (draft พร้อมแล้ว)

---

## 2026-07-31 — One-shot build plan เสร็จ + ผ่าน RIL 2 lane (codex + claude) converge

**Outcome:** แผน execute แบบ one-shot สำหรับ M1+M2+M3-prep พร้อมใช้ที่
`plans/platform-build-oneshot-2026-07-31.md` — ผ่าน review อิสระ 2 lane จน
converge (claude r2 = PASS; codex r3 = technical clear + governance sweep แก้ครบ)

**What changed:**
- แผน 4 revision (rev 1 → rev 4): commits `3ae8109`, `21932b3`, `a2a8e6f`,
  `40d54b4`; governance reconcile ทั้ง `AGENTS.md` + `active_plan.md` เป็น
  build-first ครบทุกจุด
- ทุก fact ในแผน verify จากไฟล์จริง: fixture module-1 = 15 parts / **165 MCQ**,
  FL-02 = 85 MCQ + 5 PBQ / 21 fields / kinds {checks,select,order}, PBQ-009 มี
  `exhibit`, stack ตรึงตาม cyberskills-web, tokens vendored pattern
- จุดเสี่ยงที่แผนดัก: `PGRST_DB_SCHEMAS` prod ยังไม่มี `academy` (external
  checkpoint พร้อม rollback), RLS false-green (assert relrowsecurity + negative
  แยก read/write), timebox → INCOMPLETE ห้าม tick, critical ค้าง = INCOMPLETE

**Evidence:** `reports/reviews/oneshot-plan-ril-2026-07-31.md` (บันทึกทุกรอบ +
verdicts + commits)

**Residual risk:**
- แผนยังไม่ถูก execute — สถานะจริงของ scaffold/local Supabase จะรู้ตอน run
- Demand ต่อ course ยัง unvalidated (founder รับความเสี่ยง build-first;
  รอบ pitch + poll ของ founder เป็นตัวปิด)
- Director submodule pointer ยังไม่ bump (director branch ปัจจุบันเป็นของ
  workstream อื่น — ทำตอนอยู่บน branch ที่ถูกต้อง)

## 2026-07-31 — Founder เคาะ: เริ่ม PLATFORM BUILD ทันที; Phase 0 = defer; ตัด CAS-005 gate จากแผน

**Outcome:** ทิศ execution เปลี่ยนจาก validate-first → **build-first** — เริ่มทำ
platform เลยโดยถือว่ามี demand; แผน build M1–M5 (content-agnostic) อยู่ใน
`active_plan.md` และ one-shot execution plan ละเอียดแยกไฟล์ใน `plans/`

**What changed / decided (founder, in-session 2026-07-31):**
- **เริ่ม build platform ทันที** — "ผมอยากเริ่มทำ platform"; ทุก milestone
  build แบบ content-agnostic (player/engine เสพ Crucible portable JSON)
- **Phase 0 ไม่ทิ้ง แต่ defer** — กลับมาตอนเคาะว่าจะทำ course อะไรบ้าง โดย
  founder จะไป **pitch + poll ผ่าน channels ต่างๆ เอง** (channel inventory
  Lane B = input ของรอบนั้น)
- **ตัด CAS-005 gate ออกจากแผน** — ไม่ได้ focus course ใด course หนึ่งตอนนี้;
  key fix เสร็จสมบูรณ์แล้ว (Crucible `640c8613`, verify 29/29) — เรื่อง codex
  confirm pass ค่อยตัดสินใจใหม่ถ้าจะเอา bank ออก public (หมายเหตุ: codex
  ไม่ติด usage limit แล้ว — founder แจ้ง 2026-07-31)
- Handoff ถัดไป = **one-shot build order**: founder จะสั่ง execute แผนแบบ
  one shot; แผนต้องผ่าน RIL (codex + claude อิสระ) ก่อน close session

**Evidence:** in-session directives 2026-07-31 (บันทึกคำต่อคำในส่วน What
changed); active_plan restructure ใน commit เดียวกับ entry นี้

**Residual risk:**
- Demand ต่อ course ยัง unvalidated จนกว่ารอบ pitch + poll — founder รับ
  ความเสี่ยงโดยเจตนา; mitigation: recurring cost ~0 บน owned infra + ทุก
  milestone เป็น foundation ที่ locked vision ต้องใช้อยู่ดี
- External steps (Vercel/DNS/Zero Trust/GCP) ทำใน one-shot ไม่ได้ — ต้องเป็น
  checkpoint กับ founder ตามแผน

## 2026-07-31 — Lane B: channel inventory brief เสร็จ (รอ founder เคาะ channel)

**Outcome:** inventory ช่องทาง distribution จาก assets ที่มีจริงครบ 8 ช่อง พร้อม
decision brief ให้ founder เคาะได้ทีละช่องโดยไม่ต้องหาข้อมูลเอง —
`reports/reviews/channel-inventory-2026-07-31.md` (read-only ทั้ง lane:
ไม่มีการส่ง email/โพสต์/ติดต่อภายนอกจริง)

**What changed / found:**
- ช่องที่แนะนำเริ่มก่อน: **corporate probe** กับ client เดิม role=owner (KTB,
  Chowbright, ARV, Humanica) + Angler pilot client (รวม 5 org) — ทำได้ทันที
  ไม่ต้องรอ Lane C; IIDA/Trainocate = instructor-only ผ่าน MUIC ไม่ใช่ช่องของเรา
- B2C: FB communities cybersec ไทยรวม ~25–30k follower (Thai Cy Sec ~15.5k,
  CompTIA TH ~8k, Cyber Community TH ~3.9k, 2600 TH) — รอ Lane C + CAS-005 gate
- **ข้อค้นพบ:** เว็บไม่มี analytics ติดตั้ง (traffic = วัดไม่ได้; หน้า privacy
  ห้าม third-party tracking → ต้องเลือกตัว cookieless) และไม่พบ company social
  page — ต้องตั้งใหม่ก่อน campaign คอร์สฟรีตัวแรก
- Guardrails ที่คุมทุกช่องถูกบันทึกใน brief: university-IP (company voice
  เท่านั้น), MUIC ≠ CYBERSKILLS, CAS-005 publish gate, PDPA (Angler target
  lists ใช้ไม่ได้เด็ดขาด)

**Evidence:** brief ผ่าน independent review lane (managed reviewer read-only —
codex ติด usage limit ถึง 5 ส.ค.): **PASS-WITH-FIXES, accuracy 15/15 ข้อ
ตรวจถูกทั้งหมด**, SHOULD-FIX 2 จุด (source-URL mapping, scope ICCS4xx) แก้ครบ
ในรอบเดียว; sources ต่อ claim ระบุไว้ท้าย brief

**Residual risk:**
- ตัวเลข reach ของ dev communities (BorntoDev/สมาคมโปรแกรมเมอร์ไทย) ยังไม่
  verified — ต้องนับจริงถ้า founder เลือกช่องนั้น
- Instructor consent ที่มี = ลง profile เท่านั้น; การขอช่วยแชร์ต้องขอรายคน
- การยิง B2C ทุกช่องยังถูก gate ด้วย Lane C (มีหน้าเว็บให้ชี้) + CAS-005
  codex confirm + push authorization

## 2026-07-31 — Free-tier strategy ขยาย: entry certs ฟรีเต็มรูปเป็นเครื่องจักรโฆษณา

**Outcome:** founder กำหนดทิศทาง free tier ใหม่ (กว้างกว่า "fundamentals ฟรี"
เดิมมาก): **N+, Sec+, ISC2 CC, Basic Linux, Basic Programming แจกฟรีครบทุก
feature** — video, practice, lab, cheatsheet — เจตนา = โฆษณา:
"ถ้าของฟรีดีครบเครื่องขนาดนี้ ของจ่ายตังจะขนาดไหน"

**What changed / decided (founder):**
- Free tier = 5 คอร์ส entry เต็มรูป (ไม่ใช่แค่ fundamentals) — ทิ้งตลาด
  commodity ให้เป็นสนามโฆษณา; paid เหลือขั้นสูง/trend/B2B ที่ trust ถูกแก้แล้ว
- **Release ทีละตัว ไม่พร้อมกัน — founder ยืนยันเอง ("ค่อยๆเรียกแขก")**:
  แต่ละคอร์สฟรีคือ campaign เรียกแขกหนึ่งรอบ ไม่ใช่ catalog dump; ลำดับเสนอ
  Basic Linux → N+ (รอ founder เคาะลำดับจริง)
- CPO guardrails ที่บันทึกคู่กัน: lab ใช้แต้มฟรีรายเดือน (กัน abuse + เพดานต้นทุน);
  ภาระ content freshness ×5 ต้องผ่าน Crucible capacity assessment

**Evidence:** ต้นทุน free tier ~$0.3–0.5/active/เดือน (จาก CF Stream pricing
verified + GCP lab estimate) — ถูกกว่า CPC โฆษณาไทยแต่ได้คนเรียนจริง;
market anchors verified 2026-07-31 (CertMaster $489, Dion Udemy $15–30,
Dion direct $39–69/เดือน) — ดูรายละเอียดใน active_plan ส่วนโมเดลราคา

- **Refresh วน = ค่าโฆษณา (founder ยืนยัน):** ออกครบ 5 ตัวแล้วต้องวนกลับมา
  อัปเดต N+/Sec+ ตาม cert cycle — founder ยอมรับ loop นี้เป็น recurring
  marketing cost โดยเจตนา ("คิดเสียว่าค่าโฆษณา"); โบนัส: ทุก refresh คือ
  re-marketing event + วันที่ "อัปเดตล่าสุด" เป็น trust signal

**Residual risk:**
- งาน Crucible 5 คอร์สเต็มรูป + refresh loop ถาวร = ก้อนลงทุนจริงของ strategy
  นี้ — capacity assessment ยังต้องทำเพื่อ size ภาระ (founder ยอมรับหลักการแล้ว);
  ห้ามใช้ vision นี้ข้าม Phase 0 gate
- ตัวเลขบันไดราคา paid ทั้งหมดเป็น placeholder รอ WTP probe
- ISC2 CC ชนกับของฟรีของ ISC2 เอง — ต้องชนะด้วย lab + path ไม่ใช่แค่ฟรี

## 2026-07-31 — Infra direction เคาะ: Vercel (Phase 0 web) + Cloudflare Stream (มีเงื่อนไข) + Lab GCP ต่อ

**Outcome:** founder เคาะ infra ของ Academy ใน director discussion หลัง close
Lane A — บันทึกลง `active_plan.md` ส่วน "Infra direction":

**What changed / decided (founder):**
- **Phase 0 web = Vercel — ล็อก** (`academy.cyberskills.co.th` CNAME → Vercel
  sin1; admin ครอบ Zero Trust Access)
- **Video post-gate = managed stream ผ่าน Cloudflare Stream ได้ แบบมีเงื่อนไข:**
  ต้องไม่ขัด interactive video (pop-up คำถามระหว่างดู) — เงื่อนไขผ่านโดย design
  guard: ใช้ custom player เสพ HLS/DASH manifest + signed token, **ห้าม build
  บน iframe embed** ของ Stream; ชั้น interactive เป็น player logic ฝั่งเรา
  ไม่ผูก vendor (Bunny เป็น fallback ได้เพราะ HLS มาตรฐานเหมือนกัน)
- **Lab = GCP ต่อ — ล็อก** ("ไม่อยาก rebuild ทุกอย่างใหม่หมด") — reuse Crux
  lab plane; แยก project + budget alarm
- DB = Supabase self-host เดิม (video ไม่เข้า DB); assets/backup = R2; RDC
  บทบาทเดิม

**Evidence:** Cloudflare Stream custom-player + signed-token support ยืนยันจาก
developers.cloudflare.com (using-own-player, securing-your-stream) 2026-07-31;
pricing semantics จาก official docs: storage = prepaid block $5/1,000 นาที,
delivery = $1/1,000 นาทีที่ดู, encode ฟรี, ไม่มี free allowance; cost model +
ตัวอย่าง 3 scenario อยู่ใน active_plan (pilot ≈ $15/เดือน, growth ≈ $70,
scale ≈ $220)

**Residual risk:**
- Pricing ต้อง re-verify ตอน commit จริง (ตัวเลข ณ 2026-07-31)
- "prepaid capacity" ของ Stream storage: ยืนยัน billing behavior จริงตอนเปิดใช้
  (block ขยายเมื่อ catalog โต)
- Zero Trust free tier ~50 seats ต้องตรวจกับ plan จริงตอน setup
- Payment gateway ไทยยังไม่เลือก (DD ตอนใช้จริงตามเดิม)

## 2026-07-31 — Lane A ปิดสมบูรณ์: founder เคาะ 3 disputes + แก้ key ใน Crucible ครบ

**Outcome:** Lane A (critical path ของ Phase 0) จบทั้งเส้นในวันเดียว: audit →
founder decision brief → founder เคาะ ("แก้ตามแนะนำทั้งหมด") → แก้ answer key
3 ข้อใน Crucible พร้อม propagate ทุก artifact → **hard prerequisite ของ publish
gate ปลดแล้ว** (เหลือ optional codex confirm + push Crucible)

**What changed / decided (founder, ลายลักษณ์อักษร ใน session 2026-07-31):**
- PBQ-010 `recoveryOrder`: Preserve → Contain → **Fix root cause → Validate
  clean restore** (eradication ก่อน recovery ตาม NIST SP 800-61)
- M4-082: correct → **A,C,D,E** (เพิ่ม "Map fields")
- M4-067: correct → **A,B,C,E** (เพิ่ม "Sandbox process")

**Evidence:**
- Crucible commit `640c8613` (26 ไฟล์): bank JSON/MD, v2-build rewritten +
  v2-source (re-merge), SV2 regenerate (validator pass 199 files), SV1
  regenerate, full-length-02, practice-suite, v1 generator (กัน regression),
  Crucible completed_log บันทึก decision
- Verification script 29/29 PASS; adversarial review lane อิสระ:
  CORRECT-AND-COMPLETE (scope ตรง, ไม่มีข้ออื่นถูกแตะ, ไม่เหลือ stale key ใน
  deliverable); `git diff --check` ผ่าน

**Residual risk:**
- Cross-model (codex) confirm ยังไม่ได้รัน — usage limit ถึง 5 ส.ค. 2026;
  นัดรัน 1 pass ที่ 3 ข้อนี้ก่อน public distribution
- Crucible commit ยังไม่ push (รอ authorization ตามปกติ)
- `v2-build/work/` คง snapshot ก่อนแก้ไว้โดยตั้งใจ (ประวัติ pipeline) — ไม่ใช่
  deliverable

## 2026-07-31 — Lane A: CAS-005 answer-key dispute audit เสร็จ (founder decision brief พร้อมเคาะ)

**Outcome:** ปิดคำถาม "11 founder-level disputes เหลือกี่ข้อจริง" ด้วยการ audit
จากไฟล์จริงทั้ง pipeline — **เหลือเปิดจริง 3 ข้อ** (PBQ-010, M4-082, M4-067) พร้อม
founder decision brief ทีละข้อที่
`reports/reviews/cas005-dispute-audit-2026-07-31.md`

**What changed / decided:**
- นิยาม "11 disputes" ถูก verify: คือ 11 ธงระดับ `:answer` ใน
  `v2-build/review/findings-academic-iter1.json` (610 ข้อ / 75 ธงรวม)
- ตรวจ key ครบ 600 MCQ + 10 PBQ: **ไม่มี answer key ใดถูกแก้ตลอด pipeline**
  (merge copy byte-for-byte; finalfix แตะเฉพาะ prose) — กฎ "ห้ามแก้ key โดยไม่มี
  founder decision" ไม่เคยถูกละเมิด
- 8 ข้อ reviewer ถอนธงหลัง rewrite prose (iter2 ไม่ recur), M1-136 ลดเหลือ prose
  แล้วปิดใน final loop; 3 ข้อไม่เคยถูกปิด: M4-082 (ธง recur 2 รอบ), M4-067
  (ธงใหม่ iter2), PBQ-010 (ไม่เคยถูก re-review หลัง iter1)
- Universe ครบจริง: full-length + pre/post reuse ข้อจาก module banks ตาม id
  → ไม่มีข้อหลุด review
- Source of truth confirm: bank จริง = `archive/legacy-output/v4.1/practice-tests/`
  (`module-banks/` ต้นฉบับ + `student-version-2/` deliverable); `assessments/` ใหม่ยังว่าง

**Evidence:** report ถูก fact-check โดย independent review lane (read-only
verifier, 6/6 จุด CONFIRMED, 0 factual error); NIST SP 800-61r3 (current, เม.ย.
2025) ยืนยันลำดับ eradication-ก่อน-recovery ผ่าน csrc.nist.gov 2026-07-31;
codex review lane ใช้ไม่ได้ (usage limit ถึง 5 ส.ค.) จึงใช้ managed Claude
verifier ตาม `feedback_managed_subagents_ok_supersedes_blanket_ban`

**Residual risk:**
- 3 disputes ยังเปิดจน founder เคาะ — publish gate ยังปิดเหมือนเดิม
- รายชื่อข้อที่ iter2 ครอบจริง enumerate ไม่ได้แล้ว (out ถูก overwrite) — ข้อสรุป
  "8 ข้อถอนธง" อิงจากธงไม่ recur; ถ้าต้องการชัวร์ 100% สั่ง spot-check batch เดียว
  ได้ตอน Crucible fix session
- การแก้ key + regenerate + re-review เป็นงาน Crucible session แยก ยังไม่เริ่ม

## 2026-07-31 — Implementation direction ล็อก: DIY "build the core, buy the plumbing" + ทิศทาง single-account auth

**Outcome:** ปิดคำถาม Phase 1 "hosted LMS vs DIY" — **ไม่ซื้อ platform, build เอง
แบบซื้อเฉพาะ plumbing** และเพิ่มทิศทาง auth: **single account เข้าได้ทุก product**
(Crux, STAR, Academy, Forge) ซึ่งต้องยกเป็น ADR ระดับ ecosystem ก่อน build จริง

**What changed / decided:**
- เหตุผลหลัก: product ที่ล็อกไว้ (path engine, prove-it lab, ระบบแต้ม, edition
  pricing) ไม่มีขายใน LMS ไหน — ซื้อ platform = จ่ายรายเดือนให้ส่วน commodity
  แล้วยัง build ส่วนที่เป็น product อยู่ดี + vendor lock
- Build: path engine, credit ledger, pricing logic, course player, admin /
  Reuse: Crux lab plane, self-hosted Supabase, cs- design system, Crucible /
  Buy เป็น service จ่ายตามใช้: video streaming + payment (candidates ยังไม่เลือก
  — ต้อง due-diligence ตอนใช้จริง)
- ไม่ขัด validate-before-invest: DIY บน infra ตัวเอง = recurring ~ศูนย์;
  slice แรกของ stack จริง = ตัว Phase 0 เอง (build once, ไม่มีของ throwaway)
- Auth: ยกหลัก "single email identity" เดิมเป็น cross-product single account;
  ระหว่างรอ ADR → Phase 0 ใช้ email เป็น identity key + ออกแบบ auth ให้ consume
  external issuer ได้

**Evidence:** วิเคราะห์เทียบ LearnWorlds (verified $99–299/mo, ไม่มี credit
metering / lab plane / edition pro-rata) ใน director session 2026-07-31;
Crux lab plane + money-safety มีอยู่จริงใน `crux-lms/product/services/lab-plane/`

**Residual risk:**
- Build scope จริงยังไม่ถูก estimate — ห้ามเริ่ม build ก่อน Phase 0 signal ตาม gate เดิม
- Single-account ADR ยังไม่เกิด — ถ้า Academy build auth ไปก่อนโดยไม่ design ให้
  consume external issuer จะสร้าง migration debt
- ตัวเลือก vendor (streaming/payment) ยังไม่ verify ราคา/เงื่อนไขปัจจุบัน

## 2026-07-31 — Product concept + pricing/access model (founder discussion → draft ลงแผน)

**Outcome:** นิยาม product ของ Academy ชัดขึ้นจาก "on-demand courses" เป็น
**personalized, interactive, lab-gated learning** พร้อมโมเดลราคา/สิทธิ์เข้าถึง/
เศรษฐศาสตร์ lab ครบวงจร — บันทึกเป็น draft ใน `active_plan.md` ส่วน
"นิยาม Product + โมเดลราคา/สิทธิ์เข้าถึง" เพื่อใช้เป็นสิ่งที่จะ build เมื่อผ่าน Phase 0 gate
(ไม่เปลี่ยนลำดับ: Phase 0 ยังมาก่อน)

**What changed / decided (founder):**
- Personalized learning path: ประเมินความรู้ (quiz + in-video questions) →
  skip/branch → map กับ career goal; user override เสมอ; ทุกการข้ามได้ cheatsheet
- Lab browser-based เป็น gate ต่อ topic — ใช้หลักการเดียวกับ Crux lab plane
  (ตัว Crux product ยัง ILT-only ใช้ภายใน ไม่เปลี่ยน)
- Fundamentals แจกฟรี absorb cost เอง (ไม่ขายเป็น SKU เดี่ยว — เป็น funnel +
  prerequisite ใน path); premium/cert course ซื้อขาดต่อ edition
- **Access term ล็อก final: 3 ปีเต็ม เลขเดียวทั้ง catalog** — decision path
  ในวันเดียวกัน: เริ่มจากเสนอ 3 → founder ยกหลัก "ประตูทางเดียว" เลือก 2 +
  auto-extend จนจบ edition → **สุดท้าย founder เลือก flat 3 เพื่อความง่าย**
  (คำสัญญาเดียว ประโยคเดียว ไม่มีกติกาซ่อน; ยอมรับว่าเลขที่ประกาศแล้วลดไม่ได้);
  3 ปีครอบ cert cycle เต็ม → ไม่มีเคสซื้อซ้ำของเดิมโดยธรรมชาติ; เคส edition
  ยาวกว่า 3 ปี = ต่ออายุ goodwill รายกรณี ไม่ประกาศเป็นนโยบาย
- ระบบแต้ม lab (academy currency): แถมพอ "จบคอร์ส + ซ้ำ 1–2 รอบ",
  top-up ~ราคาต้นทุน infra (ไม่ใช่ profit line), คืนแต้มบางส่วนเมื่อทำจบ,
  นาฬิกาแต้ม = นาฬิกา access
- Upgrade ข้าม edition: ส่วนลด pro-rata ตามเวลา access ที่เหลือ (ซื้อปลาย edition =
  ลดเยอะ กัน "หลังหัก") + floor ศิษย์เก่า + free-upgrade window ก่อน edition ใหม่ +
  ไม่จัด sale ช่วง transition + ประกาศสูตร public

**Evidence (market verification ระหว่าง discussion 2026-07-31):**
- Pattern พิสูจน์แล้วในตลาด: LearnWorlds interactive video (commodity แล้ว),
  CompTIA CertMaster (adaptive question-first + confidence), N2K/CyberVista
  (diagnostic-first ทั้งบริษัท), Pluralsight Skill IQ, TryHackMe/HTB Academy
  (browser lab + gated progression, anchor ~$10.50/เดือน), Google Cloud Skills
  Boost (lab credits + free 35/เดือน), HTB cubes (คืนแต้มเมื่อจบ module)
- Access ของ official vendor: CompTIA CertMaster = 12 เดือนหลัง activate;
  ISC2 self-paced = 90–180 วัน → fixed 3 ปีของเรา = 4–12 เท่าของ official
- Cautionary: Knewton (adaptive learning overpromise → ขาย outcome ไม่ขาย AI)
- Source URLs อยู่ใน session discussion (director session 2026-07-31)

**Residual risk:**
- Demand ยัง unvalidated — ทั้งหมดคือนิยาม post-gate; Phase 0 ยังไม่เริ่ม และ
  distribution ยังเป็น binding constraint
- ตัวเลขทั้งหมด (แต้ม, floor %, window, ราคา, เลขปี) เป็น placeholder รอ calibrate
  จากต้นทุนวัดจริง
- ภาระ content factory (Crucible): granular + branch + cheatsheet ต่อหน่วย =
  โจทย์โตหลายเท่า ยังไม่ได้ประเมิน
- CAS-005 answer-key disputes ยังค้าง — hard prerequisite เดิมก่อน public distribution

## 2026-06-20 — Governance structure standardized

**Outcome:** Academy governance now follows the director-managed project
structure with project-local ownership for principles, skills, plans, reports,
artifacts, context, and docs.

**What changed / decided:**
- Added project-local governance directories with short ownership READMEs:
  `principles/`, `skills/`, `reports/`, `reports/handoffs/`,
  `reports/sessions/`, `reports/reviews/`, `artifacts/`, `context/`, and
  `docs/`.
- Updated `AGENTS.md` with the required read order, director/ecosystem links,
  and the local governance directory map.
- Kept existing Academy reports in the product repo and did not migrate old
  artifacts or reports in bulk.

**Evidence:**
- Governance structure verified with targeted file/directory checks.
- Director governance validator run from the director repo:
  `rtk bash scripts/validate-governance.sh`.
- Diff hygiene checked with `rtk git diff --check`.

**Residual risk:**
- This is governance scaffold only; it does not resolve Phase 0 validation work
  or the open CAS-005 answer-key disputes.

## 2026-05-26 — Project naming + GTM strategy + repo bootstrap

**Outcome:** CyberSkills Academy defined as a product (planning stage) with a locked name, agreed scope, an honest go-to-market strategy, and a validate-before-invest operating principle. Repository created and registered.

**What changed / decided:**
- **Name locked:** "CyberSkills Academy" (chosen over codename options Doctrine/Pharos/Bastion and momentum names Grow/Go/LevelUp — for clarity, cert-prep credibility, and broad-catalog umbrella fit). Momentum words retained only as optional tagline.
- **Scope:** cert exam-prep courses + sold mock tests/practice banks + trend-driven pro courses (Agentic AI, Risk, ISO, basic pentest, cryptography). Knowledge/courses pillar, parallel to STAR (labs).
- **GTM stance (honest):** standalone open-market sale = low probability; real value = lead magnet + validation engine + funnel to corporate in-house training + live cohorts.
- **Platform:** hosted LMS (LearnWorlds) considered and **deferred** — no recurring cost before validated demand. Validate first on ~$0 infra.
- **Architecture:** content (Crucible, portable) decoupled from delivery (Academy); platform-agnostic subdomain `academy.cyberskills.co.th`; SEO content on main domain funneling in.
- **Repo:** `academy-platform` created and added as a submodule of cyberskills-director at `products/cyberskills/academy-platform` (SSH remote, matching ecosystem convention).
- **Docs:** provider-neutral `AGENTS.md` + this plan pair authored.

**Evidence:**
- Director commit `9f7726d` — "chore: add academy-platform submodule (CyberSkills Academy)".
- Strategy memory: `~/.claude/projects/.../memory/project_academy.md`.
- Source content + review evidence the strategy builds on: `products/personal/crucible-studio/output/cas005/v4.1/practice-tests/` (`student-version-2/`, `v2-build/review/findings-*.json`).

**Residual risk:**
- Distribution capacity unproven — the binding constraint for everything downstream.
- 11 CAS-005 answer-key disputes unresolved — blocks public distribution.
- Delivery platform undecided — Phase 0 must produce a demand signal before committing.

## 2026-08-01 — M3 auth + simulation + i18n + Cloudflare deploy + CRITICAL fix

**Auth ครบวงจร (M3 แกนหลัก)** — รหัส 6 หลักทางอีเมล · middleware allowlist ·
progress ผูกบัญชี (migration 0002/0003) · พิสูจน์ทั้งชุดบน workerd จริง
· e2e ต้องมี session แล้ว (auth.setup.ts ล็อกอินผ่าน API + อ่านอีเมลจริง ไม่ใช่ mock)

**Simulation challenge** — โจทย์จำลองหน้าจอตั้งค่า IPv4 ตัดสินจากสถานะสุดท้าย
ไม่ใช่ลำดับคลิก · สองโจทย์บนหน้าจอเดียวกันที่คำตอบตรงข้ามกัน · โหมด assessed มีแล้ว
แต่ยังไม่ผูกเข้า checkpoint

**Deploy จริงขึ้น Cloudflare** — https://cyberskills-academy.songpon-te.workers.dev
(หน้าร้านอย่างเดียว บัญชีปิด รอ session identity) · เจอ 3 กับดักที่ local ไม่เจอ
บันทึกใน memory `cloudflare-nextjs-deploy-traps`

**i18n EN/TH** — dictionary + สลับได้ + นโยบายความเป็นส่วนตัวสองภาษา + เทสกัน
อักษรไทยหลุดบนหน้าอังกฤษ

**วิดีโอหลายภาษา** — สลับ source ตามภาษาเสียง คืนตำแหน่งที่ดูอยู่ · caption ผ่าน
`<track>` มาตรฐาน · ย้าย quiz ออกจาก overlay มาไว้ใต้วิดีโอ (เดิมล้นจนต้องเลื่อนในกรอบ)

**CRITICAL ที่แก้แล้ว** — client ประกาศเองว่าเรียนจบได้ → ปลอมใบรับรองได้
พบจาก cross-model review พิสูจน์ด้วยสคริปต์โจมตี แก้ที่ราก และมีเทสกันย้อนกลับ

**Copy** — ตัดสำนวนที่อ่านออกว่าเครื่องเขียน 17 จุดในบทเรียน + 13 จุดใน UI
(review ข้ามโมเดลชี้ 20 จุด ตรงกับที่สงสัยตัวเอง: สูตร "X ไม่ใช่ Y" · ประโยคปิด
แบบคติพจน์ · วลีสามจังหวะ)

**ADR single-account** — founder เคาะครบ 5 ข้อ · เปิด asymmetric JWT/JWKS บน Pool A
(ปลด blocker STAR ที่ค้างตั้งแต่ 2026-06-13)

verification: build + lint + vitest 139/139 + playwright 50/50
