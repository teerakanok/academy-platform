# CyberSkills Academy — Active Plan

> Open work only. Move closed items to `completed_log.md` with evidence.
> Read `../AGENTS.md` first. Provider-neutral — no provider/model names in this plan.
> **Last updated:** 2026-08-06

## Current execution lane — activate identity without widening Pool A access

Production checkpoint 2026-08-05 ปิดแล้วสำหรับฐานข้อมูล, private-media delivery และ
least-privilege runtime data boundary: migrations `0001`–`0019` อยู่ใน Pool A;
dedicated PostgREST เผยเฉพาะ `academy` ผ่าน
`academy-data.cyberskills.co.th`, bind ที่ loopback, และ Worker version
`4861c000-d987-40ac-971e-d6e47e1a92e0` ถือ Academy-scoped secret เท่านั้น
(`MEDIA_SIGNING_SECRET`, runtime API URL/secret). Valid runtime JWT ตอบ `200`;
anonymous, forged `service_role`, และ cross-schema ถูกปฏิเสธ `401/403/406` ตามลำดับ.
หลักฐานและ rollback อยู่ใน
[`reports/sessions/academy-production-release-2026-08-05.md`](../reports/sessions/academy-production-release-2026-08-05.md).

งานหลักถัดไปตามลำดับ:

1. **เปิด auth/runtime และ bootstrap owner จาก stable identity จริง**
   - build ปัจจุบันตั้งใจปิด `NEXT_PUBLIC_SUPABASE_*`; หน้า sign-in แจ้งว่า account ยังไม่เปิด
   - owner: Academy frontend; ก่อนเปิด account ให้ซ่อนหรือปรับ “By continuing…” ใน
     closed state ซึ่งปัจจุบันไม่มี continue action แล้ว verify ด้วย closed-state E2E/visual
   - founder ต้อง sign in หนึ่งครั้งหลัง runtime พร้อม เพื่อสร้าง `academy.users` จาก
     `(issuer, subject)`; จากนั้น dry-run/apply `scripts/manage-staff-role.mjs`
   - ปัจจุบัน `academy.users=0`, active owner `=0`; ห้ามสร้าง UUID หรือใช้ email แทน identity
2. **ยืนยัน execution จริงของ retention cron รอบแรก**
   - dedicated retention API และ Worker แยกจาก runtime deploy แล้ว: role
     `academy_retention` เรียกได้เฉพาะ wrapper purge ทั้ง 5, PostgREST expose
     เฉพาะ schema `academy`, และ Worker ถือ credential เฉพาะของ API นี้
   - Cron `0 3 * * *` ยังต้องมีหลักฐานจาก event จริง: log ต้องพบ
     `retention.purge_complete` ครบทั้ง 5 งาน หรือ `retention.purge_failed` ที่
     surfaced ชัดเจน; ห้ามเรียก production purge RPC ด้วยมือเพียงเพื่อบังคับ retry
   - หลักฐาน deployment/rollback อยู่ใน
     [`reports/academy-retention-api-rollout-2026-08-06.md`](../reports/academy-retention-api-rollout-2026-08-06.md)
3. **ปิด public-launch gates ที่เหลือ**
   - distributed edge rate limit: source/test/build/dry-run พร้อมแล้ว แต่ยังต้อง
     set `RATE_LIMIT_KEY_SECRET`, deploy และตรวจบน Cloudflare production ตาม
     [`academy-web/docs/edge-rate-limit.md`](../academy-web/docs/edge-rate-limit.md)
     ก่อนถือว่า launch gate ปิด; log redaction ยังเปิดอยู่
   - restricted case-system owner/access configuration
   - legal review ภาษาไทยสำหรับ privacy/retention/appeal
   - CNAME/Zero Trust/public exposure decision แยกจาก Worker preview deployment

**สถานะ release:** production infrastructure checkpoint ผ่าน แต่ยังไม่พร้อม public launch
และยังไม่พร้อมรับ learner account จนกว่างาน 1–2 จะปิดครบ.

---

## ⛔ Pre-continuation audit gate — 2026-08-02

ตรวจ implementation เดิมทั้ง code, security และ learner UX แล้ว แม้ baseline ผ่าน
`lint` (0 errors), test 347 ตัว และ E2E 111 ตัว แต่ยังพบ production blockers ที่ suite
ไม่ครอบคลุม จึง **ห้ามถือว่า Academy พร้อมรับ production traffic หรือออก certificate**
จนกว่าจะปิด P0 ใน
[`reports/reviews/academy-implementation-audit-2026-08-02.md`](../reports/reviews/academy-implementation-audit-2026-08-02.md)

ลำดับที่ใช้เดินงาน: local security batch → integrity batch → learner-safety batch →
owner decisions → Pool A ภายใต้ authorization ใหม่ → release verification

Pool A, production schema/PGRST, R2, deploy และ secrets **ยังไม่ได้ถูกแตะ** ใน audit นี้
และยังคงใช้ authorization gate ตาม active handoff

### Local Security Batch — ปิดแล้ว 2026-08-03

- [x] auth cookie policy จุดเดียว: `HttpOnly`, `SameSite=Lax`, host/path scope และ
      production fail-secure; auth mutation ปฏิเสธ transport ที่ไม่ผ่าน HTTPS edge
- [x] same-origin/Fetch Metadata + JSON content-type guard ครบ mutation routes
- [x] bounded streaming JSON ครบ public/mutation endpoints ที่รับ body
- [x] activation + course entitlement + node prerequisite เป็น resource guard กลาง
      ครบ lesson, progress, attempts, explanations และ practice
- [x] dashboard/lesson มี typed denied, unavailable และ access-lost states; sign-out
      ตรวจ provider failure และไม่ redirect แบบสำเร็จปลอม
- [x] evidence: lint/typecheck, 388 unit/integration tests, clean build และ Playwright
      121 passed / 10 skipped; independent Code/Security/UX review = C0/H0/M0 ทุก lane

### Integrity Batch — ปิดแล้ว 2026-08-03

- [x] claim token fence + atomic attempt outcome/progress; concurrent claim แยกจาก invalid
      และ UI reconcile ผลเดิมก่อนออก attempt ใหม่
- [x] progress epoch fence ครบ attempt และ generic open/skip/video/checkpoint; reset,
      activation suspend และ entitlement revoke ชนะ in-flight request ตามลำดับ transaction
- [x] activation sync เป็น monotonic revision; revision เท่ากันแต่ status ขัดกันถูก reject
- [x] explanation snapshot ผูกกับ passing attempt และ fail closed เมื่อ pointer/snapshot หาย
- [x] evidence: lint/typecheck, Vitest 413/413, clean build, DB lint และ Playwright
      122 passed / 10 skipped; independent Code/Security/UX review = C0/H0/M0 ทุก lane

### Learner-Safety Batch — ปิดแล้ว 2026-08-03

- [x] validation ความครบของ simulation ก่อน consume attempt: per-mode public readiness,
      Apply/dirty state, legacy snapshot normalization และ policy snapshot; incomplete payload
      ไม่กิน quota/ปิดใบและ UI คงคำตอบกับ attempt เดิม
- [x] reset confirmation และ recovery contract ที่บอกผลตามจริงโดยไม่ทำให้ผู้เรียนเสียงาน
- [x] focus trap/return focus สำหรับ image/lab dialogs และ keyboard/video cue accessibility
- [x] แก้ learner-facing copy ที่ยังอ้าง persistence/issuance ไม่ตรง implementation จริง

**Evidence checkpoint 1:** lint/typecheck ผ่าน · Vitest **426/426** · clean build ผ่าน ·
Playwright **124 passed / 10 skipped** · independent Code/Security/UX review C0/H0/M0 ทุก lane

**Evidence checkpoint 2:** reset ใช้ confirmation ที่บอกขอบเขต/attempt quota ตามจริง,
operation ID + bounded receipt สำหรับ idempotent recovery, transaction recheck สิทธิ์และ
progress epoch, current-record reconciliation และ fail-closed overview state · lint/typecheck
ผ่าน · Vitest **440/440** · fresh local migration + clean build ผ่าน · Playwright
**136 passed / 10 skipped** · independent Code/Security/UX review **C0/H0/M0 ทุก lane**

**Evidence checkpoint 3:** image/lab ใช้ native modal + shared focus trap และคืน focus
ไป opener; reset dialog รักษา focus ระหว่าง slow request/reopen/terminal states พร้อม stable
fallback; video cue ใช้ non-modal semantics, keyboard-only flow, persistent live status และ
คืน focus ไป video · lint/typecheck ผ่าน · Vitest **440/440** · clean build ผ่าน · Playwright
**137 passed / 10 skipped** · desktop/mobile visual review ผ่าน · independent
Code/Security/UX review **C0/H0/M0/L0 ทุก lane**

**Evidence checkpoint 4:** dashboard พิสูจน์ server-backed learning record ผ่าน
browser context ใหม่; certificate surface แสดงเพียง course-record status และบอก
ว่า issuance/verification ยังไม่เปิด; ตัด test-out/cross-product capability ที่ยังไม่มี;
CTA ไป public catalog; consent `v2` เป็น bilingual artifact ที่ versioned ทั้งก้อนและ
`consent_events` เก็บ v1→v2 แบบ additive/idempotent ด้วย `SELECT, INSERT` เท่านั้น ·
lint/typecheck ผ่าน · Vitest **444/444** · clean build ผ่าน · clean local DB reset
ผ่าน migration 0001–0016 · Playwright **138 passed / 10 skipped** · desktop/mobile visual
review ผ่าน · independent Code/Security/UX review **C0/H0/M0/L0 ทุก lane**

**ยังไม่ใช่ production-ready:** migration `0016` ต้อง apply ก่อน deploy code ที่ใช้
consent `v2`/RPC; private `/media/*`, HTTPS runtime `Set-Cookie` proof บน
deployment topology จริง, privacy/retention, dependency advisories, durable abuse control,
least-privilege production credential และ owner decisions ที่ค้างยังเป็น launch gates

---

## ⚠️ อ่านก่อนลงมือ — แผน implement ที่ผ่าน RIL แล้ว (2026-08-02)

**`plans/implementation-plan-2026-08-02.md` คือแผนที่ session ถัดไปต้องเดินตาม**
ผ่าน RIL 7 รอบ สองเลนอิสระ (codex `model_reasoning_effort=high` + Claude critic)
→ **PASS ทั้งสองเลนในรอบที่ 7**

**สิ่งที่ RIL เปลี่ยนไปจากความเข้าใจเดิม — สำคัญมาก:**
ร่างแรกเขียนว่า "แกนหลักฐานต่อครบแล้ว เหลือแค่ต่อ simulation" ซึ่ง **ไม่จริง**
พิสูจน์ด้วยการรันจริงแล้วพบ 5 ข้อบกพร่อง (F1–F5) ที่ยังอยู่บน HEAD วันนี้:

| # | ข้อบกพร่อง | สถานะ (2026-08-02) |
|---|---|---|
| F1 | เฉลยและคำอธิบายถูกส่งไป browser ทั้งชุด (MCQ · video cue · simulation · `/player`) | ✅ ปิด — W0-1 |
| F2 | บทปกติ "ผ่าน" ด้วยการตอบครบ ไม่ต้องตอบถูก | ✅ ปิด — W0-3 |
| F3 | ใบรับรองนับ `completed` เป็น "พิสูจน์แล้ว" → ตอบผิดทุกข้อก็ได้ใบ | ✅ ปิด — W0-3 |
| F4 | UI ประกาศว่าผ่านก่อนเซิร์ฟเวอร์ตอบ (ทิ้ง `outcome`) | ✅ ปิด — W0-2 |
| F5 | คำถามกลางวิดีโอตรวจและบันทึกจริง แต่ไม่ถูกใช้ตัดสินอะไร | ✅ ปิด — W0-4 (นิยามเป็น formative) |

→ **W0 (ซ่อมแกนหลักฐาน) ต้องทำก่อนทุกอย่าง** และงานแรกจริงๆ คือ **W0-0**
(โครง attempt + คลังข้อ) เพราะกติกาอื่นทั้งหมดพึ่งมัน

> **สถานะ W0 ณ 2026-08-02: ปิดครบทั้งห้าข้อ** · รายละเอียดแต่ละงานอยู่ในบันทึก
> ความคืบหน้าด้านล่าง · **สิ่งที่ยังค้างและบล็อกการ "ปิด W0" อย่างเป็นทางการ**:
> คลังข้อ capstone EN 39 ข้อ (W-content) และการต่อ attempt เข้า `/api/progress`
> — สองอย่างนี้คือเงื่อนไขของการเปิด `test-out` กลับมา

**ลำดับที่บังคับ:** W0-0 → W0-1..4 → W1 → W2 → W3 → W4 · W-content ทำขนานกับ W0 ได้

**Founder blocker ที่ต้องขอตั้งแต่เปิด session** (§4.2b ของแผน):
R2 bucket สำหรับย้าย media · และอนุญาต deploy หนึ่งครั้งเพื่อ verify `/media/*`
(ลอง `wrangler dev --remote` ก่อน)

