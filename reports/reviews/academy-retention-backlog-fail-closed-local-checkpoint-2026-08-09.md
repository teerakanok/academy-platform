# Academy Retention Backlog Fail-Closed Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** local author evidence complete; independent review pending

## Outcome

The retention scheduler no longer reports a purge job as complete when every
bounded round still deletes rows. After `MAX_ROUNDS`, it keeps the structured
`retention.backlog_remaining` warning and throws a job-scoped error. The outer
scheduler then emits `retention.purge_failed`, continues the remaining independent
jobs, emits completion only for jobs that actually reach a zero-deletion response,
and rejects with the aggregate failure.

This is a local worker behavior change only. It does not change retention SQL,
retention periods, API configuration, credentials, deployment, or production
state.

## TDD Evidence

The RED focused run failed two new expectations:

- `runPurgeJob` resolved `{ rounds: 20, deleted: 20 }` instead of rejecting an
  unfinished backlog.
- `runRetention` resolved instead of surfacing that job failure, allowing the
  exhausted job to be logged as `retention.purge_complete`.

After the single fail-closed source change, the focused suite passed `7/7`.
The test fixes the exact event sequence: backlog warning, failed-job event,
continued execution of the next job, no false completion for the exhausted job,
and aggregate rejection.

## Verification

| Gate | Result |
|---|---|
| Focused RED | 2 failed / 5 passed; both failures reproduced false success |
| Focused GREEN | 7/7 passed |
| Retention + security wiring | 40/40 passed |
| Full unit regression | 73 files / 485 tests passed |
| Node 24 lint and typechecks | Passed; one existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte Worker bundle |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | `git diff --check` passed; staged index remained clean |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

## Remaining Risk

This checkpoint makes scheduled-event evidence truthful but does not supply that
runtime evidence. The first real cron event must still show every job reaching
`retention.purge_complete`, or surface `retention.purge_failed` when any job fails
or leaves a bounded backlog. No production purge RPC was invoked.

The existing sharp compatibility exception and the separate Identity, private
media, CSP, legal, case-system, and public-exposure release gates are unchanged.
Final code/security review belongs to the independent reviewer; this report is
author evidence only.
