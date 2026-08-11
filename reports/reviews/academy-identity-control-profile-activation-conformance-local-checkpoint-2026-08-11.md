# Academy Identity Control Profile-Activation Conformance Refresh

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS - C0/H0/M0/L0
**Production:** NO-GO
**Academy source:** `1039c2c53397a9404523c7941bc532ee1cce91f6`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

The deterministic Academy consumer-conformance generator now binds the accepted
profile-activation store checkpoint and classifies
`academy.activation-profile-only` as locally proven. That checkpoint verifies a
single statement-level PostgreSQL transaction that projects only the Academy
profile and revision-aware service activation after a verified code-exchange
result. It contains no entitlement or staff-role mutation.

This refresh moves the local ledger from 15 to 16 passes across 23 scenarios and
retains seven explicit `not_proven` scenarios. The classification is evidence
bookkeeping only: `enabled=false`, `releaseApproval=false`,
`runtimeWired=false`, and `productionReady=false` remain unchanged.

## Evidence Boundary

The new checkpoint entry is source-bound to these independently reviewed
artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md` | `a56ff9a9e96b5aa09a6348136b1603cff84da42e3659ac60107dcf3ce19c258f` |
| `reports/reviews/academy-identity-profile-activation-store-freeze-20260811.json` | `735bbb10654bfd7994c3b982c766341bbfda66e3def1f7dfab57b1a458159f45` |

The generator also pins Academy commit
`1039c2c53397a9404523c7941bc532ee1cce91f6`, Identity Control commit
`ad97ba2236bddbc4857d45359bb37b032aebbb05`, the existing producer-contract
artifacts, and every previously accepted local checkpoint digest. Any drift
stops generation.

The evidence supports only the profile-and-activation projection. Callback
cookie provenance, authenticated HTTP exchange, durable production transaction
ownership, runtime composition, operator controls, deployment, and release
approval remain separate gates.

## Scenario Disposition

The newly promoted scenario is:

- `academy.activation-profile-only`

The seven remaining explicit gaps are:

- `authorization.exact-registered-redirect`
- `authorization.state-binding-mismatch`
- `callback.login-csrf`
- `callback.origin-fetch-metadata`
- `exchange.code-replay-expiry`
- `exchange.result-key-rotation`
- `academy.canonical-founder-bootstrap`

The other 15 accepted scenarios retain their existing evidence and semantics.

## TDD And Verification

The test-only RED changed the generator contract to require the reviewed profile
checkpoint, a 16/7 summary, and removal of only the profile-only scenario from
the unproven receipt. It returned 6/7 passing while the generator still
classified that scenario as `not_proven`. GREEN 7/7 now proves the exact
report/manifest binding, the single-scenario promotion, the seven retained
gaps, and the unchanged runtime and release flags. The accepted profile-store
unit regression remains GREEN 21/21 on Node 24.18.0.

The deterministic write/current check passes with 23 scenarios. Canonical
Identity Control intake verifies all 23 scenarios as 16 pass and 7
`not_proven`, preserves `releaseApproval=false`, and matches both local Git
receipts. The director manifest utility verifies the exact eight content paths.

| Gate | Result |
| --- | --- |
| Conformance generator | PASS - 7/7 |
| Accepted profile-store unit regression | PASS - 21/21 |
| Generator write/current check | PASS - 23 scenarios |
| Canonical Identity Control intake | PASS - 23 verified / 16 pass / 7 not-proven |
| Checkpoint manifest verification | PASS - exact 8 content files |
| Different independent C/H/M/L review | PASS - C0/H0/M0/L0 |

The different reviewer independently rebound the eight-file manifest, confirmed
that only `academy.activation-profile-only` changed classification, reran the
focused generator and canonical intake, and returned `C0/H0/M0/L0`. Node syntax,
scoped ESLint, whitespace, exact-path secret scanning, JSON formatting, and
reader-first checks also passed.

UI, visual, browser, database mutation, migration execution, and deployment
lanes are N/A for this refresh. It changes only the deterministic evidence
generator, tests, generated receipts, and checkpoint documentation.

## Freeze And Release Boundary

The checkpoint declaration contains exactly eight content paths: generator,
generator test, the three canonical generated JSON files, this report, active
plan, and completed log. The manifest remains outside its own list:

`reports/reviews/academy-identity-control-profile-activation-conformance-freeze-20260811.json`

Canonical receipt capture excludes only the generated conformance report and
this named manifest. Other tracked and untracked Academy state remains visible
in the receipt.

This checkpoint adds no production-readiness percentage points by itself.
Registry enablement, runtime wiring, deployment, and release remain NO-GO until
their separately owned evidence and authorization gates pass.
