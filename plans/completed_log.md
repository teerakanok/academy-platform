# CyberSkills Academy — Completed Log

> Closed items only, with outcome + evidence + residual risk. Newest first.
> Provider-neutral. See `active_plan.md` for open work.

---

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
