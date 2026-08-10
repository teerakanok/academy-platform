# Identity Control Consumer Conformance Checkpoint RIL

**Date:** 2026-08-08  
**Scope:** Academy's local-only M-03 consumer-lineage reconciliation. This
checkpoint does not remediate Identity Control-owned receipt findings or the
fourteen Academy scenarios that remain unproven.  
**Academy source revision:** `cd623ce2c7aa2858580901a0715daffd51b52876`  
**Academy state:** dirty, uncommitted, and receipt-bound; no commit performed

## Frozen Identity Control Lineage

**Producer revision:** `8c54bd35c06ff173185ab6c0ffa986492f03e990`  
**Intake script SHA-256:**
`5212f6e9d66796cbc27d886d4c8195e80d766d05c0e45e10ccc60eec6a1bd794`  
**Focused intake-test SHA-256:**
`560d1abae97651b0e106ebc28d53fa28e57663563e448f1b198c2eec242af218`

| Canonical producer artifact | SHA-256 |
| --- | --- |
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |
| `docs/integration/consumer-conformance-kit.md` | `a9cf67af9d9e785af93e7130d03e5b677ac1410ea04b4d6119c35e1cf7022214` |
| `docs/integration/lifecycle-pull-consumer-contract.md` | `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `packages/testing/src/index.ts` | `9debd729ab67bcdbbb3c20add01ff51a9d0bc0742be81549e0b916448599c783` |

The Academy policy mirror and its focused assertion bind this exact revision and
all six digests. No active key, lifecycle publisher value, or kill-switch owner
was added or inferred.

## Invariants Rechecked

- Registered consumer remains `academy-web` / `academy` / `open` with
  `enabled=false`.
- Verification keys remain `active=null`, `overlap=[]`; lifecycle endpoint and
  both lifecycle audiences remain `null`; kill-switch owner remains `null`.
- Account lifecycle, service activation/profile creation, Academy-owned paid or
  durable course entitlement, and per-resource authorization remain separate.
  Activation alone grants no course access.
- The real adapter remains fail-closed while the registry is disabled and the
  local fake remains prohibited in production.

## Evidence Commands And Results

| Command | Result | Immutable artifact SHA-256 |
| --- | --- | --- |
| `npm run test:unit -- tests/unit/identity-consumer-policy.test.ts tests/unit/identity-registry.test.ts tests/unit/identity-transaction.test.ts tests/unit/auth-callback-route.test.ts tests/unit/identity-session-store.test.ts tests/unit/course-access.test.ts` | PASS — 6 files / 30 tests | `academy-identity-unit-conformance.txt` `2f3e45ba63c978a6f730873ca6c0aa619064a9d0d6145594fee9cfe668051fc1` |
| `npm run test:unit` | PASS — 53 files / 432 tests | `academy-unit-regression.txt` `5d2d6b8db1a5ca7e60925de393cc6ecfc6102a71dc8bb9ecc71d266e9646500c` |
| `npm run lint` | PASS — 0 errors; one pre-existing generated-registry unused-disable warning | `academy-lint-typecheck.txt` `36c6592f45caf7e741453fa24d1c92543d4972e6bec3817cc5f47c5c4c6b3e82` |
| `npm run test:integration -- tests/integration/identity-boundary.test.ts` | BLOCKED — 15 tests skipped; sandbox loopback connection denied (`EPERM 127.0.0.1:54322`); no database action taken | `academy-identity-integration-conformance.txt` `053923d751a197306eb0fa64c5c86c931ad62bb0518059d9d4b6209dc9ff8554` |

The unproven-scenario declaration is
`academy-identity-unproven-scenarios.json`
SHA-256 `0566ba7c0a81826be72129c788be11340cb85cb9860ea36004d385b9a48dfebe`.
It records 14 scenarios as `not_proven`; it does not convert the integration
blocker into a passing claim.

## Receipt And Intake Boundary

The canonical Identity CLI is run with `--print-local-receipts` only after this
review and every other receipt-bound Academy artifact is final. The resulting
report is then generated last and is excluded from its own consumer receipt.
The expected producer receipt is exactly:

- schema `identity-control-producer-local-receipt/v1`, head
  `8c54bd35c06ff173185ab6c0ffa986492f03e990`;
- head state `068182706e633c018cf701a2fa683d8071742828fd9a757280dc0c43c58a0043`,
  count `2`;
- index state `15e0de5b866e2efc225e92ecb17eb7927691a8d7fb8821625a3e0a44a53c80aa`,
  count `2`; and
- worktree state `6d74f557f6dcfe406d75abf5897de976fd54dba2b4f23c7d41bc563fade39813`,
  count `6`.

The final JSON report SHA-256 is recorded after its last write in
`/tmp/academy-m3-lineage-final.md`. It is intentionally not embedded here:
this review is itself receipt-bound, so inserting the final report's hash here
would change the consumer receipt that the report must contain.

## Independent Review Lanes

### Code quality and debt

**Verdict:** PASS — `C0/H0/M0` within this Academy M-03 scope.

One non-secret lineage projection and its assertion now share one frozen
producer revision and six exact bytes. No runtime policy was duplicated and no
unrelated refactor was introduced.

### Security

**Verdict:** PASS — `C0/H0/M0` within this Academy M-03 scope.

The lineage correction preserves disabled, null, and fail-closed behavior. It
does not manufacture credentials, keys, lifecycle traffic, activation, or
authorization.

### UX and reader-first quality

**Verdict:** N/A for visual UX; PASS — `C0/H0/M0` for operational wording.

There is no UI change. The evidence separates local PASS, blocked tests,
unproven scenarios, and release authorization so an operator cannot read this
checkpoint as a release approval.

## Final Checkpoint Verdict

**PASS for Academy's M-03 consumer-lineage reconciliation only — C0/H0/M0.**
This is local evidence, not all-pass release conformance. Academy remains
pre-production and disabled with 9 locally proven scenarios and 14 unproven
scenarios. Identity Control's M-01 and M-02 are remediated locally and await
independent final review; L-01 TOCTOU, absent keys and lifecycle values, and
separate production authorization remain outside this completed consumer slice
and keep release at NO-GO.

## Safety Confirmation

No Identity Control file, key, secret, DNS, Pool A, Supabase, Google Workspace,
Cloudflare, RDC, database, deployment, production sign-in, lifecycle traffic,
network resource, or external system was changed. No Academy file was staged,
committed, pushed, reset, checked out, or discarded.
