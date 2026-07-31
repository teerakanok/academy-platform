# CyberSkills Academy — Completed Log

> Closed items only, with outcome + evidence + residual risk. Newest first.
> Provider-neutral. See `active_plan.md` for open work.

---

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
- **Access term ล็อกแล้ว: การันตีขั้นต่ำ 2 ปี + auto-extend ฟรีตราบใดที่ edition
  ยังเป็นเวอร์ชันปัจจุบัน** — founder เลือก 2 ด้วยหลัก "ประตูทางเดียว" (เพิ่มเป็น 3
  ทีหลังได้เป็นของขวัญ แต่ลดจาก 3 เหลือ 2 = ผิดสัญญา); rider auto-extend ปิดเคส
  "ซื้อซ้ำของเดิมทั้งที่เนื้อหายัง current" และให้คนซื้อต้น edition ได้ ~3 ปีโดยพฤตินัย
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
