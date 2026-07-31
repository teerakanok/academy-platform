# CyberSkills Academy — Completed Log

> Closed items only, with outcome + evidence + residual risk. Newest first.
> Provider-neutral. See `active_plan.md` for open work.

---

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
