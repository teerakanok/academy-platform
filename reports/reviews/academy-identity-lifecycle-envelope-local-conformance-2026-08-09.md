# Academy Identity Lifecycle Envelope Local Conformance

**Date:** 2026-08-09  
**Scenario:** `lifecycle.envelope-cryptographic-verification`  
**Academy implementation revision:** `845e371173efb7b15b7605ecbc9496c47e2068fb`  
**Status:** PASS - C0/H0/M0/L0; production NO-GO

## Outcome

Academy now has a local library boundary that verifies the producer-owned ES256
lifecycle envelope before returning its event. The boundary is not imported by a
route, adapter, transport, configuration loader, or session flow. This checkpoint
therefore proves the cryptographic consumer behavior only.

The positive test uses the exact
`consumerLifecycleEnvelopeConformanceVectorV1` compact JWS, public JWK, issuer,
audience, key ID, verification time, clock skew, lifetime, and expected event.
The vector's compact JWS SHA-256 is
`8768d5258b9cfa2ae602ff24ddf273b37b48f26075bbeb2d5b6498c6d2b0b730`.
No replacement key or signature was generated.

## Source-Bound Provenance

Identity Control was read at exact revision
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`. Read-only SHA-256 verification
matched all six frozen artifacts:

| Artifact | SHA-256 |
|---|---|
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |
| `docs/integration/consumer-conformance-kit.md` | `d49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0` |
| `docs/integration/lifecycle-pull-consumer-contract.md` | `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `packages/testing/src/index.ts` | `f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9` |

Academy started at HEAD
`9efac4ea24d58734303de11657085ebea6b85e05` with the exact 169-entry dirty
allowlist preserved. The four-file implementation and producer-provenance update is
frozen locally at `845e371173efb7b15b7605ecbc9496c47e2068fb`; unrelated dirty work remains
outside that commit.

## Consumer Boundary

`verifyIdentityLifecycleEnvelope` performs these checks before returning an event:

- canonical three-part compact JWS and bounded canonical base64url decoding;
- exact header, claim, and event keys;
- `ES256`, `identity-event+jwt`, and exact key ID;
- exact issuer and audience;
- finite verification clock, bounded skew, expiry, and maximum lifetime;
- P-256 public JWK shape with verification-only key usage; and
- WebCrypto ECDSA SHA-256 signature verification.

Failures return `null`. The verifier does not accept or log secrets and has no
network, storage, registry, session, or route dependency.

## TDD And Verification

The RED run failed because the new verifier module did not exist. After the
smallest local boundary was added:

| Gate | Result |
|---|---|
| Focused vector suite | 4/4 passed |
| Focused identity regression | 48/48 passed |
| Full unit regression | 478/478 passed |
| `npm run lint` | Passed; one pre-existing warning in `registry.generated.ts` |
| `npm run build` | Passed; 29 static pages generated |
| `gitleaks detect --source . --no-banner` | No leaks found |
| `npm ls --depth=0` | Completed; existing `@emnapi/runtime` remains extraneous |
| `npm audit --omit=dev --audit-level=low` | Four existing High transitive advisories remain |

The negative matrix covers signature, algorithm, key ID, issuer, audience,
verification time, skew, lifetime, strict event schema, malformed P-256 JWK,
array-like non-array `key_ops`, and malformed compact JWS. No dependency was added
or changed. The audit findings
are in `nanoid`, Next-bundled `postcss`, and `sharp`; resolving them is outside
this cryptographic boundary and remains a separate dependency/release gate.

Database integration, lifecycle transport, cursor commit, runtime routes,
configuration loading, key distribution, owner bootstrap, deployment, and
browser behavior are not applicable to this local-only slice. They remain
blocked by the production/runtime handoff
`20260809T013829227Z-academy-identity-runtime-blocked.md`.

## Release And Review State

Identity Control still records both Academy and Crux as `enabled=false`.
Academy local evidence keeps `releaseApproval=false`; it does not authorize
runtime integration or production release.

The initial final reviewer found one Low JWK-shape issue: an array-like object could
reach WebCrypto as `key_ops`. Academy now requires a real array and the focused negative
case passes. Independent closure review reproduced the fix and final revisions with no
new finding, returning C0/H0/M0/L0. This is a local checkpoint PASS; production remains
NO-GO.

The shared mechanical reader-first gate scanned 1,032 units across the final Crux and
Academy consumer reports, conformance JSON, and identity integration plan with 0 errors
and 0 warnings. The independent human reader-first lane also passed.
