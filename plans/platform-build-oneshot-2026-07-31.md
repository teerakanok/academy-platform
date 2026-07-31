# Academy Platform — One-Shot Build Plan (สำหรับ execution session ถัดไป)

**วันที่แผน:** 2026-07-31 (rev 2 หลัง RIL รอบ 1) · **สถานะ:** รอ founder สั่ง execute ("one shot")
**ผู้อ่านหลัก:** agent ที่จะ execute แบบ one shot + founder (approve แผน)
**Provider-neutral:** แผนนี้ไม่ผูก provider/model ใด — กลไก review lane จริงให้เป็นไปตาม
runtime ของ session ที่ execute (นโยบาย director-level กำหนดเครื่องมือ)
**ที่มา decision:** `plans/completed_log.md` entry 2026-07-31 (build-first; Phase 0 defer;
ตัด CAS-005 gate) + `plans/active_plan.md` ส่วน Build roadmap

---

## 0) กรอบที่ล็อกแล้ว (ห้าม deviate โดยไม่มี founder decision ใหม่)

| เรื่อง | ค่า |
|---|---|
| Implementation | DIY "build the core, buy the plumbing" — ไม่ซื้อ hosted LMS |
| Web (Phase แรก) | Vercel region `sin1` · CNAME `academy.cyberskills.co.th` (Cloudflare) · Zero Trust ครอบทุกหน้า จนกว่า founder สั่ง public |
| DB | Supabase self-host **Pool A** (`https://supabase.cyberskills.co.th`) — schema ใหม่ `academy` เท่านั้น; video/ไฟล์หนักห้ามเข้า DB |
| Lab (M4) | GCP ต่อ — reuse Crux lab plane (`products/cyberskills/crux-lms/product/services/lab-plane/`); แยก GCP project + budget alarm |
| Video (M5) | Cloudflare Stream front-runner **แบบมีเงื่อนไข**: custom player บน HLS/DASH + signed token — **ห้าม build บน iframe embed** |
| Content | Crucible portable JSON เท่านั้น (content-agnostic; ไม่ re-author ต่อ platform) |
| Design | `@cyberskills/tokens` (`cs-` prefix), dark terminal + teal ตาม brand |
| Auth ทิศทาง | single account ทุก product — **ADR ecosystem ต้องมี draft ให้ founder เคาะก่อนลงมือ M3 (auth จริง)** |
| การเงิน | ห้าม subscribe/จ่าย service ใหม่ทุกชนิดใน one-shot; payment + streaming เลือก vendor ตอน M5 พร้อม DD ใหม่ |
| Course catalog | **ยังไม่เคาะ** — founder จะ pitch + poll ผ่าน channels เอง (Lane B brief = input); ทุกอย่างที่ build ต้องไม่ hardcode course ใด |
| Governance | `AGENTS.md` ของ repo นี้ปรับเป็น build-first แล้ว (2026-07-31) — ถ้าเจอเอกสารเก่าที่ยังพูด "validate ก่อน/no build" ให้ถือ `AGENTS.md` + แผนนี้เป็น canonical |

---

## 1) เป้าหมาย one-shot รอบแรก (สโคป = M1 + M2 + M3-prep)

**Definition of done ของ one-shot:** จบ session แล้ว repo นี้มี web app ที่
`npm run build` + lint + unit + e2e ผ่านทั้งหมดบนเครื่อง, render หน้า Academy
จริงด้วย cs- theme, มี **course player ที่ทำข้อสอบ/ดู explanation ได้จริง** จาก
fixture Crucible (internal เท่านั้น), มี lead capture + PDPA consent ทำงานกับ
local Supabase, มี ADR draft เรื่อง single-account, และ `PENDING_USER_ACTION.md`
รวบรวม external steps ครบ

**นโยบาย network ระหว่าง run (ตัดความกำกวม):**
- **อนุญาต:** ดาวน์โหลด dependency ปกติของงาน dev — npm registry, Docker image
  pull (local Supabase), Playwright browser download, อ่าน official docs
