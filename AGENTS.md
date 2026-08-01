# AGENTS.md — CyberSkills Academy (academy-platform)
**Single Source of Truth — Provider-Agnostic AI Agent Context**
**Compatible with provider-neutral AI agents**

> Canonical context for this product. All AI providers read this file.
> Provider-specific extensions, if ever needed, are pointer files only and must reference this file. Keep this file provider-neutral.
> Director-level context lives in the repo-root `../../../AGENTS.md` (CYBERSKILLS ecosystem). Read it before cross-product work.

---

## Required read order

For every Academy session:

1. Read director context: `../../../AGENTS.md`.
2. Read this file.
3. Read `plans/active_plan.md` and `plans/completed_log.md`.
4. Read local `principles/` and `skills/` only when the task matches a project-specific addition.
5. For cross-product work, read `../../../ecosystem/ECOSYSTEM.md`.

Provider-specific folders or files may point here, but this file and local project governance are the canonical source.

## Founder Updates

For a verified, material Academy prototype, decision, milestone, shipped outcome,
risk, or blocker with new evidence and direct founder value, run the director
`publish-owner-update` skill's `assess-trigger` gate. If eligible, publish only
through route `academy` to `#product-academy`. Never trigger from a commit,
routine progress, status question, duplicate evidence, chore, or session close
alone. A route failure is a stop; never fall back to `director`.

## Local governance layout

- `principles/` - Academy-specific principles only; global rules stay in the director repo.
- `skills/` - Academy-specific skills only; do not duplicate global director skills.
- `plans/active_plan.md` - open goals, gates, acceptance criteria, risks, and strategic backlog.
- `plans/completed_log.md` - closed decisions/work with outcome, evidence, and residual risk.
- `reports/` - Academy reports, sessions, handoffs, reviews, and project evidence summaries.
- `artifacts/` - generated evidence for Academy work, such as exports, screenshots, traces, and raw validation outputs.
- `context/` - durable source-of-truth context that is not a plan, report, or artifact.
- `docs/` - product, engineering, and user-facing documentation.

Local governance must complement director standards, stay provider-neutral, and remain additive unless the task explicitly approves broader cleanup.

## What this is

**CyberSkills Academy** — the **knowledge / courses pillar** of the CYBERSKILLS ecosystem: an online learning destination that sells

1. **Certification exam-prep courses** (model reference: Jason Dion style — accessible, high-quality, multi-cert).
2. **Mock tests / practice question banks** (e.g. the CAS-005 SecurityX bank already authored in Crucible).
3. **Trend-driven professional courses** that follow market demand — e.g. Agentic AI security, Risk, ISO, basic pentest, cryptography.

It is the structured-knowledge sibling of **STAR** (cinematic hands-on labs). STAR = *do*; Academy = *learn/know + prep*.

**Brand name decided 2026-05-26:** "CyberSkills Academy". Future home: subdomain `academy.cyberskills.co.th` (platform-agnostic CNAME — see Architecture).

---

## Status — PLATFORM BUILD (founder decision 2026-07-31)

**Founder เคาะ 2026-07-31: build-first.** เริ่ม build platform ทันทีแบบ
content-agnostic; **Phase 0 (validate demand) ถูก defer** — จะกลับมาตอนเคาะ
course catalog โดย founder pitch + poll ผ่าน channels เอง (input:
`reports/reviews/channel-inventory-2026-07-31.md`). Execution plan:
`plans/platform-build-oneshot-2026-07-31.md` + roadmap ใน `plans/active_plan.md`.

**Standing operating principle (ปรับ 2026-07-31):** ห้ามเพิ่ม recurring cost /
subscribe paid service ใหม่โดยไม่มี founder decision เสมอ (ข้อนี้ยังอยู่);
ส่วน "ห้าม build ใหญ่ก่อน validate" ถูก supersede โดย founder decision
2026-07-31 — build บน owned infra ที่ recurring ~0 ได้เลย

---

## Go-to-market reality (honest, not rose-tinted)

- Selling a certification practice bank as a **standalone product on the open global market is LOW probability** — the cert-prep market is commoditized, dominated by trusted incumbents (Boson, Dion, Professor Messer, official CertMaster), with a low price anchor, a discerning advanced-cert audience, and a brand/distribution cold-start for a new entrant. **The product is not the constraint — distribution + trust are.**
- The realistic value of the content/bank:
  1. **Free lead magnet + demand-validation engine** for the Academy.
  2. **Funnel into corporate / in-house training** — the highest-ticket path, where CYBERSKILLS competes on relationships + local presence + service, not on a commodity digital product.
  3. **Live cohort prep** sold via existing audience/network.
- Treat early experiments as **learning**, not a revenue line. A thin result is still a valuable finding (it saves over-investment).

---

## Architecture decisions

**Separate the content asset from the delivery platform.**

| Layer | What | Now | Later |
|---|---|---|---|
| **Content** | courses, mock banks, explanations, study guides | authored in **Crucible** as portable structured data (e.g. JSON) | ingested into whatever delivery platform is chosen — no re-authoring |
| **Delivery** | how learners consume it | DIY build `academy-web/` ตามแผน one-shot (อยู่หลัง Zero Trust จนกว่า founder สั่ง public) | public launch หลัง founder เคาะ course catalog (pitch + poll) |

- **Content source of truth = Crucible** (`products/personal/crucible-studio/`). Academy is the *delivery + commerce + funnel* layer; it consumes content Crucible produces. Keep content portable so it is not locked to any platform.
- **Delivery platform: DECIDED 2026-07-31 — DIY "build the core, buy the
  plumbing"** (hosted LMS ถูกตัด — product ที่ล็อกไม่มีขายใน platform ไหน);
  รายละเอียด + เหตุผลใน `plans/active_plan.md` ส่วน Implementation direction
  และ `plans/completed_log.md` entry 2026-07-31.