**ความคืบหน้า W0-0 (2026-08-02) — โครง attempt เสร็จ ผ่าน RIL cross-model 2 รอบ:**
- migration 0005: ตาราง `academy.attempt` (RLS default deny) + `issue_attempt`
  (โควตา 3/30นาที นับจากแถว DB + advisory lock) + `consume_attempt` (UPDATE เดียว
  เงื่อนไข ownership/context/replay/expiry ใน `WHERE` เดียว) + revoke execute
  PUBLIC/anon/authenticated ทั้ง 5 ฟังก์ชันของสคีมา + index รองรับ retention
- `POST /api/attempts` ออกโจทย์สุ่ม + remap key ต่อ attempt · `params` ฝั่ง server
  เก็บ **answerKeys snapshot** ณ ตอน issue (กัน version drift ระหว่าง issue/consume)
- เทส 30 ตัว (unit 12 · integration 13 · e2e 5) — race/replay/ownership/expiry/
  โควตา concurrent/window rollover/function grants/no-leak — full chain เขียว
- **ยังไม่ปิด W0-0**: เหลือต่อ consume เข้า `/api/progress` (คู่กับ W1) ·
  คลังข้อ 39 (W-content) · retention job (รอเลือกกลไก cron)

**W0-1 เสร็จ (2026-08-02) — เฉลยไม่ออกจากเซิร์ฟเวอร์แล้ว (ปิด F1) และ F4/W0-2 ปิดตาม:**
- `public-lesson.ts` — `PublicLesson` DTO เป็น **ชนิดที่บังคับ** ไม่ใช่วินัยของคนเขียน:
  client component รับได้เฉพาะชนิดที่ไม่มี `correct`/`explanation`/`operator`/`hints`
  อยู่ในโครง · `answer-key.ts` เป็นทางเข้าเดียวของเฉลย ปิดด้วย `server-only`
  (เพิ่ม dependency ตามที่ W0 acceptance ระบุ · SBOM อัปเดตแล้ว)
- `/api/progress` — assessed (capstone/test-out) คืน `{ passed }` เท่านั้น เหมือนกัน
  ทั้งผ่านและไม่ผ่าน · learn คืนผลรายข้อ + คำอธิบาย
- `/api/practice/simulation` ใหม่ — โหมดฝึกตรวจที่เซิร์ฟเวอร์ และเซิร์ฟเวอร์เป็นคน
  ตัดสินว่าถึงเวลาให้คำใบ้ (เดิม `SimulationBlock` ถือ hints เองแล้วนับครั้งเอง)
- `/api/explanations` ใหม่ — เปิดเฉลยเฉพาะบทที่อ่านจาก DB แล้วพบว่าผ่านจริง
- **F4/W0-2 ปิดไปด้วย**: client ไม่มีเฉลยแล้วจึงต้องรอ `outcome.passed` จากเซิร์ฟเวอร์
  ก่อน `setDone()` · ระหว่างรอแสดง "Checking…" ไม่ประกาศผลล่วงหน้า
- เทสใหม่: `answer-leak` ยิงหน้าจริงทั้ง 15 บทอ่าน HTML+RSC+JS chunk ·
  `assessed-redaction` ตรวจรูป response รวม Mastermind · `player-boundary` กันขอบเขต
  `/player` · `ui-waits-for-server` วัดบนหน้าจอก่อน reload (เกณฑ์ W0-2 ที่แผนล็อก)

**RIL cross-model บน W0-1 จับสองรูที่ผมมองข้าม — แก้แล้ว (commit 4c1c07c):**
- 🔴 **โหมดสอนเป็นเครื่องเฉลยของโหมดวัดผล**: บทปกติใช้ checkpoint ชุดเดียวกันทั้ง
  learn/test-out → ยิง learn เก็บเฉลย แล้วไปยิง test-out ได้ `tested-out` ที่นับเป็น
  พิสูจน์แล้ว → `assessment-policy.ts` **ปิด test-out ทั้งหมด** จนกว่า node จะมีคลังข้อ
  ของตัวเอง (แผน W0-0 ล็อกไว้ตั้งแต่แรกแต่ยังไม่ได้ทำ) · ปุ่มและ copy บน UI ผูกกับ
  นโยบายเดียวกัน — **การเปิด test-out กลับต้องมาพร้อมคลังข้อ ≥3 เท่า (W-content)**
- 🔴 **`/player` เปิดให้ผู้เรียนทุกคนที่ล็อกอิน** (เทสรุ่นแรกวัดแค่ anon จึงเขียวทั้งที่
  รูเปิด) → `internal-surface.ts` fail-closed ด้วย `INTERNAL_SURFACES` (ไม่ตั้ง = ปิด,
  ตอบ 404 ก่อนชั้น auth) · ซ่อนลิงก์ทั้งเมนูและ dashboard · spec ของ `/player`
  (player, visual-matrix, full-acceptance) ข้ามเมื่อปิดและผ่านเมื่อเปิด — ยืนยันสองโหมด
- MAJOR: DTO บังคับจริงด้วย `?: never` + เทสระดับชนิด (พิสูจน์ด้วยการถอด guard แล้วแดง) ·
  `course-source.ts` ใส่ `server-only` · practice endpoint จำกัด body/จำนวน key ·
  คำใบ้เปลี่ยนเป็นผู้เรียนกดขอ (เดิมเชื่อ attempt count จาก client ที่ปลอมได้) ·
  cache answer key
- chain: vitest **241** (รวม type tests) · playwright **85 + 10 skipped** (พื้นผิวภายใน)

**W1 เสร็จ (2026-08-02) — simulation เป็นด่านจริงแล้ว · RIL 2 รอบ:**
- `CheckpointItem` union (MCQ | simulation) **ไม่ breaking** — loader เติม `kind:'mcq'`
  ให้รูปเดิม ไฟล์เนื้อหา 20 ไฟล์ไม่ต้องแก้
- เซิร์ฟเวอร์ตรวจ simulation เอง · MCQ+simulation นับรวมเป็นชุดเดียว (กดตรวจครั้งเดียว)
- migration 0006: เก็บหลักฐาน **ราย requirement + ลายนิ้วมือกติกา + เวลา**
- migration 0007: **หลักฐานเลื่อนขึ้นอย่างเดียวเหมือนสถานะ** — RIL จับว่าเดิมผ่านแล้ว
  ส่งผิดซ้ำจะทำให้ "สถานะบอกว่าผ่าน แต่หลักฐานบอกว่าไม่ผ่าน" ขัดกันเอง
- `gradingFingerprint()` — เดิมบันทึก `structure.version` ของคอร์สซึ่งไม่ขยับเมื่อ
  requirements เปลี่ยน จึงตอบไม่ได้ว่าผ่านด้วยกติกาชุดไหน
- grader **fail-closed**: ไม่มี field ในสถานะ = ไม่ผ่านเสมอ · operator ที่ต้องมี value
  แต่ไม่มี = ไม่ผ่าน (เดิม `undefined === undefined` ทำให้ "ไม่ทำอะไรเลย" ผ่านด่านได้)
- เขียน simulation ลง capstone จริง 1 จุด (static IP ให้ print server, 5 requirements)
- chain: vitest **288** · playwright **100 + 10 skipped**

**ข้อจำกัดที่รู้อยู่และต้องปิดใน W4:** `courseRecordSummary` ตัดสินจากสถานะอย่างเดียว
ยังไม่อ่าน `simulationEvidence` — ถ้าเนื้อหาเพิ่มด่านใหม่เข้า capstone ที่ผ่านไปแล้ว
สถานะจะยัง completed ทั้งที่หลักฐานของด่านใหม่ยังไม่มี · W4 ต้องอ่านหลักฐานจริงประกอบ
เพราะใบรับรอง snapshot หลักฐาน ณ วันออก ไม่ใช่สถานะปัจจุบัน (บันทึกในโค้ดแล้ว)

**W1d เสร็จ (2026-08-02) — โจทย์จำลองสุ่มค่าเป้าหมายต่อ attempt:**
- `/api/attempts` สุ่มตัวแปรเก็บใน `params.simulationVars` แล้วส่งโจทย์ที่แทนค่าแล้ว ·
  `/api/progress` consume attempt แล้วตรวจด้วยค่าของ attempt นั้น คำตอบจึงแชร์กันไม่ได้
- `PublicCheckpointItem.challenge` เป็น optional **โดยตั้งใจ** — หน้า lesson ส่งได้แค่
  "มีด่าน id นี้" ตัวโจทย์มาจาก attempt เท่านั้น (เดิมส่งแม่แบบ `{{targetIp}}` ไปกับ payload)
- `useLessonAttempt` เป็น state machine (รอ / พร้อม / ขอไม่ได้) — ด่านไม่ปรากฏจนกว่า
  โจทย์จะเป็นของผู้เรียนจริง · โควตาเต็มบอกตรงๆ พร้อมเวลาที่ขอได้อีกครั้ง

**RIL รอบ W1 (cross-model, xhigh) — พบ 3 blocker + 5 should-fix บน commit ที่ "เขียวหมด":**
ปิดแล้วใน `77a14f2`:
- **oracle ที่ GET** — POST ปิดผลรายข้อไว้แล้ว แต่ `GET /api/progress` คืน
  `checkpointResults` รายข้อของ capstone + ผลราย requirement · ส่งผิดสามชุดก็ได้เฉลย
  ครบ → `toPublicProgress()` ตัดทุกเส้นทางที่ส่งไป browser (fail closed)
- **ลองใหม่แล้วตัน** — attempt ถูกใช้ไปตั้งแต่กดตรวจ ปุ่ม Try again ส่ง id เดิมซ้ำ → 409
  ตลอด · ตอนนี้ขอโจทย์ชุดใหม่จริง
- **แม่แบบที่ยังไม่แทนค่าถูกเอาไปตรวจ** — attempt เก่าข้าม deploy ทำให้ค่าที่ต้องได้เป็น
  สตริง `"{{targetIp}}"` ตรงตัว → กรอกตามก็ผ่าน · `resolveChallenge` fail closed แล้ว
- **reset ลบสมุดนับโควตา** — คนไล่ลองเฉลยไม่มีอะไรให้เสีย จึง reset สลับขอ attempt ได้
  ไม่จำกัด · reset ไม่แตะ `attempt` อีก โควตาเป็นค่าคอนฟิกให้เทสตั้งสูงแทน
- **ออก attempt ทั้งที่ทำจบแล้ว** — `hold` จนกว่าจะรู้สถานะบท

**ยังเปิดอยู่จาก RIL รอบนี้ (จดเป็นงาน ไม่ใช่ปล่อยผ่าน):**
- consume + บันทึกความคืบหน้าไม่ atomic → 500 กลางทางกินสิทธิ์ผู้เรียนถาวร ·
  และ attempt ที่ response หายกลางทางก็กินโควตาโดยไม่ได้อะไร (ต้องมี idempotency)
- ตาราง `attempt` ไม่มี retention — ตั้ง batch cleanup ก่อนเปิด traffic จริง
- **ด่านจำลองยังพิสูจน์ได้แค่ "ส่งสถานะปลายทางที่ถูก"** ไม่ใช่ "ลงมือทำ" — ยิง API ตรง
  ก็ผ่าน · แผนยอมรับข้อจำกัดนี้ไว้แล้ว แต่ **W4 ต้องไม่อ้างเกินนี้ในใบรับรอง**
  (lab จริงหรือ session ฝั่งเซิร์ฟเวอร์เท่านั้นที่ยกระดับได้)

**W0-0b เสร็จ (2026-08-02) — remap key มีผลจริงแล้ว:**
เดิม `/api/attempts` ออก MCQ ที่ remap key ต่อ attempt มาตั้งแต่ W0-0 แต่ไม่มีใครใช้ —
UI เรนเดอร์จากไฟล์ (key จริง) และ `/api/progress` ตรวจด้วย key จริง แปลว่าคำตอบ capstone
คงที่ตลอดและบอกต่อกันได้ ซึ่งเป็นสิ่งที่ W0-0 ตั้งใจกันตั้งแต่แรก
- UI รับทั้ง MCQ และด่านจำลองจาก attempt · ลำดับข้อก็มาจาก attempt
- API แปลง key กลับด้วยตารางของ attempt แล้วเทียบกับ **เฉลย snapshot ใน attempt**
  ไม่ใช่ไฟล์ปัจจุบัน · key ที่ไม่มีในตาราง = ปฏิเสธทั้ง submission
- `requiresAttempt()` เป็นจุดเดียวที่ตัดสินว่าด่านไหนต้องมี attempt (UI กับ API ต้องตอบ
  เหมือนกัน ไม่งั้นผู้เรียนกดตรวจแล้วได้ 400 โดยไม่มีอะไรบอก)
- e2e เลิกคลิก `input[value="B"]` ทั้งชุด — เลือกจากข้อความของตัวเลือกเหมือนผู้เรียนอ่าน
  (ของเดิมจะเขียวเองแบบสุ่ม ~1 ใน 4 ครั้ง)
- mutation 2 แบบแดงตามคาด ผ่าน `scripts/mutation-check.sh` (คืนไฟล์จากสำเนา ไม่ใช่ git)