- **ห้าม:** ทุก action ที่ mutate external service/account — Vercel, Cloudflare
  (DNS/Zero Trust), GCP, prod DB (`supabase.cyberskills.co.th` / `ssh-db`),
  ส่ง email, โพสต์, สมัคร service, จ่ายเงิน, และ **ห้าม publish owner update**
  (ผลงานรายงานผ่าน handoff เท่านั้น — Founder Updates gate ไว้ session ที่มี founder)

**สิ่งที่อยู่นอกสโคป one-shot (ห้ามทำ):** deploy จริง, external ทุกข้อใน §5,
M3 auth จริง, M4, M5, push ไป remote (เว้นแต่ order ของ founder ระบุ),
แตะ repo อื่น (director / Crucible / website — อ่านได้ แก้ไม่ได้)

**สถานะจบ run ที่ยอมรับได้:** `COMPLETE` (ทุก acceptance ผ่าน) หรือ
`INCOMPLETE` (ระบุ milestone ที่ไม่จบ + failing evidence) — **ห้ามรายงาน
milestone ที่ข้าม/หยุดเป็น "เสร็จ" และห้าม tick ใน active_plan** (ดู §6)

---

## 2) โครงสร้างที่จะสร้าง

```
academy-platform/
├── academy-web/                  # Next.js app (ใหม่ทั้งหมด)
│   ├── package.json              # เวอร์ชันตรงรุ่นกับ cyberskills-web ปัจจุบัน (ดู §2.1)
│   ├── package-lock.json         # commit lockfile เสมอ (reproducibility)
│   ├── .nvmrc                    # ตรึง Node LTS ที่ Vercel รองรับ (ตรวจ ณ วัน scaffold)
│   ├── SBOM.md                   # ตาม security baseline ecosystem
│   ├── packages/tokens/          # vendored copy ของ @cyberskills/tokens (pattern เดียวกับ
│   │                             #   cyberskills-web: "file:./packages/tokens" — Vercel เห็นแค่ repo นี้)
│   ├── src/app/
│   │   ├── page.tsx              # landing shell (brand + คำอธิบาย + lead capture)
│   │   ├── privacy/page.tsx      # privacy notice (PDPA — ดู M1)
│   │   ├── player/               # course player (M2)
│   │   └── api/leads/route.ts    # lead intake (server-only)
│   ├── src/lib/content/          # content contract loader (Crucible portable JSON)
│   ├── src/lib/db/               # supabase server client (env-driven URL, .schema('academy'))
│   ├── fixtures/cas005/          # dev fixture (ดู §3 — คัดลอกเข้ามา ไม่ symlink ออกนอก repo)
│   ├── supabase/                 # supabase CLI project (config.toml + migrations/)
│   └── e2e/                      # Playwright specs
├── docs/adr/ADR-draft-single-account.md   # M3-prep deliverable (DRAFT ให้ founder)
└── PENDING_USER_ACTION.md        # external steps รอ founder
```

### 2.1) Dependency matrix (ตรึงรุ่น — ห้ามอัปเกรด major กลางคัน)

- `next` / `react` / `tailwindcss`: **ตรงรุ่นกับ `cyberskills-web` ณ วัน scaffold**
  (ปัจจุบัน next ^15.5.13 · react ^18.3.1 · tailwind ^3.4.19) — ความหมายของ
  "ตรึง" = ใช้ช่วงเดียวกัน + **commit lockfile** เป็นตัวตรึงจริง
- TypeScript + `@types/*` + `eslint-config-next` ตามที่ scaffold ของรุ่นนั้นให้มา
- `@supabase/supabase-js` (รุ่น stable ล่าสุด ณ วัน scaffold), `zod`
  (ระวัง `z.coerce.boolean` กับ FormData — ใช้ explicit checkbox parsing),
  `@playwright/test`, `vitest` (unit)
