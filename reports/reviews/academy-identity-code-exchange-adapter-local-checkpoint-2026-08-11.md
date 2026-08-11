# Academy Identity Code-Exchange Least-Capability Adapter

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `c004d7ad28fe5bcf78a9f61ea5b1dac2e31296fc`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has a pure adapter that exposes only the `exchangeCode` capability
required by the callback transaction. It bridges the accepted composed JSON
operation into a narrow `IdentityCodeExchangePort`; the returned object has no
authorization-start, registry, production-admission, raw fetch, or endpoint
configuration surface. Its single request-scoped authority is to execute the
injected code-exchange operation.

The callback transaction now depends on that narrow port rather than the broad
`IdentityAdapter`. The five-field request contract is named once at the Identity
boundary and reused by both the broad development adapter and the narrow port.
The port returns `unknown`, so the callback must still pass the remote value
through the existing transaction-bound issuer, audience, service, nonce, and
shape verifier before returning an `ExchangeResult`.

## Ownership Boundary

| Concern | Owner | This checkpoint |
| --- | --- | --- |
| Authorization start and adapter admission | Registry plus future runtime composition | Not exposed by the narrow port |
| Exact five-field exchange request | Shared code-exchange request projector | Reuses the named boundary type |
| Endpoint, HTTP, deadline, response policy | Accepted composed JSON operation and its children | Injected operation only |
| Parsed remote value | Narrow port | Remains `unknown` |
| Issuer, audience, service, nonce, result shape | Callback transaction verifier | Still required before use |
| Runtime endpoint, signer, replay, enablement | Future server composition and release process | Absent |

Construction reads the injected operation and its `execute` method once and
preserves the original receiver. Operation rejection, rejecting promises,
callable thenables, and throwing `then` access collapse to the fixed,
non-enumerable `IdentityCodeExchangeAdapterFailure`; no original cause or detail
is copied into the public error.

The real local seam test begins an in-memory transaction, creates a client
assertion, executes the accepted composed HTTP/strict-JSON operation through the
narrow adapter, and completes the callback through the real result verifier. It
checks the exact POST body and verifies the returned transaction-bound result.
No broad adapter fields are present on the injected callback capability.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/code-exchange-adapter` did not exist. The smallest bridge then
passed seven focused cases covering the exact capability surface, single method
capture, receiver preservation, legitimate value identity, hostile
construction, async assimilation, full callback composition, and runtime
disconnection.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused adapter | PASS, 7/7 |
| Adapter plus callback/code-exchange seam | PASS, 6 files / 104 tests |
| Academy Identity regression | PASS, 25 files / 389 tests |
| Full Academy unit regression | PASS, 97 files / 1,079 tests |
| Identity Control API, authorization, assertion | PASS, 3 files / 59 tests |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Tracked and new-file whitespace checks | PASS |
| Reader-first review | PASS; final report 97 units and completed log 1,616 units / 0 findings plus manual maintainer read |
| Runtime import and production-value disconnection | PASS |
| First different independent C/H/M/L review | FAIL, C0/H0/M0/L1 |
| L-01 wording remediation | PASS; capability text now distinguishes exchange execution from raw network/configuration authority |
| Different independent closure review | PASS, C0/H0/M0/L0 |

The tests use injected functions and synthetic `Response` values; they perform
no network request. Database, migration, browser, and visual lanes are N/A
because this checkpoint adds no route, schema, persistence, rendered state, or
user-facing copy.

The full active-plan reader scan reports three errors and one warning from text
that is unchanged from `HEAD` and outside this checkpoint hunk. The new entry
was read manually and introduces no reader-first finding.

The first different independent review found no code or security defect and
returned `C0/H0/M0/L1`. Its Low finding identified the earlier phrase “no
network authority” as too broad because `exchangeCode` intentionally invokes
the injected network operation. The wording now names that request-scoped
authority and limits the absence claim to raw fetch, endpoint/configuration,
authorization-start, registry, and production-admission surfaces. Source and
test bytes did not change during this remediation.

The different closure reviewer verified the regenerated manifest, reran the
focused, seam, Academy Identity, producer, TypeScript, lint, diff, secret, and
reader gates, and returned final `C0/H0/M0/L0`.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Registry and runtime wiring remain disabled, and production
remains NO-GO.

The next local boundary may prepare authorization-start composition or explicit
runtime configuration without enabling either path. Production composition
still requires the approved exact endpoint, protected signer and rotation
evidence, deployed replay storage, approved strict-reader values, durable
callback and activation transactions, operators, deployment evidence, and
separate release authorization.

## Freeze Authority

The freeze manifest covers the adapter boundary, request projector, callback
transaction, new bridge, focused test, this report, the narrow active-plan
entry, and the completed-log entry. The manifest stays outside its own file
list:

`reports/reviews/academy-identity-code-exchange-adapter-freeze-20260811.json`

A different reviewer verified the regenerated manifest before closure review
and returned final `C0/H0/M0/L0`. The final bookkeeping manifest retains the
same source and test hashes while binding the aligned report, plan, and log.