**RIL รอบ 2 (หลัง W0-0b) — พบว่า remap ยัง "ไม่กันอะไร" เพราะชุด key จริงยังหลุด:**
ปิดแล้วใน `da68a29`:
- **หน้า capstone ส่ง `choices` ชุด key จริงมาด้วย** แม้ UI แสดงชุดที่ remap แล้ว →
  คนที่ผ่านแล้วบอกเพื่อน "B, C, B" เพื่อนเทียบข้อความแล้วแปลงเป็น key ของตัวเองได้ทันที
  · ตอนนี้หน้าส่งได้แค่รายชื่องาน เนื้อโจทย์มาจาก `/api/attempts` ที่เดียว
- `/api/explanations` เลิกคืน key เฉลย (คืนแค่คำอธิบาย)
- `/api/attempts` ใช้ `requiresAttempt` เหมือน UI/API อื่น (บทปกติที่มีด่านจำลองเคยตัน)
- คำตอบที่เกินมาถูกเมินเงียบๆ → ตรวจให้ชุด key ตรงกับโจทย์ของ attempt พอดี
- 409 แล้วตัน → ขอโจทย์ชุดใหม่ให้อัตโนมัติ

**ปิดครบแล้วทั้งชุด (migration 0008–0011):**
- `0008` — `passed_attempt_id` + `passed_challenge_version` บน `node_progress`
  เขียนได้ครั้งเดียว · ตั้งใจไม่ผูก FK เพราะ retention จะกวาดแถว attempt ทิ้ง
- `params.simulations` + `params.questions` — attempt หนึ่งใบถือทุกอย่างที่ใช้แสดง
  และตรวจงานของตัวเอง · `simulationsToGrade()` เป็นจุดเดียวที่ตอบว่าใช้โจทย์ชุดไหน
- `0009` — attempt จำผลสุดท้ายไว้ · ส่งซ้ำหลังจบ = คืนผลเดิม · ค้างไม่มีผลเกิน 30
  วินาที = ล้มกลางทาง ให้ตรวจใหม่ได้ (ต้องมีเวลากันไว้ ไม่งั้นยิงคู่ได้สองสิทธิ์)
- `0010` — attempt ที่ยังไม่ถูกใช้ถูกคืนซ้ำ · เปิดหน้าซ้ำ/สองแท็บไม่กินโควตา และ
  หมุนโจทย์ทิ้งด้วยการ refresh ไม่ได้อีก · หนึ่งช่องโควตา = หนึ่งชุดโจทย์ที่ใช้จริง
- `0011` — `purge_expired_attempts()` ไม่แตะของที่ยังใช้ได้และช่วงที่โควตายังนับ
  (**ยังไม่มีตัวตั้งเวลา** — เลือกกลไกอยู่ที่เจ้าของระบบ · PENDING_USER_ACTION §7b)

**RIL รอบ 3 — สองเลนอิสระ (reviewer xhigh + red-team) บน `1dc3de9`:**
ชี้ตรงกันสามข้อ ปิดแล้วใน `347660b` (migration 0012):
- **claim ไม่ต่ออายุ → attempt เดียวถูกตรวจได้หลายครั้ง** · `coalesce(consumed_at, now())`
  ไม่ต่ออายุ พอพ้น 30 วินาทีทุกคำขอที่ยิงพร้อมกันผ่านหมด → `set consumed_at = now()`
  · red-team ชี้ทางสร้างสภาพนั้นได้ฟรี (payload key ไม่ตรง → consume ก่อนแล้วค่อย 400)
  → ทุกทางออกที่ปฏิเสธหลัง consume ต้อง finalize ปิด attempt
- **ผลรายข้อถูกทับได้แม้ผ่านแล้ว** → หลักฐานถูกแช่แข็งทั้งชุดเมื่อมีตัวชี้
- **ตัวกวาดลบใบที่เป็นหลักฐาน** → `not exists` + partial index
- red-team เพิ่ม: deploy ระหว่างทางกินสิทธิ์ผู้เรียน (ตรวจจาก snapshot ล้วนแล้ว) ·
  cron ที่ล้มถูกนับว่าสำเร็จ (throw แทน log)

⚠️ บทเรียนที่บันทึกไว้: ทั้งสามข้อคือ "ตั้งกติกาแล้วบังคับไม่ครบพี่น้องของฟิลด์นั้น"
และเทสที่เขียนเองก็ตรวจแค่ครึ่งที่คิดถึง — เทสข้อ 3 ยืนยันพฤติกรรมผิดด้วยซ้ำ

**ยังเหลือ:** คำตอบที่พิมพ์ไว้ยังหายเมื่อ refresh (โจทย์กลับมาใบเดิมแล้ว แต่คำตอบ
อยู่ใน state ของหน้า)

**สถานะ production ณ ปิด session (ตรวจจริง 2026-08-02):**
- Worker `cyberskills-academy` deploy ล่าสุด 2026-08-01 · **ไม่มี secret ตั้งไว้เลย**
  → ทุกฟีเจอร์ที่ใช้ DB ปิดอยู่ตามที่ตั้งใจ (หน้า sign-in บอกว่ายังไม่เปิด)
- ตาม `reports/state/supabase.md` (2026-08-01) Pool A **ยังไม่มีสคีมา `academy`** และ
  `PGRST_DB_SCHEMAS` ก็ยังไม่มี → migration 0001–0012 อยู่แค่ในเครื่อง
- `/media/*` เสิร์ฟผ่าน ASSETS binding ตรง request ไม่ถึง Worker → **วิดีโอบทเรียน
  โหลดได้โดยไม่ต้องมีบัญชี** · middleware แก้ไม่ได้เพราะไม่เคยถูกเรียก
- founder อนุมัติแล้ว (2026-08-02): สร้างสคีมา `academy` บน Pool A + งานบน Pool A +
  R2 bucket + deploy หนึ่งครั้ง · **ยังไม่เปิดระบบบัญชีบน preview** (รอ identity contract)

**⚠️ ข้อจำกัดที่ยังจริงอยู่และต้องพูดตรงๆ:** ตราบใดที่คลังข้อยังเท่าจำนวนที่เสิร์ฟ
(W-content ยังไม่เข้า) การบอกต่อ **ข้อความ** ของตัวเลือกที่ถูกยังทำได้อยู่ดี — สิ่งที่
ปิดช่องนั้นคือการหมุนคลังข้อ ไม่ใช่การซ่อน key

**เงื่อนไขที่เหลือก่อนเปิด `test-out` กลับมา:** คลังข้อ capstone EN 39 ข้อ (W-content)

**W0-3 + W0-4 เสร็จ (2026-08-02) — ปิด F2/F3/F5 · W0 ครบทั้งห้าข้อแล้ว:**
- `assessment-policy.ts` เป็น **จุดเดียว** ที่ตอบสองคำถาม: "อะไรผ่าน" (`passesLearnMode`)
  และ "อะไรนับเป็นหลักฐาน" (`isProofBearing`) — เดิมสองคำถามนี้กระจายอยู่ API/UI/
  ใบรับรอง แล้วหลุดไม่พร้อมกัน ซึ่งเป็นต้นเหตุของ F2/F3 ตั้งแต่แรก
- เกณฑ์บทปกติ: ผิดไม่เกิน 1 **และต้องมีข้อที่ถูกอย่างน้อยหนึ่งข้อ**
  ⚠️ เกณฑ์ "ผิดไม่เกิน 1" ตามที่แผนล็อกไว้ใช้ตรงๆ ไม่ได้ เพราะคอร์สจริงมีบทที่มี
  checkpoint 1–2 ข้อ ซึ่งจะกลายเป็น "ผ่านโดยไม่ต้องตอบถูกสักข้อ" (เทส e2e จับได้
  ตั้งแต่รันครั้งแรก) — founder เปลี่ยนตัวเลขได้ที่ `LEARN_MODE_ALLOWED_WRONG`
- `courseRecordSummary` แยกสองชั้นที่ต้องผ่านทั้งคู่ (เดินครบทุกบท **และ** ทุก
  capstone ผ่าน) · คอร์สที่ไม่มี capstone ออกใบไม่ได้ → `courseIssue: 'no-assessment'`
  แยกจาก `blocking` เพราะ UI ทำ blocking เป็นลิงก์ไปหน้าบทเรียน
- คำว่า **proven สงวนให้ด่านวัดผลเท่านั้น** ทั้ง codebase — rename `provenCount`→
  `lessonsFinished`, `provenPercent`→`finishedPercent`, `isProven`→`isFinished` และ
  copy ทุกจุด (roadmap summary, dashboard, radar, legend, CheckpointQuiz, courses intro)
- **RIL cross-model 4 รอบ** — จับ: mutation `eligible=true` ไม่ถูกเทสจับเลย (เทสไม่เคย
  ดูการ์ดจริง) · blocker ระดับคอร์สสร้างลิงก์ไป node ที่ไม่มีอยู่ · เทสเดินด้านเดียว
  ของเงื่อนไขสองชั้น · คำว่า proven ที่ยังหลงเหลือ 3 รอบติด
- ข้อจำกัดที่ยังเปิด: mutation "ลบ guard `assessedTotal > 0`" ยังไม่มีเทสจับ เพราะ
  ไม่มีคอร์สจริงที่ไม่มี capstone (logic มี unit คุมผ่าน `courseIssue`) — ปิดเมื่อมี fixture
- chain: vitest **262** · playwright **91 + 10 skipped**
- **หนี้ระบบที่พบ**: ภาพ artifact ที่ track ไว้ถูก e2e regen ทุก run เพราะฝัง
  อีเมล `e2e-learner-<timestamp>` ใน header → byte ต่างตลอด (เทียบภาพแล้วเนื้อหา
  เหมือนเดิม จึง `git restore` ทุกครั้ง) — ควรแก้ให้ e2e ไม่เขียนทับ artifact
  ที่ track หรือ mask อีเมลตอน capture

---

## Objective

Stand up **CyberSkills Academy** (cert exam-prep courses + sold mock tests +
trend-driven pro courses). **Founder เคาะ 2026-07-31: build-first** — สร้าง
platform (DIY) ทันทีแบบ content-agnostic; การเลือก course catalog + demand
validation ต่อ course เป็นรอบ pitch + poll ของ founder ภายหลัง (Phase 0 deferred).

---

## Current phase: **PLATFORM BUILD — founder เคาะ 2026-07-31 (Phase 0 = DEFERRED)**

> **Founder decision (in-session, 2026-07-31):** ถือว่ามี demand — เริ่ม build
> platform ทันที; **Phase 0 (validate demand) ไม่ทิ้ง แต่ defer**: จะกลับมาทำตอน
> เคาะว่าจะทำ course อะไรบ้าง โดย **founder จะไป pitch + poll ผ่าน channels
> ต่างๆ เอง** (ใช้ channel inventory จาก Lane B —
> `reports/reviews/channel-inventory-2026-07-31.md` — เป็น input ของรอบนั้น);
> ระหว่างนี้ build ทุกส่วนแบบ **content-agnostic** (player/engine เสพ Crucible
> portable JSON — ไม่ผูก course ใด course หนึ่ง)
>
> **CAS-005 gate: ตัดออกจากแผน (founder 2026-07-31)** — ไม่ได้ focus course ใด
> ตอนนี้; ตัว key fix เสร็จสมบูรณ์แล้ว (Crucible `640c8613`, verify 29/29) —
> ถ้าวันหน้าจะเอา bank ออก public ค่อยตัดสินใจเรื่อง confirm pass ตอนนั้น
>
> **CPO note:** demand validation ต่อ course จะเกิดตอนรอบ pitch + poll ของ
> founder → การ build ตอนนี้เสี่ยงต่ำลงเพราะเป็น foundation ที่ vision ที่ล็อก
> ต้องใช้อยู่ดี + recurring cost ~0 บน owned infra

### Build roadmap (content-agnostic, ยึด infra + implementation ที่ล็อก 2026-07-31)

- [x] **M1 — Foundation:** ✅ **เสร็จ 2026-07-31 (local acceptance ครบ)** —
  `academy-web/` build+lint+test+e2e เขียวจาก `npm ci` บน local Supabase จริง;
  landing + PDPA + lead capture + schema `academy` RLS default deny
  (ดู `completed_log.md` entry 2026-07-31 one-shot executed); ส่วน deploy
  Vercel `sin1` / CNAME / Zero Trust = external checkpoints รอ founder ตาม
  `PENDING_USER_ACTION.md` §1–3 (ห้ามทำใน AFK)
- [x] **M2 — Course player (commodity core):** ✅ **เสร็จ 2026-07-31** — loader
  เสพ Crucible portable JSON + practice (explanation/pool/shuffle/retake) +
  timed exam (deadline timer/resume) + PBQ checks/select/order + exhibit +
  scoring spec + module nav + progress + axe + visual matrix; fixture =
  CAS-005 internal (นับจริง 150 MCQ — เลข 165 ในแผนเดิมคลาดเคลื่อน); video
  slot เป็น placeholder จนกว่า commit CF Stream (M5)