- Vendored `packages/tokens`: คัดลอกจาก `cyberskills-web/packages/tokens`
  เวอร์ชันปัจจุบัน; ใช้ preset key `website` ไปก่อน (key `academy` ใน canonical
  tokens = งาน director repo — บันทึกใน PENDING แทน ห้ามแก้ director repo)
- Scripts บังคับใน package.json: `dev` · `build` · `lint` · `test` (unit) ·
  `test:e2e` — acceptance ทุกข้ออ้างคำสั่งเหล่านี้

---

## 3) Content contract (verify จากไฟล์จริง 2026-07-31)

**Fixture ที่ล็อกสำหรับ one-shot:** คัดลอกจาก SV2
(`.../v4.1/practice-tests/student-version-2/`) เข้า `fixtures/cas005/`:
1. `module-banks/module-1-governance-risk-compliance/` ทั้ง module (MCQ
   single+multi)
2. `full-length/cas005-full-practice-02.json` (85 ข้อ + PBQ 5 ตัว)
3. `manifest.json` (ตัดเหลือส่วนที่ fixture ใช้ + ระบุที่มา)
พร้อม `fixtures/cas005/README.md`: ที่มา, วันที่คัดลอก, **INTERNAL ONLY —
ห้าม deploy public / ห้ามแจก** (CAS-005 public distribution เป็น decision แยก)

**Shape ที่ loader ต้องรองรับ (ตรวจจากไฟล์จริงแล้ว):**
- `manifest.json`: `generatedAt, source, instructor, website, copyright,
  brandStatement, services, modules, fullLength, prePost` — หมายเหตุ:
  **`services` คือรายการบริการการตลาดของ CYBERSKILLS ไม่ใช่ media reference**
  — เก็บเป็น metadata เฉยๆ ห้ามป้อนเข้า video slot
- MCQ item: `id, moduleId, moduleTitle, objective, learningObjective, lesson,
  bloom, difficulty, type ("single"|"multi"), topic, stem, choices,
  correct (array อักษร), explanation, whyWrong, sources, whyCorrect, keywords`
- Full-length: `id, title, timeLimitMinutes, normalQuestions, pbqs`
- PBQ: `id, title, objective, scenario, fields, sources, keywords` — แต่ละ
  field ใช้ discriminator **`kind`**; ค่าที่พบจริง: `checks`, `select`, `text`,
  `order`; `correct` เป็น **string หรือ array** แล้วแต่ kind
- **Kind ที่ต้องรองรับ + grade ได้จริงใน one-shot = ทุก kind ที่อยู่ใน fixture
  ที่ล็อก**: `checks`, `select`, `order` (FL-02) — ส่วน `text` (มีใน FL-01
  ซึ่งไม่อยู่ใน fixture) → แสดง banner "ยังไม่รองรับใน player รุ่นนี้" ได้
  **banner ใช้กับ kind นอก fixture เท่านั้น ไม่ใช่ทางผ่าน acceptance ของ kind
  ใน fixture**

กติกา: loader แปลงเข้า internal type เดียว (`CourseContent`) ที่มีช่อง media
reference แบบ optional (สำหรับ video ในอนาคต — ไม่ผูก vendor); ส่วนอื่นของ app
ห้าม import shape ดิบของ Crucible ตรงๆ; loader มี validation + error ที่บอกไฟล์/
field ที่พัง (ห้ามล้มเงียบ)

---

## 4) งานละเอียดต่อ milestone

### M1 — Foundation (ทำก่อน ทุกอย่างต่อบนนี้)

1. Scaffold `academy-web` ตาม §2/§2.1 (App Router + TypeScript + Tailwind +
   ESLint) + commit lockfile + `.nvmrc` + SBOM.md
2. Vendor tokens + tailwind preset + globals (dark default, teal accent,
   ฟอนต์ไทย/EN ตาม website — **ห้ามใส่ letter-spacing กับข้อความไทย**)
