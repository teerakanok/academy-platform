# Academy Identity Control Client-Assertion Conformance Refresh

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS - C0/H0/M0/L0
**Production:** NO-GO
**Academy source:** `18a92e942fb101e6f413a1579d20251bf2b08160`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has source-bound local evidence for the canonical
`exchange.client-assertion` consumer scenario. A focused composition test uses
the accepted Academy JTI source, provider, and Web Crypto signer together. It
creates two short-lived ES256 assertions with distinct JTI values, binds both to
the exact `academy-web` client and code-exchange audience, verifies each real
signature, and rejects a wrong audience before another JTI is requested.

The deterministic conformance generator now classifies 15 of 23 applicable
scenarios as locally proven and retains 8 explicit `not_proven` scenarios. The
registry remains disabled; `releaseApproval=false`, `runtimeWired=false`, and
`productionReady=false` remain unchanged.

The first different independent RIL returned `C0/H0/M1/L0`. The generated
evidence gave the composition test a review verdict even though it had no review
report, serialized that missing report as `{}`, and did not machine-bind the
Identity Control verifier/replay source and test that support the scenario's
one-time property. Test-only RED reproduced both gaps with 4/6 passing. The
generator now distinguishes reviewed checkpoints from test evidence, omits a
verdict and report from the composition entry, binds the exact producer
verifier and replay test from the pinned Identity Control HEAD, and rejects
either producer artifact if its digest drifts. The focused generator suite is
GREEN 6/6. A different independent closure reviewer bound the remediated
nine-file manifest and returned final `C0/H0/M0/L0`.

## Ownership Boundary

| Concern | Owner | Local evidence in this checkpoint | Still external |
| --- | --- | --- | --- |
| Assertion claims and binding | Academy provider | Exact `iss=sub=academy-web`, exchange audience, 60-second fixture lifetime, key ID, and compact ES256 shape | Production lifetime/config revision approval |
| JTI issuance | Academy JTI source | One captured Web Crypto `randomUUID()` call per assertion; canonical UUID v4 output | Identity Control replay reservation and production telemetry |
| Private signing operation | Academy Web Crypto signer | Opaque non-exportable P-256 fixture key and real 64-byte signature | Protected key ceremony, secret-store identity, public-key registration, and rotation |
| Assertion verification and replay | Identity Control | Generator-verified source and producer test that accepts once and rejects replay at exact digests | Deployed verifier, durable replay store, active/overlap registry, and traffic evidence |
| Conformance classification | Canonical Identity Control intake | Exact report, artifact digests, Git receipts, and checkpoint manifest | Client enablement and release authorization |

No Academy module reimplements Identity Control replay storage or registry
policy. Local JTI generation is probabilistic; the producer remains responsible
for atomically rejecting reuse. The new local pass therefore supports the
consumer contract without claiming that the production key or replay store
exists.

## Pinned Producer Contract

The canonical receipt continues to bind these six Identity Control artifacts:

| Producer artifact | SHA-256 |
| --- | --- |
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |
| `docs/integration/consumer-conformance-kit.md` | `d49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0` |
| `docs/integration/lifecycle-pull-consumer-contract.md` | `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `packages/testing/src/index.ts` | `f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9` |

The machine-generated local evidence also binds the producer verifier and replay
test from the exact Identity Control HEAD:

| Producer evidence | SHA-256 |
| --- | --- |
| `packages/core/src/client-assertion.ts` | `6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6` |
| `packages/core/test/client-assertion.test.ts` | `58b67a100de26a7d8ffcbce20e4c021c9b84b3a0c9c4351c4c702121981d8d61` |

The generator additionally verifies the final provider, JTI-source, and Web
Crypto signer checkpoint reports and freeze manifests at exact digests. Drift
in any accepted artifact or in the new composition test stops generation.

## Scenario Disposition

The newly promoted scenario is:

- `exchange.client-assertion`

The eight remaining explicit gaps are:

- `authorization.exact-registered-redirect`
- `authorization.state-binding-mismatch`
- `callback.login-csrf`
- `callback.origin-fetch-metadata`
- `exchange.code-replay-expiry`
- `exchange.result-key-rotation`
- `academy.activation-profile-only`
- `academy.canonical-founder-bootstrap`

The five accepted lifecycle scenarios and nine earlier local scenarios retain
their existing pass evidence. This refresh does not change their semantics.

## TDD And Verification

The initial test-only RED changed the generator contract to require the new
scenario, nine-file checkpoint declaration, and 15/8 summary. It failed before
test collection because the generator did not export a client-assertion
scenario set. After the generator classified the new source-bound evidence,
focused generation returned GREEN 5/5. The first RIL remediation added a second
RED: 4/6 passed while the self-declared verdict/empty report and unbound producer
evidence remained. GREEN 6/6 now proves the composition entry has only test
evidence, carries exact producer source/test references, and fails closed on
either producer digest drifting.

| Gate | Result |
| --- | --- |
| Client-assertion composition | PASS - 1/1 |
| Conformance generator | PASS - 6/6 |
| Academy Identity unit regression | PASS - 20 files / 288 tests |
| Academy full unit regression | PASS - 92 files / 978 tests |
| Identity Control assertion + lifecycle contract | PASS - 22/22 |
| Full Academy lint and all TypeScript configurations | PASS - one pre-existing generated-registry warning, zero errors |
| Canonical generator write/current check | PASS - 23 scenarios |
| Canonical Identity Control intake | PASS - 23 verified / 15 pass / 8 not-proven |
| Checkpoint manifest verification | PASS - exact 9 content files |
| First different independent C/H/M/L review | FAIL - C0/H0/M1/L0; evidence-chain finding remediated locally |
| Different independent closure review | PASS - C0/H0/M0/L0 |

UI, visual, browser, database, migration, and deployment lanes are N/A. This
checkpoint adds one test and deterministic evidence changes; it does not change
routes, rendered state, durable data, credentials, registry state, or runtime
imports.

## Freeze And Release Boundary

The checkpoint manifest will bind nine content paths: generator, generator
test, client-assertion composition test, three canonical generated JSON files,
this review, active plan, and completed log. The manifest remains outside its
own list:

`reports/reviews/academy-identity-control-client-assertion-conformance-freeze-20260811.json`

Canonical receipt capture excludes only the generated conformance report and
the declared manifest. Every other dirty tracked or untracked Academy path
remains visible in the receipt.

The Identity Control registry still records `enabled=false`, no active
verification key, no lifecycle publisher endpoint or audiences, and no named
kill-switch owner. Key ceremony, public-key registration/rotation, deployed
replay storage, endpoint/runtime wiring, operator evidence, and separate
production authorization remain mandatory external gates. This checkpoint
increases canonical local conformance from 14/23 to 15/23 and adds zero
production-readiness percentage points by itself.
