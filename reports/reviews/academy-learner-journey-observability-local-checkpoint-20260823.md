# Academy learner-journey observability - local checkpoint - 2026-08-23

## Outcome

Academy now has a provider-neutral local event contract for six critical learner-journey
checkpoints and a deterministic synthetic-readiness assessor. The contract accepts only
fixed low-cardinality dimensions, rejects arbitrary or identifier-bearing metadata, maps
failures to explicit Academy or Identity operational ownership, and reports ready only
when every required synthetic checkpoint exists exactly once and succeeds.

This checkpoint does not emit telemetry, create an alert route, define a production SLO,
read environment or credentials, wire Identity, touch a database, deploy, or authorize
production.

## TDD and verification

| Gate | Result |
|---|---|
| RED | Test-only integration failed on the expected missing observability module |
| Initial author | 9/13; correctly exposed rejection of all ordinary evidence arrays |
| Remediation chain | Closed array validation, static typing/lint, expected-denial readiness, canonical locale, and mutable UI coupling defects |
| Final focused | 14/14 passed on Node 24.18.0 |
| Related | 20/20 passed across observability, safe-log, and Identity runtime routes |
| Full unit regression | 128 files / 1,991 tests passed |
| Static | Scoped ESLint clean; `tsc --noEmit` zero errors; diff and forbidden-field scans clean |
| Independent review | First strict RIL failed closed on provider result schema; unchanged retry PASS with findings `[]` |
| UI / visual | N/A: no DOM, CSS, copy, or rendered customer state changed |

## Progress denominator

- This local checkpoint: **1/1 complete**.
- Critical journey taxonomy: **6/6 checkpoints represented**.
- Focused behavior: **14/14 passing**.
- Production-gap observability pillars: **2/5 locally evidenced**: privacy-safe event/redaction
  contract and deterministic synthetic readiness. Still open: consolidated SLOs, error-budget
  policy, and deployed/operator-tested alert routes.
- Canonical Identity conformance remains **16/23**; the seven remaining items still require
  deployed evidence or owner bootstrap.
- Production admission remains **0/1**: all enablement, runtime, release, evidence, and
  production-readiness flags remain false.

## Files

- `academy-web/src/lib/observability/learner-journey.ts`
- `academy-web/tests/unit/learner-journey-observability.test.ts`
- `reports/reviews/academy-learner-journey-observability-provider-call-log-20260823.json`
- `reports/reviews/academy-learner-journey-observability-glm-ril-final-20260823.json`
- `reports/reviews/academy-learner-journey-observability-closure-freeze-20260823.json`

## Next safe local slice

Define the remaining local SLO/error-budget decision contract against these six bounded
checkpoints, including window/threshold validation and deterministic burn-state
classification. Actual telemetry emission, alert destinations, operator paging, and
production synthetic execution remain separate authorized release work.

## Sol integration verdict

Accepted locally with no unresolved Critical, High, or Medium finding. This closes a
contract and deterministic synthetic-assessment gap only; it is not live observability,
release approval, or production readiness.