3. Landing shell: "CyberSkills Academy", คำอธิบาย 2–3 ประโยค (**ห้ามประกาศ
   course ใดๆ** — catalog ยังไม่เคาะ), ฟอร์ม waitlist
4. **PDPA ครบชุด:** หน้า `/privacy` (วัตถุประสงค์เก็บ email, ระยะเก็บ, ช่องทาง
   ถอน consent/ติดต่อ) · consent checkbox ไม่ pre-tick + ลิงก์ privacy ·
   ข้อความ consent เก็บเป็นไฟล์ versioned ใน repo (`src/content/consent/v1.md`)
   → DB เก็บ `consent_text_version` ตรงกับไฟล์
5. Lead intake (`/api/leads`, server-only):
   - validation (zod), email normalize (trim + lowercase), **idempotent**:
     email ซ้ำ = ตอบสำเร็จ ไม่สร้าง row ซ้ำ (unique constraint บน
     email-normalized)
   - จำกัด content-type + body size; error ตอบแบบ sanitized (ไม่รั่ว internal)
     แต่ **insert ล้มจริงต้องตอบ fail จริง** — ห้าม return success ทั้งที่ DB
     ไม่รับ (บทเรียน Server Action masked errors)
   - rate-limit ขั้นต่ำ per-IP (in-memory) + บันทึกใน PENDING ว่า public
     release ต้องมี edge rate-limit จริง
   - **access model:** insert ผ่าน service-role key ฝั่ง server เท่านั้น
     (env ไม่มี `NEXT_PUBLIC_` prefix); browser ไม่คุย DB ตรง
6. Migration `0001_academy_schema.sql`: schema `academy` + ตาราง `leads`
   (id, email + unique จาก normalized email, consent_at NOT NULL,
   consent_text_version NOT NULL, utm/referrer nullable, created_at) +
   **RLS เปิดและไม่มี policy ให้ anon/authenticated เลย (default deny —
   service role เท่านั้นที่เขียน/อ่าน)** + grants ชัดเจน + คอมเมนต์ระบุขั้นตอน
   prod (ดู §5 ข้อ 3)
7. Local dev DB — runbook self-contained (ห้ามอ้างไฟล์นอก repo):
   ใช้ supabase CLI ใน `academy-web/supabase/` → `npx supabase init` แล้วตั้ง
   `config.toml` ให้ `[api] schemas` รวม `"academy"` → `npx supabase start`
   (Docker) → `npx supabase db reset` เพื่อ apply migration จากศูนย์;
   client ใช้ `.schema('academy')`; **ห้ามชี้ prod เด็ดขาด**
8. Playwright e2e: landing render · submit lead สำเร็จ (ยืนยัน row เกิดจริง
   ด้วย query ฝั่ง test ไม่ใช่เชื่อ response) · consent ไม่ติ๊ก = ถูกปฏิเสธ ·
   email ซ้ำ = idempotent · **negative RLS test: anon REST (`/rest/v1` local +
   anon key) select/insert `academy.leads` ต้องถูกปฏิเสธ**
9. ทุก check เขียว → commit (atomic ต่อหน่วยงาน)

**Acceptance M1 (วัดได้ + no false-green):** `npm run build && npm run lint &&
npm run test && npm run test:e2e` เขียวทั้งหมดบน local Supabase จริง (ผ่าน
`db reset` แล้วอย่างน้อย 1 รอบ); negative RLS test มีอยู่และผ่าน; ไม่มี secret
ใน git; screenshot landing เก็บใน `artifacts/oneshot-<date>/m1/`
**Fallback:** ถ้า local Supabase ตั้งไม่ขึ้น → dev ต่อบน Postgres docker เปล่า
ได้เพื่อไม่ block งานอื่น แต่ **M1 = INCOMPLETE** (พิสูจน์ RLS/PostgREST ไม่ได้)
— รายงานตรงๆ ห้ามนับผ่าน

### M2 — Course player (หัวใจของ one-shot)

1. Content loader ตาม §3 + unit tests (single, multi, timed, มี/ไม่มี PBQ,
   ไฟล์พัง → error ชัด)
