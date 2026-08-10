# Academy Identity Lifecycle Pull Request Builder

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `28b893dfc16685233da828251c2711d8ea8f4030`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`
**Executable producer contract:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a pure local request builder for the accepted Identity Control
lifecycle pull wire contract. It binds one configured consumer ID and
client-assertion audience to an injected server-side assertion provider,
validates the durable cursor and requested limit before signer use, and returns
a fresh exact request object for an initial or continued pull.

The builder owns request construction only. It does not fetch an endpoint,
serialize or parse raw JSON, select credentials, verify the assertion, apply a
page, schedule a puller, read runtime configuration, or enable the consumer.

## Source-Bound Contract

The implementation mirrors the executable producer request schema:

- `consumerId` is 1..160 characters and matches the producer's exact identifier
  alphabet;
- `clientAssertion` is a 32..4096-character three-segment compact JWS lexical
  value;
- an initial request omits `cursor`, while a continued request carries exactly
  `{ sequence: <canonical cursor> }`;
- cursor values are canonical unsigned decimals within signed PostgreSQL
  `bigint`; and
- `limit` is a safe integer from 1 through 100.

The configured assertion audience must be a canonical HTTPS URL without user
credentials or a fragment. The builder passes the exact `{ consumerId,
audience }` pair to the provider. The provider method is captured once and
called with its original receiver, which prevents validation/use drift through
a mutable property lookup.

Configuration and cursor inputs fail before signer use. A signer exception or
malformed result becomes one fixed non-enumerable error with no original cause,
credential text, or log output. The builder rejects non-string consumer values
before regex evaluation, so an object cannot run an implicit `toString()` path.

Compact-JWS validation here is intentionally lexical. Identity Control remains
responsible for ES256 verification, `iss=sub=consumerId`, the exact assertion
audience, lifetime, active/overlap key policy, and one-time `jti` consumption.
The real Academy signer and its key/rotation boundary remain separate release
work.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/lifecycle-pull-request` did not exist. The first implementation
run passed 23/25. Both failures were test-fixture defects: the intended
overbound assertion was 4094 rather than more than 4096 characters, and the
receiver Proxy blocked the test's own `this.marker` read. Correcting only those
fixtures produced focused GREEN at 25/25.

Author review then added a non-string consumer object whose `toString()` would
return a valid ID. Test-only RED passed 25 and failed 1 because regex evaluation
coerced the object. An explicit string guard before regex evaluation closed the
path; final focused GREEN passes 26/26 with zero coercion calls.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| First implementation run | 23 pass / 2 fixture defects; no product finding claimed |
| Consumer coercion RED | EXPECTED FAIL, 25 pass / 1 fail |
| Focused pull request builder | PASS, 26/26 |
| Relevant lifecycle regression | PASS, 8 files / 157 tests |
| Full Academy unit regression | PASS, 84 files / 851 tests |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Producer contract drift check | PASS, four accepted contract paths unchanged from `a6ef1f4` |
| Scoped ESLint | PASS |
| Full lint and TypeScript checks | PASS; one pre-existing generated-registry warning |
| Network/parser/logger/runtime disconnection | PASS |
| Different independent checkpoint RIL | PASS `C0/H0/M0/L0` |

Next/OpenNext build is N/A because this pure module has no runtime import and
full project TypeScript checks compile it directly. Database and visual lanes
are N/A because the checkpoint changes no schema, database access, UI, route,
copy, or rendered state.

## Runtime Boundary

A future authorized adapter will combine this request builder with a bounded
duplicate-safe response parser and authenticated HTTP client. That adapter must
still own exact endpoint selection, assertion key access, request serialization,
response byte/depth/deadline bounds, media-type and status handling, and retry
classification. This checkpoint does not depend on the concurrent untracked
shared response-helper work in the Academy tree.

Production remains blocked on the publisher endpoint, assertion audience,
Academy-owned signer and key rotation, event issuer/audience/key distribution,
network deadline and backoff, one-logical-puller scheduling, lag alert and named
owner, runtime bindings, deployment evidence, registry enablement, release
approval, and separate production authorization. Current values remain
`enabled=false`, `releaseApproval=false`, and `runtimeWired=false`.

## Freeze And Review

The machine freeze manifest covers the source, focused test, this report, and
the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-pull-request-freeze-20260810.json`

A different independent reviewer bound the manifest before semantic review,
reran focused 26/26, lifecycle 157/157, and producer 14/14, and passed scoped
ESLint, TypeScript, diff, secret, and reader gates. The reviewer found no code,
security, bounded-failure, or reader-facing defect and returned
`C0/H0/M0/L0`. The visual lane remains N/A because the module is pure and
unwired. Production boundaries and approvals above remain unchanged.
