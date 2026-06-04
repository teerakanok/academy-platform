# CyberSkills Academy — Active Plan

> Open work only. Move closed items to `completed_log.md` with evidence.
> Read `../AGENTS.md` first. Provider-neutral — no provider/model names in this plan.
> **Last updated:** 2026-05-26

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