2. Practice/quiz runner:
   - single + multi — เกณฑ์ multi = ถูกทั้ง set (all-or-nothing, ไม่มี partial)
   - per-question explanation (whyCorrect/whyWrong/sources) หลังตอบ (โหมด
     practice) หรือหลังจบชุด (โหมด exam)
   - question pool + shuffle (seedable เพื่อ test), timed ตาม
     `timeLimitMinutes`, retake ได้
   - **Timer แบบ deadline-based** (เก็บ `endsAt` timestamp — reload/สลับ tab
     แล้วเวลาไม่เพี้ยน) + fake-clock tests
   - PBQ: render + **grade ทุก kind ใน fixture (`checks`, `select`, `order`)**;
     `order` ต้องมีทางเลือก keyboard (ปุ่มเลื่อนขึ้น/ลง) ไม่ใช่ drag อย่างเดียว;
     kind นอก fixture → banner "ยังไม่รองรับ" (ตามกติกา §3)
3. **Scoring spec (ตายตัว ห้ามตีความเอง):** MCQ 1 ข้อ = 1 หน่วย; PBQ ให้คะแนน
   ต่อ field (1 field = 1 หน่วย, grade ตาม kind); ข้อที่ไม่ตอบ = ผิด;
   denominator = หน่วยทั้งหมดในชุด; breakdown ต่อ module/objective ใช้หน่วย
   เดียวกัน; weakest domain = domain คะแนน% ต่ำสุดที่มี ≥3 หน่วย (ต่ำกว่านั้น
   แสดง "ข้อมูลไม่พอ"); เสมอกัน → แสดงทุก domain ที่เสมอ — ทั้งหมดมี unit test
4. Results screen ตาม spec ข้อ 3 + ปุ่ม review ข้อผิด — โครง data ออกแบบให้
   เป็น primitive ของ assessment/personalized path (M3+)
5. **Module navigation (requirement ที่ล็อก):** เลือก module → practice จาก
   bank ของ module นั้น → เห็น progress ต่อ module — มี acceptance ของตัวเอง
6. Progress ชั่วคราว: localStorage แบบ versioned
   (`academy.progress.v1`, key ต่อ contentId+attemptId, เก็บ answers +
   endsAt + สถานะ; corrupt → reset พร้อมแจ้ง; resume หลัง reload ได้;
   retake = attempt ใหม่ ไม่ทับของเก่า) + tests; โครง type พร้อมย้าย DB (M3)
7. Video slot: component รับ **normalized media ref จาก `CourseContent`**
   (optional) — ตอนนี้ render placeholder; ห้ามอ่าน `manifest.services`
8. e2e: เปิด full-length-02 จาก fixture → ทำครบ (รวม PBQ ทั้ง 3 kind) →
   ได้ผล + breakdown + review ได้ · module nav ใช้ได้จริง · resume หลัง
   reload · a11y: axe ไม่มี violation ระดับ critical/serious บนหน้า player +
   results
9. Visual review (ระดับย่อของ `deep-visual-review`): state matrix = {landing,
   module list, quiz กลางชุด, PBQ ทั้ง 3 kind, results, review} × {desktop
   1440, mobile 390} → แก้จนไม่มี defect ที่มองเห็น → screenshot เก็บ
   `artifacts/oneshot-<date>/m2/`

**Acceptance M2:** ทำ full-length-02 จบจริงผ่าน UI ทั้งชุด (PBQ ทุก kind ถูก
grade — ไม่มี banner ในเส้นทางนี้); scoring spec มี unit test ครอบ (multi
เกิน/ขาด, ไม่ตอบ, PBQ ต่อ field, timer หมด, retake, weakest-domain edge);
module nav acceptance ผ่าน; e2e + axe เขียว

### M3-prep (ไม่ใช่ M3 เต็ม — auth จริงห้ามทำจนกว่า ADR ผ่าน)