- [~] **M3 — Identity + personalized path v0** — 🟡 **แกนหลักเสร็จ 2026-08-01**
  (auth ครบวงจร + gating + progress ผูกบัญชี พิสูจน์บน Cloudflare runtime แล้ว;
  เหลือ Google sign-in ที่ต้องใช้ OAuth credential จริง และหน้าโปรไฟล์/ชื่อจริง)
  (founder เคาะ ADR ครบ 5 ข้อ; ดู `docs/adr/ADR-draft-single-account.md` §0)
  - **เคาะแล้ว:** Option A (shared issuer Pool A GoTrue + identity contract) ·
    เปิด asymmetric JWT/JWKS · consent ecosystem · **บังคับสมัครถ้าจะใช้**
    (founder overrule คำแนะนำเดิม — เหตุผล: ค่า infra ต่อหัวไม่ใช่ศูนย์ โดยเฉพาะ
    lab compute ใน M4 + การสมัครเป็น filter ของความตั้งใจ) · login = email OTP
    **และ** Google
  - **Account = universal CYBERSKILLS account** ไม่ใช่ account ของ Academy —
    หน้าสมัครพูดในนาม CYBERSKILLS, ครอบทุกบริการ, **รวมถึง certification ที่เรา
    อาจออกเองในอนาคต** → identity ต้อง verified email ตั้งแต่วันแรก และห้ามถอย
    ไปใช้ email เป็น join key (ใช้ `(issuer, subject)`)
  - **ขอบเขต gate:** ทุกอย่างที่ "ใช้" ต้องมี account (บทเรียน/quiz/lab/progress)
    ส่วนหน้าร้าน (landing, รายการคอร์ส, หน้าแนะนำคอร์ส) เปิดสาธารณะ — เพราะเป็น
    สิ่งที่ทำให้คนอยากสมัคร และเป็นหน้าเดียวที่ search + การแชร์ลิงก์เข้าถึงได้
    ซึ่งสำคัญเพราะ "หา distribution channel ไม่ได้" ยังเป็นข้อเปิดในแผน
  - **ทำได้เลยบน local Supabase:** ตาราง `academy.users` `(issuer, subject)` ·
    หน้าสมัคร/เข้าสู่ระบบ · route gating · ย้าย progress จาก browser → DB ·
    ผูก waitlist lead ↔ account ด้วย verified email ณ เวลา sign-up
  - ⚠️ ก่อนแตะ Pool A ทุกครั้ง อ่าน `ecosystem/SHARED_INFRA_ACCESS.md` และ `reports/state/supabase.md`
    ของ director repo ก่อน — เป็น shared infra ที่ Crux/STAR/Forge ใช้ร่วมกัน
  - **ติด external checkpoint:** asymmetric JWT/JWKS บน Pool A (founder เท่านั้น —
    `PENDING_USER_ACTION.md` §4.1) · ระหว่างรอ ให้ verify ฝั่ง server ไปก่อน
    (แบบ Crux) ซึ่งไม่ต้องใช้ JWKS
  - **ต้อง DD สดตอนลงมือ:** ความสามารถ asymmetric JWT ของ GoTrue เวอร์ชันที่รันจริง

- [ ] **M3.5 — Certificate of completion** (founder เพิ่ม 2026-08-01: Academy ต้อง
  ออกใบรับรองเมื่อเรียนจบคอร์ส)
  - ✅ **claim ล็อกแล้ว 2026-08-05** — `Certificate of Course Completion`; เรียนครบ
    ทุก requirement และผ่าน required assessed checkpoint ทุกด่าน; ระบุชัดว่าไม่ใช่
    professional certification
  - ✅ **กติกา course record สองชั้นทำแล้ว** — `courseRecordSummary()` ใน
    `src/lib/course/roadmap.ts`: บททั่วไปต้องทำครบในฐานะความคืบหน้า และ capstone
    ทุกจุดต้องผ่านในฐานะ assessed evidence; การข้ามกั้น record แต่กลับมาทำได้
  - [ ] **W4 ต้องตัดสินจากหลักฐานจริง** — ห้ามออกใบจาก progress status อย่างเดียว;
    ต้องตรวจและ snapshot passing attempt/simulation evidence + course version
  - [ ] **ต้องมี account ก่อน** (ขึ้นกับ M3) — ใบรับรองเอ่ยชื่อคน จึงออกให้คนที่
    ไม่มีตัวตนไม่ได้ ข้อนี้ยืนยันการตัดสินใจบังคับสมัครของ founder อีกทาง
  - [ ] **ชื่อบนใบ** — ต้องมีฟิลด์ชื่อจริงตอนสมัคร (email อย่างเดียวไม่พอ) และ
    ต้องแก้ได้ก่อนออกใบ เพราะพิมพ์ผิดแล้วออกไปแล้วแก้ยาก
  - [ ] **ต้อง verify ได้ตั้งแต่ใบแรก** — ใบที่ตรวจสอบไม่ได้คือรูปภาพที่ใครก็ทำปลอมได้
    ต้องมี id + หน้า verify ตั้งแต่วันแรก **ย้อนหลังใส่ให้ใบที่ออกไปแล้วไม่ได้**
  - [ ] **PDPA** — หน้า verify เปิดเผยชื่อ + คอร์ส ต้องให้ผู้เรียนเลือกได้ว่าจะให้
    ตรวจสอบสาธารณะไหม และหน้า verify ต้องไม่ให้ search engine เก็บ index
  - [ ] แยกให้ชัดจาก **certification exam** (ที่ founder พูดถึงว่าอาจทำเอง) —
    completion = จบคอร์สนี้ · certification = สอบผ่านมาตรฐานที่เราออก คนละน้ำหนัก
    ห้ามให้หน้าตาใบเหมือนกันจนคนเข้าใจผิด

- [ ] **M4 — Lab gate:** เสียบ Crux lab plane (แยก GCP project + budget alarm),
  checkpoint-lab flow + credit meter v0 (ภายใน)
- [ ] **M5 — Commerce + video:** credit ledger จริง + edition/pricing logic +
  payment gateway ไทย (DD เลือก vendor ตอนนั้น) + commit Cloudflare Stream +
  custom player (ห้าม iframe embed ตามเงื่อนไขที่ล็อก)

### Hosting — ยังไม่ตัดสิน (พิสูจน์แล้วว่าไปได้ทั้งสองทาง 2026-08-01)

founder ถามเรื่องย้าย frontend ไป Cloudflare — **ข้อเท็จจริงสำคัญ: ยังไม่เคย deploy
ขึ้น Vercel เลย** จึงไม่ใช่การย้าย แต่คือการเลือกก่อนลงครั้งแรก ต้นทุนตอนนี้ ≈ ศูนย์

พิสูจน์ด้วยการ build + รันบน workerd จริงในเครื่อง (`wrangler dev`):
- ตอนแรกพัง 3 หน้า ด้วยสาเหตุเดียว: `fs.readFileSync is not implemented`
- **แก้ที่ต้นเหตุแล้ว** — เนื้อหาผูกเข้ามาตอน build ผ่าน `registry.generated.ts`
  (`scripts/generate-content-registry.mjs` + เทสกันล้าสมัย) ไม่มีการอ่านดิสก์ตอน
  request อีก **ได้ประโยชน์ไม่ว่าจะเลือกทางไหน**
- ผลล่าสุด: ทุกหน้า 200 บน workerd พร้อมเนื้อหาจริง · `next/og` ใช้ได้ ·
  worker 2.2 KB + assets 1.8 MB (เพดานฟรี 3 MiB)
- `src/lib/content/source.ts` (engine ของ /player ที่เป็น internal-only) ยังอ่าน
  ดิสก์อยู่ — ไม่แก้เพราะ /player ห้าม deploy public อยู่แล้ว **ถ้าจะขึ้น Cloudflare
  จริงต้องกันเส้นทางนี้ออกจาก bundle หรือแปลงให้เหมือนกัน**

ยังไม่ตัดสิน เพราะข้อที่เหลือไม่ใช่เรื่องเทคนิค: **DB อยู่กรุงเทพที่เดียว** หน้าร้าน
เป็น static/SSG หมด (edge ชนะขาด) แต่หน้าที่ล็อกอินแล้วต้องคุย DB ข้ามทวีป
→ ต้องวัดจริงหลัง M3 มี progress ลง DB แล้ว ไม่ใช่เดา (Smart Placement อาจช่วย
แต่ยังไม่ยืนยัน)

### Simulation challenge — โจทย์จำลองหน้าจอจริง (founder เพิ่ม 2026-08-01)

**ปัญหาที่แก้:** อ่านเรื่องตั้งค่า WPA2 / DHCP / GPO จบแล้วยังไม่รู้ว่าหน้าจอจริงหน้าตา
อย่างไร ความมั่นใจไม่เกิด และผู้เรียนเองก็รู้ว่ายังไม่รู้จริง เครื่องจริงก็ไม่มีให้ทุกคน

**ทำแล้ว (v1):**
- contract + engine ตัดสิน: `src/lib/simulation/types.ts` — ตัดสินจาก**สถานะสุดท้าย**
  ไม่ใช่ลำดับการคลิก (ของจริงมีหลายทางไปถึงผลเดียวกัน การบังคับลำดับ = สอนให้ท่องขั้นตอน)
- surface แรก: `network-interface` (หน้า IPv4 properties) — เลือก DHCP แล้วช่องกรอกปิด
  กด OK แล้วได้ค่ามาจาก "เซิร์ฟเวอร์" จริง
- block kind `simulation` ใน content contract + loader validation
- บทเรียน demo: สองโจทย์บนหน้าจอเดียวกันที่**คำตอบตรงข้ามกัน** (print server ต้อง static ·
  laptop ที่ย้ายที่ต้อง DHCP) — สอน "ทำไมถึงมีสวิตช์นี้" ไม่ใช่สอนกรอกฟอร์ม
- โหมด practice (ตรวจซ้ำได้ บอกทีละข้อว่าอะไรค้าง แต่ไม่เฉลยค่า) กับ assessed
  (ตรวจครั้งเดียว บอกแค่ผ่าน/ไม่ผ่าน) — ต่างกันที่ผลตอบกลับ ไม่ใช่ต่างที่หน้าจอ
- คำใบ้โผล่หลังลองเองสองครั้ง และมีเทสคุมว่าคำใบ้ห้ามเฉลยค่าที่ต้องกรอก

**ยังไม่ทำ:**
- [ ] **เอาไปใช้เป็นข้อสอบ prove it จริง** — โหมด assessed มีแล้วแต่ยังไม่ผูกเข้า
      checkpoint/test-out (ต้องขยาย checkpoint ให้รับ item ที่ไม่ใช่ MCQ)
- [ ] surface เพิ่ม ตามที่ founder ยกตัวอย่าง: WPA2/wireless · AD Group Policy editor
      (GPO เป็นตัวที่ต่างจากของเดิมมากที่สุด — ต้องมี tree + properties pane
      น่าจะเป็น archetype ที่สองของระบบ ไม่ใช่แค่ฟอร์ม)
- [ ] คอร์สเครือข่ายจริงที่บทนี้ควรอยู่ (ตอนนี้ฝากไว้ในคอร์ส demo)
- [ ] ให้ Crucible ผลิต simulation ได้ (ตอนนี้เขียนมือใน JSON ของบทเรียน)

### Identity Control — ทิศทางที่ล็อกแล้ว และสิ่งที่ Academy ทำไปแล้ว (2026-08-01)

**ทางเข้ากลางคือ `accounts.cyberskills.co.th`** ทั้งสมัครและเข้าสู่ระบบ · Academy
redirect ไปที่นั่นพร้อม client_id / redirect_uri / state / PKCE / nonce / service_id
แล้วรับ **one-time code + state กลับมาทาง browser เท่านั้น** · backend แลก code ด้วย
PKCE verifier แล้วได้ (issuer, subject, verified email, service_id, nonce,
activation status/revision) · **ไม่มี cookie ระดับโดเมนแม่**

**สี่ชั้นสถานะ และชั้นก่อนหน้าไม่เคยแปลว่าได้ชั้นถัดไป:**
`account exists → service activation → product entitlement → resource authorization`

**Academy เป็นเจ้าของเอง:** academy.users/profile, purchase, invitation, course access,
progress, quiz, certificate, resource authorization
**Identity Control ไม่แตะของพวกนี้** และ **Academy ห้ามค้นหา/รวม/สร้าง identity ด้วย
email เอง**

#### ทำแล้ว
- [x] adapter boundary หลัง interface + fake (`src/lib/identity/`) — fake บังคับกฎเดียว
      กับของจริง (code ใช้ครั้งเดียว · PKCE · redirect_uri ตรงเป๊ะ · หมดอายุ) ไม่ใช่
      stub ที่ตอบ ok เสมอ
- [x] registry ที่**ปฏิเสธ adapter ปลอมบน production ตั้งแต่ตอนเรียก**
- [x] callback route เตรียมไว้ (`/auth/callback`) — ยังไม่ต่อจริง และ**ปฏิเสธ callback
      ที่มี subject/email/token/otp/invite ติดมาใน URL** เพราะนั่นแปลว่าอีกฝั่งผิดสัญญา
