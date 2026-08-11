# Academy Identity Code-Exchange Port Admission Gate

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `ae766c4ce02e46c4e063856be21cc92ddd9d87c7`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

The existing final `createIdentityCodeExchangePort` factory now requires one
runtime-config input and passes it through the accepted exact-data projector
before it reads either injected capability. The factory constructs the
least-capability code-exchange port only for an `admitted` projection. A valid
but blocked gate combination, absent configuration, or malformed configuration
returns the existing fixed construction failure.

This removes the direct endpoint-and-timeout construction path from the final
factory. It does not create a second factory, choose production values, read the
environment, import the registry, or wire a route. The factory remains referenced
only by its focused test.

## Ownership Boundary

| Concern | Owner | This checkpoint |
| --- | --- | --- |
| Exact scalar configuration and admission classification | Accepted runtime-config projector | Runs before the final port can access fetch or strict-reader capabilities |
| Code-exchange HTTP and strict JSON behavior | Accepted transport and JSON operation | Receive only the admitted endpoint/timeout and injected capabilities |
| Least-capability callback surface | Accepted adapter | Continues to expose only `exchangeCode` and returns `unknown` for result verification |
| Enablement and release-evidence provenance | Future trusted server composition and operators | Remains external; caller booleans alone are not production authority |
| Assertion signer/config coherence | Future trusted server composition | Must source the signer and client assertion audience from the same accepted authority; this factory does not create a signer |
| Runtime import, endpoint ownership, deployment and release | Future runtime/release checkpoints | Unchanged and still blocked |

The final factory reads the public `config` option first. Only after the
projector returns `status: 'admitted'` does it read `fetchPort` and
`responseReader`. The admitted projection has already established exact endpoint
and client-assertion-audience equality; this factory forwards the endpoint and
timeout because assertion creation remains a separate owned capability.

## TDD And Verification

The test-only RED changed the existing final factory contract from direct
endpoint/timeout values to `{ config, fetchPort, responseReader }`. Against the
old source, five of eight focused tests failed: admitted construction paths and
the required projector boundary were absent. Three existing bounded-failure
cases remained green. The final gate matrix then added all three blocked
`enabled`/`releaseApproval` combinations.

GREEN proves that the admitted path still performs the exact POST and completes
the real local callback seam. A descriptor-only config Proxy is read without
ordinary property access; the three public options are read once; nested method
receivers are preserved. Every blocked gate combination and malformed scalar
configuration produces the fixed detail-free construction error without reading
either nested method. Accepted execution failures remain on the existing bounded
adapter surface.

| Gate | Result |
| --- | --- |
| Test-only RED | EXPECTED FAIL, 5 failed / 3 passed |
| Focused final port | PASS, 10/10 |
| Code-exchange and callback seam | PASS, 8 files / 141 tests |
| Academy Identity regression | PASS, 27 files / 426 tests |
| Full Academy unit regression | PASS, 99 files / 1,116 tests |
| Identity Control API, authorization and assertion | PASS, 3 files / 59 tests |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Runtime/environment/production-value disconnection | PASS |
| Tracked and new-file whitespace checks | PASS |
| Secret scan | PASS; exact five content paths, no leaks |
| Reader-first review | PASS; report plus completed log 1,779 units / 0 findings and manual relevant-entry read |
| Different independent C/H/M/L review | PASS, `C0/H0/M0/L0` |

Database, migration, browser, UI and visual lanes are N/A. The checkpoint changes
one pure server-side factory and its synthetic unit test; it adds no route,
storage, schema, rendered state or user-facing copy.

The different independent reviewer verified the named manifest before and after
review, reran focused 10/10, seam 141/141, Academy Identity 426/426, producer
59/59 and the proportional lint, TypeScript, diff, secret and reader gates. The
review found no code, debt, security or reader/UX defect and returned final
`C0/H0/M0/L0`.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Canonical registry state remains `enabled=false`, release
approval remains false, runtime wiring remains disabled, and production remains
NO-GO.

The next runtime work still needs a trusted source for gate provenance and exact
values, an approved strict-reader configuration, protected signer and replay
capabilities, durable callback and activation transactions, named operators,
deployment evidence, and separate release authorization. The producer browser
handoff for authorization start remains a separate contract gap and is not
inferred here.

## Freeze Authority

The checkpoint freeze covers the final port source, its focused test, this
report, and the narrow active-plan and completed-log entries. The manifest stays
outside its own file list:

`reports/reviews/academy-identity-code-exchange-port-admission-gate-freeze-20260811.json`

Different independent review passed `C0/H0/M0/L0`. Final bookkeeping preserves
the reviewed source and test hashes while rebinding this report and the plan/log
entries.