1. `docs/adr/ADR-draft-single-account.md` — **สถานะ DRAFT ระบุหัวไฟล์ว่า
   "ยังไม่ใช่ decision — รอ founder + ยกเป็น ecosystem ADR"**; เนื้อหาขั้นต่ำ:
   ปัญหา/บริบท 4 product (Crux, STAR, Academy, Forge), ทางเลือก ≥2 (shared
   issuer บน self-hosted Supabase Auth / dedicated OIDC IdP / อื่นตาม DD สด)
   พร้อม **decision matrix** (แกน: PDPA consent scope, migration STAR account
   เดิม, ผลต่อ Crux zero-friction ILT, ops load, lock-in), **หลักฐานจาก code
   จริง** (อ่าน auth surface ของ Crux/STAR แบบ read-only ระบุ path), sources
   ที่ตรวจจริง ณ วันเขียน, migration + rollback sketch, คำแนะนำ
2. ยืนยัน design M1–M2 สอดคล้อง: email = identity key; ไม่มี auth hardcode;
   พร้อม consume external issuer

### หลังจบงาน build (ใน one-shot เดียวกัน)

1. **Review lane อิสระ** ทั้ง codebase ใหม่ — cross-model 1 lane ถ้า runtime
   มีเครื่องมือ, ไม่งั้น managed reviewer แยก context (นโยบายเครื่องมืออยู่
   ระดับ director ไม่ผูกในแผนนี้); แก้ critical ให้หมดหรือบันทึกเป็น known
   issue พร้อมเหตุผล
2. อัปเดต `plans/active_plan.md` + `completed_log.md` **เฉพาะ milestone ที่
   acceptance ผ่านจริง** + `PENDING_USER_ACTION.md` ครบตาม §5
3. Cleanup: ปิด dev server/supabase local (`npx supabase stop`), fixture อยู่ใน
   `fixtures/` เท่านั้น, ไฟล์ชั่วคราวอยู่ scratchpad/`artifacts/` ตามที่กำหนด
4. Commit ครบ (ระบุ pathspec — ห้าม `git add -A`) + handoff packet ใหม่ตาม
   session-close contract; ถ้าจบ INCOMPLETE → handoff ต้องแนบ failing evidence

---

## 5) External checkpoints (รอ founder — บันทึกลง PENDING_USER_ACTION.md)

เรียงตามลำดับที่ต้องเกิด:

1. **Vercel:** สร้าง project + ผูก repo, **Root Directory = `academy-web`**,
   framework Next.js, Node ตาม `.nvmrc`, region `sin1`, ตั้ง env vars
   (รายชื่อจาก `.env.example`), ยังไม่เปิด public
2. **Cloudflare:** CNAME `academy.cyberskills.co.th` → ค่าที่ Vercel ให้ตอน
   add custom domain + **Zero Trust Access app ครอบทุก path** (allowlist
   email founder/ทีม) — ตรวจ free-tier seat ตอน setup
3. **DB prod (Pool A) — due-care เต็ม:** (ก) backup point; (ข) apply
   `0001_academy_schema.sql` (schema `academy` เท่านั้น) ผ่าน `ssh-db` ตาม
   `ecosystem/SHARED_INFRA_ACCESS.md`; (ค) **เพิ่ม `academy` เข้า
   `PGRST_DB_SCHEMAS` ของ Pool A แล้ว restart PostgREST** (การแก้ env นี้เป็น
   cross-product change — ตรวจ consumer อื่นก่อน + เตรียม rollback เป็นค่าเดิม);
   (ง) `NOTIFY pgrst, 'reload schema'` (refresh cache — ใช้แทนการแก้
   `PGRST_DB_SCHEMAS` ไม่ได้); (จ) verify: REST query schema `academy` ผ่าน +
   negative RLS ยังปฏิเสธ anon + สุ่มเช็ค product schema อื่นยังตอบปกติ
