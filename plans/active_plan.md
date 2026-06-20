# CyberSkills Academy — Active Plan

> Open work only. Move closed items to `completed_log.md` with evidence.
> Read `../AGENTS.md` first. Provider-neutral — no provider/model names in this plan.
> **Last updated:** 2026-06-10

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

## Phase 1 — Platform decision (gated by Phase 0 "go")
- [ ] Decide delivery platform: hosted LMS vs DIY (record decision + rationale in `completed_log.md`).
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
