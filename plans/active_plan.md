# CyberSkills Academy — Active Plan

> Open work only. Move closed items to `completed_log.md` with evidence.
> Read `../AGENTS.md` first. Provider-neutral — no provider/model names in this plan.
> **Last updated:** 2026-07-31

---

## Objective

Stand up **CyberSkills Academy** (cert exam-prep courses + sold mock tests + trend-driven pro courses) **without over-investing ahead of demand**. Near-term goal is not revenue — it is a **validated decision** on whether (and how) to build the delivery platform.

---

## Current phase: **Phase 0 — Validate demand (cheap, reversible, ~$0 recurring)**

Use only assets that already exist + free/owned infra. No paid platform, no large build.

### Phase 0 — open items
- [ ] **Resolve the 11 CAS-005 answer-key disputes** (hard prerequisite before any public distribution). Source: `products/personal/crucible-studio/output/cas005/v4.1/practice-tests/v2-build/review/findings-*.json`. Founder decision required (changes original keys — affects v1 + v2). Incl. PBQ-010 (NIST 800-61: eradication before recovery).
- [ ] **Pick a distribution channel** (the real constraint). Inventory what exists: founder/academic network, existing client/list, relevant communities, website traffic. Without a channel, expect ~0 signal.
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

> ส่วนนี้คือ "สิ่งที่จะ build เมื่อผ่าน Phase 0 gate" — **ไม่ใช่ execution lane ปัจจุบัน**
> Phase 0 (validate demand) มาก่อนเสมอ; vision นี้ไม่ใช่เหตุผลข้าม gate
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
| Fundamentals (เช่น basic Linux & bash) | **ฟรี — absorb cost เอง** (แบบมีเพดาน): funnel + prerequisite layer ใน path + เวทีโชว์ placement/skip; **ไม่ขายเป็น SKU เดี่ยว** (สู้ของฟรี THM/OverTheWire/freeCodeCamp ไม่ได้); lab ใช้แต้มฟรีรายเดือน (precedent: Skills Boost แจก 35 credits/เดือน); lab พื้นฐาน = container เบา ต้นทุนต่ำ |
| Path / Premium / Cert course (เช่น AI Secure Coding, CISSP) | ซื้อขาดต่อ **edition**, access **3 ปีเต็ม — เลขเดียวทั้ง catalog** (ล็อก final 2026-07-31), update ย่อยฟรีภายใน term, โชว์วันที่ "อัปเดตล่าสุด" ชัดเจน |
| หน่วยขายหลัก | **Path/Track** — fundamentals ที่เกี่ยวข้องรวมอยู่ข้างใน (access clock inherit จาก path ที่ซื้อ) |

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

- **Distribution + trust ยังเป็น binding constraint** — vision นี้ทำให้ product แหลมขึ้น
  แต่ product ไม่เคยเป็นคอขวด; ห้ามใช้ vision เป็นเหตุผลเลื่อน/ข้าม Phase 0
- **Phase 0 synergy (ทดสอบ concept ได้เกือบฟรี):** reframe free CAS-005 sample เป็น
  **"placement test — รู้จุดอ่อนใน 30 นาที ไม่เสียเวลาเรียนของที่รู้แล้ว"** แล้ววัดว่า
  messaging ไหนดึง lead กว่า = validation ของ desirability จากพฤติกรรมจริง;
  corporate probe pitch "ทำ skill-gap diagnostic ให้ทีมฟรี ได้ report"
- **บทเรียน Knewton:** ห้ามขาย "AI-personalized" เป็น headline — ขาย outcome
  ("ถึงเป้าเร็วขึ้น ไม่เรียนซ้ำของที่รู้"); user override เสมอ
- **ภาระ content factory:** granular content + tag + branch + cheatsheet ต่อหน่วย
  ทำให้โจทย์ฝั่ง Crucible โตขึ้นหลายเท่า — ยังไม่ได้ประเมิน ต้องประเมินก่อน commit build
- CAS-005 answer-key disputes ยังเป็น hard prerequisite ก่อน public distribution (ไม่เปลี่ยน)

### Open items ของโมเดลนี้ (รอ founder / รอ pilot)

- [x] ~~ล็อกเลข access term สุดท้าย~~ — **ล็อก final 2026-07-31: 3 ปีเต็ม
  เลขเดียวทั้ง catalog** (เหตุผล: ความง่าย — คำสัญญาเดียวไม่มีกติกาซ่อน;
  ดูรายละเอียดในส่วนโมเดลราคา)
- [ ] ตั้งชื่อ academy currency
- [ ] Calibrate ตัวเลขจริงจาก pilot ที่มีต้นทุนวัดจริง: แต้มต่อ lab, แต้มแถมต่อ course,
  ราคา top-up, floor %, free-upgrade window
- [ ] นิยามเส้นแบ่ง Academy checkpoint lab vs STAR scenario lab เป็นลายลักษณ์อักษร
- [ ] ตรวจข้อกฎหมาย/consumer protection ไทยเรื่อง prepaid credit + วันหมดอายุ
  ก่อนประกาศนโยบายจริง

---

## Phase 1 — Platform decision (gated by Phase 0 "go")
- [ ] Decide delivery platform: hosted LMS vs DIY (record decision + rationale in `completed_log.md`).
  - อัปเดต 2026-07-31: requirement lab-gated learning ทำให้ hosted-LMS ล้วนไม่น่าเพียงพอ —
    lab plane ควรเป็น embeddable service แยกชั้น (ดู "นิยาม Product + โมเดลราคา" ด้านบน)
- [ ] If hosted LMS: free-trial test against hard requirements — multi-answer grading, **per-question explanation rendering** (the differentiator), question pools / timed / retake mock exams, free-tier for the freemium teaser, data export/ownership. **PBQ interactive UX is the known risk** — confirm an acceptable approximation or supplement.
- [ ] Stand up `academy.cyberskills.co.th` (CNAME) only when a platform is chosen.

## Phase 2 — Catalog build (gated by Phase 1)
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
- CAS-005 bank still has **11 unresolved answer-key disputes** — blocks public release.
- Recurring-cost trap: committing to a paid platform before demand = capital burn + sunk-cost pressure.
- Content source (Crucible) and delivery (Academy) must stay decoupled or migration cost balloons.

---

## Strategic backlog (speculative — NOT execution lane)
- On-demand video course library (Coursera-style) — the larger build; validate via waitlist first.
- Additional cert tracks beyond CAS-005.
- Subscription/membership model across the catalog.
- Cross-sell into other CYBERSKILLS services (SAT, TTX/PhalanX, pentest, SOC) via nurture.
- Corporate B2B training packages (likely the largest revenue line).
- Single learner identity / account unifying bank + courses + waitlists.
