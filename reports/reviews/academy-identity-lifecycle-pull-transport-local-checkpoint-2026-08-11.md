# Academy Identity Lifecycle Pull Transport Composition

**Date:** 2026-08-11
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `91a952400c650138f85a24304ab1afc94821c275`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`
**Executable producer contract:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has one pure composition factory for the reviewed lifecycle pull
chain. It snapshots the consumer, audience, limit, assertion provider, response
transport, strict reader, and envelope policy once, then composes the existing
JSON operation, request operation transport, and verified-page transport.

One captured `requestedLimit` is supplied to both request construction and page
verification. Runtime composition therefore cannot accidentally sign a request
for one limit and validate the response against another.

## Ownership Boundary

| Boundary | Owns | This checkpoint does not select |
| --- | --- | --- |
| Client assertion provider | Server-side signing, claims, key, lifetime, and replay identifier | Key material or production signer |
| Response transport | Authorized endpoint, request serialization, HTTP method/status/media policy, authentication, and cancellation | URL, credential, or HTTP policy |
| Strict response reader | Byte/depth/deadline bounds, UTF-8, duplicate-safe JSON, and body cleanup | Production parser values |
| Pull transport composition | One-time option snapshot, shared limit, and reviewed adapter order | Scheduler, retry/backoff, lag alerts, registry, or runtime wiring |
| Verified-page transport | Cursor/page relation and event-envelope verification | Producer issuer, audience, or public-key distribution |

The factory rejects an invalid shared limit before reading either response port
method. Initialization failures use one fixed, detail-free
`IdentityLifecyclePullTransportFailure`. The verified-page owner boundary now
also snapshots and validates runtime cursor/time input inside its catch boundary
before downstream work. Runtime request, parser, and page-verification failures
therefore retain bounded classifications at their owning adapter.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/lifecycle-pull-transport` did not exist. The implementation then
added only the composition factory. Focused GREEN passed 7/7. A follow-up
characterization added invalid limits `0`, `101`, `1.5`, and `NaN`; all four stop
before either response port method is read, bringing focused coverage to 11/11.

The first independent RIL returned `C0/H0/M1/L0`: the accepted verified-page
transport destructured runtime input before entering its `try`, so a throwing
Proxy getter could expose raw detail and malformed input could reach downstream
work. Test-only RED passed 10/16 and failed six cases covering null/malformed
input and throwing cursor/time getters. The owner module now snapshots both
fields once inside `try`, validates a canonical signed-bigint cursor and valid
Date, and stops before `pullPage`. Remediation GREEN passes owner 16/16 and the
combined owner/composition focus 27/27.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused pull transport | PASS, 11/11 on Node 24.18.0 |
| First independent RIL | FAIL `C0/H0/M1/L0` |
| Runtime-input RED | EXPECTED FAIL, 10 pass / 6 fail |
| Remediation owner plus composition focus | PASS, 27/27 on Node 24.18.0 |
| Strict-reader plus lifecycle regression | PASS, 12 files / 224 tests on Node 24.18.0 |
| Full Academy unit regression | PASS, 88 files / 918 tests on Node 24.18.0 |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Scoped ESLint and TypeScript | PASS |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Runtime import search | PASS; reference exists only in the focused test |
| Different independent closure RIL | PASS `C0/H0/M0/L0`; owner plus composition 27/27, relevant 224/224, producer 14/14 |

Next/OpenNext build is N/A because the module is absent from every route,
Worker, middleware, registry, and runtime import while the full TypeScript gate
compiles it directly. Database and visual lanes are N/A because the checkpoint
changes no schema, data, route, UI, copy, or rendered state.

## Runtime Boundary

The producer contract still marks the private network listener and production
values as unapproved. The approved registry still has `enabled=false`, no active
verification key, null lifecycle endpoint and audiences, and no named kill-switch
owner. This checkpoint therefore changes production readiness by zero percentage
points.

The next runtime step requires approved endpoint and audience values, product
client-key ownership, exact HTTP behavior, parser and scheduling policy, named
operators, deployment evidence, and separate production authorization. The
factory does not substitute local defaults for any of those decisions.

## Freeze And Review

The machine freeze manifest covers the composition source/test, the remediated
verified-page source/test, this report, and the two narrow plan files. The
manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-pull-transport-freeze-20260811.json`

A different independent reviewer bound the regenerated manifest before semantic
review and reverified it after every gate. The review confirmed the runtime-input
remediation, composition, and shared-limit invariants; reran owner plus
composition 27/27, relevant 224/224, and producer 14/14; then returned final PASS
`C0/H0/M0/L0`.
