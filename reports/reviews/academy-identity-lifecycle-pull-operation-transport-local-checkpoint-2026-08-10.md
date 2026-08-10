# Academy Identity Lifecycle Pull Operation Transport

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `8570f76428b9a6be1d9a540e0270acc49e9587ca`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`
**Executable producer contract:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a pure local transport that composes the accepted lifecycle
pull-request builder with an injected logical operation. Each pull creates the
exact initial or continued producer request, preserves the operation receiver,
and returns one opaque page value to the existing verified-page transport.

This closes the local composition gap between request construction and page
verification. Network mechanics remain with a future authorized adapter, so
this checkpoint adds no endpoint, HTTP method or status policy, raw JSON path,
credential store, scheduler, Worker binding, registry entry, or runtime import.

## Ownership Boundary

| Boundary | Owns | Hands off |
| --- | --- | --- |
| Pull-request builder | Consumer ID, assertion audience, cursor/limit validation, and exact producer request shape | One fresh logical request |
| Pull-operation transport | One operation invocation with the captured method and original receiver | One untrusted `unknown` page value |
| Future operation adapter | Authenticated network execution, HTTP semantics, bounded response reading, and duplicate-safe parsing | One parsed `unknown` value |
| Verified-page transport and verifier | Exact producer page relation, cursor arithmetic, configuration revision, and compact-JWS verification | One fresh all-or-nothing verified page |
| Pull cycle and leased store | Lease, durable cursor/config read, fenced commit, release acknowledgement, and health result | One durable cycle outcome |

The factory snapshots its configuration and operation method once. It validates
the configured limit in the producer range `1..100`, then delegates consumer,
audience, cursor, and assertion checks to the accepted request builder. Each
call snapshots the cursor and limit, rejects a limit mismatch before signer or
operation use, and invokes the captured method with its original operation as
the receiver.

Request-builder or operation failures become one fixed, non-enumerable
`IdentityLifecyclePullOperationTransportFailure` with no original detail,
cause, or log output. The returned page remains untrusted until the existing
verified-page transport validates it. The integration tests prove that a valid
empty page reaches the lease-fenced commit, while an invalid cursor relation
returns the cycle's bounded `retry_required` result and never commits.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/lifecycle-pull-operation-transport` did not exist. The first
implementation passed all eight focused tests.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused pull-operation transport | PASS, 8/8 |
| Relevant lifecycle regression | PASS, 9 files / 165 tests |
| Full Academy unit regression | PASS, 86 files / 887 tests |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Scoped ESLint and TypeScript | PASS |
| Full lint and all TypeScript checks | PASS; one pre-existing generated-registry warning |
| Network/parser/logger/runtime disconnection | PASS |
| Different independent checkpoint RIL | PASS `C0/H0/M0/L0` |

Next/OpenNext build is N/A because repository-wide import checks keep this pure
module outside every route, Worker, middleware, registry, and runtime entry;
full project TypeScript checks compile it directly. Database and visual lanes
are N/A because the checkpoint changes no schema, database access, UI, route,
copy, or rendered state.

## Runtime Boundary

The next integration slice is an authenticated operation adapter. Its owner
must bind the approved endpoint and assertion credentials, define exact HTTP
request/status/media semantics, use the reviewed bounded duplicate-safe JSON
response helper, and classify deadline and retry outcomes without exposing
details. Scheduler ownership, one-logical-puller policy, lag alerts, runtime
bindings, deployment evidence, and production approval remain later gates.

Current product controls remain `enabled=false`, `releaseApproval=false`, and
`runtimeWired=false`. This local checkpoint changes production readiness by
zero percentage points; it supplies one independently reviewable dependency
for a later authorized runtime transaction.

## Freeze And Review

The machine freeze manifest covers the source, focused test, this report, and
the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-pull-operation-transport-freeze-20260810.json`

A different independent reviewer bound that manifest before semantic review,
reran focused 8/8, lifecycle 165/165, and producer 14/14, and passed scoped
ESLint, TypeScript, diff, secret, and reader gates. Adversarial in-memory probes
also confirmed one-read config/request/method/thenable behavior and fixed
secret-safe failure output. The reviewer found no code, security, operational,
or reader-facing defect and returned `C0/H0/M0/L0`. The visual and database
lanes remain N/A because the module is pure and unwired.
