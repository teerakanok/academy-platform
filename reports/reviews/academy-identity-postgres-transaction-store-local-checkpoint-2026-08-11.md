# Academy Identity PostgreSQL Transaction Store - Local Checkpoint - 2026-08-11

**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`

## Outcome

Academy now has a local durable store for the short-lived authorization
transaction created before a learner leaves for Identity Control and consumed
when that browser returns. Once the route is wired, this boundary lets a sign-in
survive an Academy process restart or a callback landing on another instance,
while allowing only one successful consume.

`beginIdentityAuthorization` now waits for durable creation before exposing the
browser handoff. `completeIdentityCallback` waits for the atomic claim before
code exchange. Existing memory and file stores remain valid local adapters; the
new PostgreSQL adapter uses only two named RPCs and returns the same domain
projection.

Migration `0025_identity_authorization_transaction.sql` stores state, PKCE
verifier, nonce, a browser-binding digest, the exact registered client
projection, return path, and database-clock expiry. The raw browser binding is
never persisted. A wrong binding preserves the transaction for the correct
browser; success and expiry both remove it durably.

## Product Boundary

| Concern | Owner | Checkpoint effect |
|---|---|---|
| Authorization state, PKCE, nonce, browser binding | Academy | Durable across restart and atomic across instances |
| Identity assertion, code exchange, replay, canonical principal | Identity Control | Remains behind the accepted injected ports |
| Profile activation | Academy profile-activation store | Remains a separate accepted atomic RPC |
| Session cookie and dashboard admission | Future Academy route composition | Not wired by this checkpoint |

This is backend foundation, not a visible release. No route imports the new
store, no browser flow changed, and no production database, registry, secret,
deployment, or release state was changed.

## Repository And SQL Boundary

The adapter captures the injected RPC method once with its original receiver,
validates exact inputs and bounded exact responses, and maps operational failure
to one fixed detail-free error. It returns fresh projections and does not expose
raw table access.

The PostgreSQL table has `state` as its primary key. Creation uses the database
clock, reclaims the same expired state, and removes at most 100 other expired
rows per start. Consume locks the selected row, compares the stored digest, and
deletes only on success or expiry. Row-level security is enabled; direct table
rights are revoked from browser, service, and Academy runtime roles. The
existing `academy_runtime` role receives execute rights only on the two RPCs.

## TDD And Verification

The first test-only RED stopped before collection because
`@/lib/identity/postgres-transaction-store` did not exist. After the first
implementation, an adversarial RPC value exposed Promise/thenable assimilation
outside the fixed failure boundary. The focused RED reproduced the raw failure;
the adapter now carries parsed data inside a non-thenable envelope across the
async boundary.

Current Node 24.18.0 evidence:

| Gate | Result |
|---|---|
| Focused transaction/store units | `5 files / 61 tests` PASS |
| Local PostgreSQL integration | `9/9` PASS |
| Existing profile-activation PostgreSQL integration | `11/11` PASS |
| Full Academy unit suite | `101 files / 1,152 tests` PASS |
| Full Academy lint and all TypeScript configs | PASS; one pre-existing generated-registry warning |
| Scoped whitespace and secret checks | PASS |

The PostgreSQL suite proves restart, digest-only persistence, wrong-binding
preservation, one successful concurrent consume, duplicate-create rejection,
post-wait clock refresh, durable expiry deletion, bounded cleanup, runtime RPC
execution, and denied direct table access. It used the Academy disposable local
Supabase PostgreSQL service. The temporary test role was dropped, the original
role membership was verified unchanged, and the local stack was stopped without
backup; no owned container, listener, or test process remains.

A broader integration selection also included suites whose documented local
authority or data-API prerequisites were not present. Those unrelated results
are not used as evidence for this checkpoint; the dedicated real-PostgreSQL
suite above is the store's integration proof.

## Product State And Next Slice

Canonical local conformance remains `16/23`. Registry enablement,
`releaseApproval`, `runtimeWired`, and production readiness remain false. The
customer-visible sign-in journey is therefore unchanged.

The next implementation slice is the first vertical runtime path: compose the
registered authorization start, this durable store, the accepted code-exchange
port, verified profile activation, and host-scoped session issuance behind a
local-disabled gate, then prove the journey in a real browser. Endpoint/key
release, production credentials, operator controls, deployment, and explicit
release authorization remain later external gates.

## First Independent RIL And Remediation

The first different independent review verified the original 11-file manifest
and returned `C0/H0/M1/L0`. Migration 0025 sampled the database clock before
operations that could wait on a row or unique-index lock. A consume that began
before expiry could therefore wait across expiry and still accept the row. A
successful create delayed by same-state arbitration could receive a shortened
or already-expired TTL.

Two real-PostgreSQL cases were added before changing SQL. The RED run passed
seven cases and failed both new cases: the waiting consume returned the expired
transaction, while the two-second create had only `777ms` remaining. The
migration now refreshes `created_at` and `expires_at` after a successful insert
has won uniqueness arbitration, and refreshes `v_now` after acquiring the
consume row lock. The GREEN integration rerun passed `9/9`; the focused unit
rerun remained `61/61`. The disposable database was stopped and verified absent.

## Review

The different independent closure reviewer verified the remediated 11-file
manifest before and after review and returned final `C0/H0/M0/L0`. The reviewer
confirmed that database time is refreshed after uniqueness arbitration and row
locking, that create/consume remain atomic, and that the adapter preserves the
accepted async transaction-store boundary. Fresh focused `61/61`, scoped
ESLint, TypeScript, whitespace, secret, reader, and staged-empty gates passed.
The frozen real-PostgreSQL `9/9` evidence was accepted without restarting the
local database.

UI and visual review are N/A for this checkpoint because it changes no route,
component, copy, or rendered state. The final authority is
`reports/reviews/academy-identity-postgres-transaction-store-freeze-20260811.json`.
