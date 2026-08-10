# Academy Identity Control Conformance Ledger Refresh

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Identity Control source:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a deterministic local generator for its Identity Control
consumer-conformance ledger. The refresh retains nine previously accepted local
scenarios, promotes only the five lifecycle scenarios supported by final
independent checkpoint reports, and leaves nine runtime-dependent scenarios as
`not_proven`.

The resulting ledger records 23 applicable scenarios: 14 local passes and 9
explicit gaps. It keeps the Academy registry entry disabled, keeps
`releaseApproval=false`, and records that no runtime is wired. This checkpoint
does not authorize sign-in, lifecycle traffic, deployment, or production use.

## Source-Bound Inputs

The generator refuses any Academy or Identity Control HEAD other than the two
revisions above. It also verifies the six canonical Identity Control artifacts
at their exact SHA-256 values before generating evidence. Those digests remain:

| Producer artifact | SHA-256 |
| --- | --- |
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |
| `docs/integration/consumer-conformance-kit.md` | `d49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0` |
| `docs/integration/lifecycle-pull-consumer-contract.md` | `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `packages/testing/src/index.ts` | `f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9` |

The lifecycle evidence artifact verifies exact digests for the final envelope,
reducer, durable page-store, pull-lease, and pure pull-cycle reports. It also
binds the accepted lease and pull-cycle freeze manifests. Digest drift stops
generation rather than silently promoting a scenario.

## Scenario Disposition

The five newly promoted local scenarios are:

- `lifecycle.envelope-cryptographic-verification`
- `lifecycle.duplicate-stale`
- `lifecycle.gap-conflict`
- `lifecycle.config-revision-change`
- `lifecycle.cursor-after-commit`

The nine explicit gaps remain:

- `authorization.exact-registered-redirect`
- `authorization.state-binding-mismatch`
- `callback.login-csrf`
- `callback.origin-fetch-metadata`
- `exchange.client-assertion`
- `exchange.code-replay-expiry`
- `exchange.result-key-rotation`
- `academy.activation-profile-only`
- `academy.canonical-founder-bootstrap`

These gaps require released endpoint/key/audience policy, runtime wiring,
canonical sign-in, owner bootstrap, or deployed evidence. The generator does
not infer any of those inputs.

## Deterministic Receipt Boundary

The report declares one checkpoint manifest with the producer-defined schema and
role. Its exact eight content paths include the generator, test, generated
evidence, unproven receipt, conformance report, this review, and the two narrow
plan files. The manifest is outside its own file list:

`reports/reviews/academy-identity-control-conformance-ledger-refresh-freeze-20260810.json`

Generation writes the evidence and unproven receipts first. It then asks the
canonical Identity Control CLI for local consumer and producer receipts while
excluding only the conformance report and declared checkpoint manifest. The
final conformance report is written last. The checkpoint manifest is rendered
after all eight content files are final, then canonical intake verifies both the
report and manifest.

Raw Git inspection established that the Academy index had zero staged changes at
the baseline. An earlier wrapper pipeline count of one was a blank-line count;
`git diff --cached --name-only`, `--raw`, and `--numstat` were all empty. No
unrelated path is excluded from the receipt or hidden by this checkpoint.

## TDD And Verification

The RED run failed with `ERR_MODULE_NOT_FOUND` before the generator existed.
GREEN then passed the deterministic contract matrix on Node 24.18.0.

| Gate | Result |
| --- | --- |
| Generator focused test | PASS, 5/5 |
| Academy Identity unit regression | PASS, 12 files / 125 tests |
| Academy full unit regression | PASS, 81 files / 780 tests |
| Identity Control intake regression | PASS, exit 0 |
| Scoped ESLint | PASS |
| Full lint and TypeScript checks | PASS; one pre-existing generated-registry warning |
| Node syntax checks | PASS |
| Canonical final intake | PASS, 23 verified / 14 pass / 9 not-proven |
| Manifest verification | PASS, exact 8 content files |
| Different independent RIL | PASS `C0/H0/M0/L0` |
| Root manifest re-verification | PASS, exact 8 content files |
| `gitleaks detect --source . --no-banner` | PASS, 162 commits / no leaks |
| Tracked and new-file whitespace checks | PASS |
| Author reader-first pass | PASS |

Visual review is not applicable: this checkpoint changes only a local generator
and evidence artifacts; it does not alter UI, copy, layout, routes, or runtime
states.

## Release And Review State

A different independent reviewer closed the checkpoint at `C0/H0/M0/L0`; root
separately re-verified the declared eight-file manifest. Identity Control still
records Academy and Crux as `enabled=false`; Academy keeps
`releaseApproval=false` and `runtimeWired=false`. Publisher endpoint,
verification keys, lifecycle audiences, kill-switch owner, authenticated
transport, scheduler/runtime bindings, canonical owner bootstrap, deployed
browser evidence, and separate production authorization remain external gates.

No database, server, PID, secret, route, Worker, registry, Identity Control file,
production system, or network resource was changed. No file was staged,
committed, pushed, deployed, reset, discarded, or checked out.
