# AL-24 evidence — typed Academy public-launch runbook

## Result

Implemented `academy-web/ops/runbooks/AL-10.json` and the product-owned launch helpers:

- protected Cloudflare Access application/policy plus baseline-probe snapshot;
- audited eight-course visibility launch and exact-state rollback;
- Cloudflare Access public topology change that keeps `/admin`, `/api/admin`, and `/player` internal;
- the exact public launch exposure postcheck including the raw workers.dev `404` gate;
- in-process fake Cloudflare API and fake public-postcheck coverage;
- a loopback-only Postgres rehearsal command and integration test for migration `0043`.

No live Cloudflare, Academy, Pool A, DNS, Worker, account, media, retention, or production HTTP call was made by this worker.

## Course visibility mechanism and trade-off

The runbook does not write `academy.course_settings` with SQL and does not borrow a human owner browser session. Migration `0043_launch_course_visibility_rpc.sql` adds:

- `academy.inspect_launch_course_visibility()`;
- `academy.set_launch_course_visibility(jsonb, jsonb, text, text, boolean)`;
- append-only `academy.course_settings_launch_audit`.

The scoped launch database credential must connect through a member of `academy_staff_admin`, which receives execute only on the two RPCs and no `course_settings` table rights. The RPC requires the protected pre-change state hash, derives the sole active owner, accepts only the founder-approved launch shape, and records exact before/after rows, owner account, founder approval reference, changed-row count, and timestamp. Rollback accepts only the exact audited pre-launch state and records the reverse transition.

Trade-off / deployment precondition: production must deploy reviewed migration `0043` through the amended AL-09 release before AL-10 can be approved. If that migration is absent, the visibility step fails closed and Access must not change. The credential is capability-bearing and must be scoped and rotated through the secret registry; only its env name is in the manifest.

## Source PASS

From `academy-web/` unless stated otherwise:

- Manifest validator:
  - command: `PYTHONPATH=/Users/teerakanok/Dev/cyberskills-director-governance/scripts python3 -c 'import json,gathering_ops; gathering_ops._validate_manifest(json.load(open("ops/runbooks/AL-10.json")))'`
  - result: exit `0`; schema `gathering-ops/v1`; 5 steps; 8 tracked execution inputs; 3 writable output directories.
- Focused unit gate:
  - command: `./node_modules/.bin/vitest run --project unit tests/unit/launch-ops-runbook.test.ts --reporter=verbose`
  - result: exit `0`; 7/7 tests PASS.
- Full unit gate:
  - command: `./node_modules/.bin/vitest run --project unit --reporter=dot --sequence.concurrent=false --max-concurrency=1`
  - result: exit `0`; 171/171 files PASS; 3238 PASS, 2 skipped, 0 fail.
- TypeScript:
  - command: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/tsc -p tsconfig.worker.json && ./node_modules/.bin/tsc -p ops/academy-retention-worker/tsconfig.json`
  - result: exit `0`.
- Scoped lint:
  - command: `./node_modules/.bin/eslint ops/launch tests/unit/launch-ops-runbook.test.ts tests/integration/launch-course-visibility-rpc.test.ts`
  - result: exit `0`, no warnings for this card.
- Node syntax:
  - command: `node --check` for all six files under `ops/launch/`
  - result: exit `0`.
- Full `npm run lint` reaches the documented pre-existing baseline and exits `1` on exactly the three `require()` errors in `scripts/academy-bound-worker-executor.cjs`; no new file or error was introduced. The three TypeScript commands above were therefore run separately and passed.
- Secret scan:
  - `gitleaks dir . --no-banner --redact` reported 28 pre-existing tracked findings in old Identity/report fixtures and the known non-secret Cloudflare identifiers; none were in files added by AL-24.

## Local receipts

Protected fake-rehearsal evidence is outside Git under the Gathering state directory:

- Cloudflare in-process fake snapshot/apply/rollback:
  - `/Users/teerakanok/.local/state/cyberskills/gathering-academy-first-launch/evidence/AL-24/cloudflare-inprocess-20261005T235200/`
- Public postcheck fake receipt:
  - `/Users/teerakanok/.local/state/cyberskills/gathering-academy-first-launch/evidence/AL-24/postcheck-fake-20261005/launch-postcheck.json`

SHA-256:

- `access-snapshot-summary.json`: `b3b344408a09bbc1a7f0f89600f994d1160bf2a5869ccc638c30d292742938f7`
- `baseline-probes.json`: `7dec5c5ad83c825966907a0237950a0380e0f304316c7515cbed524adb37c22b`
- `access-launch-receipt.json`: `39b012364ee0e912e8b38dd6862313b9c1d73422d84c93d77ec4b85c7a5f4362`
- `access-rollback-receipt.json`: `8a57f51332326b9487f791eb26792cfaa289825f1740d411f6b632f8389e9c5b`
- `launch-postcheck.json`: `d2272721d31a9186a0d4e777a3b6f43a696161da253be389b502b40a75d3204a`

The receipts are sanitized/fake values only. The full Cloudflare API export remains a runtime-only writable output in the real run because a live export can contain directory emails or identifiers.

## NOT_RUN in this sandbox — host commands

Port/IPC and Docker were denied by the managed sandbox:

- actual loopback fake Cloudflare server: `listen EPERM 127.0.0.1`;
- Docker socket: `permission denied`;
- Supabase CLI telemetry path outside writable roots: `EPERM`.

Therefore the native Postgres/fake-server receipts remain host-run inputs, not worker PASS claims.

HOST-E2E fake Cloudflare server:

```bash
cd /Users/teerakanok/Dev/continuations/academy-first-launch-glm-2/academy-web
node ops/launch/rehearse-cloudflare-access.mjs /tmp/al24-cloudflare-rehearsal
```

HOST-E2E disposable local Postgres reset and visibility rehearsal:

```bash
cd /Users/teerakanok/Dev/continuations/academy-first-launch-glm-2/academy-web
npx supabase start
npx supabase db reset --local --no-seed
ACADEMY_LAUNCH_DATABASE_CREDENTIAL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  node ops/launch/rehearse-course-visibility.mjs /tmp/al24-course-visibility-rehearsal
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  ./node_modules/.bin/vitest run --project integration tests/integration/launch-course-visibility-rpc.test.ts --reporter=verbose
```

Expected host evidence: the rehearsal JSON records exit `0` for snapshot, check-snapshot, apply, check-launch, rollback, and check-rollback; the integration test proves launch, idempotent relaunch, exact rollback, idempotent rerollback, and two durable audit rows.

## Founder-only / separate preconditions (not runbook steps)

- Founder second-account free-enrol journey canary using the production-playtest authority and cleanup contract.
- Authenticated private-media production proof for `basic-os-linux`.
- Retention worker first scheduled-event evidence for every configured job.
- Fresh founder GO after independent review and after AL-09 (including migration `0043`) is complete.

## Residual risks

- Native Postgres and the real loopback fake-server process were not executable in this sandbox; host evidence is required before integration.
- AL-09's existing card/pin predates migration `0043`; the host must amend/re-run the reviewed release plan so production actually contains the RPC before AL-10 approval.
- Cloudflare API application-field compatibility is source/fake-tested, not production-proven. The live snapshot step fails closed if the API shape, application, policy, or gated baseline differs.
- Independent reviewer PASS from another provider is still required by the Gathering card.
