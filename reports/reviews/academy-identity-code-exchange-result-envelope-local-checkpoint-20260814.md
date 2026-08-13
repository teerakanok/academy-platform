# Academy Identity Code-Exchange Result Envelope Local Checkpoint

**Date:** 2026-08-14
**Academy source revision:** `8d8e910a5aefa8050e8e8b1aa894e46e0f558271`
**Identity producer revision:** `5cf3d58e7e0a1dc3fe355de19f6b44a8a1742171`
**Status:** FINAL DIFFERENT-INDEPENDENT PASS C0/H0/M0/L0
**Authority:** local-only; enabled `false`; runtime wired `false`; release approval `false`; production `NO-GO`

## Result

Academy now has a production-disabled verifier for Identity Control's strict
`{ signedResult }` code-exchange result. The consumer verifies the exact
producer positive and rotation vectors with Web Crypto ES256 and binds the
envelope issuer, audience, client ID, callback nonce, canonical principal,
service, activation, issue/expiry times, and `identity-result-*` key ID. The
bounded keyring requires exactly one active key, permits an overlap key during
rotation, rejects retired and unknown keys, and cannot reuse lifecycle or
client-assertion key namespaces.

The JWS header and claims use the already-reviewed duplicate-safe JSON parser.
Policy, keyring, key, JWK, and bounded dense-array inputs are copied from exact
own enumerable data descriptors before validation. The verifier returns a
fresh result only after signature verification; malformed, mismatched,
expired, ambiguous, accessor-bearing, and tampered inputs collapse to `null`.

The first different-independent review returned `C0/H0/M1/L0`: Academy's
shared raw-result projection checked verified-email shape but omitted the
producer's exact 3..320 UTF-16 code-unit bound. Test-only RED proved 320 passed
while 321 also passed incorrectly. The shared predicate now enforces the exact
producer bound before format validation, so both raw and signed-result paths
share the same strict projection.

## TDD And Verification

- RED: focused test collection failed because the new consumer module did not
  exist.
- Initial GREEN: signed-result plus shared strict-parser focused tests passed
  `34/34`.
- Remediation RED: shared-result focused tests passed 26 and failed the exact
  321-code-unit rejection.
- Remediation GREEN: signed-result, shared-result, and strict-parser tests pass
  `61/61`.
- Related Identity regression passes `203/203` across 12 files.
- Academy TypeScript passes with no errors.
- Scoped ESLint passes with no findings.

No endpoint, environment value, operational key, key generation, registry,
route, adapter, callback, session, migration, database, Cloudflare, deployment,
or UI byte changed. Visual review and DB rehearsal are N/A because this slice is
an unwired pure consumer. Conformance remains 16 pass / 7 `not_proven`; the
checkpoint supplies local contract evidence only and does not promote a
scenario.

## Final Review

Canonical authority:
`reports/reviews/academy-identity-code-exchange-result-envelope-freeze-20260814.json`.
A different-independent closure reviewer rebound the eight-file remediation
authority and passed final `C0/H0/M0/L0`. The checkpoint remains unwired and
does not authorize operational keys, runtime configuration, deployment, or
release.
