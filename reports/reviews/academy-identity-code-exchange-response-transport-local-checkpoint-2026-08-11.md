# Academy Identity Code-Exchange Response Transport

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `ac18dd9c51b05c2bf0469c144aa5a718af4bf1dc`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has a pure, injected response transport for Identity Control code
exchange. It accepts one canonical HTTPS endpoint whose exact path is
`/v1/code/exchange`, serializes one producer-aligned five-field request, and
issues a `POST` with JSON accept/content headers, omitted ambient credentials,
redirect refusal, and cache bypass. It returns only a genuine `200 Response`
that carries a `no-store` cache directive.

The transport uses one private AbortController and a caller-selected positive
integer timeout capped at five seconds. A private rejection promise closes the
operation even if the injected fetch ignores the AbortSignal. A response that
arrives after timeout is cancelled without re-opening the failed operation.
Non-200, missing-`no-store`, non-Response, fetch, timeout, platform setup, abort,
and cleanup failures collapse to one fixed detail-free error. The transport does
not return an accepted response until timer cleanup succeeds.

## Ownership Boundary

| Concern | Owner in this checkpoint | Later owner |
| --- | --- | --- |
| Request field contract | Shared `code-exchange-request` projector | Identity Control producer contract revision |
| Endpoint shape and HTTP request | Response transport | Runtime composition binds the exact approved hostname/audience |
| Fetch implementation | Injected fetch port | Academy server runtime |
| Response status and cache policy | Response transport | Identity Control route keeps `200` plus `no-store` behavior |
| Body bytes and JSON | Accepted strict response reader | Runtime selects its bounded reader values |
| Parsed result trust | Accepted result verifier | Server-held issuer/audience/service/nonce transaction |

The new shared request projector prevents the JSON operation and response
transport from drifting into two copies of producer validation. Both direct
entry points reject surplus, hidden, symbol, accessor, invalid-prototype,
malformed, and throwing-reflection requests before network capability use, then
construct a fresh request projection field by field.

The transport validates a canonical HTTPS URL with no credentials, query, or
fragment and the exact code-exchange path. It does not claim that any syntactically
valid host is approved. Runtime composition must bind the endpoint to the
reviewed consumer registry value and keep the client disabled until the release
gates close.

## TDD And Adversarial Verification

The test-only RED stopped before collection because
`@/lib/identity/code-exchange-response-transport` did not exist. The first
implementation passed response-transport 24/24 and retained JSON-operation
17/17. A timer self-audit then added a platform abort that performs its native
side effect and throws. RED failed that single selected case by exposing the
injected error from the timer callback. The deadline now treats controller
abort as best-effort while always settling its private rejection promise;
targeted GREEN passed, followed by response 25/25 plus operation 17/17.

A final seam test composes the real response transport, JSON operation, strict
reader, and accepted exchange-result verifier. The parsed value crosses each
layer as `unknown` and becomes trusted only after exact transaction-bound result
verification. Before the first RIL, this seam passed 26 transport, 17
JSON-operation, and 26 result-verifier assertions. The final remediation seam
passes 30 transport, 17 JSON-operation, and 26 result-verifier assertions.

The first different independent review returned `C0/H0/M1/L0`: controller and
timer setup happened before the bounded `try`, while timer cleanup could throw
from `finally`. Platform failures could therefore escape with their original
detail. Four adversarial RED cases reproduced raw failures from controller
construction, timer setup, timeout-reason construction, and timer cleanup while
the original 26 transport cases stayed green. The remediation initializes the
deadline transaction inside the bounded path, tracks an armed timer explicitly,
turns off the deadline before guarded cleanup, and cancels a response when
cleanup cannot be confirmed. GREEN then passed all 30 transport cases.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| First response + JSON-operation GREEN | PASS, 41/41 |
| Abort mutate-then-throw RED | EXPECTED FAIL, 1 failed / 24 skipped |
| Remediation response + JSON-operation GREEN | PASS, 42/42 |
| First different independent review | FAIL, C0/H0/M1/L0 |
| Platform setup/cleanup RED | EXPECTED FAIL, 4 failed / 26 passed |
| M-01 transport GREEN | PASS, 30/30 |
| Final response + JSON-operation + result seam | PASS, 3 files / 73 tests |
| Academy Identity regression | PASS, 23 files / 375 tests |
| Full Academy unit regression | PASS, 95 files / 1,065 tests |
| Identity Control API, authorization, and assertion regression | PASS, 3 files / 59 tests |
| Scoped ESLint | PASS |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Tracked and new-file whitespace checks | PASS |
| Reader-first review | PASS; report 112 units and completed log 1,568 units / 0 findings plus manual maintainer read |
| Runtime import and production-value disconnection | PASS |
| Different independent C/H/M/L re-review | PASS, C0/H0/M0/L0 |

The tests use injected functions and synthetic `Response` objects; they make no
network request. Database, migration, browser, and visual lanes are N/A because
the checkpoint changes no schema, persistence, route, rendered state, or
user-facing copy. Repository-wide import inspection finds the transport only in
its source and focused test.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Registry and runtime wiring stay disabled, and production
remains NO-GO.

The response transport deliberately owns only the fetch-to-headers deadline.
The strict reader owns its separate bounded body deadline. Production
composition still requires the approved exact endpoint, client assertion/key
and rotation evidence, deployed replay storage, durable callback and activation
transactions, operator evidence, deployment, and separate release
authorization.

## Freeze Authority

The final machine freeze manifest covers the shared request projector,
refactored JSON operation, response transport, focused transport test, this
report, the narrow active-plan entry, and the completed-log entry. The manifest
stays outside its own file list:

`reports/reviews/academy-identity-code-exchange-response-transport-freeze-20260811.json`

A different reviewer verified the remediation manifest before semantic review,
reran focused and proportional regression/static gates, and returned final
`C0/H0/M0/L0`. The final bookkeeping manifest binds the same source/test bytes
with the aligned report, plan, and completed log.

The first reviewer disclosed one process-boundary deviation: a missing local
probe package caused its package runner to attempt resolution. The command ended
without repository or staged-byte changes; the remediation and subsequent gates
used only installed local tools.
