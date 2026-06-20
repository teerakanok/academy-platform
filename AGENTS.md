# AGENTS.md — CyberSkills Academy (academy-platform)
**Single Source of Truth — Provider-Agnostic AI Agent Context**
**Compatible with: Claude Code | Gemini CLI | OpenAI Codex | any future AI agent**

> Canonical context for this product. All AI providers read this file.
> Provider-specific extensions (if ever needed) go in a separate `CLAUDE.md` / `.gemini/` / `.codex/` and must reference this file. Keep this file provider-neutral.
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

## Status — PLANNING / VALIDATION stage (no build yet)

This product has **not been built**. The current phase is **demand validation before investment** (see `plans/active_plan.md`).

**Standing operating principle for this product:** *validate-before-invest.* Do not take on recurring fixed cost (hosted-LMS subscriptions, paid platforms) or large build effort **until demand is validated** with cheap, reversible experiments. Recurring cost must be a *result* of traction, not a bet on it.

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
| **Delivery** | how learners consume it | validate with the simplest free path (static pages on existing infra) | adopt a delivery platform **only after demand is validated** |

- **Content source of truth = Crucible** (`products/personal/crucible-studio/`). Academy is the *delivery + commerce + funnel* layer; it consumes content Crucible produces. Keep content portable so it is not locked to any platform.
- **Delivery platform: UNDECIDED.** A hosted LMS (e.g. LearnWorlds) was considered and **deferred** (recurring cost before validated demand). Decision is downstream of validation. If validated:
  - **Hosted LMS** — chosen for no-maintenance, built-in commerce/accounts/certificates/funnels, once paying volume justifies the recurring cost.
  - **DIY custom** — only if a hosted platform cannot meet a hard requirement; would follow CYBERSKILLS stack defaults (see Tech Stack).
- **URLs must be platform-agnostic.** Use `academy.cyberskills.co.th` (CNAME) so the delivery platform can be swapped without breaking links or brand — never expose a vendor's raw URL.
- **SEO / funnel:** keep free lead-magnet + marketing content on the **main domain** (`cyberskills.co.th` / a resources path) to build authority and capture search, then funnel into the Academy subdomain (subdomain SEO authority is weaker).
- **Learner identity:** plan for a single email-based identity so free bank, paid courses, and waitlists can converge into one account later. Do not build an account system during validation — just capture email consistently.

---

## Tech stack — TBD (decision pending validation)

Do **not** assume or hardcode a stack yet. The delivery platform decision (hosted LMS vs DIY) is open.

- If **hosted LMS**: configuration/branding work, content import, minimal custom code.
- If **DIY custom** (only if justified): follow CYBERSKILLS defaults — Next.js or React+Vite · Tailwind (cs- design tokens) · FastAPI (Python) or NestJS (Node) · Supabase (PostgreSQL) · LLM provider abstracted, not hardcoded.

Whatever is chosen, record the decision + rationale in `plans/completed_log.md`.

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

- ❌ Do **not** subscribe to a recurring paid platform or start a large build before demand is validated (see validate-before-invest).
- ❌ Do **not** publicly distribute the CAS-005 bank until the **open answer-key disputes are resolved** (a wrong key destroys credibility with the senior security audience). Source + review evidence: `products/personal/crucible-studio/output/cas005/v4.1/practice-tests/` (`student-version-2/` + `v2-build/review/findings-*.json`).
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
- Strategy memory (Director): `~/.claude/projects/.../memory/project_academy.md`.
- Read repo-root `AGENTS.md` + `ecosystem/ECOSYSTEM.md` before cross-product work.
