# Academy Identity Code-Exchange Transport Composition

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `0aeaf47933b5c9722f9c93acc202e9badf548add`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has one pure composition factory for the accepted code-exchange
response transport and strict JSON operation. The factory captures one injected
endpoint, timeout, fetch port, and response reader, then returns an operation
that accepts the exact five-field producer request and yields a parsed but still
untrusted `unknown` value.

The factory adds no second HTTP, request, or parser policy. Endpoint shape,
status, cache, deadline, and late-response cleanup remain in the response
transport. Request projection and async failure normalization remain in the JSON
operation. Body size, depth, media type, UTF-8, duplicate-key rejection, and body
cleanup remain in the injected strict reader.

## Ownership Boundary

| Concern | Owner | Composition responsibility |
| --- | --- | --- |
| Exact request projection | Shared code-exchange request projector | Reuses the same accepted operation |
| Endpoint, POST, status, cache, fetch deadline | Accepted response transport | Supplies captured endpoint, timeout, and fetch port |
| Body bytes and strict JSON | Injected accepted reader | Supplies the captured reader without choosing its policy values |
| Issuer, audience, service, nonce, result schema | Transaction-bound result verifier | Returns `unknown`; does not promote trust |
| Runtime endpoint, key, replay, enablement | Future server composition and release process | Leaves these values and imports absent |

Construction reads each public option once. The child factories capture the
fetch and reader methods once and preserve their original receivers. Invalid
endpoint or timeout stops before either nested method is read. A public option
getter failure collapses to the fixed, non-enumerable
`IdentityCodeExchangeTransportFailure` with no original cause or detail.

Execution errors retain the accepted child boundary: response failures and
strict-reader rejection become the fixed JSON-operation failure. Duplicate
semantic JSON does not cross as a parsed value. A successful value reaches the
transaction verifier as `unknown` and is projected only after exact issuer,
audience, service, and nonce binding.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/code-exchange-transport` did not exist. The smallest composition
then passed seven focused cases covering the real seam, exact option and method
reads, receiver preservation, invalid configuration, secret-safe construction,
duplicate semantic JSON, and runtime disconnection.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused composition | PASS, 7/7 |
| Composition + response + JSON + result seam | PASS, 4 files / 80 tests |
| Academy Identity regression | PASS, 24 files / 382 tests |
| Full Academy unit regression | PASS, 96 files / 1,072 tests |
| Identity Control API, authorization, assertion | PASS, 3 files / 59 tests |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Tracked and new-file whitespace checks | PASS |
| Reader-first review | PASS; report 77 units and completed log 1,587 units / 0 findings plus manual maintainer read |
| Runtime import and production-value disconnection | PASS |
| Different independent C/H/M/L review | PASS, C0/H0/M0/L0 |

The tests use injected functions and synthetic `Response` values; they perform
no network request. Database, migration, browser, and visual lanes are N/A
because this checkpoint adds no route, schema, persistence, rendered state, or
user-facing copy.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Registry and runtime wiring remain disabled, and production
remains NO-GO.

The next adapter-preparation boundary must still preserve the untrusted result
type and transaction verifier. Production composition additionally requires the
approved exact endpoint, protected signer and rotation evidence, deployed replay
storage, strict reader values, durable callback and activation transactions,
operators, deployment evidence, and separate release authorization.

## Freeze Authority

The final freeze manifest covers the composition source, focused test, this
report, the narrow active-plan entry, and the completed-log entry. The manifest
stays outside its own file list:

`reports/reviews/academy-identity-code-exchange-transport-freeze-20260811.json`

A different reviewer verified the author freeze before semantic review, reran
focused and proportional regression/static gates, and returned final
`C0/H0/M0/L0`. The final bookkeeping manifest binds the same source/test bytes
with the aligned report, plan, and completed log.
