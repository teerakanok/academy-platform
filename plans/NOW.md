# NOW — CyberSkills Academy   (updated 2026-10-06, from plans/active_plan.md@f50fec0)

## Current slice
- The plan was last changed 2026-09-06 (f50fec0). Newer state is in
  `reports/state/2026-09-17-production-state.md`: free-course self-enrolment live
  (migration 0040); the founder holds staff role `owner` and grants for all 8
  published courses. Payment gateway: deferred by the founder.
- Next action (2026-09-17 handoff, `reports/handoffs/current.json`): a founder
  real-browser check with a second account (free course start lands in the
  lesson), then triage the 13 known unit failures.

## Open gates and blockers
- Passed locally, not production proof: entitlement retention 0030/0031, real
  PostgreSQL 11 tests and frozen 47-file review PASS (2026-09-06); operator
  rehearsal, dedicated-role PostgreSQL 6 cases and 9-file review PASS (2026-09-08).
- Learner enrolment journey: still unproven. Local QA (2026-09-19) cannot reach
  it: sign-in is closed in the local build, and `supabase db reset` stops near
  0033/0034 on a top-level `LOCK TABLE`, so the 0040 tables never exist. Needs
  production behind Cloudflare Access, or staging.
- Security, static review 2026-09-19: the four Mediums of 2026-09-16 stay open
  (retire/unpublish enforcement, no rate rule on `/api/certificate/verify`, shared
  `service_role` on core learner tables, `next@15.5.22`), plus 2 new Lows.
- Owner gates (`plans/archive/archived-PENDING_USER_ACTION.md` §2-5): public exposure needs
  its own authorization; Thai privacy/appeal text review and a restricted-case
  owner; private-media proof with a real session; first retention-cron event.
- Hosting: deploys go to Cloudflare Workers; the final choice waits for a latency
  measurement after M3.
- Pool A is shared: before auth, migrations, or SQL read
  `/Users/teerakanok/Dev/cyberskills-director-governance/ecosystem/SHARED_INFRA_ACCESS.md` and
  `/Users/teerakanok/Dev/cyberskills-director-governance/reports/state/supabase.md`.

## Do not
- Add a recurring paid service without a founder decision.
- Change a production database, host, or deploy without fresh owner authority.
- Change the `#38BDF8` accent without a new logo as the reference.

## Pointers
- Full plan section: plans/active_plan.md § "Current execution lane — activate identity without widening Pool A access"
- Audit gate: plans/active_plan.md § "⛔ Pre-continuation audit gate — 2026-08-02"
- Local acceptance: reports/reviews/2026-09-06-entitlement-retention.md; reports/verification/2026-09-08-operator-rehearsal/README.md
- Journey QA: academy-web/reports/journey-qa-2026-09-19.md
- Security: academy-web/reports/security-review-2026-09-19.md
- Production state: reports/state/2026-09-17-production-state.md
- Stack lock: plans/platform-build-oneshot-2026-07-31.md, read when changing the stack
- Entitlement operations: academy-web/docs/course-entitlement-operator.md