- **URLs must be platform-agnostic.** Use `academy.cyberskills.co.th` (CNAME) so the delivery platform can be swapped without breaking links or brand — never expose a vendor's raw URL.
- **SEO / funnel:** keep free lead-magnet + marketing content on the **main domain** (`cyberskills.co.th` / a resources path) to build authority and capture search, then funnel into the Academy subdomain (subdomain SEO authority is weaker).
- **Learner identity:** single email-based identity ตั้งแต่วันแรก (lead capture ใช้ email เป็น identity key); ระบบ account/auth จริงเริ่มได้เมื่อ **ADR ecosystem single-account** ผ่าน founder เท่านั้น (ดู plans) — ออกแบบให้ consume external issuer ได้เสมอ.

---

## Tech stack — ล็อกตามแผน build (2026-07-31)

DIY บน CYBERSKILLS defaults: Next.js App Router (TypeScript) · Tailwind +
`@cyberskills/tokens` (cs-) · Supabase self-host **Pool A** schema `academy` ·

> ⚠️ Pool A เป็น shared infra (Crux/STAR/Forge/Academy) — ก่อนแตะ auth, migration,
> หรือ SQL ตรง ให้อ่าน `ecosystem/SHARED_INFRA_ACCESS.md` และ `reports/state/supabase.md`
> ของ director repo ก่อนเสมอ
deploy Vercel `sin1` + CNAME `academy.cyberskills.co.th` + Zero Trust ก่อน
public · Lab = Crux lab plane บน GCP (M4) · video = managed stream ผ่าน custom
HLS player (M5, vendor ยังไม่ commit) — เวอร์ชัน/รายละเอียดตรึงใน
`plans/platform-build-oneshot-2026-07-31.md`; การเปลี่ยน stack ต้องมี founder
decision ใหม่ + บันทึกใน `plans/completed_log.md`.

---

## Brand & design

- Inherit the CYBERSKILLS aesthetic: dark, terminal/CLI motif, teal accent, "rigorous / precision / threat-intelligence" tone.
- Use the `@cyberskills/tokens` design system (`cs-` tokens) when building any UI (`bg-cs-bg`, `text-cs-accent`, etc.). See `ecosystem/DESIGN_SYSTEM.md`.
- Tagline energy reserved: "Learn. Grow. Go." (optional).

---

## Ecosystem integration

- **Crucible** (`products/personal/crucible-studio/`) — content factory; produces courses + mock banks the Academy delivers.
- **STAR** — sibling labs pillar; cross-link ("hands-on labs coming") but keep funnels distinct (different audience depth).
- **CYBERSKILLS website** — top-of-funnel; the Services page already lists "Certification Exam Prep" — the natural paid tie-in. Free sample + lead capture live here and funnel into the Academy.
- **Exam bank as lead magnet** — the CAS-005 bank is the first content asset + the MVP wedge that can launch the Academy.

---

## Constraints — what NOT to do

- ❌ Do **not** subscribe to a recurring paid platform / จ่ายเงิน service ใหม่
  โดยไม่มี founder decision (ยังมีผลเสมอ; ส่วน "ห้าม build ก่อน validate" ถูก
  supersede แล้ว — ดู Status)
- ℹ️ CAS-005 bank: answer-key disputes **ปิดครบ 2026-07-31** (Crucible
  `640c8613`); ปัจจุบันใช้เป็น **internal dev fixture เท่านั้น** — การเอาออก
  public เป็น decision แยกในอนาคต (founder ตัด gate นี้ออกจากแผน 2026-07-31
  เพราะยังไม่ focus course ใด)
- ❌ Do **not** hardcode a vendor's raw URL anywhere — use the `academy.` subdomain.
- ❌ Do **not** re-author content per platform — keep one portable source of truth in Crucible.
- ❌ Do **not** reference provider-specific model names (e.g. specific Claude/Gemini/OpenAI model strings) or provider-only tooling in any skill, template, script, or doc for this product — this product is **provider-neutral**.

---

## Security baseline (inherit ecosystem standard)

Follow the CYBERSKILLS cross-product security baseline (repo-root `AGENTS.md` → "Security Baseline"): input validation; secrets in `.env` only (never hardcode); error sanitization; explicit CORS (no `*` in prod); dependency pinning + SBOM; admin/route protection with required auth tokens; docs endpoints disabled in production; internal services bound to localhost. Any feature handling learner PII must honor **PDPA** (consent + privacy notice) since the audience includes Thailand.

---

## Provider-neutral agent guidance

When delegating work on this product, describe roles by **neutral capability tier**, never by provider/model name:

| Tier | Use for |
|---|---|
| `light` | quick lookups, formatting, small edits |
| `balanced` | standard implementation, content transforms, reviews |
| `heavy` | architecture, ambiguous strategy, deep analysis |
| `coding` | code-heavy implementation |
| `longrun` | long autonomous build/agent tasks |

(Tier → concrete model mapping lives in the orchestration layer / `config/model-tiers.yaml`, not here.)

---

## Pointers

- `plans/active_plan.md` — open goals, gates, acceptance criteria, risks, strategic backlog.
- `plans/completed_log.md` — closed items with outcome + evidence + residual risk.
- Strategy context: `plans/active_plan.md`, `plans/completed_log.md`,
  `context/`, and relevant ecosystem docs.
- Read repo-root `AGENTS.md` + `ecosystem/ECOSYSTEM.md` before cross-product work.