4. เคาะ **ADR single-account** → ปลดล็อก M3 จริง
5. (M4+) GCP project แยก + budget alarm; (M5) DD payment gateway ไทย +
   ยืนยัน CF Stream + ราคา ณ วันใช้จริง

---

## 6) กติกา execution สำหรับ one-shot agent

- **Precondition ก่อนเริ่ม:** git status ของ repo นี้ต้อง clean ที่ handoff
  commit; ถ้ามี dirty/untracked ที่ไม่ใช่ของ run นี้ → หยุด รายงาน ห้าม absorb;
  ห้ามแตะ dirty ใน director repo (ของ workstream อื่น)
- ทำ **inline/sequential ใน main loop** — review lane เท่านั้นที่แยกไปรัน
  อิสระ (foreground + ตรวจ liveness เป็นระยะ); ห้ามใช้ background lane ที่
  ตรวจ transcript ไม่ได้
- TDD กับทุก logic ที่มีสิทธิ์ผิด (grading, timer, loader, idempotency) —
  เขียน test ก่อนแก้ bug เสมอ
- Atomic commit ต่อหน่วยงาน; **ห้าม push** เว้นแต่ order ระบุ
- เจอทางแยกที่ §0 ไม่ครอบ → เลือกทาง reversible ที่สุด + บันทึกใน
  PENDING/handoff; เจอความจำเป็นต้องแตะ external → ข้าม + บันทึก (ห้ามทำเอง)
- ห้าม print secret; `.env.local` ห้ามเข้า git
- **Timebox + ความซื่อตรงของสถานะ:** milestone ใดวน >90 นาทีไม่คืบ (test แดง
  ซ้ำเดิม) → หยุด milestone นั้น ทำส่วนอื่นที่ไม่พึ่งกันต่อ; milestone ที่หยุด =
  **INCOMPLETE เสมอ** — ห้าม tick, ห้ามลง completed_log, ต้องอยู่ใน handoff
  พร้อม failing evidence; ผล run โดยรวมรายงานตาม §1

---

## 7) ความเสี่ยงของแผน + ท่ารับ

| ความเสี่ยง | ท่ารับ |
|---|---|
| PBQ grading ซับซ้อนกว่าที่ประเมิน (โดยเฉพาะ `order`/หลาย field) | scoring spec ตายตัวใน §4-M2-3; fixture ล็อกแล้ว (FL-02); kind นอก fixture ไม่ต้องทำ |
| Local Supabase ตั้งไม่ขึ้น | fallback Postgres เปล่าเพื่อไม่ block งานอื่น แต่ M1 = INCOMPLETE (นับผ่านไม่ได้ — พิสูจน์ RLS/PostgREST ไม่ได้) |
| `PGRST_DB_SCHEMAS` prod ไม่มี `academy` | รู้แล้ว — เป็น external checkpoint §5-3 พร้อมขั้นตอน rollback; local ตั้ง `[api] schemas` เองได้ |
| Version drift กับ ecosystem | ตรึงตาม `cyberskills-web` + lockfile commit; ปัญหา version = บันทึก PENDING ไม่อัปเกรดกลางคัน |
| Demand ต่อ course ยังไม่ validate | รับโดย founder (build-first); catalog ไม่ hardcode — pitch + poll รอบหน้าใช้ Lane B brief |
| Scope creep เข้า M3/M4/M5 | §1 นิยามนอกสโคปชัด; auth จริงล็อกด้วย ADR gate |

---

## 8) สิ่งที่ตัด/เลื่อนแล้วโดย founder (อย่าหยิบกลับมาเอง)

- Phase 0 validation → defer ไปรอบเคาะ course catalog (founder pitch + poll เอง)
- CAS-005 confirm gate → ตัดจากแผน (กลับมาพิจารณาเฉพาะถ้าจะเอา bank ออก public;
  ระหว่างนี้ fixture = internal only ตาม §3)
- Course catalog / ลำดับ free-tier release → รอ founder
- Currency rename, Crucible capacity assessment, payment/streaming vendor →
  milestone หลัง
