# Academy Identity Lifecycle Verified-Page Transport

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `64f2517ec53ee205521aa70730d760d7d7074204`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`
**Executable producer contract:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a pure local decorator that connects a future duplicate-safe
parsed-page transport to the accepted lifecycle pull-page verifier and pull
cycle. It forwards the exact cursor and configured limit, supplies the pull
cycle's single verification time and explicit envelope policy, and returns only
the verifier's fresh all-or-nothing page projection.

This closes the local composition gap between parsed input and the durable
consumer pipeline. It does not add an HTTP client, raw JSON parser, endpoint,
credential, scheduler, Worker binding, registry entry, or runtime import.

## Ownership Boundary

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Future parsed-page transport | Authenticated request, bounded duplicate-safe raw parsing, and one `unknown` page value | Signature verification, cursor relation, lease, or commit |
| Verified-page decorator | Exact request cursor/limit binding, verifier invocation, and bounded failure classification | Fetch, credentials, logging, retry policy, or durable state |
| Pull-page verifier | Exact producer page relation and compact-JWS verification | Network transport, lease, or commit |
| Pull cycle and leased store | Lease, durable cursor/config read, fenced commit, release acknowledgement, and health result | Raw transport or cryptographic parsing |

The factory validates the local request limit in the producer range `1..100`
before the parsed-page port can run. It snapshots that port's method once and
invokes it with the original receiver, so a property trap cannot change the
method between validation and use.

The decorator passes the exact requested cursor, limit, verification time, and
envelope policy into the real pull-page verifier. A transport exception or any
page/policy/cryptographic rejection becomes one fixed, non-enumerable error with
no original detail, cause, log, or partial page result. Through the pull cycle,
that failure produces `retry_required`, forbids sensitive operations, and never
calls the fenced page commit. A valid verified page commits under the active
lease and retains the cycle's exact release acknowledgement.

## TDD And Verification

The first test-only RED stopped before collection because
`@/lib/identity/lifecycle-verified-page-transport` did not exist. The first
implementation passed 8/8 focused tests. Author review then added a Proxy that
allows the `pullPage` method to be read once only; the second RED passed 8 and
failed 1 because the implementation re-read the property. Capturing the method
once and calling it with the original receiver restored focused GREEN at 9/9.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Method re-read RED | EXPECTED FAIL, 8 pass / 1 fail |
| Focused verified-page transport | PASS, 9/9 |
| Relevant lifecycle regression | PASS, 7 files / 131 tests |
| Full Academy unit regression | PASS, 83 files / 825 tests |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Producer contract drift check | PASS, four accepted contract paths unchanged from `a6ef1f4` |
| Scoped ESLint | PASS |
| Full lint and TypeScript checks | PASS; one pre-existing generated-registry warning |
| Runtime/network/logging disconnection | PASS |
| Different independent checkpoint RIL | PASS `C0/H0/M0/L0` |

Next/OpenNext build is N/A for this checkpoint because the module is absent from
all route, Worker, middleware, registry, and runtime imports; full project
TypeScript checks compile it directly. Database and visual lanes are likewise
N/A because the checkpoint changes no schema, database access, UI, route, copy,
or rendered state.

## Runtime Boundary

The future raw transport still owns bounded response bytes, duplicate-key-safe
JSON parsing, authenticated HTTP semantics, client-assertion credentials,
endpoint selection, and deadline behavior. Those requirements deliberately stay
outside this decorator so cryptographic verification and transport mechanics do
not become one mutable runtime boundary.

Production remains blocked on owner-approved endpoint, issuer/audience/key
distribution, client assertion and credential handling, network deadline and
retry behavior, one-logical-puller scheduling, lag policy and operator ownership,
runtime bindings, deployment evidence, registry enablement, release approval,
and separate production authorization. Current values remain `enabled=false`,
`releaseApproval=false`, and `runtimeWired=false`.

## Freeze And Review

The machine freeze manifest covers the source, focused test, this report, and
the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-verified-page-transport-freeze-20260810.json`

A different independent reviewer bound the manifest before semantic review,
reran focused 9/9, lifecycle 131/131, and producer 14/14, and passed scoped
ESLint, TypeScript, diff, secret, and reader gates. The reviewer found no code,
security, operational failure, or reader-facing defect and returned
`C0/H0/M0/L0`. The visual lane remains N/A because the module is pure and
unwired. Production boundaries and approvals above remain unchanged.
