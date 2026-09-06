# SEC-ACADEMY-006 local application-integrity evidence

**Scope:** local code and tests only. No production database, deploy, provider, SMTP, SSH, or outbound message was touched.

## Implementation contract

- Assessed issuance is guarded in `academy.issue_attempt` under the existing per learner/course/node transaction advisory lock: rolling quota clamp, UTC daily ceiling of 10, and 5/15-minute consecutive-failure backoff.
- Assessed submission is guarded in `academy.consume_attempt`: minimum dwell is 30 seconds or 15 seconds per snapshot task, whichever is greater; the existing claim-token fencing and progress transaction remain unchanged.
- The existing `issue_attempt` and `consume_attempt` input/output signatures remain unchanged. Additive read-only retry-hint RPCs preserve learner retry UX; they do not authorize admission.
- Production ignores an over-large `ATTEMPT_MAX_PER_WINDOW` by clamping to 3; non-production clamps to 100. An explicit local-fixture disable is rejected in production and only affects Playwright fixtures.
- Assessed MCQ serving uses the existing crypto shuffle/remap and answer-key snapshot with a stable serve ceiling of five. Current Crucible capstones contain three to five items, so all authored items are used and no content or key changed.
- Suspicious admission/submission events emit one bounded JSON `console.warn` containing only fixed reason and coarse retry bucket—no learner identifier, course, node, answers, or secret.
- Migration `0033` is additive function replacement, preserves grants/RLS and runtime privilege boundaries, and contains no destructive expiration/delete. The integration fixture applies it inside one transaction and always rolls back.

## Evidence

| Result | Command | Exit | Immutable log SHA-256 |
|---|---|---:|---|
| RED | `cd academy-web && npx vitest run --project unit assessment-attempt-integrity --maxWorkers 1` | 1 | `d1a35f89e56172cfba243f22407cbc4229fb052b07fe171a03864cb92943dc92` (`artifacts/sec006-red-vitest.log`) |
| Required GREEN | `cd academy-web && npm ci --ignore-scripts --no-audit && npx vitest run --project unit attempt capstone progress --maxWorkers 1 && npx tsc --noEmit && npx tsc -p tsconfig.worker.json` | 0 | `e14e9458af13e1ac4fe88a8e1191ec8c02d1e3366472e6e1add0671b6b8e249b` (`artifacts/sec006-required-gate.log`) |
| Full unit | `cd academy-web && npx vitest run --project unit --maxWorkers 1` | 0 (146 files / 2,417 tests) | `5a63cbae10bfc15cf67c8ca1ade3e0afa7f690963fdcf018cc71eaf1b4584a67` (`artifacts/sec006-full-unit.log`) |
| Lint baseline | `cd academy-web && npm run lint` | 1: known 3 `academy-bound-worker-executor.cjs` `no-require-imports` errors plus 16 warnings; changed-file ESLint passes | `f6877ce2381465a0ae9ab49b81fa76f4f11f27144d540e036b05c0cb0f93c531` (`artifacts/sec006-lint.log`) |
| DB apparatus | `cd academy-web && npx vitest run --project integration assessment-attempt-integrity --maxWorkers 1` | 1 before code: `TEST_DATABASE_URL` absent; Supabase status also cannot access Docker | `0bf5277e5c600514aa71a0dd9d5fe9840e054d887609dcc9d818f43587e8ec2e` (`artifacts/sec006-integration.log`) |

## Remaining release evidence

- Apply migration `0033` through the approved Pool A migration gate, then run the rolled-back integration fixture against disposable PostgreSQL.
- Run independent SQL review and production smoke: fourth rolling issue, dwell-time submission, consecutive-failure backoff, daily ceiling, and one legitimate successful learner attempt.
- Confirm structured warnings arrive in the existing production observability sink and trigger review at the intended threshold.
- Content lane must expand every certificate-bearing Crucible capstone to at least 15 authored MCQs (3× the five-question serve ceiling); current banks max out at five. This exact dependency prevents full SEC006 production closure even though application gates pass.
