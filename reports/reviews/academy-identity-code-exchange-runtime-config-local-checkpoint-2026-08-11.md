# Academy Identity Code-Exchange Runtime Configuration Projection

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `e76d43a81a1985a9b1503208f9f37c320c2849b8`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has a pure data-only projection for the scalar values that a future
server composition would need before constructing the accepted code-exchange
port. It accepts one exact five-field object, snapshots own enumerable data
descriptors, and classifies the input without reading environment variables,
constructing a port, or importing the registry.

The projection returns usable endpoint, assertion audience, and timeout values
only when both injected gates are true: the consumer is enabled and release is
approved. Every other valid gate combination returns a `blocked` result without
those values. Scalar configuration must be either wholly absent or wholly valid;
partial, mismatched, non-canonical, insecure, or overbound values return `null`
even while both gates are false.

`admitted` is a narrow local classification, not production readiness. A future
trusted server composition must still establish the provenance of both gate
values and supply the external capabilities. This checkpoint does not change
the canonical state: `enabled=false`, `releaseApproval=false`,
`runtimeWired=false`, and `productionReady=false`.

## Ownership Boundary

| Concern | Owner | This checkpoint |
| --- | --- | --- |
| Canonical endpoint shape and fetch timeout bound | Shared identity-local scalar policy | One policy reused by config projection and response transport |
| Exact input snapshot and admission state | Runtime config projector | Rejects inexact or incoherent data and withholds usable values until both gates pass |
| Fetch and strict JSON capabilities | Accepted code-exchange port composition | Remain injected and absent from this module |
| Registry enablement and release evidence provenance | Future trusted server composition and operators | Remain external; caller booleans alone are not authority evidence |
| Environment schema, secrets, deploy and production admission | Future runtime/release work | Not selected or read |

The blocked result includes only the two gate values and whether scalar
configuration is absent or valid. It deliberately does not return endpoint,
audience, timeout, fetch, reader, signer, or port authority. The admitted result
is a fresh four-field projection and preserves the exact endpoint-to-assertion-
audience equality required by the producer contract.

The shared scalar-policy module prevents endpoint and timeout rules from being
duplicated between configuration and transport. The accepted response transport
continues to enforce the same canonical HTTPS `/v1/code/exchange` endpoint and
safe-integer timeout range of 1 through 5,000 milliseconds.

## TDD And Verification

The initial test-only RED stopped before collection because
`@/lib/identity/code-exchange-runtime-config` did not exist. GREEN then covered
the admitted projection, every blocked gate combination, exact absent config,
the canonical disabled evidence, partial and malformed config, endpoint/audience
drift, endpoint and timeout bounds, surplus/symbol/prototype/array/accessor
inputs, descriptor-only snapshotting, fresh output, and static disconnection.

The first different independent RIL returned `C0/H0/M1/L1`. It proved that a
trailing empty `?` or `#` survived WHATWG URL parsing with empty search/hash and
was accepted as a second byte representation of the endpoint. It also found the
report reader count stale. Remediation RED produced four failures while 53 prior
cases passed: both aliases were admitted by the projector and each response-
transport construction read the fetch method before failing. The shared scalar
predicate now requires the raw value to equal canonical `origin + exact path`.
GREEN passes 57/57 and proves both aliases stop before fetch capability access.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused config + accepted response transport | PASS, 57/57 |
| Full Academy Identity regression | PASS, 27 files / 424 tests |
| Full Academy unit regression | PASS, 99 files / 1,114 tests |
| Identity Control API, authorization, assertion | PASS, 3 files / 59 tests |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Runtime/environment/production-value disconnection | PASS |
| Tracked and new-file whitespace checks | PASS |
| Secret scan | PASS; exact eight content paths, no leaks |
| Reader-first review | PASS; report 102 and completed log 1,668 units / 0 findings plus manual maintainer read |
| First different independent C/H/M/L review | FAIL, C0/H0/M1/L1 |
| Different independent closure review | PASS, C0/H0/M0/L0 |

The tests use plain local data and synthetic capabilities only. They perform no
network call and do not read environment variables. Database, migration,
browser, and visual lanes are N/A because this checkpoint adds no route,
storage, schema, rendered state, or user-facing copy.

The full active-plan mechanical scan still reports three errors and one warning
from text unchanged in `HEAD` and outside this checkpoint hunk. Manual review of
the new entry found no reader-first defect: a future Academy maintainer can see
what the projector provides, what each status means, and where the remaining
runtime authority is established without being blamed or asked to infer policy.

The different closure reviewer verified the regenerated manifest before and
after review, reran focused 57/57, Academy Identity 424/424, producer 59/59 and
the proportional lint, TypeScript, diff, secret, and reader gates, confirmed
that both empty-delimiter aliases stop before fetch capability access, and
returned final `C0/H0/M0/L0`.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Registry and runtime wiring remain disabled, and production
remains NO-GO.

Next integration work still needs a trusted source for the exact endpoint and
gate evidence, approved strict-reader values, protected signer and rotation,
deployed replay storage, durable callback and activation transactions, named
operators, deployment evidence, and separate release authorization. The
authorization-start browser handoff also remains contract-blocked; this slice
does not infer it from the producer's server transaction response.

## Freeze Authority

The final freeze will cover the shared scalar policy, runtime projector,
accepted response-transport reuse change, focused tests, this report, and the
narrow plan/log entries. Its manifest stays outside its own file list:

`reports/reviews/academy-identity-code-exchange-runtime-config-freeze-20260811.json`

A different reviewer verified the regenerated manifest and returned final
`C0/H0/M0/L0`. Final bookkeeping retains the reviewed source/test hashes while
binding the aligned report, plan, and completed log.
