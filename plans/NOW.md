# NOW — CyberSkills Academy   (updated 2026-10-06, from plans/active_plan.md@f50fec0)

## Current slice
- The plan was last changed 2026-09-06 (f50fec0). Its top checkpoint (2026-09-04)
  names the next gate as an owner-present sign-in, then an entitlement grant and
  staff bootstrap. The newer record `reports/state/2026-09-17-production-state.md`
  shows the later state: free-course self-enrolment is live (migration 0040), and
  the founder account holds staff role `owner` and grants for all 8 published courses.
- Next action (2026-09-17 handoff, `reports/handoffs/current.json`): a founder
  real-browser check with a second account (free course start lands in the lesson),
  then triage the 13 known unit failures. Payment gateway: deferred by the founder.

## Open gates and blockers
- Least-privilege manual entitlement (migration 0030, plan top, 2026-09-06):
  independent review and the real PostgreSQL fixture were still required to close.
- Pre-continuation audit gate (2026-08-02): its three batches are marked closed
  2026-08-03; the section's remaining launch gates are not marked closed.
- Hosting: deploys go to Cloudflare Workers; the final choice waits for a latency
  measurement after M3.
- Pool A is shared infra: read the director `ecosystem/SHARED_INFRA_ACCESS.md` and
  `reports/state/supabase.md` before touching auth, migrations, or SQL.

## Do not
- Add a recurring paid service without a founder decision.
- Change a production database, host, or deploy without fresh owner authority.
- Change the `#38BDF8` accent without a new logo as the reference.

## Pointers
- Full plan section: plans/active_plan.md § "Current execution lane — activate identity without widening Pool A access"
- Audit gate: plans/active_plan.md § "⛔ Pre-continuation audit gate — 2026-08-02"
- Hosting: plans/active_plan.md § "Hosting — ยังไม่ตัดสิน (พิสูจน์แล้วว่าไปได้ทั้งสองทาง 2026-08-01)"
- Production state: reports/state/2026-09-17-production-state.md
- Stack lock: plans/platform-build-oneshot-2026-07-31.md, read when changing the stack
- Entitlement operations: academy-web/docs/course-entitlement-operator.md
