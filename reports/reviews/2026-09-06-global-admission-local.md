# Academy aggregate authorization admission

The database create RPC serializes admission across runtime instances and enforces an operator-owned outstanding-row limit (default1000, tested at4). Expired-row cleanup is bounded to100 per request. Runtime handles capacity refusal as an opaque429 before calling Identity. Existing edge marker, form-size and host gates remain.

Parent PostgreSQL verification found and repaired a duplicate precheck that ignored an in-flight row deletion. It now waits for the row lock before deciding whether a duplicate survives. The new capacity-recovery test had an off-by-one fixture and omitted the existing final exhaustion claim; both were corrected without changing callback retry policy. After three failed releases, the slot remains occupied until the next claim classifies exhaustion or the transaction TTL expires (maximum600seconds). This residual behavior must be assessed in independent review.

Evidence in `2026-09-06-global-admission-evidence/gates.json` binds the raw outputs:

- Baseline create RPC:12 concurrent clients all admitted, violating the test cap4 (exit1).
- Candidate PostgreSQL:18/18 passed (exit0), including12 concurrent clients under cap4, stale claims, expiry, full TTL after lock wait and private-table grants.
- Unit:2146/2146 passed; app/worker/retention TypeScript and `npm run build:cf` exit0.
- `npm run lint` exit1: unchanged baseline3errors16warnings.
- Disposable PostgreSQL reused the existing pinned-image ownership/cleanup helpers. Bootstrap SQL first completed ROLLBACK before COMMIT; all owned fixture containers were removed and absence verified. No production DB was used.

The SQL migration has not been applied to production. Independent approval, production dry-run/guarded COMMIT, host gate and authenticated learner journey remain required. Restore the previous create-function definition before dropping the capacity table if reverting the schema; pair schema rollback with compatible code. The captured controller fixture scripts retain exact local paths as execution evidence, not as a production deployment procedure.

## Independent checkpoint

Frozen source efd457b; source digest 29316cc66693b6bfb21bcb39feece0e06b9b9bf9a7f9fade714601f85091e556. Independent result PASS, no unresolved medium/high finding. See adjacent independent result and receipt JSON. Controller checked the actual result against the retained PostgreSQL 18/18 and unit2146/build evidence. Delayed capacity release up to600s and manual coordinated rollback remain explicit limitations. Production migration and authenticated journey remain pending.
