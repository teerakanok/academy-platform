# Academy state — 2026-09-12 security recovery close

Canonical state record for the ws-523a1d40 recovery round source commit on `codex/academy-security-recovery-523a1d40`
(baseline `bf74fbf`; this file ships inside that source commit). Kept here so topology/operations facts survive session close.

## Database migrations added this round (not yet applied to any shared/live DB)

| Migration | Purpose | Rollback |
| --- | --- | --- |
| `academy-web/supabase/migrations/0040_pending_waitlist_requests.sql` | pending/waitlist admission requests | `supabase/rollbacks/0040_pending_waitlist_requests.rollback.sql` |
| `academy-web/supabase/migrations/0041_identity_lifecycle_first_login_guards.sql` | identity lifecycle first-login guards + authorization fence | — (guards are additive; see migration header) |
| `academy-web/supabase/migrations/0043_identity_assurance_and_session_policy.sql` | identity assurance v2 + session policy | — |
| `academy-web/supabase/migrations/0044_attempt_reauthentication_read.sql` | attempt reauthentication read model | — |

All were exercised only on disposable isolated PostgreSQL (43 migrations,
5/5 groups PASS; lifecycle 59/59). No shared Supabase / Pool A operation
was performed. Apply order and rollback rehearsal remain part of the
deploy runbook, which is owner-gated.

## Runtime configuration facts

- Admission: `ACADEMY_ADMISSION_MODE` is read from the worker binding; only
  the exact string `open` admits. Missing/malformed/`maintenance`/throwing
  binding → fail-closed 503 `no-store` + `retry-after: 60`. Worker-first
  routing (`run_worker_first: true`); raw-host requests 404 before asset
  handling; `scheduled()` never reads the admission mode.
- Retention worker (`academy-web/ops/academy-retention-worker/retention.ts`)
  was modified this round; production enablement/schedule unchanged and
  still owner-gated.
- CSP: script-src uses nonce + strict-dynamic; `style-src-attr
  'unsafe-inline'` retained — adjudicated structural follow-up
  (RoadmapGraph data-driven layout; evidence in
  `reports/academy-lane-report-20260912.md` §7).

## Acceptance status at close

- Local/isolated evidence only: unit 3277 PASS/2 SKIP, lint 0 errors,
  OpenNext production build + real workerd 14/14, isolated PG suites green
  (see `artifacts/academy-fresh-combined-acceptance-20260912.log` and
  `reports/academy-candidate-freeze-20260912.json`, freeze v2,
  controller-verified 178/178 hashes).
- Independent review: PASS_WITH_NOTES
  (`../../../cyberskills-director/reports/security/identity-recovery-523a1d40/academy-independent-review-20260912.md`
  in the director checkout); follow-ups F3/F5/F4 closed, F2 deferred
  (adjudicated).
- NOT done anywhere: production deployment, deployed-config read-back,
  measured invocation cost, log delivery, live lifecycle propagation.
  Deploy authority is recorded (deploy-when-ready) but execution is
  controller/owner-gated.

## Outstanding owner inputs

Nine privacy facts (processors, countries, transfer grounds, retention)
block finalizing `academy-web/docs/privacy/*` placeholders — enumerated in
`reports/academy-lane-report-20260912.md` §6. No facts were invented.

## F-2 convergence addendum — 2026-09-13
- Lifecycle pull live: worker config identity-events audience + producer values; cron */5 pulls; converged (checkpoint cursor 7, 7 active projections, academy-web ack 7). Root causes fixed: modules-worker fetch receiver (bind), envelope signer issuer is the identity-control origin, sync_service_activation EXECUTE granted to definer role postgres via supabase_admin.
- published_at remains 0 until crux-control (not yet wired) acknowledges — owner item.