- [x] migration 0004: `service_activation` (สำเนาจาก Identity Control พร้อม revision)
      แยกจาก `course_entitlement` (Academy เป็นเจ้าของ) + ฟังก์ชัน
      `has_course_entitlement` เพื่อให้มีคำตอบเดียวที่ทุกเส้นทางใช้ร่วมกัน
- [x] เทส 11 ข้อยืนยันว่า **เปิดใช้บริการสำเร็จไม่ได้ให้สิทธิ์คอร์สใดเลย** ·
      suspended ใช้บริการไม่ได้แต่สิทธิ์คอร์สยังอยู่ (คนละชั้น) · เพิกถอน/หมดอายุ
      ใช้ไม่ได้แต่ยังตอบได้ว่าเคยมี
- [x] session เป็น host-scoped อยู่แล้ว (ไม่มีการตั้ง domain ที่ไหนในโค้ด)
- [x] map ด้วย (issuer, subject) และ email เป็น attribute ที่เปลี่ยนได้ — ทำไว้ตั้งแต่ M3

#### ยังไม่ทำ
- [x] เสียบ activation + `has_course_entitlement` + node prerequisite เข้าเส้นทาง
      lesson/progress/attempt/explanation/practice/reset ผ่าน guard กลาง
- [ ] transaction store ฝั่ง backend (เก็บ state/PKCE verifier/nonce) แล้วต่อ callback
- [ ] `/sign-in` เปลี่ยนเป็น redirect ไป Account Center — **ทำเมื่อ Identity Control
      พร้อมต่อจริงเท่านั้น**
- [ ] adapter ตัวจริงที่คุยกับ Identity Control (รอ P3 provider/persistence + release gates)

#### ⚠️ ข้อขัดสองข้อ — **session identity เป็นคนตัดสิน Academy ปรับตาม** (founder 2026-08-01)

Academy จะไม่แก้สองข้อนี้เอง และไม่แตะ Pool A เพื่อแก้มัน แค่ส่งข้อมูลให้ session
identity ตัดสิน แล้วรอรับผลกลับมาปรับ
- **Academy ถือ `SUPABASE_SERVICE_ROLE_KEY` ของ Pool A** ซึ่งเป็น shared service-role
  ที่ทิศทางระบุว่า "ห้ามถือ" — ใช้เขียนสคีมา `academy` ของตัวเอง
  ทางแก้: สร้าง Postgres role เฉพาะที่ grant แค่สคีมา `academy` แล้วให้ Academy ถือ
  ตัวนั้นแทน (ต้องทำฝั่ง Pool A จึงเป็นงานของ founder/session identity ไม่ใช่ของ session นี้)
- **Pool A ตั้ง `GOTRUE_COOKIE_DOMAIN=.cyberskills.co.th` ไว้แล้ว** ซึ่งขัดกับข้อ
  "ไม่มี shared parent-domain cookie" — cookie ของ Academy เองเป็น host-scoped
  แต่ค่าที่ตั้งไว้ที่ GoTrue ควรถูกทบทวนโดย session identity

#### สิ่งที่ Academy จะต้องรื้อถ้าทิศทางเปลี่ยน
`/sign-in` ของ Academy (รหัส 6 หลักผ่าน GoTrue โดยตรง) เป็นของชั่วคราวและ **ไม่ควร
เปิดใช้บน production** — ดังนั้นการลงแรงทำ rate limiter แบบ distributed ให้ OTP ของ
Academy เองเป็นงานที่จะถูกทิ้ง ความรับผิดชอบนั้นย้ายไปอยู่ที่ Identity Control
(ปรับลำดับงานตามนี้แล้ว)

### ความปลอดภัย — ที่แก้แล้ว และที่ยังเปิดอยู่ (review 2026-08-01)

รีวิวข้ามโมเดลรอบภาพรวม (codex, persona: hostile appsec) แล้วพิสูจน์ทุกข้อด้วยการ
โจมตีจริง ไม่เชื่อรายงานทันที

**แก้แล้ว — CRITICAL:** client ประกาศเองได้ว่า 'เรียนจบ' → ยิง 10 request ได้ครบ
คอร์สโดยไม่ตอบคำถามเลย และมีสิทธิ์ใบรับรอง (พิสูจน์ 10/10 ก่อนแก้ · 0/10 หลังแก้)
ตอนนี้ client ส่งได้แค่ action/answers เซิร์ฟเวอร์ตรวจกับเฉลยเอง + เทสกันย้อนกลับ

**ยังเปิดอยู่ — ต้องปิดก่อนเปิดสมัครจริง:**
- [ ] **HIGH · เดารหัส OTP ได้** — rate limit อยู่ใน memory ของ process และ key มาจาก
      header ที่ปลอมได้; บน Workers แต่ละ isolate มี memory แยก รหัส 6 หลัก = ล้านค่า
      → ต้องใช้ limiter แบบ distributed (KV/DO/Redis) จำกัดทั้ง IP และ email
      และล็อก challenge หลังผิดกี่ครั้ง
- [x] **HIGH · ไม่มี entitlement ต่อคอร์ส** — ปิดใน app paths ด้วย activation +
      entitlement + node prerequisite guard; `/media/*` ยังแยกเป็น launch gate ด้านล่าง
