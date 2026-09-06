# Academy canonical admission and bounded route budgets

## Outcome

The outer Worker now has one canonical admission boundary before OpenNext. It
performs an exact method:path lookup after one trailing-slash normalization.
Valid encoded public paths remain public. One strict decode rejects malformed
input, encoded slashes/backslashes/control bytes, dot segments, double encoding,
and decoded method:path disguises for protected handlers. Query strings remain
intact.

Admission then checks durable actor, actual-target, and global-route budgets.
Actor identity aggregates IPv6 to /64 and uses bounded request inspection for
targets. Object names are HMAC-derived; production handlers still fail closed
without a fresh method/path/time-bound marker. Existing SSO, lifecycle,
manual entitlement, disabled legacy OTP, host-gate, privacy, and stream-bounding
behavior remain in force.

## Evidence

- Base: detached `621d028c995dd370c9317349f325e8dc43b5dc2f`; retained artifact
  SHA-256 `076d48b571f1b4f4deaccc87b00ff848ee93f140e604194a28ee831204d9486c`;
  `git apply` exit 0.
- Type RED: `npx tsc --noEmit` exit 2 with TS2345 at
  `tests/unit/identity-security-admission.test.ts:82`; the fixture now uses a
  real `NextRequest`.
- Route RED: focused command exit 1; the new valid encoded public assertion
  received `{ kind: "invalid" }`. Raw output:
  `artifacts/canonical-route-budget-local.red.log`
  (`7e35439ccf66214c2c8c3133cce6aaa0999f5a77500d1b47b3011c12b7278e1f`).
- Outcome gate: exact controller command exit 0, focused `21/21`, then both
  TypeScript configs pass. Raw output:
  `artifacts/canonical-route-budget-local.outcome-gate.log`
  (`5e70fed5e457ef7ac3a1ce7793367f2f17fbb1a5be6b2072a12e8b3f9a83b32e`).
- Full unit: `npm run test:unit` exit 0, 145 files and `2411/2411` tests. Raw
  output: `artifacts/canonical-route-budget-local.full-unit.log`
  (`c4a3f8e06b47fe59d198a763b4c41bc90ea01886cb1260c3bb7b4eff248776b4`).
- Lint: exit 1 with only the parent-known baseline: three
  `no-require-imports` errors and 16 warnings, no new findings. Raw output:
  `artifacts/canonical-route-budget-local.lint.log`
  (`ddee13cef7e1cbf1f417ce23ec3d6316612e5a301bad07e5c7cff7ab41545e45`).
- Prior independent review `235e83e5` was PASS with LOW findings for DO-only
  fixture coverage and rotation. This session adds local workerd enforcement,
  marker verification, ambiguity rejection, and documents rotation bounds.

## Local workerd and build boundaries

The workerd fixture now uses the real DO binding through
`enforceEdgeRateLimit`: it preserves an encoded public request, returns `404`
for `/auth%2Fcallback`, admits ten requests with valid markers, then returns
`429`. `npm run verify:workerd` nevertheless exits 1 because this sandbox denies
`listen("127.0.0.1")` with `EPERM`; the fixture itself remains localhost-only.
Raw output: `artifacts/canonical-route-budget-local.workerd.log`
(`03b383a73f05845a628a7cfcefb2b9b0c322004b64f348873877c624416e8641`).

Cloudflare build exits 1 after the separately skipped localhost gate because
Next cannot resolve `fonts.googleapis.com` in the restricted network. No deploy,
provider request, database mutation, secret value, or outbound mail occurred.
Raw output: `artifacts/canonical-route-budget-local.buildcf.log`
(`6e805a97bc45820180092a437da0931764c048a5b965f50b90c07e12c5f61f6d`).

## Rotation boundary

Marker and object derivation use one active secret. Key rotation changes all
scope names and marker signatures, invalidates outstanding markers, and resets
active fixed-window budgets. This bounded behavior is intentional; no multi-key
compatibility framework was invented. Rotation remains a coordinated deploy
operation using a fresh high-entropy secret delivered through Wrangler stdin.

## Remaining boundaries

Production smoke/deployment, host/Zero Trust verification and authenticated
production journeys remain open. Current session authority covers related release
work; authorization is not the cause of the earlier local sandbox failures.

## Parent acceptance — 2026-09-06T10:43Z

The parent checked the raw RED assertion (encoded public path was incorrectly
invalid), verified all 29 frozen review file hashes, and independently ran from
`academy-web/`: `npx vitest run --project unit --maxWorkers 1` (2411/2411, exit 0),
`npx tsc --noEmit` (0), `npx tsc -p tsconfig.worker.json` (0), and
`npx tsc -p ops/academy-retention-worker/tsconfig.json` (0). `npm run lint`
returned 1 with exactly the accepted three baseline errors in
`academy-bound-worker-executor.cjs` and 16 warnings.

`npm run build:cf` returned 0, including all 13 real workerd checks: durable
counters, ten admitted and signed requests followed by 429, and ambiguous-path
refusal. Parent evidence is retained in `artifacts/canonical-route-budget-parent.gates.json`
and `artifacts/canonical-route-budget-parent.buildcf.log`. Earlier sandbox logs
above remain historical evidence and are not current build results.

Independent frozen review `run-59d901374f69473c8e1886182a61ce4a` returned PASS
with no findings; its exact JSON is `artifacts/canonical-route-budget-parent.review.json`.
The reviewer withdrew the earlier get/put race claim after checking Cloudflare
input gates, and the distributed rollback demand because these are abuse attempt
budgets rather than success-only reservations. No implementation was changed to
satisfy either unsupported finding. Production acceptance remains open.
