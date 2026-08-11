# Academy Identity Code-Exchange Result Verifier

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `b7b0058878b527bf3570ccb2576990122d15ee0a`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now snapshots the Identity Control code-exchange result before the
callback can use it. The verifier accepts only the released seven-field result
and two-field activation projection, checks the issuer, audience, service, and
nonce against the server-held transaction, and returns a fresh result object.

This closes an implementation weakness in the existing local
`exchange.result-binding` evidence. Previously, the callback read properties
directly from the adapter result, accepted any nonempty issuer, and returned that
same object. A wrong issuer, surplus field, accessor, symbol, non-enumerable
property, reflection failure, or later adapter mutation now makes the result
unavailable or cannot change the verified projection.

## Ownership Boundary

| Concern | Owner | Academy verifies here | Remains external |
| --- | --- | --- | --- |
| Principal and activation decision | Identity Control | Exact released result projection | Identity lifecycle and activation policy |
| Browser transaction binding | Academy transaction store | Caller-provided expected issuer, audience, service ID, and nonce | Approved production issuer value, durable store, and callback runtime |
| Result parsing and HTTP limits | Future Academy operation adapter | Receives one parsed `unknown` value | Endpoint, client authentication, status policy, deadline, and strict JSON transport |
| Product access | Academy | Nothing in this verifier grants course access | Activation persistence, entitlement, and resource authorization |

The verifier does not infer producer policy, create a principal, write
activation state, or grant an entitlement. It preserves the existing callback
failure distinction: a validly shaped result for another audience or service is
`audience_mismatch`; malformed data, a nonce mismatch, and an issuer mismatch
are `invalid_result`.

## Source-Bound Contract

The implementation mirrors `ExchangeResult` at Identity Control revision
`ad97ba2236bddbc4857d45359bb37b032aebbb05`:

- exact result fields: `issuer`, `subject`, `verifiedEmail`, `audience`,
  `serviceId`, `nonce`, and `activation`;
- exact activation fields: `status` and positive integer `revision`;
- activation status is one of `pending`, `active`, `suspended`, or
  `deactivated`;
- issuer and subject are nonempty strings and verified email passes the
  existing Academy email contract;
- issuer, audience, service ID, and nonce equal the explicit values retained in
  the server-side transaction.

Result and expectation objects must be ordinary objects with exact enumerable
own data properties. The verifier rejects accessors, symbols, surplus or hidden
keys, arrays, invalid prototypes, and throwing reflection traps. It snapshots
each accepted descriptor once and does not perform ordinary property reads.

## TDD And Verification

The first test-only RED stopped before collection because
`@/lib/identity/code-exchange-result` did not exist. The first implementation
returned GREEN for 19 focused verifier checks and the 11 existing transaction
checks. A self-audit added malformed expectation cases; RED then returned 20
passes and 2 failures because invalid expectation values were compared against
the result before rejection. Validating the exact expectation snapshot first
returned GREEN 22/22.

A second classification audit added non-string audience and empty service
results. RED returned 22 passes and 2 failures because both were classified as
audience mismatches. The verifier now validates all binding field types before
comparison. Final focused verification is GREEN 24/24 for the verifier and
13/13 for the transaction.

## First Independent RIL And Remediation

The first different independent RIL returned `C0/H0/M1/L1`. M-01 found that
the canonical `exchange.result-binding` scenario requires wrong-issuer
rejection, while the verifier accepted any nonempty issuer. L-01 found that the
frozen report recorded 90 reader-lint units while the canonical run counted 91.

Test-only remediation RED returned 37 passes and 2 failures: a foreign issuer
passed the pure verifier and the callback resolved successfully. The
implementation now requires a caller-provided `expectedIssuer` in
`LocalIdentityClient`, persists it with the server transaction, rechecks the
client configuration at callback time, and passes it into the exact result
expectation. The source contains no production issuer literal and does not infer
the issuer from the Account Center endpoint. GREEN passes 26 verifier tests, 14
transaction tests, and 4 durable-store tests. Fresh reader evidence is recorded
from the remediated report below.

| Gate | Result |
| --- | --- |
| Focused verifier + callback + durable transaction store | PASS - 44/44 |
| Academy Identity unit regression on final bytes | PASS - 21 files / 317 tests |
| Academy full unit regression on final bytes | PASS - 93 files / 1007 tests |
| Identity Control authorization + lifecycle contract | PASS - 2 files / 44 tests |
| Scoped ESLint | PASS |
| Full lint and all TypeScript configurations | PASS - one pre-existing generated-registry warning, zero errors |
| Tracked and new-file whitespace checks | PASS |
| Scoped secret scan on the eight final checkpoint content files plus manifest | PASS - no leaks |
| Reader-first review | PASS - final report lint 107 units / 0 findings plus manual maintainer review; broader active-plan signals are pre-existing outside this hunk |
| First different independent C/H/M/L review | FAIL `C0/H0/M1/L1`; issuer binding and evidence count remediated locally |
| Different independent closure review | PASS `C0/H0/M0/L0` - manifest 7/7; issuer binding and reader evidence independently verified |

Database, migration, UI, visual, browser, and deployment lanes are N/A. The
checkpoint changes one pure verifier, its callback integration, tests, and
evidence text; it changes no schema, route, rendered state, credential,
registry, or runtime configuration.

## Readiness And Release Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). `exchange.result-binding` was already locally proven, so this
checkpoint adds zero scenario points and zero production-readiness percentage
points. It strengthens the implementation behind that existing pass.

The registry remains `enabled=false`; `releaseApproval=false`,
`runtimeWired=false`, and `productionReady=false`. Production still requires
the registered endpoint and redirect, protected key material and rotation,
deployed replay storage, strict authenticated HTTP operation, durable callback
and activation transaction, named operators, deployment evidence, and separate
release authorization.

The final freeze manifest covers the verifier source and test, transaction
source and test, durable-store test, this report, the active plan, and the
completed log. The manifest stays outside its own file list:

`reports/reviews/academy-identity-code-exchange-result-verifier-freeze-20260811.json`

The different independent closure review verified the frozen remediation and
returned `C0/H0/M0/L0`. It does not authorize runtime wiring, production
traffic, deployment, or release.
