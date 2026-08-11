# Academy Identity Code-Exchange JSON Operation

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO
**Academy source:** `10e62cc548905997ea3d471b6e2470a47bac13d2`
**Identity Control source:** `ad97ba2236bddbc4857d45359bb37b032aebbb05`

## Outcome

Academy now has a pure local operation between an injected code-exchange
response transport and the accepted strict JSON reader boundary. The operation
snapshots the exact five-field producer request, sends one fresh projection to
the response transport, hands the returned `Response` to the reader, and
returns one successfully parsed but still untrusted `unknown` value.

This checkpoint composes existing contracts. The response transport remains
the future owner of the approved endpoint, authenticated request, HTTP method,
status handling, cancellation, and network deadline. The strict reader remains
the owner of body size and depth limits, media type, UTF-8, duplicate-safe JSON,
body cleanup, and its configured read deadline. The accepted exchange-result
verifier remains the first trust boundary for parsed response data.

## Contract And Failure Boundary

The request projection follows Identity Control revision
`ad97ba2236bddbc4857d45359bb37b032aebbb05`:

- `clientId` is a string from 1 through 80 characters;
- `clientAssertion` is a 32 through 4,096 character compact JWS;
- `redirectUri` uses HTTPS, or HTTP only for the exact `localhost` hostname;
- `code` is a 16 through 160 character URL-safe opaque value;
- `codeVerifier` is 43 through 128 characters from the released PKCE alphabet.

The operation accepts one ordinary object with exactly those five enumerable
own data properties. It rejects surplus, hidden, symbol, accessor, array,
invalid-prototype, malformed, and throwing-reflection inputs before invoking
the response transport. An accepted request is reconstructed field by field,
so the transport receives neither the caller object nor a surplus field.

The factory captures both port methods once and invokes each with its original
receiver. Transport errors, reader errors, fail-closed reader results, and
rejected Promise or thenable values collapse to one fixed non-enumerable
`IdentityCodeExchangeJsonOperationFailure`. The public error carries no cause,
original message, enumerable field, or log output. A successful parsed value
remains untrusted until `verifyIdentityCodeExchangeResult` validates and
projects it against the server-held transaction.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/code-exchange-json-operation` did not exist. The first source
implementation passed focused 17/17. Standalone TypeScript then found one tuple
`includes` typing error; a narrow type cast fixed compilation without changing
runtime behavior, and focused 17/17 remained green.

| Gate | Result |
| --- | --- |
| Missing-module RED | EXPECTED FAIL before collection |
| Focused operation tests | PASS, 17/17 |
| Academy Identity regression | PASS, 22 files / 345 tests |
| Full Academy unit regression | PASS, 94 files / 1,035 tests |
| Identity Control authorization and assertion regression | PASS, 2 files / 38 tests |
| Scoped ESLint | PASS |
| Full lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Tracked and new-file whitespace checks | PASS |
| Reader-first review | PASS; report 82 units and completed log 1,545 units / 0 findings plus manual maintainer read; broader active-plan signals are pre-existing outside this hunk |
| Runtime import and endpoint-policy disconnection | PASS |
| Different independent C/H/M/L review | PASS `C0/H0/M0/L0`; focused 17/17, Identity 345/345, producer 38/38 |

Next/OpenNext build, database, browser, and visual lanes are N/A for this
checkpoint. Repository-wide import inspection finds the new operation only in
its source and focused test. The slice changes no route, Worker, middleware,
registry, schema, database access, rendered state, or user-facing copy; full
project TypeScript checks compile the module directly.

## Readiness Boundary

Canonical local Identity consumer conformance remains 15 of 23 scenarios
(`65.2%`). This checkpoint adds zero conformance scenarios and zero production
readiness points. Registry and runtime wiring stay disabled, and production
remains NO-GO.

The next local slice may implement the injected response transport after it
pins the approved code-exchange endpoint and client-assertion audience without
inventing production credentials. Production still requires protected key
material and rotation, deployed replay storage, durable callback and activation
transactions, named operators, deployment evidence, and separate release
authorization.

## Freeze Authority

The final machine freeze manifest covers the source, focused test, this report,
the narrow active-plan entry, and the completed-log entry. The manifest stays
outside its own file list:

`reports/reviews/academy-identity-code-exchange-json-operation-freeze-20260811.json`

A different independent reviewer verified the author freeze before semantic
review, reran the focused, Identity, producer, TypeScript, lint, diff, secret,
and reader gates, and returned PASS `C0/H0/M0/L0`. The final text-only authority
rebind confirms that source and test bytes remain unchanged.