- [ ] **MEDIUM · ไฟล์บทเรียนอยู่ใน public/** — วิดีโอ/PDF โหลดได้โดยไม่ล็อกอิน
      ขัดกับมติ "ต้องสมัครถ้าจะใช้"
- [ ] **MEDIUM · shouldCreateUser:true บน endpoint สาธารณะ** — ยิงอีเมลจำนวนมากได้
- [ ] **MEDIUM · MAX_TRACKED_KEYS ไม่ใช่เพดานจริง** — memory โตไม่หยุดจาก IP ปลอม

### การป้องกันเนื้อหา · refund · เครดิต — ข้อสรุปจากการคุย 2026-08-02

#### จุดยืนที่ founder เคาะ
**ยอมรับว่ากันคนที่อ่านช้าๆ แล้วก๊อปไปเรื่อยๆ ไม่ได้ และไม่เป็นไร** — เพราะคูเมืองจริง
คือ lab + simulation + ใบรับรองที่ verify ได้ + ประสบการณ์ใช้งาน ซึ่ง clone ไม่ได้
เป้าหมายจึงเป็น **"ทำให้การขโมยไม่คุ้ม"** ไม่ใช่ "ทำให้ขโมยไม่ได้" และโฟกัสที่การกัน bot

> ⚠️ **คูเมืองคือ "การร้อยกัน" ไม่ใช่ชิ้นส่วนใดชิ้นเดียว** (founder แก้จุดเน้น 2026-08-02)
>
> lab อย่างเดียวไม่ใช่คูเมือง — แพลตฟอร์มอื่นก็มี lab สิ่งที่ลอกยากจริงคือการที่
> **วิดีโอ + คำถามคั่น + checkpoint + simulation + lab อยู่บนแกนเดียวกัน** โดยมี
> progress และ "หลักฐานว่าพิสูจน์แล้ว" วิ่งผ่านทุกชิ้นและสะสมขึ้นเป็นแผนที่ทักษะเดียว
> คนที่ดูดข้อความหรือวิดีโอไปได้ **ชิ้นส่วน** แต่สิ่งที่เราขายคือ **เส้นทาง**
>
> **ผลต่อลำดับงาน: "รอยต่อที่ยังไม่เชื่อม" มีค่ากว่า "ชิ้นส่วนใหม่"**
>
> รอยต่อที่เชื่อมแล้ว: **checkpoint → course-record gate → แผนที่ความครอบคลุม**
> (W0-3 · ยังไม่ใช่ certificate issuance หรือ skill mastery; W4 ต้อง snapshot
> หลักฐานจริงก่อนออกใบ)
> ⚠️ **คำถามกลางวิดีโอไม่ใช่รอยต่อของแกนหลักฐาน** — มันเป็น *formative* คือมีไว้ให้
> ผู้เรียนตื่นตัวและจับว่าตัวเองเข้าใจผิดตรงไหน ผลถูกบันทึกไว้ใช้ปรับปรุงเนื้อหา
> แต่ไม่ถูกใช้ตัดสินสถานะใดๆ (W0-4 ล็อก) — ถ้าทำให้เป็นด่านจะกลายเป็นการบังคับ
> ให้ดูวิดีโอครบ ซึ่งขัดกับ "แผนที่ ไม่ใช่คิว"
> **รอยต่อที่ยังขาด: simulation (มีโหมด assessed แล้วแต่ยังไม่ต่อเข้า checkpoint) · lab**
> → การทำ simulation surface อันที่สองก่อนต่ออันแรกเข้าแกน = ผิดลำดับ

#### กัน bot — ลำดับที่ตกลง
- [ ] **1. Turnstile เมื่อพฤติกรรมผิดปกติ** (Cloudflare มีให้ใช้อยู่แล้ว) — คุ้มที่สุด
      เพราะเก็บค่าใช้จ่ายจากคนที่น่าสงสัยเท่านั้น คนอ่านปกติไม่เจออะไรเลย
- [ ] **2. ย้าย rate limiter ไปที่เก็บถาวร + วัดความเร็วต่อบัญชี** (ไม่ใช่ต่อ IP —
      เขาล็อกอินอยู่แล้ว และ IP หมุนได้) วัด: บทต่อชั่วโมง · เวลาที่อยู่ในบท ·
      **ความเร็วในการผ่าน checkpoint** ปลดหนี้ in-memory limiter ไปด้วย
- [ ] **3. ลายน้ำต่อบัญชี** — เพื่อสาวกลับได้เมื่อเนื้อหาหลุด (หลักฐาน ไม่ใช่กำแพง)

#### ❌ ตัดสินว่าไม่ทำ: ล็อกบทธรรมดาจนกว่าจะพิสูจน์บทก่อนหน้า
เหตุผล:
- ด่านที่เป็น MCQ **AI ผ่านง่ายกว่าคนรีบๆ ด้วยซ้ำ** จึงกันคนขี้เกียจก๊อปได้ แต่กัน
  AI crawler ที่ตั้งใจได้น้อย
- **เปลี่ยน "ค้าง" ให้เป็น "เลิก"** — วันนี้คนที่ทำ checkpoint ไม่ผ่านยังข้ามแล้วเรียนต่อ
  ได้ ยังอยู่ในระบบ ถ้าล็อกคือติดอยู่บทเดียวแล้วหายไปเลย ราคานี้แพงกว่าประโยชน์

**ทำแทน: เพิ่มความถี่ของ capstone** — capstone ข้ามไม่ได้และต้องตอบถูกทุกข้อโดย
เซิร์ฟเวอร์ตรวจอยู่แล้ว คอร์ส 10 บทที่มี capstone 3 จุดบังคับให้ crawler ผ่านของจริง
3 รอบ ได้ผลใกล้เคียงการล็อกทุกบท แต่ผู้เรียนไม่มีทางตัน
**และเป็นการตัดสินใจเรื่องเนื้อหา ไม่ใช่โค้ด** — แก้ `course.json` ถอยกลับได้ทันที
- [ ] ทดลองกับ Basic OS & Linux: ย้าย capstone จากจุดเดียวตอนจบ เป็น 3 จุด

#### กฎ UX ที่ต้องยึดไม่ว่าจะเลือกทางไหน
**ล็อก ≠ มองไม่เห็น · ล็อก ≠ ไปไม่ถึง**
บทที่ล็อกต้องบอกได้ทุกอย่างที่ใช้ตัดสินใจ (ชื่อ · สาระที่ครอบคลุม · เวลา · **ทำไมล็อก** ·
**ทำอะไรถึงเปิด**) และต้องมีปุ่ม "ฉันรู้เรื่องนี้อยู่แล้ว ขอพิสูจน์เลย" เสมอ
— กลไกเดียวกันแต่ความรู้สึกคนละขั้ว: "ระบบควบคุมคุณ" กับ "เกมบอกด่านถัดไป"
เหตุผลที่สำคัญเป็นพิเศษ: **การแอบดูคือข้อมูลที่ใช้ตัดสินใจ ไม่ใช่ทางลัด** ปิดทางลัด
= ต้องออกแรงหน่อย · ปิดการมองเห็น = "เชื่อฉันไปก่อนสิ" ซึ่งคนละน้ำหนักกับคนที่จะจ่ายเงิน

#### Refund — เสนอไว้ ยังไม่เคาะ
กรอบที่ใช้ได้ไม่ใช่ "คืนของ" (ความรู้คืนไม่ได้) แต่คือ **"เราส่งมอบตามที่สัญญาไหม"**
- ชั้น 1: คอร์สฟรีที่เต็มรูปแบบจริง → ตัดสินใจได้ก่อนจ่าย จนแทบไม่ต้องขอคืน
- ชั้น 2: **คืนเงินได้ตราบใดที่ยังไม่มีบทไหนถูกบันทึกว่าพิสูจน์แล้ว** (ภายใน 14 วัน)
  — เกณฑ์นี้**ใช้ได้เพราะเราวัด "การพิสูจน์" ได้แม่น** ซึ่งแพลตฟอร์มอื่นทำไม่ได้
  (เขาต้องใช้ "ดูวิดีโอไม่เกิน x%" ที่กำกวมและโกงง่าย) และมันตรงกับสิ่งที่เราขายจริง
- ทางเลือก: คืนเป็นเครดิตแทนเงินสด — ตัดความเสี่ยง chargeback
- ⚠️ **ต้องให้คนรู้กฎหมายไทยดูก่อน** — สินค้าดิจิทัลกับสิทธิผู้บริโภคมีข้อกำหนดของมัน

#### เครดิตจากการเรียนจบ — เห็นด้วย ยังไม่เคาะ ทำตอน M5
ให้รางวัลกับ**การพิสูจน์** ไม่ใช่การจ่ายเงิน ซึ่งตรงกับแบรนด์และแพลตฟอร์มอื่นไม่ทำ
เสียบเข้า `course_entitlement` ที่มี `source: 'grant'` อยู่แล้ว ไม่ต้องสร้างระบบใหม่
**สามกับดักที่ต้องกันตั้งแต่ออกแบบ:**
1. **ฟาร์มคอร์สฟรี** — เรียนฟรี 4 แล้วได้คอร์สเสียเงินฟรี = แจกของให้คนที่ไม่เคยจ่าย
   → เครดิตต้องมาจากคอร์สที่จ่ายเงิน หรือให้คอร์สฟรีมีน้ำหนักต่ำมาก
2. **นับเป็นจำนวนคอร์สจะดันให้เลือกคอร์สง่าย** → ถ่วงน้ำหนักตามระดับ และให้เมื่อ
   พิสูจน์ครบเท่านั้น
3. **เครดิตคือภาระผูกพันทางบัญชี** → ต้องมีอายุและเพดานต่อคน
**ตั๋วสอบ cert มีต้นทุนจริง ต่างจากคอร์สที่ต้นทุนส่วนเพิ่มเกือบศูนย์** → แลกได้ทั้งคู่
แต่คนละราคาเครดิต ซึ่งสื่อสารตรงกับความจริงว่าใบรับรองมีค่ากว่า

### Launch gates (ยังมีผลระหว่าง build)

- Rename currency ก่อน public launch · Crucible capacity assessment ก่อน commit
  free-course catalog
- ห้ามเพิ่ม vendor/จ่ายเงิน service ใหม่โดยไม่มี founder decision (streaming/
  payment DD ตอน M5)
- Auth จริง (M3) ต้องมี ADR ecosystem single-account ให้ founder เคาะก่อน

---

## Phase 0 — DEFERRED (founder decision 2026-07-31; กลับมาตอนเคาะ course catalog)

> Lane A ✅ เสร็จ (CAS-005 disputes ปิด, commit `640c8613`) · Lane B ✅ inventory
> เสร็จ (`reports/reviews/channel-inventory-2026-07-31.md`) · เมื่อถึงรอบเคาะ
> course catalog: **founder pitch + poll ผ่าน channels เอง** โดยใช้ brief Lane B
> เป็น input; validation experiments ด้านล่างเก็บไว้เป็นบริบทของรอบนั้น

### Phase 0 — open items (deferred — ไม่ใช่ execution lane ตอนนี้)
- [x] ~~**Resolve the CAS-005 answer-key disputes**~~ — **✅ RESOLVED 2026-07-31**
  (audit → founder เคาะ → แก้ครบ; รายละเอียดใน `completed_log.md` 2026-07-31)
  - Audit: `reports/reviews/cas005-dispute-audit-2026-07-31.md` — 11 disputes
    verify แล้วเหลือเปิดจริง 3 ข้อ (PBQ-010, M4-082, M4-067); อีก 8+1 ปิดโดย
    review loop; ไม่มี key ใดเคยถูกแก้ก่อน founder decision
  - Founder decision (ลายลักษณ์อักษร 2026-07-31): "แก้ตามแนะนำทั้งหมด" —
    PBQ-010 eradication-ก่อน-recovery, M4-082 +D (Map fields), M4-067 +A
    (Sandbox process)
  - Fix ใน Crucible commit `640c8613`: propagate ครบทุก artifact (bank → v2-build
    → SV2/SV1 → suite → generator), verify 29/29 PASS + adversarial review
    CORRECT-AND-COMPLETE
  - ~~เงื่อนไขก่อน public distribution: codex confirm pass~~ — **superseded
    2026-07-31: founder ตัด gate นี้ออกจากแผนแล้ว** (ตัดสินใหม่เฉพาะถ้าจะเอา
    bank ออก public); Crucible push ยังรอ authorization ตามปกติ
- [ ] **Pick a distribution channel** (the real constraint) — **inventory เสร็จ
  2026-07-31 รอ founder เคาะ**: brief 8 ช่องที่
  `reports/reviews/channel-inventory-2026-07-31.md` (corporate probe 4+1 org /
  FB communities ~25–30k / company social page ต้องตั้งใหม่ / instructor pool /
  สกมช / dev communities / events); ข้อค้นพบสำคัญ: เว็บไม่มี analytics —
  traffic วัดไม่ได้จนกว่าจะติดตัว cookieless. Without a channel, expect ~0 signal.
- [ ] **Publish a free sample** (e.g. ~50 questions, spread across domains) on existing infra at ~$0 — static hosting or a page on the current website. Reskin to the cs- dark theme.
- [ ] **Lead capture at ~$0** — capture email (+ one qualifying field: target exam date) at the results screen, value-first (let them finish + see explanations first), instant unlock (no "check your email" delay), PDPA consent checkbox. Store on owned/free infra (self-hosted Supabase or a free form).
- [ ] **Auto-capture behavioral signals** (no extra friction): completion, score, weakest domain, referrer/UTM — these are the honest signals.
- [ ] **Follow-up email sequence** — (1) deliver result + 1-click feedback; (2) separate invite to Academy + STAR waitlist (let them pick interest). Add at least one willingness-to-pay probe (not just "was it useful?").
- [ ] **Direct corporate probe** — approach 2–3 known organizations re: in-house cert/security training (highest-ticket, fastest real signal).

### Phase 0 — gates / acceptance (set thresholds BEFORE running; review against them, do not rationalize)
- Lead volume in N weeks → measures distribution strength.
- Completion / return rate → measures content-experience quality.
- Willingness-to-pay / pre-sell conversion → the only real demand signal.
- Waitlist conversion (Academy / STAR) → demand for the bigger bets.
- **Go / No-go:** define the number for each that justifies moving to Phase 1.

---

## นิยาม Product + โมเดลราคา/สิทธิ์เข้าถึง (draft จาก founder discussion 2026-07-31)

> ส่วนนี้คือ **spec ของสิ่งที่กำลัง build** (execution ตาม
> `plans/platform-build-oneshot-2026-07-31.md`) — อัปเดต 2026-07-31:
> Phase-0-first ถูก supersede โดย founder decision build-first;
> course catalog ยังรอ founder pitch + poll
> ที่มา + market evidence: `completed_log.md` entry 2026-07-31

### แก่นของ product: personalized, interactive, lab-gated

- **Personalized learning path:** ระบบประเมินว่า user รู้หัวข้อไหนแล้ว (quiz +
  คำถาม interactive ระหว่างดูวิดีโอ) แล้วแนะนำ branch — ข้ามสิ่งที่รู้ โฟกัสสิ่งที่ไม่รู้ —
  และ map เส้นทางกับ career goal ของ user
- **หลักการแก่น (founder):** user ไม่ควรต้องเรียนของที่รู้อยู่แล้ว — *walk steadily on
  the path to their future career* ไม่ใช่พายเรืออยู่ในอ่าง fundamental ไม่รู้จบ
  (fundamental ดี แต่ปริมาณต้องเหมาะสมและเกี่ยวข้อง)
- **User override เสมอ:** จะเรียนของที่รู้แล้วก็ได้ / จะข้ามตามคำแนะนำก็ได้ — และทุกการข้าม
  ได้ **cheatsheet สรุป** เพื่อข้ามอย่างมั่นใจว่าไม่ตกหล่นอะไรสำคัญ (แก้ skip anxiety)
- **Lab เป็นส่วนของ learning experience:** ดูวิดีโอ → ตัดเข้า browser-based lab เป็น
  gate ก่อนผ่าน topic — default บังคับ แต่ต้องมีทางออก test-out/skip + cheatsheet เสมอ
  (lab ที่พัง/ช้าสำหรับคนทำงานคือ "อ่าง fundamental" ตัวใหม่ — reliability ของ gate
  คือทั้งหมดของความน่าเชื่อ)
- **Prove-it lab = กลไก trust ของ skip decision:** test-out ด้วยการทำจริงใน lab
  โกงไม่ได้ เดาไม่ได้ — user เชื่อผลโดยไม่ต้องเชื่อแบรนด์ (ปลดล็อก cold-start trust;
  เหนือกว่า quiz-based ของ CertMaster/Pluralsight)
- **ท่าตอบ content piracy:** ไม่ได้กัน screen capture — แต่ย้าย value จาก content
  (ขโมยได้) ไปที่ system (ขโมยไม่ได้): assessment, path เฉพาะคน, lab grading,
  ความสดของเนื้อหา, report — เหตุผลเดียวกับที่ TryHackMe อยู่ได้ทั้งที่ writeup เกลื่อนเน็ต

### โมเดลราคา + สิทธิ์เข้าถึง

| ชั้น | นโยบาย |
|---|---|
| **Free tier — ขยาย (founder 2026-07-31):** N+, Sec+, ISC2 CC, Basic Linux, Basic Programming | **ฟรีเต็มรูป — ให้หมดทุก feature** (video, practice, lab, cheatsheet, personalized path): เป็น **เครื่องจักรโฆษณา** — "ถ้าของฟรีดีครบเครื่องขนาดนี้ ของจ่ายตังจะขนาดไหน"; ทิ้งตลาด entry-cert commodity (Udemy/Messer) ให้เป็นสนามโฆษณา แล้วให้ paid เหลือแต่ขั้นสูงที่ trust ถูกแก้แล้ว; guardrail เดียว: **lab ผ่านแต้มฟรีรายเดือน** (precedent: Skills Boost 35 credits/เดือน — กัน abuse + เพดานต้นทุน + สอนผู้เรียนรู้จักแต้ม); ต้นทุน ~$0.3–0.5/free active/เดือน (~10–17฿) ถูกกว่า CPC โฆษณา แต่ได้คนเรียนจริง + email + skill data; **release ทีละตัว ไม่พร้อมกัน — founder ยืนยัน ("ค่อยๆเรียกแขก")**: แต่ละคอร์สฟรี = campaign เรียกแขกหนึ่งรอบ (ลำดับเสนอ Basic Linux → N+, รอ founder เคาะ); **refresh วนตาม cert cycle (N+/Sec+ edition ใหม่ ฯลฯ) = ค่าโฆษณา — founder ยอมรับเป็น recurring marketing cost โดยเจตนา** (ออกครบ 5 แล้ววนกลับมาอัปเดตตัวแรกต่อ; ทุก refresh = re-marketing event "อัปเดตล่าสุด" ที่เป็น trust signal ด้วย); Crucible capacity assessment ยังต้องทำเพื่อ size ภาระ (ไม่ใช่เพื่อ justify); หมายเหตุ ISC2 CC: ISC2 แจก training ฟรีเองอยู่ (1M Certified) — ของเราชนะด้วย lab + path |
| Path / Premium / Cert course (เช่น AI Secure Coding, CISSP) | ซื้อขาดต่อ **edition**, access **3 ปีเต็ม — เลขเดียวทั้ง catalog** (ล็อก final 2026-07-31), update ย่อยฟรีภายใน term, โชว์วันที่ "อัปเดตล่าสุด" ชัดเจน |
| หน่วยขายหลัก | **Path/Track** — fundamentals ที่เกี่ยวข้องรวมอยู่ข้างใน (access clock inherit จาก path ที่ซื้อ) |

- **บันไดราคา paid (placeholder รอ WTP probe — discussion 2026-07-31):** เมื่อ
  entry certs ย้ายไปฟรีหมด paid เหลือขั้นสูง: CySA+/Pentest+ ~3,990–4,990฿ ·
  SecurityX/CASP+ ~5,990–6,990฿ · CISSP ~6,990–7,990฿ · trend courses
  ~2,990–4,990฿ · B2B seat 2–3× + lab-verified skill report; anchor ตลาด
  verified 2026-07-31: CertMaster Learn+Labs ≈ $489/12 เดือน, Dion Udemy
  ~$15–30 sale, Dion direct $39–69/เดือน; unit cost ต่อผู้เรียน/คอร์ส ≈ 170–280฿
  → margin ~90% (ก้อนจริงคือ content freshness)
- **Edition clock:** course ผูก cert ใช้รอบของ cert vendor (~3 ปี); fundamentals/trend
  course ใช้ major-version ของเราเอง (ยกเครื่องใหญ่ = edition ใหม่; patch เล็ก = free update)
- **ตัวเลข access — ล็อก final 2026-07-31: 3 ปีเต็ม เลขเดียวทั้ง catalog**
  - เหตุผล (founder): **เอาให้ง่าย** — คำสัญญาเดียว ประโยคเดียว ไม่มีกติกาซ่อน;
    3 ปีครอบหนึ่ง cert cycle เต็ม (~3 ปีทั้ง CompTIA/ISC2) → ไม่มีเคส "ซื้อซ้ำ
    ของเดิมทั้งที่เนื้อหายัง current" โดยธรรมชาติ
  - เทียบ official (verified 2026-07-31): CompTIA CertMaster = 12 เดือนหลัง activate;
    ISC2 self-paced = 90–180 วัน → 3 ปีของเรา = 3 เท่า CompTIA, 6–12 เท่า ISC2
  - ทางเลือกที่พิจารณาแล้วไม่เอา (บันทึกไว้ใน `completed_log.md`): "การันตี 2 ปี +
    auto-extend จนจบ edition" — ปลอดภัยเชิง ratchet กว่า แต่ซับซ้อนกว่า; founder
    เลือกความง่ายและยอมรับว่าเลข 3 ที่ประกาศแล้วจะลดทีหลังไม่ได้
  - เคส edition อายุยาวกว่า 3 ปี (ถ้าเกิด): ต่ออายุให้ฟรีเป็น goodwill รายกรณี —
    ไม่ต้องเป็นนโยบายประกาศ

### เศรษฐศาสตร์ lab: ระบบแต้ม (academy currency)

- **ชื่อ currency: working name = "credit/เครดิต" (ชั่วคราว — ล็อก 2026-07-31):**
  founder ยังไม่ถูกใจชื่อนี้ ตั้งใจเปลี่ยนทีหลัง → **ต้อง rename ก่อน public launch
  เท่านั้น** (เปลี่ยนชื่อ currency หลังมี user จริง = แพงทั้ง UX/docs/ความเชื่อมั่น);
  ชื่อที่เสนอแล้วไม่ผ่าน: UP/Delta/Fuel/Creds/Zenith/ก้าว/Spark/Scala —
  บทเรียน filter: ทุกชื่อต้องรอดประโยคไทย "เติมเงิน 100 ___" โดยไม่ขำ/ไม่กำกวม
- ซื้อ course ได้แต้มติดมา (~100 เป็นเลขแนวคิด) — **calibrate ให้พอ "ทำ lab จบคอร์ส +
  ทำซ้ำทั้งคอร์สได้ 1–2 รอบ"** จากต้นทุนวัดจริงตอน pilot ไม่ใช่จากความรู้สึก
- แต้มหมดซื้อเพิ่มได้ที่ **ราคา ~ต้นทุน infra** — ไม่ใช่ profit line ("คนต้องการเวลาเพิ่ม
  ช่วยแบกค่า infra") — สื่อสารนุ่มๆ ไม่ประกาศ "at cost" เป็นคำมั่นแข็ง (เผื่อ payment fee + buffer)
- **กัน struggle tax / credit anxiety** (คนเรียนอ่อนต้องไม่จ่ายแพงกว่า):
  คิดแต้มต่อ "ครั้ง" ไม่ใช่ต่อชั่วโมง (มีเพดานเวลา + idle auto-stop), **ทำจบได้แต้มคืน
  บางส่วน** (แบบ HTB cubes — Tier 0 คืน 100%, tier สูงคืน ~20%), UI โชว์ "แต้มพอสำหรับ
  lab ที่เหลืออีก ~X รอบ" ไม่โชว์เลขดิบเป็นหลัก
- **แต้ม = abuse defense ในตัว** — idle VM / crypto mining เผาแต้มตัวเอง ไม่ต้องมีระบบตรวจจับซับซ้อน
- **นาฬิกาแต้ม = นาฬิกา access เดียวกัน** (จบปัญหา liability แต้มค้างท่อทางบัญชี);
  upgrade แล้วแต้มค้างยกยอดตาม + ได้แต้มก้อนใหม่ของ edition ใหม่
- **Fixed cost ที่เดินตลอดไม่ว่ามีลูกค้าไหม:** platform floor (เล็ก), video
  storage/streaming (มี floor ไม่แพง), **content freshness = ก้อนใหญ่จริง เป็นเวลา
  มนุษย์/Crucible ไม่ใช่ค่า server** → fund ด้วยยอดขายต่อเนื่อง + B2B ไม่ใช่ค่า access

### นโยบาย upgrade ข้าม edition (pro-rata + floor + free window)

- **ส่วนลด = floor ศิษย์เก่า (~25–30%) + ส่วนเพิ่มตามสัดส่วนเวลา access ที่เหลือ** —
  ซื้อปลาย edition เหลือเวลาเยอะ = ลดเยอะ (founder: กันความรู้สึก "หลังหัก");
  access หมดแล้วก็ยังได้ floor (ศิษย์เก่าที่จ่ายเต็มมาแล้วต้องไม่ได้ 0%)
- **Free-upgrade window:** ซื้อภายใน ~6 เดือนก่อน edition ใหม่ออก → ได้ edition ใหม่
  **ฟรี** — ไม่ใช่แค่ fairness แต่กัน **Osborne effect** (cert vendor ประกาศ retire exam
  ล่วงหน้าเป็น public → ตลาดรอ → ยอดขายแข็งตาย; "ซื้อวันนี้ได้ edition ใหม่ฟรี" ทำให้ช่วง
  transition ขายต่อได้ปกติ)
- Upgrade = เริ่มนาฬิกา access ใหม่บน edition ใหม่; edition เก่ายังเข้าได้จนครบ term เดิม
- **กัน sale-stacking:** ช่วง transition window ไม่จัด sale — ราคาเต็ม + แถม edition
  ใหม่ฟรี คือดีลของช่วงนั้น (ทางเลือกซับซ้อนกว่า: คิดส่วนลดจากราคาที่จ่ายจริง)
- **ประกาศสูตรเป็น public บนหน้า pricing** — เป็นจุดขาย + ตัด negotiate รายเคส +
  เข้าชุด brand โปร่งใสทั้งเส้น (แต้มราคาต้นทุน / วันที่อัปเดต visible / สูตร upgrade เปิดเผย
  = เรื่องเดียวกัน: *platform ที่ไม่หลังหักผู้เรียน*)
- ตัวเลขทั้งหมด (floor %, window, สูตร linear) = **placeholder ตัวอย่าง** รอ calibrate

### Implementation direction — ล็อก 2026-07-31: DIY "build the core, buy the plumbing"

- **ไม่ซื้อ hosted LMS** — product ที่ล็อกไว้ (path engine, prove-it lab gate, ระบบแต้ม,
  edition/pro-rata pricing) **ไม่มีขายใน platform ไหน**; hosted LMS ครอบแค่ส่วน
  commodity (วิดีโอ+quiz) แล้วยังต้อง build ส่วนที่เป็น product ล้อมมันอยู่ดี =
  จ่ายสองต่อ + vendor lock
- **Build:** path engine, credit ledger, edition/pricing logic, course player UX, admin
- **Reuse (มีแล้ว):** lab plane จาก Crux (shared capability), self-hosted Supabase
  (auth+DB), cs- design system, Crucible content pipeline
- **Buy เป็น service (จ่ายตามใช้):** video streaming (signed URL พอ ไม่ต้อง DRM หนัก —
  ยุทธศาสตร์ย้าย value ออกจากวิดีโอแล้ว; candidates เช่น Bunny/Cloudflare Stream —
  **ยังไม่เลือก** ต้อง due-diligence ตอนใช้จริง), payment gateway ไทย (candidates เช่น
  Stripe/Opn/2C2P — **ยังไม่เลือก**)

### Infra direction — founder เคาะ 2026-07-31

- **Phase 0 web = Vercel (ล็อก):** `academy.cyberskills.co.th` CNAME (Cloudflare) →
  Vercel region `sin1` (ใกล้ Supabase self-host; pattern เดียวกับ product อื่น);
  admin/preview ครอบ Cloudflare Zero Trust Access จนกว่าจะพร้อม public
- **DB = Supabase self-host เดิม** (leads + consent PDPA + signals; ต่อไปคือ auth/
  credit ledger/progress ตาม ADR) — video/ไฟล์หนักไม่เข้า DB เด็ดขาด (object
  storage + CDN เท่านั้น; DB เก็บ metadata + token)
- **Video (post-gate) = managed stream, Cloudflare Stream เป็น front-runner**
  (founder อนุมัติแบบมีเงื่อนไข): **เงื่อนไข interactive video ต้องไม่เสีย** —
  verified 2026-07-31: Stream เสิร์ฟ HLS/DASH manifest มาตรฐาน + signed token
  ให้ custom player ได้ (hls.js/Video.js/Shaka/AVPlayer/ExoPlayer) → ชั้น
  interactive (pop-up คำถาม, pause ที่ cue point, กัน seek ข้ามคำถาม) เป็น player
  logic ฝั่งเรา ไม่ผูก vendor; **design guard: ห้าม build lesson player บน iframe
  embed ของ Stream** — ต้องเป็น custom player เสพ manifest; ตัวเลข pricing
  (verified 2026-07-31: $5/1,000 นาทีเก็บ + $1/1,000 นาทีส่ง, encode ฟรี)
  re-verify อีกครั้งตอน commit จริง; Bunny ยังเป็น fallback ได้เพราะ HLS มาตรฐาน
  เหมือนกัน
- **Lab = GCP — ล็อก (founder 2026-07-31):** ใช้ shared lab plane จาก Crux ต่อ
  ("ไม่อยาก rebuild ทุกอย่างใหม่หมด") — แยก GCP project + budget alarm ของ
  Academy; credit ledger เป็นตัว meter ต้นทุน
- **Course assets ที่ไม่ใช่ video** (lab images, ไฟล์แจก) = R2 (egress ฟรี);
  DB backup → R2 ตาม pattern ปัจจุบัน; RDC คงบทบาทเดิม (host self-host stack)
- **Cloudflare cost model (verified จาก official docs 2026-07-31):** Stream
  storage = **prepaid capacity** ซื้อเป็นบล็อก $5/1,000 นาที content (นับความยาว
  video ไม่เกี่ยว resolution; encode+ingress ฟรี), delivery = $1/1,000 นาทีที่ถูกดู
  (นับ HLS/DASH/player ทุกแบบ); **ไม่มี free allowance** (ข้อมูล blog ภายนอกที่ว่า
  Pro/Business แถมนาที — ไม่อยู่ใน official docs, อย่าใช้วางแผน)
  - สูตร: ค่า Stream/เดือน ≈ ⌈นาที catalog/1,000⌉×$5 (ช่วงที่ catalog โต) +
    (ผู้เรียน active × นาทีดูเฉลี่ย)/1,000 × $1
  - ตัวอย่าง: pilot (catalog 10 ชม., 50 คน×200 นาที) ≈ **$15/เดือน**; growth
    (30 ชม., 200 คน×300 นาที) ≈ **$70/เดือน**; scale (60 ชม., 500 คน×400 นาที)
    ≈ **$220/เดือน** — ต้นทุน video ต่อผู้เรียน ~$0.2–0.4/คน/เดือน จิ๋วเทียบราคา
    คอร์สซื้อขาด; personalized path ยิ่ง skip มาก delivered minutes ยิ่งลด = ถูกลง
  - R2 (assets/backup): ~$0.015/GB/เดือน, egress ฟรี; Zero Trust Access ใช้
    free tier ได้ถึง ~50 seats (ตรวจ plan จริงตอน setup); Phase 0 ไม่มี video
    → ค่า Cloudflare ส่วนเพิ่ม ≈ $0
- **หมายเหตุประวัติ (เขียนก่อน build-first):** เดิมเฟรมว่า "ไม่ขัด
  validate-before-invest" เพราะ recurring ~ศูนย์ — ตอนนี้ founder เคาะ
  build-first แล้ว (2026-07-31) ประเด็นนี้จบ; ลำดับ build เดิมที่บันทึกไว้:
  1. Slice แรกของ stack จริง = ตัว Phase 0 เอง (placement test + free sample +
     lead capture บน foundation จริง ไม่ใช่ของ throwaway)
  2. ผ่าน gate → build ต่อบน foundation เดิม: course player → lab gate (เสียบ Crux
     capability) → credit + payment — ไม่มีจังหวะย้ายบ้าน

### Auth — ทิศทาง: single account ทุก product (founder 2026-07-31)

- **Requirement:** user มี 1 account เข้าได้ทั้ง Crux, STAR, Academy, **Forge**
  (และ product อนาคต) — ยกระดับจากหลัก "single email-based identity" เดิมใน
  `AGENTS.md` เป็น cross-product identity จริง
- **นี่คือ decision ระดับ ecosystem ไม่ใช่ของ Academy คนเดียว** — แตะ STAR (มี login
  เดิม) และ Crux (มี auth-transport threat model + zero-friction ILT flow ที่ห้ามพัง)
  → ต้องยกเป็น **ADR ระดับ director/ecosystem ก่อนเริ่ม build auth จริง** (open item)
- แนวทางที่ ADR ต้องประเมิน (ทั้งหมดเป็น candidates — **ยังไม่เลือก**): shared issuer
  บน self-hosted Supabase Auth ที่มีอยู่ / dedicated self-hosted OIDC IdP /
  ทางเลือกอื่นตาม due diligence ณ วันทำจริง
- **สิ่งที่ทำได้เลยราคาถูก (ไม่ต้องรอ ADR):** Phase 0 lead capture ใช้ **email เป็น
  identity key** ตั้งแต่วันแรก; ออกแบบ Academy auth ให้ **consume external issuer ได้**
  (ไม่ hardcode auth ผูกกับตัวเอง)
- **ข้อควรระวังใน ADR:** PDPA — identity ข้าม product = PII ใช้ร่วม, consent ต้องครอบ;
  migration path ของ account เดิมใน STAR; ห้ามเพิ่ม friction ให้ Crux ILT onsite flow

### ขอบเขต ecosystem (ห้ามเบลอ)

- **Crux = ILT-only ใช้ภายใน ไม่ขาย** (ล็อกใน crux `context/product-direction.md`) —
  Academy ใช้ **หลักการ + lab-plane capability** (zero-install browser lab, per-learner
  VM/container, money-safety teardown discipline) ผ่าน decision ใหม่ ไม่ยืด Crux เป็น
  Academy backend
- **เส้นแบ่งกับ STAR (ต้อง record เป็นลายลักษณ์อักษรตอน planning):** Academy =
  "checkpoint lab" (สั้น, guided, ผูก topic, หลักนาที) vs STAR = "scenario lab"
  (cinematic, story-driven, immersive) — คนละ granularity เติมกัน
- ภาพระยะยาว: lab plane เป็น **shared capability ตัวเดียว** เสิร์ฟ 3 ทาง — Crux ILT,
  Academy checkpoint labs, train-the-trainer lab seats (ลงทุนก้อนเดียวใช้สามทาง)
- **ผลต่อ Phase 1 platform decision:** hosted-LMS ล้วนไม่พอ (ทำ lab-gated แบบนี้ไม่ได้
  native) → lab plane ควรเป็น **service แยกที่ embed ได้** (iframe/LTI) —
  content / delivery / lab แยกชั้น ไม่แต่งงานกับ platform ไหน
- **B2C↔B2B ใช้ primitive เดียวกัน:** credit ledger = ระบบคิดเงิน lab seat ฝั่ง
  corporate/train-the-trainer; pitch "lab-verified skill report ของทีม" แรงกว่า quiz-based

### Guards เชิงกลยุทธ์ (อย่าหล่น)

- **Distribution + trust ยังเป็น binding constraint** — build-first (founder
  2026-07-31) แก้ฝั่ง product ไม่ใช่ฝั่ง distribution; การลงทุน content ต่อ
  course ยังต้องรอผล pitch + poll ของ founder — ห้าม commit catalog เอง
- **Phase 0 synergy (ทดสอบ concept ได้เกือบฟรี):** reframe free CAS-005 sample เป็น
  **"placement test — รู้จุดอ่อนใน 30 นาที ไม่เสียเวลาเรียนของที่รู้แล้ว"** แล้ววัดว่า
  messaging ไหนดึง lead กว่า = validation ของ desirability จากพฤติกรรมจริง;
  corporate probe pitch "ทำ skill-gap diagnostic ให้ทีมฟรี ได้ report"
- **บทเรียน Knewton:** ห้ามขาย "AI-personalized" เป็น headline — ขาย outcome
  ("ถึงเป้าเร็วขึ้น ไม่เรียนซ้ำของที่รู้"); user override เสมอ
- **ภาระ content factory:** granular content + tag + branch + cheatsheet ต่อหน่วย
  ทำให้โจทย์ฝั่ง Crucible โตขึ้นหลายเท่า — ยังไม่ได้ประเมิน; **ต้องประเมินก่อน
  commit "course catalog/เนื้อหา"** (ไม่ block การ build platform ซึ่ง
  content-agnostic — founder เคาะ build-first 2026-07-31)
- CAS-005: disputes ปิดครบแล้ว (Crucible `640c8613`); gate ก่อน public ถูกตัด
  จากแผนโดย founder 2026-07-31 — ตัดสินใจใหม่เฉพาะเมื่อจะเอา bank ออก public จริง

### Open items ของโมเดลนี้ (รอ founder / รอ pilot)

- [x] ~~ล็อกเลข access term สุดท้าย~~ — **ล็อก final 2026-07-31: 3 ปีเต็ม
  เลขเดียวทั้ง catalog** (เหตุผล: ความง่าย — คำสัญญาเดียวไม่มีกติกาซ่อน;
  ดูรายละเอียดในส่วนโมเดลราคา)
- [ ] Rename academy currency ก่อน public launch (working name ชั่วคราว = "credit"
  — founder ไม่ชอบ; ดูรายชื่อที่ตกรอบ + filter ในส่วนระบบแต้ม)
- [ ] Calibrate ตัวเลขจริงจาก pilot ที่มีต้นทุนวัดจริง: แต้มต่อ lab, แต้มแถมต่อ course,
  ราคา top-up, floor %, free-upgrade window
- [ ] นิยามเส้นแบ่ง Academy checkpoint lab vs STAR scenario lab เป็นลายลักษณ์อักษร
- [ ] ตรวจข้อกฎหมาย/consumer protection ไทยเรื่อง prepaid credit + วันหมดอายุ
  ก่อนประกาศนโยบายจริง
- [ ] ยก **ADR ระดับ director/ecosystem: single account ทุก product** (Crux + STAR +
  Academy + Forge) ก่อนเริ่ม build auth จริงของ Academy — ประเมิน shared issuer vs
  dedicated IdP, PDPA consent scope, migration ของ account เดิมในแต่ละ product,
  ห้ามพัง Crux zero-friction ILT

---

## Phase 1 — Platform decision (**superseded 2026-07-31** — ตัดสินครบแล้ว: DIY + build-first; เก็บไว้เป็นประวัติ)
- [x] ~~Decide delivery platform: hosted LMS vs DIY~~ — **ล็อก 2026-07-31: DIY
  "build the core, buy the plumbing"** (ดู Implementation direction ด้านบน +
  `completed_log.md` entry 2026-07-31); ~~build เรียงหลัง Phase 0~~ →
  **build-first ตาม founder decision 2026-07-31** (ดู Build roadmap ด้านบน)
- ~~If hosted LMS: free-trial test against hard requirements~~ — superseded
  (ไม่ใช้ hosted LMS แล้ว); hard requirements เดิม (multi-answer grading,
  per-question explanation rendering, question pools/timed/retake, PBQ UX)
  ย้ายไปเป็น requirement ของ course player ที่ build เอง
- [ ] Stand up `academy.cyberskills.co.th` (CNAME) — ปลดล็อกแล้ว (platform =
  DIY ล็อก 2026-07-31); เป็น external checkpoint ใน
  `plans/platform-build-oneshot-2026-07-31.md` §5

## Phase 2 — Catalog build (gated by **course-catalog decision** — founder pitch + poll; platform decision ปิดแล้ว)
- [ ] Import the CAS-005 bank (portable content → chosen platform; no re-authoring).
- [ ] Freemium gate ladder: free sample → paid full bank + study guides → live cohort → corporate in-house quote → waitlists.
- [ ] First trend course pilot (pick one with demand signal: Agentic AI security / Risk / ISO / basic pentest / cryptography).

## Parallel strategic track — Train-the-Trainer / Instructor Business-in-a-Box

This is **not a replacement for the learner-facing Academy**. Keep the original B2C / B2B learner path alive. This track is a parallel B2B/B2B2C wedge: sell commercial teaching capability to instructors, training centers, universities, bootcamps, and consultants who want to launch cert-prep classes quickly.

Deep market research, competitor analysis, pricing model, and validation gates: `reports/train-the-trainer-market-research-2026-06-10.md`.

### Concept

Package CYBERSKILLS Academy content as a **commercially licensed trainer starter kit**:
- Instructor kit: teaching notes, lesson plan, timing plan, slide deck, instructor script, lab setup guide, facilitation tips, common student questions.
- Student kit: workbook, handouts, lab guide, practice questions, mock exam, explained answers.
- Online subscription labs: cohort-ready lab seats, updated as tools/exam objectives change.
- Trainer prep: on-demand videos that teach the instructor how to teach the course quickly.
- Update subscription: continuously refreshed slide, lab, mock exam, and transition guide when exam versions/objectives change.
- Launch assets: course outline, landing-page copy, sales brochure, pricing guidance, certificate template.
- Commercial license: explicit right to use the content in paid classes, subject to license limits.

### Value proposition

- Help instructors start a new training business faster.
- Let instructors bring themselves + capital; CYBERSKILLS supplies the courseware, labs, mocks, and teaching system.
- Shorten time-to-revenue: buy the kit, get teaching-ready assets immediately.
- Give small training providers a credible course catalog without building content from zero.

### Business model

- Subscription for updated courseware, labs, mock exams, and trainer-prep videos.
- Commercial teaching license by instructor, cohort, institution, or student-seat tier.
- Optional lab-seat usage pricing for cohorts.
- Possible higher-touch tier: CYBERSKILLS reviews/approves instructors and provides delivery QA.

### Phase 0 validation path

- [ ] Identify 10-20 real prospects: independent instructors, corporate trainers, universities, bootcamps, and small training centers.
- [ ] Create a 1-module sample kit + product one-pager + draft commercial license; do **not** build a full platform first.
- [ ] Test willingness to pay with paid pilot, LOI, or deposit. Interest without money is not a go signal.
- [ ] Validate legal/IP/trademark constraints for each target certification before public positioning; do not imply official authorization unless formally authorized.
- [ ] Compare this track against learner-facing Academy signals after the first validation cycle; both can proceed if the channel and maintenance load are justified.

### 5-Direction Design Check

**Forward:** Add a parallel instructor-enablement offering that packages Academy assets into a commercial courseware + labs + trainer-prep subscription. Success is not a built platform; success is validated instructor/training-center willingness to pay.

**Reverse:** Runtime buyer flow: instructor sees offer → reviews sample module/license → pays pilot/deposit → receives courseware/lab access → teaches cohort → reports usage/feedback. Outputs needed: license terms, content package, lab-seat rules, update cadence, QA expectations.

**Top:** This complements learner-facing Academy and STAR. Academy content remains the source package; STAR-style labs can become optional cohort lab seats. It must not blur into official certification-provider training unless CYBERSKILLS has authorization.

**Bottom:** Maintenance cost is real because exam objectives, slides, labs, and mock explanations must stay current. Start with one cert/module sample before any recurring platform or full catalog commitment.

**Left-Right:** Alternative considered: keep only direct-to-learner Academy. Not chosen as the only path because instructor licensing can create higher willingness-to-pay and distribution leverage. Tradeoff: higher legal/QA burden, but potentially stronger B2B revenue and faster channel access.

---

## Known risks / weaknesses (evidence-backed)
- **Distribution is the binding constraint**, not product quality — unvalidated.
- Open-market standalone sale probability is **low** (commodity market, strong incumbents, cold-start trust).
- ~~CAS-005 answer-key disputes~~ — **ปิดครบ 2026-07-31** (founder เคาะ + fix
  ใน Crucible `640c8613`); confirm-pass gate ถูกตัดจากแผน (founder 2026-07-31)
  — พิจารณาใหม่เฉพาะถ้าจะเอา bank ออก public; push Crucible ตาม authorization ปกติ.
- Recurring-cost trap: committing to a paid platform before demand = capital burn + sunk-cost pressure.
- Content source (Crucible) and delivery (Academy) must stay decoupled or migration cost balloons.

---

## Backlog ที่ founder สั่งจดไว้ (ยังไม่ทำ — 2026-08-01)

- [ ] **Progressive mode ของ realistic practice test (แบบ CISSP CAT):** เดินหน้า
  อย่างเดียว ย้อนกลับไปแก้ข้อที่ตอบไปแล้วไม่ได้ — เป็นโหมดเพิ่มเติมจากโหมดปกติ
  ที่มีอยู่ (ปัจจุบัน nav ข้ามไปมาได้อิสระ) ต้องคิดเรื่อง: กติกาการ flag/review
  ที่ยังเหลือ, การบันทึก attempt ที่ย้อนไม่ได้, และการสื่อสารให้ผู้เรียนรู้ตัว
  ก่อนกดยืนยันแต่ละข้อ
- [ ] **UI ของหน้า practice test ต้องรื้อ** — founder ระบุ 2026-08-01 ว่า
  "ค่อนไปทางไม่ชอบ" แต่ให้ทำตัวหลัก (course experience) ก่อน; ตอนรื้อให้ยึด
  visual language ชุดใหม่ของ Academy ที่ทำไว้แล้ว

## Strategic backlog (speculative — NOT execution lane)
- On-demand video course library (Coursera-style) — the larger build; validate via waitlist first.
- Additional cert tracks beyond CAS-005.
- Subscription/membership model across the catalog.
- Cross-sell into other CYBERSKILLS services (SAT, TTX/PhalanX, pentest, SOC) via nurture.
- Corporate B2B training packages (likely the largest revenue line).
- Single learner identity / account unifying bank + courses + waitlists.
