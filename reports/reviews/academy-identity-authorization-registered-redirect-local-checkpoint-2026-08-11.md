# Academy Identity Registered Authorization Redirect - Local Checkpoint

**Date:** 2026-08-11
**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`
**Production:** NO-GO

## Outcome

Academy now requires an authorization-start caller to provide one exact local
client projection together with its server-owned registered redirect list. The
selected callback must be an exact member of that list before Academy generates
PKCE material, creates browser-binding state, or writes a transaction.

The list is limited to 16 canonical entries. The boundary reads the own length
descriptor before enumeration, then accepts only a dense plain array containing
own enumerable string data properties. It rejects duplicate, sparse, accessor,
symbol, surplus, non-canonical, query-bearing, fragment-bearing, hostile, and
overbound inputs with a fixed local error. Each accepted redirect is exact HTTPS
or localhost HTTP with no credentials, query, or fragment.

The persisted transaction schema remains unchanged. Only the selected exact
client projection is stored; the registration list is used only to authorize
the start operation and is not persisted.

## Ownership Boundary

| Concern | Owner | This checkpoint |
| --- | --- | --- |
| Canonical registered redirect set | Future trusted Academy server composition | Supplies the exact list; this local function does not read environment or registry state |
| Selected callback authorization | Academy transaction boundary | Requires exact membership before randomness or storage mutation |
| Producer-side client registration | Identity Control and release process | Remains external; an injected list alone is not production authority |
| Authorization route, Account Center redirect, cookie and session | Future approved Academy runtime | Remain disconnected |

The source has no runtime caller. Repository search finds
`beginIdentityAuthorization` only in its owner module and local tests. No route,
Worker, registry, environment, endpoint, key, cookie, database migration, or
deployment value was added.

## TDD And Verification

The test-only RED changed the public call shape to `{ client, redirectUris }`
before source implementation. The focused file passed 17 prior tests and failed
the new valid-registration case because the old function treated the whole
registration object as a client. During GREEN, the new boundary exposed a
WHATWG URL edge: a callback ending in an empty `?` was still admitted because
parsed search was empty. The test remained RED until the boundary required an
exact raw canonical representation and rejected raw `?` and `#` delimiters.

Current Node 24.18.0 evidence:

| Gate | Result |
| --- | --- |
| Focused transaction | PASS, `19/19` |
| Transaction, durable store, adapter and final port | PASS, `4 files / 48 tests` |
| Academy Identity regression | PASS, `29 files / 452 tests` |
| Full Academy unit regression | PASS, `100 files / 1,139 tests` |
| Identity Control authorization and API regression | PASS, `2 files / 51 tests` |
| Full Academy lint and all TypeScript configurations | PASS; one pre-existing generated-registry warning |
| Scoped ESLint and diff check | PASS |

Adversarial coverage proves that an overbound 17-entry Proxy is rejected before
`ownKeys`, accessors are never invoked, hostile reflection detail is not
returned, and every invalid registration stops before verifier generation and
store mutation. Exact mismatch coverage includes trailing slash, empty query,
empty fragment, foreign-host suffix, duplicate registration, and a selected
callback absent from the registered set.

## Readiness Boundary

Canonical local consumer conformance remains `16/23`; this implementation does
not promote another scenario because the trusted runtime source for the
registration list and the real authorization route are still absent. Registry
enablement, `runtimeWired`, release approval, production evidence, and production
readiness remain false.

Before learners can use central sign-in, Academy still needs the trusted runtime
composition, producer endpoint/key/replay authority, durable callback recovery,
host-scoped cookie and session issuance, operator controls, deployed browser
evidence, and explicit release authorization. Production remains **NO-GO**.

## Freeze Authority

The checkpoint freezes the transaction source, its four directly affected test
files, this report, and the narrow active-plan and completed-log entries. The
manifest remains outside its own file list:

`reports/reviews/academy-identity-authorization-registered-redirect-freeze-20260811.json`

A different independent reviewer must bind that manifest before semantic
review. The author does not self-approve this checkpoint.

## Independent Review

A different independent reviewer verified the eight-file manifest before and
after semantic review and returned final `C0/H0/M0/L0`. Fresh reviewer evidence
passed focused transaction 19/19, the affected four-file seam 48/48, Academy
Identity 452/452, Identity Control producer 51/51, TypeScript, scoped ESLint,
diff and no-index whitespace, exact-path secret scanning, reader-first review,
and staged-empty checks.

The review confirmed descriptor and resource ordering, exact membership, empty
delimiter, credentials, default-port, dot-segment, and foreign-host handling;
validation before randomness, verifier, or storage mutation; unchanged durable
schema; and the absence of any runtime caller. The final verdict certifies this
local checkpoint only. The production NO-GO and remaining authority gates stay
unchanged.
