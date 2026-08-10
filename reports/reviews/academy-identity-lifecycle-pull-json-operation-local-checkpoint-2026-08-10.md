# Academy Identity Lifecycle Pull JSON Operation

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `c41a22759d7fdb36db78b2f76302b1f9ab5ae09a`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`
**Executable producer contract:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a pure local operation adapter between an injected response
transport and an injected strict JSON reader. It passes the exact lifecycle
pull request to the response transport, hands the returned `Response` to the
reader, and returns only the reader's successfully parsed `unknown` value to the
existing pull-operation and verified-page boundaries.

The adapter supplies composition and bounded failure behavior without selecting
a URL, HTTP method, response status policy, credential, parser limit, deadline,
retry rule, scheduler, Worker binding, registry entry, or runtime import.

## Ownership Boundary

| Boundary | Owns | Hands off |
| --- | --- | --- |
| Pull-request builder and operation transport | Exact consumer/assertion/cursor/limit request | One fresh logical request |
| Response transport port | Authorized endpoint, authentication, request serialization, HTTP method/status/media acceptance, and transport cancellation | One accepted `Response` |
| Strict response reader port | Byte/depth/deadline bounds, UTF-8, JSON media type, duplicate-safe parsing, and body cleanup | `{ ok: true, value }` or `{ ok: false }` |
| Pull JSON operation | Exact two-port sequencing, receiver preservation, and fixed failure classification | One untrusted parsed `unknown` value |
| Verified-page transport and pull cycle | Producer page relation, compact-JWS verification, lease, fenced commit, release, and health outcome | One durable cycle result |

The factory captures both port methods once and invokes each with its original
receiver. A response transport exception, strict reader exception, or
`{ ok: false }` result becomes one fixed, non-enumerable
`IdentityLifecyclePullJsonOperationFailure` with no original detail, cause, or
log output. Successful values are awaited inside that same failure boundary, so
a rejecting Promise or callable thenable cannot expose its rejection detail.
Ordinary JSON values retain their identity and remain untrusted until the
existing page verifier snapshots and validates them.

The integration tests use the reviewed `readStrictJsonResponse` implementation
behind the reader port. They prove that duplicate JSON keys fail closed, a valid
empty page reaches the lease-fenced commit, and a parsed page with an invalid
cursor relation returns bounded retry without a commit.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/lifecycle-pull-json-operation` did not exist. The first
implementation passed eight of nine tests. The remaining failure was a test
fixture expecting the raw target as `this` even though the contract correctly
preserves the captured Proxy port as receiver. Correcting only that expectation
produced focused GREEN at 9/9; source behavior did not change.

The first independent RIL returned `C0/H0/M1/L0`: returning the parsed value
without awaiting it inside the local `try` allowed async thenable assimilation
to reject after the fixed failure boundary had been left. Test-only RED then
passed 10/13 and failed for a rejecting Promise, rejecting callable thenable,
and throwing `then` getter, each exposing the injected error. The operation now
uses `return await value` inside the existing catch boundary. Remediation GREEN
passes 13/13; resolving thenables are assimilated once, while ordinary JSON
object identity remains unchanged.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| First implementation run | 8 pass / 1 fixture defect; no product finding claimed |
| Focused pull JSON operation before RIL | PASS, 9/9 |
| First independent RIL | FAIL `C0/H0/M1/L0` |
| Thenable assimilation RED | EXPECTED FAIL, 10 pass / 3 fail |
| Remediation focused pull JSON operation | PASS, 13/13 |
| Strict-reader plus lifecycle regression | PASS, 11 files / 206 tests |
| Full Academy unit regression | PASS, 87 files / 900 tests |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Scoped ESLint and TypeScript | PASS |
| Full lint and all TypeScript checks | PASS; one pre-existing generated-registry warning |
| Endpoint/policy/logger/runtime disconnection | PASS |
| Different independent closure RIL | PASS `C0/H0/M0/L0`; focused 13/13, relevant 206/206, producer 14/14 |

Next/OpenNext build is N/A because repository-wide import checks keep this pure
module outside every route, Worker, middleware, registry, and runtime entry;
full project TypeScript checks compile it directly. Database and visual lanes
are N/A because the checkpoint changes no schema, database access, UI, route,
copy, or rendered state.

## Runtime Boundary

Future runtime composition must provide the approved response transport and a
reader configured through the reviewed strict JSON boundary. The response
transport still needs owner-approved endpoint and assertion credentials, exact
HTTP method/status/media behavior, and cancellation semantics. Parser byte,
depth, and deadline values; retry/backoff; one-logical-puller scheduling; lag
alerts; deployment evidence; and production authorization remain later gates.

Current controls stay `enabled=false`, `releaseApproval=false`, and
`runtimeWired=false`. This checkpoint changes production readiness by zero
percentage points; it turns two separately owned future ports into one locally
verified operation boundary.

## Freeze And Review

The machine freeze manifest covers the source, focused test, this report, and
the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-pull-json-operation-freeze-20260810.json`

A different independent reviewer bound the regenerated manifest before semantic
review and reverified it after all gates. The review confirmed the thenable
remediation and all prior lanes, reran focused 13/13, relevant 206/206, and the
producer contract 14/14, then returned final PASS `C0/H0/M0/L0`.
