# CyberSkills Academy — Completed Log

> Closed items only, with outcome + evidence + residual risk. Newest first.
> Provider-neutral. See `active_plan.md` for open work.

---

## 2026-08-11 - PostgreSQL authorization transaction store implemented

**Outcome:** Academy now has a PostgreSQL-backed store for the short-lived
authorization transaction used by the future Identity Control sign-in journey.
Authorization start waits for durable creation, callback waits for an atomic
one-time consume, raw browser-binding material is never persisted, and the
transaction can survive a process restart or callback landing on another
Academy instance. This is backend foundation; no customer-facing route or
screen changed in this checkpoint.

**Verification:** The missing-module RED was followed by focused unit GREEN
`61/61`, local PostgreSQL GREEN `9/9`, existing profile-activation PostgreSQL
`11/11`, full Academy unit `1,152/1,152`, and full lint plus all TypeScript
configurations. The real database cases cover restart, one-time concurrent
consume, digest-only persistence, wrong-binding preservation, expiry cleanup,
lock-wait clock refresh, RPC-only runtime access, and denied direct table
access. The local Supabase stack was stopped and verified absent afterward.

**Review:** First independent RIL returned `C0/H0/M1/L0` because create and
consume sampled database time before waits on unique-index or row locks. Two
real-PostgreSQL RED cases reproduced stale time; the migration now refreshes
time after arbitration or lock acquisition. A different closure reviewer
verified the remediated manifest and returned final `C0/H0/M0/L0`.

**Residual risk:** The store is not imported by a route and does not change the
current sign-in experience. Registry/runtime remain disabled and production is
NO-GO. The next product slice must compose authorization start, Account Center,
callback exchange, profile activation, session issuance, and dashboard entry
behind an explicit local-only gate, then prove that journey in a real browser.

## 2026-08-11 - Local Identity registered authorization redirect boundary implemented

**Outcome:** Academy authorization start now accepts one exact client plus a
bounded server-owned registered redirect list. The selected callback must be an
exact canonical member before PKCE/browser-binding generation or transaction
storage. Invalid, duplicate, non-canonical, hostile, accessor, sparse, symbol,
or overbound registrations stop with a fixed local error and no mutation. The
persisted transaction schema is unchanged.

**Verification:** The test-only RED passed 17 prior tests and failed the new
valid-registration call shape. An intermediate RED then exposed the empty `?`
URL alias. Current GREEN passes focused 19/19, the four-file affected seam
48/48, Academy Identity 452/452, full unit 1,139/1,139, Identity Control
authorization/API 51/51, and full lint plus all TypeScript configurations with
one pre-existing generated-registry warning. Evidence is in
`reports/reviews/academy-identity-authorization-registered-redirect-local-checkpoint-2026-08-11.md`.

**Review:** A different independent reviewer verified the exact eight-file
manifest before and after semantics, reran focused 19/19, the affected seam
48/48, Academy Identity 452/452, producer 51/51, and proportional static,
security, secret, reader, and staged-empty gates, then returned final
`C0/H0/M0/L0`.

**Residual risk:** The registered list is injected local data, not producer or
release authority. No route imports this boundary. Trusted runtime composition,
Account Center redirect, callback recovery, cookie/session issuance, operators,
deployment evidence, and release approval remain external. Conformance stays
16/23, readiness does not increase, and production remains NO-GO.

## 2026-08-11 - Profile-only activation conformance promoted locally

**Outcome:** The deterministic Academy consumer-conformance generator now binds
the independently accepted profile-activation store report and freeze manifest
at exact digests. It promotes only `academy.activation-profile-only`, moving the
local ledger from 15/23 to 16/23 while retaining seven named `not_proven`
scenarios. Registry enablement, runtime wiring, production evidence, release
approval, and production readiness remain false.

**Verification:** The test-only RED passed 6/7 and failed while the profile-only
scenario remained unproven. GREEN passes generator 7/7 and the accepted profile
store unit regression 21/21. Generator write/current returns 23 scenarios; the
canonical Identity Control intake verifies 23/23 with 16 pass and 7
`not_proven`, and the director utility verifies the exact eight-file manifest.
Evidence is in
`reports/reviews/academy-identity-control-profile-activation-conformance-local-checkpoint-2026-08-11.md`.

**Review:** A different independent reviewer rebound the manifest before and
after semantics, confirmed the exact single-scenario delta and accepted evidence
digests, reran the focused generator, canonical intake, static, security, and
reader gates, and returned final `C0/H0/M0/L0`.

**Residual risk:** This is evidence bookkeeping rather than runtime enablement.
Callback cookie provenance, authenticated exchange, durable production
transaction ownership, operator controls, deployment, and release authorization
remain separate gates. Production remains NO-GO.

## 2026-08-11 - Local Identity profile activation store implemented

**Outcome:** Academy now has one narrow RPC store plus migration 0024 for the
profile-and-activation part of a future approved callback. The function upserts
one Academy profile by canonical `(issuer, subject)` and applies the existing
revision-aware activation projection in one PostgreSQL statement transaction.
It contains no course-entitlement or staff-role mutation. Equal email never
merges principals, activation conflicts roll the profile write back, and
concurrent repeats converge on one account.

**Verification:** The missing-module RED stopped before collection. Current
Node 24 evidence passes focused 21/21, local PostgreSQL integration 11/11,
Academy Identity 448/448, full unit 1,137/1,137, Identity Control producer
59/59, and full lint plus all TypeScript configurations with one pre-existing
generated-registry warning. The temporary Academy Supabase stack was stopped
and verified absent after the integration run. Evidence is in
`reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md`.

**Review:** First independent RIL returned `C0/H1/M0/L0` because a stale lower
activation revision could update the profile and return success while the
durable activation stayed at a newer revision. Remediation RED passed 10 cases
and failed that stale case. Migration 0024 now requires the durable
status/revision to equal the input inside the same statement transaction;
exact duplicates remain accepted and stale/conflicting input rolls the profile
write back. GREEN local PostgreSQL integration passes 11/11. A different
independent closure reviewer bound the remediated manifest, reran focused
21/21, Academy Identity+callback 450/450 and producer 59/59 with proportional
static/security/reader gates, and returned final `C0/H0/M0/L0`.

**Residual risk:** At this implementation checkpoint the store remained unwired,
`academy.activation-profile-only` remained `not_proven`, and conformance stayed
15/23. The later source-bound conformance refresh records the local promotion;
production remains NO-GO. The approved callback/session recovery transaction,
Origin/Fetch Metadata and browser binding, producer endpoint/key/replay
contracts, existing runtime-role ACL review, operators, deployment evidence,
and release authorization remain separate gates.

## 2026-08-11 - Final Identity code-exchange port now enforces admission

**Outcome:** The existing canonical final port factory now projects one exact
runtime configuration before it can read either injected capability. Only an
`admitted` projection reaches the accepted response/JSON transport and
least-capability adapter. Every valid blocked gate combination and malformed
configuration stops with the fixed construction failure before fetch or reader
method access. No parallel factory, runtime import, environment read, registry
read, route, or production value was added.

The test-only RED produced five failures and three passes against the prior
factory. GREEN passes focused 10/10, code-exchange/callback seam 141/141,
Academy Identity 426/426, full unit 1,116/1,116, Identity Control producer
59/59, and full lint plus all TypeScript configurations with one pre-existing
generated-registry warning. Evidence is in
`reports/reviews/academy-identity-code-exchange-port-admission-gate-local-checkpoint-2026-08-11.md`.

**Review:** Different independent RIL verified the named manifest twice, reran
focused 10/10, seam 141/141, Academy Identity 426/426, producer 59/59 and the
proportional static, security and reader gates, then returned final
`C0/H0/M0/L0`.

**Residual risk:** Admission remains a local classification. A future trusted
server composition must establish gate provenance and source the assertion
signer, endpoint, strict-reader settings, replay capability, durable
transactions, operators, deployment evidence, and release authorization from
accepted authority. Conformance remains 15/23, registry/runtime remain disabled,
readiness does not increase, and production remains NO-GO.

## 2026-08-11 - Local Identity code-exchange runtime config projection implemented

**Outcome:** Academy now has a pure exact-data projector for the scalar values
needed by a future trusted server composition. It admits endpoint, assertion
audience, and timeout values only when both consumer enablement and release
approval are true. Every other valid gate combination yields a blocked result
without usable values, and malformed dark configuration is rejected instead of
being retained for later activation.

The canonical endpoint and fetch-timeout predicates now live in one
identity-local scalar-policy module shared by the projector and accepted
response transport. The missing-module RED stopped before collection. GREEN
initially passed focused config+transport 53/53, Academy Identity 27 files / 420 tests,
full unit 99 files / 1,110 tests, Identity Control API/authorization/assertion
59/59, and full lint plus all TypeScript configurations with one pre-existing
generated-registry warning.

**Review:** the first different independent RIL returned `C0/H0/M1/L1` because
WHATWG URL parsing allowed trailing empty query/fragment delimiters as bytewise
aliases, and the report reader count was stale. Remediation RED failed four new
cases while 53 prior cases passed. The shared predicate now requires canonical
origin-plus-path serialization; GREEN passes focused 57/57, Identity 424/424,
full unit 1,114/1,114, producer 59/59, and full lint/typechecks. A regenerated
freeze was verified by a different reviewer, who reran focused 57/57, Identity
424/424, producer 59/59 and proportional static/security/reader gates and
returned final `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-runtime-config-local-checkpoint-2026-08-11.md`.

**Residual risk:** `admitted` proves only local scalar coherence. A future
trusted runtime must prove the enablement and release values' provenance and
supply endpoint ownership, strict-reader values, fetch/signer/replay
capabilities, durable transactions, operators, deployment evidence, and release
authorization. The module reads no env and has no runtime import. Conformance
remains 15/23; registry/runtime remain disabled and production remains NO-GO.

## 2026-08-11 - Local Identity final code-exchange port composition implemented

**Outcome:** Academy now has one pure final factory that combines the accepted
response/JSON transport with the accepted least-capability adapter and returns
an `IdentityCodeExchangePort`. The port's one request-scoped authority is code
exchange through the injected operation; it exposes no raw fetch,
endpoint/configuration, authorization-start, registry, or production-admission
surface. Parsed output remains `unknown` until the callback verifier accepts it.

The missing-module RED stopped before collection. GREEN passes focused 8/8,
callback/code-exchange seam 112/112, Academy Identity 26 files / 397 tests, full
unit 98 files / 1,087 tests, and Identity Control API, authorization, and
assertion regression 59/59. Full lint and all TypeScript configurations pass
with one pre-existing generated-registry warning.

**Review:** different independent RIL verified the manifest, reran focused 8/8,
seam 112/112, Academy Identity 397/397, producer 59/59 and proportional
static/security/reader gates, then returned final `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-port-local-checkpoint-2026-08-11.md`.

**Residual risk:** canonical conformance remains 15/23 and readiness does not
increase. The module is pure and unwired. Exact production endpoint, protected
signer and rotation, replay storage, strict-reader values, durable callback and
activation transactions, operators, deployment, and release authorization
remain separate gates. Registry/runtime stay disabled and production remains
NO-GO.

## 2026-08-11 - Local Identity code-exchange least-capability adapter implemented

**Outcome:** Academy now exposes the accepted composed code-exchange operation
to callback logic through a narrow `IdentityCodeExchangePort` containing only
`exchangeCode`. The callback transaction no longer requires the broad adapter
surface, and the shared five-field request type is named once at the Identity
boundary. The port returns `unknown`; the callback still requires the exact
issuer, audience, service, nonce, and result-shape verifier before use.

The test-only RED stopped before collection on the missing bridge module. GREEN
passes focused 7/7, callback/code-exchange seam 104/104, Academy Identity 25
files / 389 tests, full unit 97 files / 1,079 tests, and Identity Control API,
authorization, and assertion regression 59/59. Full lint and all TypeScript
configurations pass with one pre-existing generated-registry warning.

**Review:** the first different independent review returned `C0/H0/M0/L1`.
Code and security passed; the Low finding corrected an overbroad report claim
that the port had no network authority even though its one request-scoped
capability invokes the injected exchange operation. Text-only remediation now
states that the port exposes no raw fetch, endpoint/configuration,
authorization-start, registry, or production-admission surface. Source and test
bytes remain unchanged. Different closure re-review verified the regenerated
manifest, reran focused 7/7, seam 104/104, Academy Identity 389/389, producer
59/59 and proportional static/security/reader gates, then returned final
`C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-adapter-local-checkpoint-2026-08-11.md`.

**Residual risk:** canonical conformance remains 15/23 and readiness does not
increase. The module is pure and unwired. Exact production endpoint, protected
signer and rotation, replay storage, strict-reader values, durable callback and
activation transactions, operators, deployment, and release authorization
remain separate gates. Registry/runtime stay disabled and production remains
NO-GO.

## 2026-08-11 - Local Identity code-exchange transport composition implemented

**Outcome:** Academy now has one pure factory that composes the accepted
code-exchange response transport and strict JSON operation. It captures the
injected endpoint, timeout, fetch port, and strict reader once, preserves nested
port receivers, and returns parsed data as `unknown` for the transaction-bound
result verifier.

**Verification:** Missing-module RED stopped before collection. GREEN passes
focused 7/7, response+JSON+result seam 80/80, Academy Identity 24 files / 382
tests, full unit 96 files / 1,072 tests, Identity Control API/authorization/
assertion 59/59, and full lint/all TypeScript configs. Different independent RIL
verified the exact freeze, reran proportional code/security/reader gates, and
returned final `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-transport-local-checkpoint-2026-08-11.md`.

**Residual risk:** This composition has no runtime import and adds no conformance
or production-readiness points. The exact approved endpoint, protected signer
and key rotation, deployed replay storage, strict reader values, durable callback
and activation transactions, operators, deployment evidence, and separate
release authorization remain external. Registry/runtime stay disabled and
production remains NO-GO.

## 2026-08-11 - Local Identity code-exchange response transport implemented

**Outcome:** Academy now has a pure injected HTTP boundary for the exact
`/v1/code/exchange` path. It projects the five-field producer request, sends one
JSON `POST` without ambient credentials or redirect following, requires a real
status-200 response with `no-store`, and uses an independent private deadline.
Late responses are cancelled, and platform setup, timeout, abort, cleanup,
fetch, status, and cache-policy failures share one fixed detail-free error.

**Verification:** Missing-module RED preceded the implementation. The first
GREEN passed 41/41; an abort mutate-then-throw self-audit RED then closed the
timer callback. The first different RIL returned `C0/H0/M1/L0` because controller
and timer setup plus cleanup could escape the bounded failure path. Four focused
RED cases reproduced the platform failures while 26 prior cases stayed green.
Transactional setup and guarded cleanup produced transport 30/30, final seam
73/73, Academy Identity 23 files / 375 tests, full unit 95 files / 1,065 tests,
Identity Control API/authorization/assertion 59/59, and clean lint/typechecks.
Different independent re-review returned final `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-response-transport-local-checkpoint-2026-08-11.md`.

**Residual risk:** This transport is not imported by a route, Worker, registry,
or runtime entry and adds no conformance or production-readiness points. Runtime
must still bind the exact approved host, signer/key rotation and replay storage,
strict body-reader values, durable callback and activation transactions,
operators, deployment evidence, and separate release authorization. Registry
and runtime remain disabled; production remains NO-GO.

## 2026-08-11 - Local Identity code-exchange JSON operation implemented

**Outcome:** Academy now snapshots the exact five-field Identity Control
code-exchange request, passes one fresh projection through an injected response
transport, delegates the returned `Response` to the accepted strict JSON reader,
and returns one parsed but still untrusted `unknown` value. The operation captures
both port methods once, preserves their receivers, and exposes one fixed
detail-free failure for malformed input, transport, reader, and async-value
failures.

**Verification:** Missing-module RED stopped before collection. Focused tests pass
17/17, Academy Identity regression passes 22 files / 345 tests, full unit passes
94 files / 1,035 tests, Identity Control authorization and assertion regression
passes 38/38, and full lint plus all TypeScript configurations pass with one
pre-existing generated-registry warning. A different independent reviewer bound
the four-file author freeze, reran proportional code, security, secret, diff, and
reader gates, and returned PASS `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-json-operation-local-checkpoint-2026-08-11.md`.

**Residual risk:** This pure module is not imported by a route, Worker, registry,
or runtime entry and adds no conformance or readiness points. The approved
endpoint, authenticated response transport, HTTP status and cancellation policy,
protected key material and rotation, replay storage, durable callback and
activation transactions, deployment evidence, operators, and release
authorization remain external. Registry/runtime stay disabled and production
remains NO-GO.

## 2026-08-11 - Local Identity callback browser binding implemented

**Outcome:** Academy now generates a separate 32-byte browser binding at local
authorization start, persists only its canonical SHA-256 digest, and requires
the same binding before a callback can release the transaction. A mismatch
leaves the live state available to the browser that began the flow; a match
claims it once.

**Verification:** Initial TDD moved from 4 failed / 17 passed to focused 23/23.
The first independent RIL returned `C0/H0/M2/L0` after proving surplus caller
fields, a noncanonical digest alias, and duplicate live states could cross the
reference stores. Remediation RED was 23 passed / 6 failed. Exact own-data
projection, canonical digest re-encoding, fresh clones, and atomic duplicate
state rejection produced focused 29/29, Identity 328/328, full unit 93 files /
1018 tests, producer authorization 30/30, and clean lint/typechecks. The closure
RIL then returned `C0/H0/M0/L1` for one lock-description overclaim; the text-only
fix passed final `C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-callback-browser-binding-local-checkpoint-2026-08-11.md`.

**Residual risk:** This local store contract does not set or verify a browser
cookie and adds no conformance or production-readiness points. Runtime cookie
scope and cleanup, Origin/Fetch Metadata policy, durable production storage,
endpoint and key operations, deployment evidence, named operators, and release
authorization remain external. Registry/runtime stay disabled and production
remains NO-GO.

## 2026-08-11 - Local Identity code-exchange result verifier implemented

**Outcome:** Academy now snapshots the exact Identity Control exchange result
before callback use, binds issuer, audience, service ID and nonce to the
server-held transaction, and returns a fresh projection. Surplus, hidden,
accessor, symbol, invalid-prototype and throwing-reflection inputs fail closed.

**Verification:** Missing-module RED preceded the implementation. Two focused
self-audits closed malformed expectation handling and binding-field
classification. The first independent RIL returned `C0/H0/M1/L1` because a
foreign issuer was accepted and the reader count was stale. Issuer-binding RED
failed 2/39; remediation added caller-provided `expectedIssuer`, durable
transaction persistence and callback-time recheck without a production literal
or endpoint inference. Final focused passes 44/44, Academy Identity regression
317/317, full unit 93 files / 1007 tests, producer contract 44/44, and full
lint/typechecks. Different independent closure verified the freeze and passed
`C0/H0/M0/L0`. Evidence is in
`reports/reviews/academy-identity-code-exchange-result-verifier-local-checkpoint-2026-08-11.md`.

**Residual risk:** Canonical local conformance remains 15/23 (`65.2%`) and this
hardening adds no production-readiness points. Endpoint/key rotation/replay
storage/strict HTTP operation/durable production callback and activation
transaction/operators/deployment/release authorization remain external.
Registry and runtime wiring stay disabled; production remains NO-GO.

## 2026-08-11 - Local Identity client-assertion conformance promoted

**Outcome:** Academy composed its accepted JTI source, assertion provider, and
Web Crypto signer in one focused local test. Two assertions carry distinct
canonical JTI values, exact client/audience/lifetime claims, and real verifiable
ES256 signatures; a wrong audience stops before another JTI request. The
deterministic conformance generator now classifies
`exchange.client-assertion` as locally proven and targets 15 pass / 8
`not_proven` scenarios.

**Verification:** Generator test-only RED stopped because the new scenario set
did not exist. Initial GREEN passed 5/5. First different RIL then returned
`C0/H0/M1/L0` because the composition entry self-declared a review verdict with
an empty report and did not machine-bind producer replay evidence. A second RED
passed 4/6; remediation distinguishes test evidence, removes that verdict/report,
binds the exact Identity verifier and replay test, and rejects digest drift.
Generator GREEN is now 6/6. Composition 1/1, Academy Identity 20 files / 288
tests, full unit 92 files / 978 tests, producer assertion+lifecycle 22/22, and
full lint/all TypeScript configs pass with one pre-existing generated warning.
Evidence is in
`reports/reviews/academy-identity-control-client-assertion-conformance-local-checkpoint-2026-08-11.md`.

**Residual risk:** Generator current check, canonical intake at 23 verified / 15
pass / 8 not-proven, and the exact nine-file freeze manifest pass. Different
independent closure RIL returned final `C0/H0/M0/L0`. This is local conformance evidence,
not a deployed key or replay store. Public-key registration/rotation,
endpoint/runtime binding, named operators, deployment evidence, client
enablement, and release authorization remain external gates.

## 2026-08-11 - Local Identity client-assertion Web Crypto signer implemented

**Outcome:** Academy added a pure server-side signer that accepts one opaque,
non-exportable, private, sign-only P-256 `CryptoKey`; binds one client, assertion
purpose and key ID; and delegates bounded owned bytes to captured Web Crypto.
It does not generate, import, export, serialize, load, log or persist key
material.

**Verification:** Missing-module RED stopped before collection and first GREEN
passed 13/13. Security self-audit then produced RED 14/15 because a stateful
nested `namedCurve` value was read twice; one-read capture returned GREEN 15/15.
First different independent RIL returned `C0/H0/M1/L0`: ordinary metadata reads
trusted an own shadow, so a genuine extractable key could present
`extractable=false` and sign. Remediation RED passed 15 checks and failed three
brand cases; native `CryptoKey.prototype` getters now reject the shadow and duck
object and bypass Proxy traps, producing GREEN 18/18 on supported Node 24.
Different independent closure RIL bound the remediated manifest and returned
final `C0/H0/M0/L0`. A Node 25 observation still returned real native metadata
through the Proxy and did not permit an extractable-key bypass; literal Proxy
behavior will be reprobed against the pinned `workerd` compatibility date during
runtime wiring. Provider/JTI/signer focus passes 59/59,
Academy Identity regression passes 19 files / 287 tests, full unit passes 91
files / 977 tests, Identity Control assertion+lifecycle passes 22/22, and full
lint plus every TypeScript config
passes with one pre-existing generated warning. Evidence is in
`reports/reviews/academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0`. The module
cannot prove that equivalent private material was imported into another
`CryptoKey` or reused across purposes. The approved key ceremony, protected secret-store
identity, public-key digest, registry revision, lifecycle values, HTTP/scheduler
ownership, deployment and release authorization remain external gates. Runtime
wiring and registry release remain disabled.

## 2026-08-11 - Local Identity client-assertion JTI source implemented

**Outcome:** Academy added a zero-argument server-side JTI source that uses only
Web Crypto `randomUUID()`. It emits canonical lowercase UUID v4 values and
collapses missing, throwing, or malformed runtime behavior to one fixed failure.
The production API exposes no entropy override or weak-random fallback.

**Verification:** Missing-module RED stopped before collection. The first
implementation passed 9/10 because explicit `null` incorrectly selected the
global default; the input boundary fix returned GREEN 10/10. Security self-audit
then produced RED 10/11 because the factory still exposed caller-supplied
entropy. The zero-argument global-Web-Crypto-only API passes focused 11/11,
Identity regression 18 files / 269 tests, full unit+type 91 files / 963 tests,
producer assertion/lifecycle 22/22, and full lint plus all TypeScript configs
with one pre-existing generated warning. Evidence is in
`reports/reviews/academy-identity-client-assertion-jti-source-local-checkpoint-2026-08-11.md`.

**Independent review:** Different independent RIL verified the frozen manifest
and returned final `C0/H0/M0/L0`.

**Residual risk:** UUID v4 collision resistance is probabilistic; Identity
Control retains authoritative atomic replay reservation. Runtime signer/key
ceremony, exact lifecycle values,
HTTP/scheduler ownership, deployment, and release authorization remain external
gates. Registry and runtime wiring remain disabled.

## 2026-08-11 — Local Identity client-assertion provider implemented

**Outcome:** Academy added a pure server-side ES256 assertion provider that
consumes an injected clock, JTI source and signer. It pins one client, exact
audience, key ID, bounded lifetime and protocol purpose per instance. The module
does not generate, import, export, read or store private key material.

**Verification:** The first RED stopped before collection because the module did
not exist, and first GREEN passed 20/20. A resource self-audit then produced RED
at 20/22 for overbound audience work and signature cloning before length
rejection; producer-aligned byte ceilings and a fixed 64-byte post-validation
copy closed both. Purpose-isolation RED then passed 22/25: invalid purpose was
ignored and one provider could serve both code exchange and lifecycle pull. The
provider now pins the purpose and exact request shape before side effects;
focused passed 25/25. First different RIL then returned `C0/H0/M1/L0` because
the signer port did not bind client, purpose or key ID. Remediation RED passed
25 existing checks and failed 3 binding cases; the provider now rejects a
mismatched signer capability before side effects and passes the frozen binding
into `sign` for runtime revalidation. Focused passes 30/30, Identity regression
passes 17 files / 258 tests, full unit+type passes 90 files / 952 tests, the
Identity Control verifier plus lifecycle contract passes 22/22, and full lint
plus all TypeScript configurations passes with one pre-existing
generated-registry warning. Evidence is in
`reports/reviews/academy-identity-client-assertion-provider-local-checkpoint-2026-08-11.md`.

**Independent review:** Different independent re-review verified the remediated
manifest and passed final `C0/H0/M0/L0`.

**Residual risk:** This checkpoint does not authorize or create any key. The
runtime signer and key ceremony must
still prove that underlying key material maps to exactly one client and purpose;
the provider can enforce only the capability binding it receives. The approved
code-exchange audience still
requires product-owned key provisioning, public-key registration and rotation
evidence. Lifecycle endpoint and assertion/event audiences remain unresolved;
secret-store binding, JTI ownership, HTTP and scheduler policy, named operators,
runtime deployment and production authorization remain external gates. Registry
state stays disabled and production readiness does not change.

## 2026-08-11 — Local Identity lifecycle pull transport composed

**Outcome:** Academy added one pure composition factory for the reviewed
lifecycle request, JSON response, and verified-page adapters. It snapshots all
seven public options once and supplies one shared request limit to both request
construction and response verification without selecting runtime values.

**Verification:** The test-only RED stopped before collection on the missing
module. Focused GREEN passed 7/7, then invalid-limit characterization proved
`0`, `101`, `1.5`, and `NaN` stop before response port method access, producing
final focused 11/11. Strict-reader plus lifecycle regression passed 217/217,
full unit passed 88 files / 911 tests, and the Identity Control lifecycle pull
contract passed 14/14. Full lint and all TypeScript configurations passed on
Node 24.18.0 with one pre-existing warning in the generated registry. Runtime
import search found the module only in its focused test. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-transport-local-checkpoint-2026-08-11.md`.

The first independent RIL returned `C0/H0/M1/L0` because runtime input was
destructured before the verified-page catch boundary. A throwing Proxy getter
could expose its detail, while malformed cursor/time values could call
downstream first. Test-only RED passed 10/16 and failed six cases. The owner
module now snapshots both fields once inside `try` and validates them before
`pullPage`; owner GREEN passes 16/16, combined focus 27/27, relevant 224/224,
full unit 918/918, and full lint/typechecks.

**Residual risk:** Different independent closure review bound the regenerated
manifest, reran owner plus composition 27/27, relevant 224/224, producer 14/14
and proportional static gates, then passed final `C0/H0/M0/L0`. The private
endpoint, assertion and event audiences, signing and verification keys, HTTP
behavior, parser and scheduler policy, named operators, runtime bindings,
deployment evidence, and production authorization remain separately owned.
Current values stay `enabled=false`, `releaseApproval=false`, and
`runtimeWired=false`; production readiness does not increase from this local
composition checkpoint.

## 2026-08-10 — Local Identity lifecycle pull JSON operation implemented

**Outcome:** Academy added a pure local adapter between an injected response
transport and injected strict JSON reader. It preserves both captured receivers,
passes the exact lifecycle request through, returns only a successful parsed
value, and collapses transport/parser failures to one fixed detail-free error.

**Verification:** TDD first stopped on the missing module. The first
implementation passed 8/9; the remaining failure was a receiver expectation in
the Proxy fixture, and correcting only that fixture produced focused 9/9. The
first independent RIL returned `C0/H0/M1/L0` because async return adopted a
rejecting thenable after leaving the fixed catch boundary. Test-only RED passed
10/13. Awaiting the value inside the catch closed Promise, callable-thenable,
and throwing-getter detail leaks; focused GREEN now passes 13/13.
Strict-reader plus lifecycle tests passed 206/206, full unit passed 900/900, and
the Identity Control lifecycle pull contract passed 14/14. Scoped ESLint and
full lint/all TypeScript checks passed with one pre-existing generated-registry
warning. Real strict-reader composition rejects duplicate keys; valid and
invalid pages reach commit/retry outcomes without bypassing the verifier.
Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-json-operation-local-checkpoint-2026-08-10.md`.

**Residual risk:** Different independent closure review bound the regenerated
manifest, reran focused 13/13, relevant 206/206, producer 14/14 and proportional
static gates, then passed final `C0/H0/M0/L0`. The response transport still owns
the approved endpoint, credentials, HTTP
method/status/media behavior, and cancellation. Parser bounds, scheduler and
retry ownership, runtime bindings, deployment evidence, registry enablement,
release approval, and production authorization remain separate gates. Current
values stay `enabled=false`, `releaseApproval=false`, and `runtimeWired=false`.

## 2026-08-10 — Local Identity lifecycle pull-operation transport implemented

**Outcome:** Academy added a pure local transport that composes the accepted
pull-request builder with an injected logical operation. It creates the exact
initial or continued producer request, captures the operation method once with
its original receiver, and hands one opaque result to the existing verified-page
boundary. Failures collapse to one fixed detail-free error.

**Verification:** TDD first stopped on the missing module, then the first
implementation passed focused 8/8. Relevant lifecycle tests passed 165/165,
full unit passed 887/887, and the Identity Control lifecycle pull contract passed
14/14. Scoped ESLint and full lint/all TypeScript checks passed with one
pre-existing generated-registry warning. A valid empty page reaches the
lease-fenced commit; an invalid cursor relation returns bounded retry and never
commits. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-operation-transport-local-checkpoint-2026-08-10.md`.

**Residual risk:** Different independent review bound the manifest, reran
focused 8/8, lifecycle 165/165, producer 14/14 and proportional static gates,
and passed `C0/H0/M0/L0`. The actual authenticated HTTP operation, endpoint and
credential values, bounded response parsing, status/deadline/retry policy,
scheduler/runtime bindings, deployment evidence, registry enablement, release
approval, and production authorization remain separate gates. Current values
stay `enabled=false`, `releaseApproval=false`, and `runtimeWired=false`.

## 2026-08-10 — Shared strict JSON response boundary hardened

**Outcome:** Academy adopted the existing untracked shared BYOB response reader
and duplicate-safe JSON parser as a reviewed dependency. The helper enforces
strict UTF-8, media type, timeout/abort, byte and depth ceilings, rejects
duplicate semantic keys and ambiguous JSON, and returns `unknown` for an owning
client to project safely. Concurrent consumer/UI files were not staged.

**Verification:** A standalone adversarial RED passed 18/20 and failed because
caller options could exceed a 1 MiB allocation and depth 64. The helper now
rejects both before read/allocation; focused tests first passed 20/20. A later type gate
found only a test utility's `ArrayBufferLike` mismatch, fixed by copying fixture
bytes into an owned buffer. The first current-byte importer/full runs passed
210/210 and 871/871; scoped ESLint plus full lint/all TypeScript checks passed with one
pre-existing generated-registry warning. Evidence is in
`reports/reviews/academy-strict-json-response-local-checkpoint-2026-08-10.md`.

The first independent RIL returned `C0/H0/M1/L1`: repeated option reads allowed
a stateful getter to bypass the allocation cap or throw after reader acquisition,
and two report labels described untracked freeze bytes as tracked/committed.
Test-only RED passed 20/22. The helper now snapshots and validates all public
options once, allocates before acquiring the reader, and keeps cleanup on captured
values. Focused GREEN passes 22/22, current importers pass 212/212, and the
current full unit suite passes 877/877. Report wording is corrected.

The second independent RIL returned `C0/H0/M1/L0`: an `AbortSignal` Proxy could
throw from state/listener access after the reader was acquired, reject with
injected detail, and leave the stream locked. Signal-boundary RED passed 22/25.
Signal state and methods are now captured and preflighted before body access;
deadline cleanup and reader release are independently guarded. Current focused,
importer, and full-unit suites pass 25/25, 215/215, and 880/880 respectively.

The third independent RIL returned `C0/H0/M1/L0`: one-byte response
fragmentation caused cumulative BYOB view capacity to grow quadratically and a
microtask chain could outlive the nominal timer. Deterministic RED passed 25/26.
The reader now reuses a scratch buffer capped at 256 KiB plus one byte and
cancels before read 129. Current focused and importer suites pass 26/26 and
216/216; the current full workspace shape passes 85 files / 877 tests.

The fourth independent RIL returned `C0/H0/M1/L0`: a hostile signal wrapper
could attach the internal deadline listener and throw before cleanup ownership
was recorded. RED passed 26/27 with one retained listener. An intermediate fix
removed the leak but failed four existing hostile-signal assertions. The final
implementation validates native signal method identities, uses captured native
EventTarget operations only, and arms cleanup before registration. Focused,
importer, and full-unit suites now pass 27/27, 217/217, and 878/878.

The fifth independent RIL returned `C0/H0/M1/L0`: the read loop still attached
an internal listener dynamically, so prototype methods wrapped before module
load could retain it after add mutated then threw. Fresh-module RED passed
27/28 with two retained listeners. The reader now races each read against a
private deadline promise and creates no internal event listener; only the
already-transactional external listener remains. Focused, importer, and
full-unit suites now pass 28/28, 218/218, and 879/879.

The sixth independent closure RIL passed code/security at `C0/H0/M0` and found
one Low documentation error: the timer was already scheduled, while its callback
was starved by the microtask chain. The checkpoint report now records that exact
cause; source and test bytes are unchanged.

Different independent text-only closure then verified the regenerated manifest,
confirmed unchanged source/test hashes, reran focused 28/28, and returned final
`C0/H0/M0/L0`.

**Residual risk:** Product clients still own exact schema/status projection. The
actual Identity lifecycle
HTTP adapter, endpoint, assertion credentials, runtime bindings, scheduling,
deployment evidence, registry enablement, release approval, and production
authorization remain separate gates.

## 2026-08-10 — Local Identity lifecycle pull request builder implemented

**Outcome:** Academy added a pure local builder for the accepted lifecycle pull
request schema. It binds the configured consumer ID and assertion audience to
an injected server-side provider, validates cursor and limit before signer use,
and returns a fresh exact initial or continued request. Provider failures and
malformed assertions collapse to one bounded detail-free error.

**Verification:** TDD first stopped on the missing module. The first
implementation run passed 23/25; both failures were corrected test fixtures,
after which focused tests passed 25/25. Author review then exposed implicit
consumer-ID object coercion with a 25-pass/1-fail RED. The implementation now
checks string type before regex evaluation, and final focused tests pass 26/26
with zero coercion calls. Relevant lifecycle tests passed 157/157, full unit
passed 851/851, and the producer lifecycle pull contract passed 14/14. Scoped
ESLint and full lint/all TypeScript checks passed with one pre-existing
generated-registry warning. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-request-local-checkpoint-2026-08-10.md`.

**Residual risk:** Different independent checkpoint review bound the manifest,
reran focused 26/26, lifecycle 157/157, producer 14/14, and proportional static
gates, and passed `C0/H0/M0/L0`. The builder is local-only and unwired; it
performs lexical assertion validation but does not own signature/claim/replay
verification. Raw JSON and authenticated HTTP, endpoint and credential values,
key rotation, deadline/backoff/lag, scheduler/runtime bindings, deployment
evidence, registry enablement, release approval, and production authorization
remain separate gates.

## 2026-08-10 — Local Identity lifecycle verified-page transport implemented

**Outcome:** Academy added a pure local decorator between a future
duplicate-safe parsed-page transport and the accepted lifecycle pull-page
verifier/pull cycle. It binds the exact request cursor and configured limit,
uses the cycle's one verification time and explicit envelope policy, and returns
only a fully verified fresh page. Transport or verification failures collapse to
one bounded detail-free error; through the cycle they require retry and cannot
reach the fenced page commit.

**Verification:** TDD first stopped on the missing module. Initial GREEN passed
8/8. A Proxy RED then passed 8 and failed 1 because the parsed-page method was
read twice; capturing it once with its original receiver restored focused GREEN
at 9/9. Relevant lifecycle tests passed 131/131, full unit passed 825/825, and
the Identity Control lifecycle pull contract passed 14/14. The accepted producer
contract paths are unchanged from `a6ef1f4`. Scoped ESLint and full lint/all
TypeScript checks passed with one pre-existing generated-registry warning.
Evidence is in
`reports/reviews/academy-identity-lifecycle-verified-page-transport-local-checkpoint-2026-08-10.md`.

**Residual risk:** Different independent checkpoint review bound the manifest,
reran focused 9/9, lifecycle 131/131, producer 14/14, and proportional static
gates, and passed `C0/H0/M0/L0`. This module is local-only and unwired. Bounded
duplicate-safe raw JSON parsing, authenticated HTTP/client assertion,
endpoint/key/audience configuration, deadline/retry/lag ownership,
scheduler/runtime bindings, deployment evidence, registry enablement, release
approval, and production authorization remain separate gates.

## 2026-08-10 — Local Identity lifecycle pull-page verifier implemented

**Outcome:** Academy added a pure local verifier between a future authenticated
transport and the accepted durable pull-cycle port. It snapshots exact producer
page descriptors, enforces request limit and canonical cursor arithmetic, and
returns a fresh ordered page only after every compact JWS passes the existing
WebCrypto envelope verifier with one validated time and explicit policy.

**Verification:** TDD first stopped on the missing module. GREEN passed focused
34/34, relevant lifecycle 120/120, full unit 814/814, and the producer lifecycle
contract 14/14. Scoped and full lint/TypeScript checks passed with the one
pre-existing generated-registry warning. Static source assertions prove the
Worker, Wrangler/OpenNext configuration, middleware, Identity registry, and
callback remain disconnected. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-page-verifier-local-checkpoint-2026-08-10.md`.
The first independent RIL returned `C0/H0/M1/L0`: an overbound Array Proxy could
reach `ownKeys` before its own length was rejected. M-01 test-only RED failed
2/36 assertions and observed one trap call for both overbound envelope and JWK
`key_ops` arrays. The parser now validates the own length data descriptor and
bound before enumeration. Remediation GREEN passes focused 36/36, lifecycle
122/122, producer 14/14, and full lint/TypeScript checks with both trap counts at
zero. A different independent final re-review passed `C0/H0/M0/L0`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0`. The
verifier remains local-only and unwired. Endpoint, issuer/audience/key policy,
client assertions, authenticated bounded transport, deadlines/retries,
scheduler/runtime bindings, operator ownership, deployed evidence, registry
enablement, release approval, and production authorization remain separate
gates.

## 2026-08-10 — Local Identity Control conformance ledger refreshed

**Outcome:** Academy added a deterministic, source-bound generator for the local
Identity Control consumer-conformance ledger. The ledger retains nine accepted
local scenarios, promotes only the five lifecycle scenarios supported by final
independent reports, and keeps nine endpoint/key/runtime/bootstrap/deployed gaps
as `not_proven`. Its exact checkpoint declaration covers eight content paths;
the machine freeze manifest is the ninth artifact and is excluded only from its
own list. Academy stays `enabled=false`, `releaseApproval=false`, unwired, and
production NO-GO.

**Verification:** TDD first failed with `ERR_MODULE_NOT_FOUND`. GREEN passed the
generator contract 5/5, relevant Academy Identity units 125/125, and full unit
780/780 on Node 24.18.0. The producer intake regression, scoped ESLint, and Node
syntax checks passed. Canonical intake passed 23 verified / 14 pass / 9
not-proven; the exact eight-file manifest, secret, diff, and author reader gates
also passed. Evidence is recorded in
`reports/reviews/academy-identity-control-conformance-ledger-refresh-local-checkpoint-2026-08-10.md`.

**Residual risk:** Different independent checkpoint review passed
`C0/H0/M0/L0`; root separately re-verified the exact eight-file manifest. This
local evidence does not configure or call Identity Control. Publisher endpoint,
keys, audiences, kill-switch owner, authenticated transport, runtime/scheduler
wiring, canonical owner bootstrap, deployed browser proof, registry enablement,
and separate production authorization remain external gates.

## 2026-08-10 — Local Identity lifecycle pure pull cycle implemented

**Outcome:** Academy added an unwired pure cycle that composes the accepted
database-clock lease, durable checkpoint, strict page builder, and leased commit
around an injected verified-page transport and clock. It distinguishes busy,
transport retry, and committed results; reports independent page gap/conflict
flags plus configuration health; rejects durable approved-config drift before
transport; and never exposes an unfenced commit path.

**Verification:** TDD first failed because the module was missing. A second RED
failed 1/10 assertions because the clock and transport remained reachable before
the durable approved revision guard. GREEN passed focused 10/10, Identity 99/99,
full unit 761/761, and producer contract 20/20 on Node 24.18.0. Scoped lint,
typecheck, Next production build, offline production/dev audits, static policy
checks, and gitleaks passed. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md`.
The first independent RIL returned `C0/H0/M1/L0`: release `false` was ignored,
and a release exception could replace an already known primary outcome.
Remediation RED failed 14/20 assertions. GREEN passes focused 20/20, Identity
109/109, producer contract 20/20, scoped lint, and Node 24 typecheck. Every
acquired committed/retry result now carries exact release acknowledgement; local
failure preserves its original cause with the same status. A different
independent re-review then returned `C0/H0/M1/L0` with M-02 because the wrapper
copied cause text into its public message, string form, and stack. M-02 RED failed
9/29 assertions across read/parse/commit and all three release states. GREEN
passes focused 29/29, Identity 118/118, producer 20/20, scoped lint, and Node 24
typecheck. The wrapper now emits one fixed classification; exact cause identity
is non-enumerable, and JSON/enumerable keys expose only allowlisted
`leaseRelease`. A different final re-review verified the remediated checkpoint
freeze and passed `C0/H0/M0/L0`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0`. The module
is local-only and unwired. Endpoint/key/audience approval, authenticated strict
transport, runtime credentials and bindings, scheduler/topology,
timeout/retry/lag policy, monitoring/owner, authorized migrations and deployment,
registry enablement, and release approval remain external gates.

## 2026-08-10 — Local Identity lifecycle pull lease implemented

**Outcome:** Academy added an unwired database-clock lease for one logical
Identity lifecycle puller. Claim, renew, release, and fenced page commit require
an exact token/worker pair; page commit locks the active lease row in the same
transaction as the accepted `0022` aggregate commit. The first independent RIL
returned `C0/H0/M1/L0` because the concrete production class still exposed the
unfenced method even though its narrowed runtime type and SQL grant were fenced.
Remediation removed the lower interface, method, and exact unfenced RPC literal
from production code; administrative aggregate tests now use test-local
`rawCommit` only. SQL continues to expose leased commit only.

**Verification:** Initial TDD failed on the missing lease module and store method.
Image-pin tests then failed on missing/existing mutable-reference behavior, and a
descriptor Proxy RED showed 1 failed / 27 passed before validated inputs were
projected from their descriptors. GREEN passed focused 28/28, Identity 89/89,
hardened harness 13/13, disposable PostgreSQL 27/27, and full unit 751/751 on
Node 24.18.0. Lint/typechecks, Next and OpenNext builds, both offline audits, and
gitleaks passed. The owned PostgreSQL run used a verified content-addressed local
arm64 image with `--pull never` and proved cleanup. Evidence is in
`reports/reviews/academy-identity-lifecycle-pull-lease-local-checkpoint-2026-08-10.md`.
The remediation RED was 1 failed / 23 passed; GREEN passed focused 28/28,
Identity 89/89, hardened harness 13/13, disposable PostgreSQL 27/27 with cleanup,
and Node 24.18.0 typechecks. A different independent reviewer verified the
machine-generated eleven-file freeze manifest, reran focused 28/28, Identity
89/89, harness 13/13, disposable PostgreSQL 27/27 with cleanup, Node 24
typecheck, diff, reader, and secret gates, and passed the checkpoint at
`C0/H0/M0/L0`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0`. Migration
`0023` is unapplied outside the disposable loopback container. Pull-cycle
composition, endpoint/key/audience policy, scheduler and runtime binding,
operational owner, production
migration/rollback, monitoring, registry enablement, and release approval remain
separate gates. The PostgreSQL run is local arm64 fixture evidence, not portable
CI or deployed runtime proof.

## 2026-08-10 — Local Identity lifecycle atomic page store implemented

**Outcome:** Academy added an unwired page builder, one-RPC durable snapshot,
and atomic PostgreSQL page commit for already verified lifecycle pages. The
singleton `academy-web` checkpoint owns cursor and approved/observed config
health; issuer/subject projections keep applied state, revision, gap/conflict
fences, and highest-known revision without linking Academy users, email, or
activation. Runtime can call the two security-definer RPCs but cannot write the
tables directly; PUBLIC cannot execute the RPCs.

**Verification:** TDD first failed on the missing source and then on the missing
`0022` migration. Initial RIL returned `C0/H1/M2/L0` for ambient Docker authority
and uncertain cleanup, divergent raw-RPC gap evidence overwrite, and SQL issuer/
UTF-16 parity. Remediation RED reproduced the missing harness controls and 2/16
PostgreSQL failures. GREEN passed the adversarial harness 7/7, focused unit/reducer
41/41, disposable PostgreSQL 17.5 matrix 16/16 with migration reapply and cleanup
absence proof, Identity regression 84/84, and full unit 739/739 on Node 24.18.0.
Lint/typechecks, Next and OpenNext builds, both offline audits, dependency-tree
validation, and gitleaks passed. Later RIL returned `C0/H1/M1/L0` because direct
Vitest could trust marker+URL without inspecting its container and raw PostgreSQL
text could not preserve every accepted UTF-16 subject. The current remediation
requires exact running container ID/name/nonce label/image/loopback port inspection
before DB connection and uses a lossless canonical `subject_key` wire/table key.
GREEN passed harness 10/10, focused 47/47, disposable PostgreSQL 23/23,
identity-named 83/83, and full unit 745/745; lint/typechecks, Next/OpenNext,
offline audits, dependency tree, and gitleaks passed. Evidence is in
`reports/reviews/academy-identity-lifecycle-page-store-local-checkpoint-2026-08-10.md`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0`. Migration
`0022` is unapplied outside the owned disposable loopback container.
Puller/lease, endpoint/key/audience policy, runtime wiring,
PostgREST deployment, reconciliation authority, production migration/rollback,
monitoring, and browser evidence remain separate release gates. Registry
enablement and release approval remain false.

## 2026-08-09 — Local identity lifecycle projection reducer implemented

**Outcome:** Academy added an unwired pure reducer that mirrors Identity Control
revision `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606` for first seed, contiguous
revision, projected duplicate, stale, gap, and conflict handling. It validates
exact event/projection schemas and principal scope, returns fresh projections,
preserves valid state on every non-applied disposition, and keeps the producer
wire states without inventing an Academy database or activation mapping.

**Verification:** TDD collection failed before the module existed. The first
implementation passed focused 21/21, Identity 57/57, and full unit 719/719.
Initial RIL returned `C0/H0/M1/L0` because descriptor validation re-read Proxy
properties through `get`. Remediation RED reproduced four event/current throw
and divergent-get cases at 4 failed / 21 passed. The reducer now snapshots each
descriptor value once and never invokes input `get`; GREEN passed focused 25/25,
Identity 61/61, and full unit 723/723 across 78 files on Node 24.18.0.
Lint/typechecks, Next and OpenNext builds, both offline npm audits,
dependency-tree validation, and secret scanning passed.
Evidence is in
`reports/reviews/academy-identity-lifecycle-reducer-local-checkpoint-2026-08-09.md`.

**Residual risk:** Final independent re-review passed `C0/H0/M0/L0` after M-01
remediation. The reducer remains library-only and unwired; endpoint/key/audience
approval, authenticated pull, durable page and
cursor commit, operational owner, database transaction, deployment, and browser
proof remain separate production gates. Registry enablement and release approval
remain false.

## 2026-08-09 — Player resume rejects cross-scope browser records locally

**Outcome:** The exam/practice record schema remains `v1`, while new saves use an
injective private k2 key with two UTF-16-length-prefixed segments. Exact valid
legacy records copy to k2 and keep their old key; invalid or mismatching legacy
candidates remain untouched because their delimiter-based ownership is
ambiguous. Latest selection decodes exact k2 content, derives legacy scope from
validated records, prefers k2 when an attempt exists in both namespaces, and
breaks equal timestamps by ascending attempt-ID code units. No UI, route, DB,
Identity, or configuration code changed.

**Verification:** The original RED reproduced scope mismatches at 3 failed / 6
passed; the first GREEN reached relevant 24/24 and full unit 690/690. Independent
RIL returned `C0/H0/M2/L0` for delimiter collisions and enumeration-dependent
ties. Remediation RED failed 9/17; GREEN passed focused 17/17, relevant 32/32,
and full unit 698/698 across 77 files on Node 24.18.0. Lint/typechecks, Next and
OpenNext builds, both offline npm audits, dependency-tree validation, gitleaks,
and patch checks passed. Evidence is in
`reports/reviews/academy-player-attempt-storage-scope-local-checkpoint-2026-08-09.md`.

**Residual risk:** Browser storage remains best-effort local UX state, not
trusted grading evidence. Browser/E2E and production-runtime proof were not
needed for this pure data-boundary change. Final independent re-review passed
`C0/H0/M0/L0` after exercising delimiter, malformed-key, migration-failure,
dedupe, and deterministic tie cases.

## 2026-08-09 — Course skill-map client rejects ambiguous responses locally

**Outcome:** The protected learner skill-map client now uses the existing
bounded, duplicate-safe raw JSON reader and builds an exact deep projection
before coverage reaches the chart. Extra, missing, duplicate, malformed,
wrong-media, oversized, or stalled responses fail to the existing unavailable
state. One deadline covers fetch and body parsing; 401/403 preserve their
existing states and non-success bodies are canceled without being read. The
one-way producer invariant now also rejects `notStarted=true` with a positive
value while preserving the valid rounded-zero `notStarted=false` state. The
route, shared parser, UI, DB, and configuration were not edited.

**Verification:** The targeted RED failed because the former fetch had no abort
signal; a full-matrix RED was stopped when the unresolved-fetch case did not
settle under the former implementation. GREEN passed focused 32/32, relevant
40/40, and full unit 685/685 on Node 24.18.0. Lint/typechecks, Next and OpenNext
builds, both offline npm audits, dependency-tree validation, gitleaks, and
scoped patch checks passed. Initial RIL returned `C0/H0/M1/L0`. Remediation RED
failed the inconsistent start state at 1 failed / 33 passed; GREEN passed
focused 34/34, relevant 42/42, and full unit 687/687 on Node 24.18.0, with
lint/typechecks, both offline audits, and gitleaks passing. Evidence is in
`reports/reviews/academy-course-skill-map-client-response-validation-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local consumer-boundary evidence. Independent closure
review passed at C0/H0/M0/L0. Authenticated route/DB behavior and
deployed-browser stream behavior remain separate production gates; no server,
deployment, or production state was changed.

## 2026-08-09 — Practice simulation rejects ambiguous verdicts locally

**Outcome:** The practice simulation UI now receives only an exact, bounded,
duplicate-safe deep projection. Capstone and regular response variants follow
the existing route contract; regular results must match public requirements and
their counts, pass flag, hints, and debrief must be internally consistent. The
request and existing failure/UI states remain unchanged. The existing attempt
parser was extracted into the shared raw boundary instead of adding a third
parser; exact-ok keeps its sole 128-byte raw envelope contract.
Trusted `node.kind` now selects the only accepted response variant through the
LessonView/LessonBody/SimulationBlock chain. Capstones reject per-requirement
responses. One AbortController deadline covers fetch and body parsing, with the
reader receiving only the remaining time.

**Verification:** Missing-helper collection failed first. The temporary former
behavior reproduced 29 failures while 8 controls passed. GREEN passed practice
37/37, the four shared consumers 152/152, relevant/security 208/208, and full
unit 651/651 on Node 24.18.0. Lint/typechecks, Next and OpenNext builds, offline
npm audits, dependency-tree validation, gitleaks, and patch checks passed.
Independent RIL returned `C0/H0/M2/L0`. Remediation RED reproduced both
cross-variant accepts, missing fetch deadline, reset body budget, missing signal,
and missing trusted prop chain at 6 failed / 35 passed. GREEN passed focused
41/41, shared consumers 156/156, relevant/security 278/278, and full unit
655/655; lint/typechecks and both builds passed. Independent final re-review
passed at C0/H0/M0/L0.
Evidence is in
`reports/reviews/academy-practice-simulation-client-response-validation-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local consumer-contract evidence. Authenticated route,
DB-backed authorization, deployed-browser BYOB behavior, and production proof
remain separate gates. Route, DB/SQL, Identity, configuration, deployment, and
production state were not changed. Independent checkpoint review is pending.

## 2026-08-09 — Public waitlist rejects ambiguous success locally

**Outcome:** The public waitlist form now shows its existing success state only
for an HTTP success carrying the sole bounded raw JSON envelope `{ok:true}`.
Truthy non-boolean flags, extra or duplicate keys, a BOM, wrong media type,
oversized and malformed bodies, explicit failures, and non-success HTTP status
cannot claim that the learner is on the list. The shared success reader now uses
BYOB views bounded to `max+1`, a five-second deadline, optional AbortSignal, and
non-blocking safe cancellation. Non-success HTTP bodies are never read or parsed,
and server text is never returned to the form; the existing generic rejection
and network copy remain. Request fields, layout, route behavior, and persistence
are unchanged.

**Verification:** Missing-helper collection failed first. A behavior-preserving
extraction then reproduced the defect at 8 failed / 12 passed; GREEN passed
20/20. Final review returned C0/H0/M2/L0; remediation RED reproduced the unbounded
single-chunk/no-deadline reader and unbounded non-success error propagation at
12 failed / 36 passed. GREEN passed waitlist 32/32 and unsubscribe 16/16.
Waitlist/security regression passed 114/114 and full unit passed 614/614. Node 24
lint/typechecks, Next and OpenNext builds, both npm audits, dependency-tree
validation, gitleaks, and patch checks passed. Independent final review passed
at C0/H0/M0/L0.
Evidence is in
`reports/reviews/academy-waitlist-client-response-validation-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local client-contract evidence. DB-backed persistence,
deployed-browser behavior, and email delivery remain separate gates. No route,
E2E, DB/SQL, legal, Identity, configuration, deployment, or production state was
changed. Final-review M-01/M-02 remediation is complete locally; different
independent re-review is pending.

## 2026-08-09 — Lesson attempts reject malformed and ambiguous responses locally

**Outcome:** The lesson attempt hook now receives only a bounded, duplicate-safe,
exact recursive projection. False/missing/extra wrappers, omitted arrays,
malformed or answer-bearing nested tasks, invalid attempt IDs/expiry, duplicate
wire keys, duplicate task IDs, and invalid retry values no longer reach the
lesson as a ready attempt. The request and existing failure-state union remain
unchanged; route, public types, `LessonView`, progress, and DB code were not
edited. Expiry validation now checks the Gregorian date, component ranges, and
century leap-year rule instead of accepting JavaScript-normalized dates/times;
it does not compare against the learner device clock. Each network-interface
required field must also exist in the initial state and belong to the shared
surface input allowlist, matching the existing producer invariant.

**Verification:** The missing-helper import failed first. A behavior-preserving
extraction of the former casts then produced RED at 34 failed / 13 passed;
expanded GREEN passed 50/50 on Node 24.18.0. Attempt/security regression passed
170/170 and full unit regression passed 565/565. Node 24 lint/typechecks, Next
build, OpenNext build, both npm audits, dependency-tree validation, gitleaks, and
scoped patch checks passed. Evidence is in
`reports/reviews/academy-attempt-client-response-validation-local-checkpoint-2026-08-09.md`.
Preliminary RIL returned `C0/H0/M1/L0`; the expiry remediation reproduced four
normalized invalid timestamps at RED (`4 failed / 60 passed`), then passed
64/64 focused, 177/177 attempt/security, and 579/579 full unit tests. Independent
re-review closed that finding and identified a separate medium cross-field gap.
Its RED reproduced both violations (`2 failed / 65 passed`); GREEN passed 67/67
focused, 180/180 attempt/security, and 582/582 full unit tests. Independent
re-review of the latest remediation is pending.

**Residual risk:** This is local client-contract evidence. DB-backed attempt
issuance/consumption and deployed authenticated-browser proof remain separate
gates. No API behavior, persistence, SQL, configuration, Identity, deployment,
or production state changed; independent checkpoint review is pending.

## 2026-08-09 — Unsubscribe client rejects ambiguous success locally

**Outcome:** The unsubscribe form now enters its existing completion state only
when the request has an HTTP success status and the response is exact one-key
`{ok:true}` JSON. Malformed, empty, wrong-type, extra-key, and explicit-failure
HTTP 2xx responses use the existing failure/retry state instead of reporting
that marketing email has stopped. Request and anti-enumeration contracts remain
unchanged; the API route was not edited.

**Verification:** A behavior-preserving RED of the former `response.ok` decision
failed all seven malformed HTTP-success cases while three controls passed, then
initial GREEN passed 10/10. Preliminary RIL returned `C0/H0/M1/L0` because
`response.json()` collapsed duplicate wire keys before the one-key check. The
remediation now validates `application/json` and a bounded raw UTF-8 envelope;
duplicate keys in both orders fail while valid JSON whitespace passes.
Remediation RED failed 3/15 and GREEN passed 15/15; unsubscribe/security
re-review then found L-01 because default UTF-8 decoding consumed a leading BOM
before raw matching. BOM RED failed 1/16; preserving the BOM for rejection made
GREEN pass 16/16. Unsubscribe/security regression passed 51/51 and full unit
regression passed 515/515. Node 24 lint/typechecks, Next build, OpenNext build,
both npm audits, gitleaks, and scoped patch checks passed. Evidence is in
`reports/reviews/academy-unsubscribe-client-response-validation-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local client-contract evidence. Deployed browser and
DB-backed withdrawal proof remain separate gates; no route, SQL, configuration,
legal policy, Identity boundary, deployment, or production state changed.
The M-01 and L-01 findings are remediated locally; independent closure review
is pending.

## 2026-08-09 — Progress clients reject malformed and foreign-course records locally

**Outcome:** Lesson progress loading and reset reconciliation now accept a
learner record only when a scoped exact validator/projector accepts the wrapper,
record keys, nested arrays/maps, and requested slug. Returned data is a new
projection rather than the response object. Invalid responses keep the
established `unavailable` or `unknown` result instead of reaching learner state
as success.

**Verification:** TDD RED reproduced four unchecked response paths while nine
positive/existing cases passed. Focused GREEN passed 13/13, full unit regression
initially passed 493/493. Preliminary RIL returned `C0/H0/M2/L0`; remediation RED
reproduced exact-key, nested-map, and defensive-projection gaps, then GREEN passed
19/19 and full unit regression passed 499/499. Node 24 lint/typechecks, Next
build, OpenNext build, and both npm audits passed. The remediation removes the
dependency on pre-existing dirty `progress.ts` without editing that file.
Evidence is in
`reports/reviews/academy-progress-client-response-validation-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local client-contract evidence only. DB-backed,
Identity-runtime, deployed-network, and authenticated-browser proof remain with
their separate gates. No API, persistence, database, Identity, configuration,
deployment, or production state changed. The preliminary findings are remediated
locally; independent re-review is pending.

## 2026-08-09 — Dashboard resume honors the recorded in-progress lesson locally

**Outcome:** The dashboard now passes `record.lastNodeId` into the roadmap resume
boundary. That preference wins only while the exact node is `in-progress`;
completed, skipped, tested-out, locked, missing, and omitted preferences retain
the established deterministic fallback.

**Verification:** TDD RED reproduced both the pure selection defect and missing
dashboard-consumer boundary. Focused GREEN passed 20/20, full unit regression
passed 488/488, and Node 24 lint/typechecks, Next build, and OpenNext build
passed. Both npm audits found zero vulnerabilities; secret and patch-hygiene
checks also passed. Evidence is in
`reports/reviews/academy-dashboard-resume-last-node-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local consumer evidence only; authenticated browser
proof remains gated on the unwired Identity runtime. Equal course timestamps
remain unchanged because the persistence contract provides no causal tie-break.
No SQL, configuration, deployment, Identity, or production state changed;
independent review is pending.

## 2026-08-09 — Retention backlog now fails closed locally

**Outcome:** The scheduled retention worker no longer treats an unfinished
bounded backlog as success. At `MAX_ROUNDS` it records
`retention.backlog_remaining`, fails that job, continues independent jobs, emits
`retention.purge_failed`, never emits false completion for the exhausted job,
and rejects the aggregate run.

**Verification:** TDD RED reproduced two false-success paths. Focused GREEN passed
7/7, retention plus security wiring passed 40/40, full unit regression passed
485/485, and Node 24 lint/typechecks, Next build, OpenNext build, dev-inclusive
audit, secret scan, and patch-hygiene checks passed. Evidence is in
`reports/reviews/academy-retention-backlog-fail-closed-local-checkpoint-2026-08-09.md`.

**Residual risk:** This is local worker behavior evidence only. A real scheduled
event must still prove all five jobs reach completion or surface failure. No SQL,
retention period, credential, configuration, deployment, or production state
changed; independent review is pending.

## 2026-08-09 — Production dependency audit reduced locally; release exception open

**Outcome:** Targeted npm overrides move transitive `nanoid`, PostCSS, and sharp
to patched `3.3.17`, `8.5.26`, and `0.35.2` resolutions while Next remains
`15.5.22`. The lockfile and direct-dependency SBOM receipt were updated together;
no force install or major framework upgrade was used. This clears the scoped
local production audit but does not close release readiness. The dev toolchain
also moves to Wrangler 4.120.0 / Miniflare 5.20260801.1-alpha, which owns patched
`undici@7.29.0`; the existing `@eslint/eslintrc` range resolves patched
`js-yaml@4.3.1`.

**Verification:** The production audit moved from four High findings to `found 0
vulnerabilities`. Focused SBOM tests passed 2/2, full unit regression passed
484/484, and lint/typechecks plus production build passed. On Node 24.19.0 the
Next optimizer converted a real 400x400 PNG to a nonempty 64x64 PNG, rejected
malformed and unapproved sources, and the OpenNext/Cloudflare build completed.
The dev-inclusive audit moved from 2 High + 2 Moderate findings to `found 0
vulnerabilities`; the updated toolchain tree has no invalid/peer errors and its
Node 24 OpenNext build passed.
Evidence is in
`reports/reviews/academy-production-dependency-audit-local-checkpoint-2026-08-09.md`.

**Residual risk:** Independent re-review is pending. Sharp 0.35.2 is outside the
`^0.34.3` optional range declared by Next 15.5.22 and 15.5.23, so this remains a
release-blocked compatibility exception despite passing local runtime evidence.
Academy/director has no canonical CI workflow, so neither audit command is yet a
required CI gate. The Wrangler/Miniflare toolchain findings are closed locally;
the sharp compatibility exception remains the dependency release blocker.

## 2026-08-09 — Local identity session-cookie boundary completed

**Outcome:** The future `academy_session` library now accepts one exact
case-sensitive canonical cookie from a raw header, rejects duplicate names in
every order, and validates the existing URL-safe 32-160 character opaque ID
contract. Creation and deterministic deletion share host-only `Path=/`,
`HttpOnly`, `SameSite=Lax`, and matching `Secure` behavior; deletion uses
`Max-Age=0` and no parent `Domain`.

**Verification:** TDD RED failed four new cases before the parser/deletion helper
existed. Focused GREEN passed 6/6, full unit regression passed 484/484, and
lint/typechecks plus production build passed. Evidence is in
`reports/reviews/academy-identity-session-cookie-local-checkpoint-2026-08-09.md`.

**Residual risk:** This boundary is unit-only and unwired. Runtime integration
and production browser proof for canonical host-only issuance, duplicate-name
failure, refresh, deletion, revocation, and sibling-host isolation remain
separate authorized work. Independent review is pending; the dependency audit
is locally green, but the sharp compatibility exception still blocks release.

## 2026-08-09 — Local HTTP security-header delivery completed

**Outcome:** Academy added a catch-all Next.js header rule with report-only CSP,
HSTS, MIME sniffing protection, active frame denial from `X-Frame-Options: DENY`,
strict-origin referrer handling, restricted browser capabilities, and disabled DNS prefetching. The CSP remains
in observation mode until deployed browser compatibility evidence supports an
enforcement decision.

**Verification:** TDD RED failed 3/3 because `nextConfig.headers` was absent;
focused GREEN passed 3/3. Full unit regression passed 481/481, lint/typechecks
and production build passed, and a temporary local production server returned
all seven headers on both `/courses` and `/api/auth/me`. The temporary port was
closed after verification. Evidence is in
`reports/reviews/academy-security-headers-local-checkpoint-2026-08-09.md`.

**Residual risk:** final independent review is pending. CSP enforcement still
needs deployed browser evidence, and the sharp compatibility exception still
blocks dependency release readiness. No deployment, production state, registry, key,
database, or Identity Control system changed in this checkpoint.

---

## 2026-08-09 — Local lifecycle-envelope verifier implementation completed

**Outcome:** Academy added one unwired WebCrypto consumer boundary for
`lifecycle.envelope-cryptographic-verification`. It accepts the exact
producer-owned fixture-only ES256 vector from Identity Control revision
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`. The reviewed implementation is
frozen locally at `845e371173efb7b15b7605ecbc9496c47e2068fb` and returns `null` for signature,
algorithm, key ID, issuer, audience, time/skew/lifetime, strict schema, malformed
key, and malformed compact-JWS failures. No replacement key or signature was
created.

**Verification:** TDD RED was captured before the verifier existed. Focused tests
passed 4/4, focused identity regression 48/48, full unit regression 478/478,
lint/typechecks and production build passed, and gitleaks found no leak. The
source-bound receipt and author report are under
`reports/conformance/identity-control/academy-lifecycle-envelope-local-conformance.json`
and
`reports/reviews/academy-identity-lifecycle-envelope-local-conformance-2026-08-09.md`.

**Independent review:** the closure pass reproduced the array-only `key_ops`
fix and final revisions, passing C0/H0/M0/L0.

**Residual risk:** the dependency audit is locally green, but the sharp compatibility exception still blocks release. Runtime key distribution,
lifecycle transport/cursor, configuration, session/auth wiring, owner bootstrap,
and production authorization remain blocked; Academy and Crux remain disabled
and local evidence keeps `releaseApproval=false`.

---

## 2026-08-09 — Public learning previews and learner-data boundary hardened

**Outcome:** Academy now provides a truthful public decision surface before
accounts are available: static EN/TH course previews, catalog, canonical
localized metadata, and localized static share images. Public projections
exclude lesson bodies, answers, private media, cues, skill weights, and learner
records. The protected learner map and dashboard use derived/allowlisted DTOs;
the dashboard no longer serializes the course registry through Flight.

**Authorization and data minimization:** dashboard course data is created only
after session, service activation, and per-course entitlement. `GET
/api/progress` is `private, no-store`, rejects malformed success payloads, and
reads progress only for the entitlement-approved slug allowlist. An empty
allowlist opens no DB query.

**Verification:** full unit suite passed `474/474`; production build passed;
public E2E passed `24/24`; `git diff --check` passed. Independent code/debt,
security, and UX reviews closed without C/H/M findings. Reports are under
`reports/reviews/*checkpoint-2026-08-09.md`.

**Residual risk:** real learner sign-in, owner bootstrap, and entitled browser
proof remain blocked on Identity Control runtime release, public-key/lifecycle
publication, named kill-switch owner, conformance rehearsal, and separate
production authorization. No database, deployment, or external configuration
was changed.

---

## 2026-08-06 — Consumer Registry v1 approval incorporated locally

**Outcome:** Academy updated its non-secret candidate and local contract mirror
from pre-approval `UNKNOWN` values to the canonical Identity Control policy:
`academy-web`, `academy`, `open`,
`https://academy.cyberskills.co.th/auth/callback`, result audience
`https://academy.cyberskills.co.th`, client-assertion audience
`https://accounts.cyberskills.co.th/v1/code/exchange`, config revision `1`,
initial state `disabled`, and lifecycle transport `authenticated_pull`.
Public-key references, lifecycle endpoints/audiences, and kill-switch owner stay
canonical `null`/empty because Identity Control has not published those values.

**Local preparation:** Added restart-safe file stores for authorization
transactions and opaque Academy sessions with an exclusive inter-process lock,
atomic writes, restrictive file permissions, one-time consume/revoke, expiry,
and fail-closed corruption/lock handling. Session claims contain lifecycle/
activation only; course entitlement remains an Academy-owned authorization
decision. The real adapter, production
sign-in, owner bootstrap, DNS, key generation, and deployment remain disabled.

**Verification:** Identity boundary, policy mirror, durable transaction/session,
and course-access tests pass. The candidate report is
`reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`.
No Identity Control, Pool A, DNS, credential, key, or production system was
touched.

**Residual risk:** Identity Control still needs to publish public-key
registration/rotation evidence, lifecycle pull contract, kill-switch owner,
and separate production authorization before Academy can wire runtime.

---

## 2026-08-06 — Identity Control consumer registration candidate prepared

**Outcome:** Academy prepared a non-secret candidate from its tracked source and
deployed Worker evidence. This was the pre-approval snapshot; its `UNKNOWN`
values are superseded by the canonical policy entry above. The deployed Worker
callback remains recorded only as an unregistered preview candidate for Identity
Control to assess separately.

**Safety:** no key, token, secret, credential, external configuration, or
production system was read or changed. The candidate is recorded at
`reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`.

**Residual risk:** Academy cannot open sign-in or implement the real adapter
until Identity Control validates and publishes the registration values and
separately authorizes runtime integration.

---

## 2026-08-06 — Identity Control local convergence preparation

**Outcome:** Academy now follows the accepted central-account boundary without
inventing production identity configuration. The local fake flow creates and
one-time-consumes server-held state, PKCE verifier, and nonce; it rejects every
browser callback payload except one opaque `code` plus one opaque `state`, then
validates audience, service ID, nonce, principal shape, and activation shape
before any future Academy session/profile orchestration. It also requires the
code-exchange client assertion through a server-held provider boundary; no key,
signer, or production client value was invented locally.

**Safety:** direct Academy-to-GoTrue OTP is quarantined to an explicit,
loopback-only local E2E fixture. A deployed Academy cannot reopen that path by
receiving public Supabase values. Fake mode requires an explicit local-only
issuer and is rejected on production; Academy does not guess the canonical
issuer, Account Center endpoint, client/service registration, audience, callback
registry, key, or secret.

**Identity ownership correction:** a new canonical principal no longer inherits
or links a waitlist lead through email equality. Migration `0021` nulls legacy
`leads.user_id` associations while retaining the underlying waitlist and consent
records.

**Ownership:** Identity Control remains responsible for canonical principals,
Account Center, OTP, service activation, authorization codes, lifecycle and
client registry. Academy retains only its profile projection, orders, course
entitlements/invites, learning records, attempts, and certificates. Activation
does not grant a course entitlement.

**Verification:** local transaction/callback, direct-OTP quarantine, registry,
sign-in state, and full Academy unit suite passed 420/420; lint/typecheck and
Cloudflare build passed with only the pre-existing generated-registry warning.
The independent code/debt, security, and UX review loop closed with no remaining
critical, high, medium, or low finding.
No Pool A, Identity Control production configuration, DNS, credential, or
deployment was touched.
The independent review record is
`reports/reviews/academy-identity-control-preparation-2026-08-06.md`.

**Residual risk:** production integration remains intentionally unwired until
Identity Control publishes the registered values and receives separate release
authorization. The local in-memory transaction store is test preparation only,
not a production persistence design.

---

## 2026-08-06 — Checkpoint drafts survive a reload within one issued attempt

**Outcome:** learner-entered checkpoint answers and simulation state are now
stored as a versioned browser draft keyed by course, node, and server-issued
attempt ID. Reloading returns only that attempt's work; a different attempt
cannot read it. The draft is removed when the checkpoint passes or the learner
requests a new attempt.

**Safety:** the browser store accepts only current question IDs and choice keys,
and only simulation fields/types permitted by that issued public challenge.
Malformed storage is discarded. The draft contains no answer key, grading rule,
session credential, or authority; server-side attempt and grading controls
remain authoritative.

**Verification:** draft unit contract covers round-trip isolation, malformed or
out-of-contract storage, and scoped clearing. Academy unit suite passed
400/400; lint/typecheck and Cloudflare build passed.

**Residual risk:** browser storage is best-effort and device-local. A learner
can resume an issued task after a reload on the same browser, but cross-device
draft synchronization remains intentionally out of scope until account runtime
is open.

**Follow-up browser proof:** a clean local Supabase start and `db reset` now
apply migrations `0001` through `0020`; compatibility roles in
`supabase/roles.sql` provide only the names/grants required for that local
migration path. A disposable loopback-only dedicated data API with ephemeral
credentials then ran `e2e/attempt-ux.spec.ts`: 9/9 passed. That proof found and
closed one lifecycle race: a queued browser save could recreate a draft after
automatic attempt replacement. The save guard is now synchronous, and the
`409` fixture returns a distinct replacement attempt as the real invalid-attempt
state does.

---

## 2026-08-06 — Unsubscribe URL bearer redaction deployed and verified

**Outcome:** unsubscribe tokens are carried only in the URL fragment. The browser
reads the token once, removes the fragment from history, and sends it only in the
POST body; the initial HTTP request has no bearer token in its URL.

**Verification:** a deployed-browser request to
`/unsubscribe?lang=th#not-a-token` was intercepted as exactly
`/unsubscribe?lang=th`. Worker tail recorded the same clean URL twice with
invocation status `Ok`. No real recipient or unsubscribe token was used for the
proof. Unit and static security wiring tests cover fragment parsing, history
replacement, and the absence of query-token links.

**Residual risk:** account and private-media activation remain separate launch
gates; this evidence proves URL/log redaction, not delivery of a marketing email.

---

## 2026-08-06 — Edge rate limit deployed and production-verified

**Outcome:** public lead and future auth mutations are limited by a Durable Object
per opaque actor-route pair before OpenNext. `RATE_LIMIT_KEY_SECRET` was created
through standard input without recording its value. Academy Worker version
`b85b7a6d-ceaa-4708-81fd-0d8096462251` is active with the binding and migration
`v1-edge-rate-limiter`.

**Verification:** eleven invalid `POST /api/leads` requests, with no email or
database mutation, returned `400` ten times then `429` with `Retry-After: 53`.
An invalid `POST /api/auth/verify` returned `400`; Worker tail recorded the
invocation as `Ok`. Public `/`, `/courses`, and `/sign-in` returned `200`; a
legacy media path returned `404`.

**Deployment correction:** the first upload,
`7426e155-5d1c-4b12-996c-419db1d8deb6`, was not accepted as evidence because
Wrangler auto-detected OpenNext and deployed its inner worker without the Durable
Object class, causing intermittent `503`. Cloudflare correctly rejected rollback
after the migration was applied. A forward deployment using
`--autoconfig=false` restored the configured `worker.ts` entrypoint. `deploy:cf`
now permanently includes `--autoconfig=false --keep-vars`.

**Residual risk:** privacy/media/account-runtime public-launch gates remain
separate; any future deployment must retain the guarded deploy command and rerun
the bounded `429` proof.

**Evidence:** `academy-web/docs/edge-rate-limit.md`.

---

## 2026-08-06 — Dedicated Academy retention scheduler deployed

**Outcome:** งาน retention แยกออกจาก Academy runtime Worker แล้ว. Dedicated
PostgREST API expose เฉพาะ schema `academy`, bind ที่ loopback และรับ JWT อายุสั้นจาก
Worker `cyberskills-academy-retention` เท่านั้น. Role `academy_retention` execute ได้
เฉพาะ wrapper purge ที่ไม่มีพารามิเตอร์ 5 งาน; runtime และ shared `service_role`
ไม่มีสิทธิ์เรียก parameterized attempt purge.

**Verification:** backup schema/role ก่อนเปลี่ยน, transaction rollback rehearsal,
apply จริง และตรวจ owner/`SECURITY DEFINER`/`search_path=pg_catalog` ของ wrapper ครบ;
API กับ health sidecar healthy, tunnel/DNS ผ่าน, external root ตอบ `200` และ anonymous
table request ตอบ `401`. Worker version
`d2c0f761-c387-46d1-b28d-654b44a9af25` deploy 100% พร้อม schedule `0 3 * * *`.
Local suite 508/508, lint, Cloudflare build/deploy dry-run และ independent
Code/Security/UX review `C0/H0/M0/L0` ผ่าน.

**Residual risk:** ยังต้องเก็บหลักฐานจาก Cron event รอบแรกว่า job ทั้ง 5 รายงาน
`retention.purge_complete` หรือ failure ถูก surfaced ชัดเจน; ห้ามเรียก production purge
RPC ด้วยมือเพียงเพื่อเร่งผล. Public launch และ identity gates อื่นยังเปิดอยู่.

**Evidence:** `reports/academy-retention-api-rollout-2026-08-06.md`.

---

## 2026-08-05 — Dedicated Academy runtime data API deployed

**Outcome:** Academy Worker ไม่มีเส้นทาง runtime ที่ต้องถือ shared Pool A
`service_role` อีกต่อไป. Dedicated PostgREST อยู่หลัง tunnel hostname
`academy-data.cyberskills.co.th`, expose เฉพาะ schema `academy`, bind loopback และใช้
`academy_runtime` แบบ `NOLOGIN`/`BYPASSRLS` ที่มี exact Academy allowlist เท่านั้น.

**Verification:** backup Academy schema/roles ก่อนเปลี่ยน, privileged role bootstrap,
transaction rollback rehearsal และ migration `0019` ผ่าน; health sidecar ของ container
รายงาน `healthy`; runtime JWT อายุ 60 วินาทีจาก public path ตอบ `200` ขณะที่ anonymous,
forged `service_role` และ cross-schema ถูกปฏิเสธ `401/403/406`. Worker deployment
`4861c000-d987-40ac-971e-d6e47e1a92e0` เรียก RPC ผ่าน boundary นี้สำเร็จด้วย unknown
unsubscribe token ที่ไม่สร้างหรือเปิดเผยข้อมูลผู้เรียน. Local suite 498 tests, lint/type
checks และ Cloudflare build ผ่าน; independent Code/Security/UX review `C0/H0/M0/L0`.

**Residual risk:** runtime role เป็น trusted backend capability จึง route ยังต้อง bind
learner identity เองเสมอ; auth/owner bootstrap ยังปิด, retention cron รอบแรกยังต้องมี
execution evidence, และ public launch gates อื่นยังคงอยู่.

---

## 2026-08-05 — Pool A migrations and private-media Worker deployed

**Outcome:** ติดตั้ง Academy schema `0001`–`0018` บน production Pool A แบบ transaction
เดียว, เพิ่ม `academy` เข้า PostgREST และ deploy Worker ที่ใช้ private R2 media พร้อม
`MEDIA_SIGNING_SECRET` โดยไม่ส่ง local Supabase credentials ขึ้น Cloudflare

**Verification:** backup schema/roles/`.env` ผ่าน `pg_restore` inventory; Academy มี 13
tables, 1 view, 28 functions และทุก table เปิด RLS; `academy_staff_admin` เป็น NOLOGIN
role; schema `academy` ตอบ PostgREST `200` ขณะที่ schema ปลอมตอบ `PGRST106`; container
อื่นไม่ถูก recreate; Worker version `566b1d4e-ed2e-434e-9ca6-3a66282fadfb`; public pages
ตอบ `200`, legacy media 5 paths และ tampered grant ตอบ `404`; remote secret inventory
มีเพียง `MEDIA_SIGNING_SECRET`; production anon table/RPC ถูกปฏิเสธด้วย `401/42501`
ขณะที่ `public` และ `helm` profiles เดิมยังตอบ `200`; SQL rollback ผ่าน bounded
transaction dry-run แล้วจบด้วย `ROLLBACK` และ `.env` rollback delta มีเพียง `academy`

**Production fix:** เพิ่ม Worker-boundary deny สำหรับ registered legacy MP4/VTT/PDF
ก่อน OpenNext พร้อม registry-derived regression tests 15/15 และ lint/typecheck ผ่าน;
full suite non-DB tests ผ่าน 364 รายการ ส่วน DB integration 13 รายการรันไม่ได้เพราะ local
Supabase ไม่ได้เปิดที่ `127.0.0.1:54321/54322`

**Independent review:** Code C0/H0/M0/L0; Security C0/H0/M0/L0; UX C0/H0/M0/L1
PASS โดย Low ที่เหลือเป็น stale closed-auth copy ซึ่งมี owner, removal trigger และ
E2E/visual verification ระบุใน active plan แล้ว; visual lane N/A เพราะ production diff
ไม่มี DOM/CSS/layout change

**Residual risk:** auth/runtime ยังปิด, `academy.users=0`, owner bootstrap ยังทำไม่ได้,
retention cron รอบแรกยังต้องมี execution evidence; launch gates อื่นใน active plan ต้อง
ปิดก่อนรับ learner traffic

---

## 2026-08-05 — Certificate evidence claim approved

**Outcome:** Academy จะออก `Certificate of Course Completion: [Course]` โดยยืนยัน
เฉพาะว่าผู้เรียนทำ course requirements ครบและผ่าน required assessed checkpoints ทุกด่าน
พร้อมระบุชัดว่าไม่ใช่ professional certification

**Evidence:** independent learner, hiring-manager, enterprise-learning และ
digital-credential personas เลือก claim นี้เป็นอันดับหนึ่งทั้งหมด (4–5/5); ตรวจ current
progress/attempt/evidence implementation และเทียบ 1EdTech Open Badges 3.0 กับ Credential
Engine credential taxonomy; decision brief validator ผ่าน

**Implementation verification:** canonical title/claim/disclaimer + state-specific preview
constants ถูกใช้บน course record surface; targeted claim/course/i18n 19/19, full Vitest
483/483, production build, lint/typecheck (warning generated registry เดิม 1 จุด), targeted
course-record E2E 2/2; independent Code/Security/UX review C0/H0/M0/L0 และ
reader-first PASS

**Residual risk:** ยังออกใบไม่ได้จนกว่า W4 จะตรวจหลักฐานจริง, snapshot course/evidence
version, สร้าง idempotent issuance/status และเปิด privacy-controlled verification;
simulation ปัจจุบันไม่พิสูจน์ observed hands-on performance

---

## 2026-08-03 — Learner-Safety checkpoint 4: truthful learner copy + versioned consent

**Outcome:** learner-facing surfaces พูดตรงกับ capability ปัจจุบัน: progress มาจาก
CYBERSKILLS account ข้าม browser context, course card ไม่อ้างว่าออกใบรับรองแล้ว,
test-out/cross-product account copy ที่ยังพิสูจน์ไม่ได้ถูกตัด และ consent ที่ผู้เรียนเห็น
เป็น bilingual `v2` artifact ที่อ้างกลับได้ทั้งก้อน

**What changed:**
- เปลี่ยน issuance-oriented `certificateEligibility` เป็น `courseRecordSummary`;
  UI ใช้ Learning record/Course record complete และแยก future issuance note
- landing/catalog/sign-in/radar/roadmap copy อธิบายเฉพาเส้นทางที่เปิดจริง;
  historical test-out legend แสดงเฉพา record เก่าและบอกว่า route ถูกพัก
- CTA “Browse courses” ไป `/courses`; dashboard E2E สร้าง browser context ใหม่เพื่อพิสูจน์
  server-backed persistence โดยไม่อาศัย local browser state
- consent `v2` เก็บ English+ไทยใน tracked artifact เดียว; migration `0016` เพิ่ม
  default-deny `consent_events`, backfill `v1` และ atomic/idempotent RPC สำหรับ v1→v2 โดย
  `service_role` มีเฉพา `SELECT, INSERT` บน consent history

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **444/444** · clean production build ผ่าน · local DB reset จากศูนย์
และ apply migration 0001–0016 ผ่าน · Playwright **138 passed / 10 skipped** · focused
post-reset consent/RLS **21/21** + landing E2E **12/12** · desktop/mobile visual review ผ่าน ·
independent Code/Security/UX review **C0/H0/M0/L0 ทุก lane**

**Residual risk:** production ยังไม่มี migration `0016`; ต้อง apply migration ก่อน deploy code
ที่เรียก consent `v2` RPC ไม่เช่นนั้น lead submission จะ fail; W4 ยังต้อง evidence-aware
snapshot/version ก่อนเปิด certificate issuance/verification; private media, privacy/retention,
dependency, durable abuse control และ least-privilege production credential ยังเป็น launch gates

---

## 2026-08-03 — Learner-Safety checkpoint 3: dialog + video cue accessibility

**Outcome:** ผู้เรียนใช้ image lightbox, lab expansion, reset confirmation และ video cue
ด้วยคีย์บอร์ดได้ครบ โดย focus ไม่หลุดไป background, กลับไปจุดที่มีความหมายหลังปิด และ
ผลตรวจ video cue ถูกประกาศให้ assistive technology โดยไม่แตะ production, Pool A, R2,
deploy หรือ secrets

**What changed:**
- image และ lab เปลี่ยนเป็น native modal dialog; shared focus trap รองรับทั้งวง Tab ปกติ,
  non-tabbable focus target และช่วงที่ไม่มี enabled control พร้อมคืน focus ไป opener
- reset dialog เปิดหลัง phase commit, focus status ระหว่าง slow mutation, กัน Escape ระหว่าง
  outcome ยังไม่ทราบ และคืน focus ไป trigger หรือ course title ที่ยังอยู่จริงใน terminal state
- video cue แก้ semantics จาก modal เป็น inline dialog, focus ตัวเลือกแรก, รองรับ keyboard-only
  submit/continue, ใช้ persistent live status + `aria-describedby` และคืน focus ไป video
- visual suite scroll cue เข้า viewport จริงและเก็บ image/inline-lab modal ทั้ง desktop/mobile

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **440/440** · clean production build ผ่าน · Playwright
**137 passed / 10 skipped** · focused dialog/video/reset regressions **16/16** · ตรวจภาพ
desktop/mobile ไม่พบ overflow, clipping หรือ overlap · independent Code/Security/UX
checkpoint review **C0/H0/M0/L0 ทุก lane**

**Residual risk:** Learner-Safety Batch ยังเหลือ learner-facing copy ที่อ้าง
persistence/issuance ไม่ตรง implementation; production gates ด้าน privacy/retention,
private media, dependency, durable abuse control และ least-privilege credential ยังเปิด

---

## 2026-08-03 — Learner-Safety checkpoint 2: safe course reset

**Outcome:** ผู้เรียน reset course progress ได้ผ่าน confirmation ที่บอกผลกระทบจริง;
response หาย, multi-tab write, access loss และ load failure ไม่ทำให้ UI ประกาศผลเกินหลักฐาน
หรือทับงานรอบใหม่ โดยไม่แตะ production, Pool A, R2, deploy หรือ secrets

**What changed:**
- reset ใช้ client operation ID และ DB receipt; operation เดิมเป็น no-op และ receipt ถูกจำกัด
  128 แถวต่อผู้เรียน/คอร์สพร้อม index เพื่อไม่ให้ storage โตไม่สิ้นสุด
- DB revalidate activation/entitlement ใน transaction เดียวกับ epoch increment + delete;
  revoke/suspend race ปฏิเสธ reset และ compatibility caller ได้ error จริง
- ทุก success อ่าน receipt + current canonical record ก่อนอัปเดต UI; unknown recovery เป็น
  read-only status check ไม่มี destructive retry และ copy แยก access/load outcome ตามหลักฐาน
- overview ไม่สร้าง empty progress ปลอมเมื่อ 401/403/503, reset รองรับ record ที่มีเพียง
  `inProgress`/cue/evidence และ access loss ซ่อน stale roadmap/reset trigger

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **440/440** · migration 0001–0015 จาก fresh local DB ผ่าน ·
clean production build ผ่าน · Playwright **136 passed / 10 skipped** · race regressions ครอบคลุม
response-lost, delayed 200 + new-tab write, revoke/suspend และ receipt cap · independent
Code/Security/UX checkpoint review **C0/H0/M0 ทุก lane**

**Residual risk:** receipt รับประกัน idempotency สำหรับ 128 operation ล่าสุดต่อผู้เรียน/คอร์ส;
Learner-Safety Batch ยังเหลือ dialog/video accessibility และ learner-facing copy ส่วน production
gates ด้าน privacy/retention, private media, dependency, durable abuse control และ
least-privilege credential ยังเปิด

---

## 2026-08-03 — Learner-Safety checkpoint 1: simulation readiness

**Outcome:** incomplete simulation ไม่ consume/ปิด attempt และไม่ล้างงานผู้เรียน; คำตอบที่
ทำครบแต่ผิดยังถูก grade ตามปกติ โดยไม่แตะ production, Pool A, R2, deploy หรือ secrets

**What changed:**
- readiness ใช้ public `requiredFields` แยก DHCP/static และ server ตรวจ snapshot ก่อน claim
- field edit หลัง Apply กลับเป็น unapplied; validation แสดงข้างปุ่มและคง MCQ/simulation เดิม
- active attempt รุ่นเก่าถูก normalize; supplied attempt และ assessed/redaction policy ยังยึด
  snapshot เดิมเมื่อ deploy เปลี่ยน node/simulation กลางงาน
- authoring typo ที่ชี้ field ซึ่ง surface แก้ไม่ได้ถูก loader ปฏิเสธ; mobile network form
  แสดงค่าเต็มและ touch target 44px

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **426/426** · clean production build ผ่าน · Playwright
**124 passed / 10 skipped** · independent Code/Security/UX checkpoint review **C0/H0/M0 ทุก lane**

**Residual risk:** Learner-Safety Batch ยังเหลือ reset recovery, dialog/video accessibility และ
learner-facing copy; production gates ด้าน privacy/retention, private media, dependency,
durable abuse control และ least-privilege credential ยังเปิด

---

## 2026-08-03 — Integrity Batch ปิดครบหลัง independent checkpoint

**Outcome:** ปิด race ของ attempt/progress/reset/access, ทำ activation revision ให้ monotonic
และผูก explanation กับ snapshot ของ attempt ที่ผู้เรียนทำจริง โดยไม่แตะ production, Pool A,
R2, deploy หรือ secrets

**What changed:**
- claim token เปลี่ยนทุก reclaim; current claim เท่านั้นที่ commit progress+outcome แบบ atomic
  ได้ และ concurrent matching claim ถูกแยกจาก invalid เพื่อให้ UI reconcile ก่อนออกใบใหม่
- progress epoch ครอบคลุม attempt และ generic mutations; reset เพิ่ม epochพร้อมลบ progress
  ใน transaction เดียว และ final write revalidate activation+entitlement ภายใต้ row locks
- activation sync รับเฉพาะ revision ที่สูงกว่า; equal revision ต้อง idempotent
- attempt params เก็บ explanation snapshot; review endpoint เลือกจาก `passed_attempt_id` ก่อน
  content ปัจจุบัน และ fail closed บน assessed completion ที่หลักฐานหาย

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **413/413** · clean production build ผ่าน · DB lint ไม่มี error ·
Playwright **122 passed / 10 skipped** · deterministic two-connection tests ครอบคลุม
suspend/reset interleaving · independent Code/Security/UX checkpoint review
**C0/H0/M0 ทุก lane**

**Residual risk:** ยังห้าม production traffic/certificate จนกว่าจะปิด learner-safety,
privacy/retention, private media, dependency advisories, durable abuse control และ
least-privilege production credential; งาน product ถัดไปคือ Learner-Safety Batch

---

## 2026-08-03 — Local Security Batch ปิดครบหลัง implementation audit

**Outcome:** ปิด P0 ข้อ 1–4 จาก audit ครบทั้ง auth cookie/transport,
same-origin mutation boundary, bounded JSON, activation/entitlement/prerequisite guards
และ learner-facing denied/unavailable/access-lost states โดยไม่แตะ production, Pool A,
R2, deploy หรือ secrets

**What changed:**
- รวม policy ของ auth cookie ให้เป็น `HttpOnly`, `SameSite=Lax`, `Secure` แบบ
  fail-secure และบังคับ HTTPS auth mutations บน production edge
- mutation routes ตรวจ same-origin/Fetch Metadata; JSON endpoints อ่าน body แบบมี
  byte limit; resource routes ตรวจ activation, course entitlement และ node prerequisite
- dashboard แสดงเฉพาะคอร์สที่มีสิทธิ์และแยก signed-out/inactive/unavailable; lesson และ
  course overview หยุด action เมื่อสิทธิ์หาย; sign-out ล้าง current-browser cookies แม้
  provider revoke ยืนยันไม่ได้ พร้อม visible local-only notice
- เพิ่ม regression coverage สำหรับ direct locked-node access, revoked/suspended access,
  mid-session revoke, DB non-mutation, partial entitlement, 503 retry และ sign-out fallback

**Evidence:** lint/typecheck ผ่าน (`0 errors`, generated registry warning เดิม 1 จุด) ·
Vitest unit/integration/type **388/388** · clean production build ผ่าน · Playwright
**121 passed / 10 skipped** · independent Code/Security/UX checkpoint review
**C0/H0/M0 ทุก lane**

**Residual risk:** ยังห้าม production traffic/certificate จนกว่าจะปิด Integrity Batch,
private `/media/*`, HTTPS runtime `Set-Cookie` proof บน topology จริง, privacy/retention,
dependency advisories และ durable abuse control; งานถัดไปคือ Integrity Batch ตาม
`active_plan.md`

---

## 2026-07-31 — One-shot build EXECUTED: M1 + M2 + M3-prep ผ่าน acceptance ครบ

**Outcome:** `academy-web/` เกิดจริงและเขียวทั้ง chain จาก clean install:
`npm ci && build && lint && test (vitest 55/55) && test:e2e (playwright 18/18)`
บน local Supabase จริง — M1 Foundation (landing + PDPA + lead capture + schema
`academy` RLS default deny), M2 Course player (loader + practice + timed exam +
PBQ checks/select/order + scoring spec + module nav + resume + axe + visual
matrix), M3-prep (ADR draft single-account)

**What changed (commit หลักของ run):**
- M1: scaffold ตรึงรุ่นตาม cyberskills-web (next 15.5.x/react 18.3.x/tailwind
  3.4.19 + lockfile + .nvmrc 24 + SBOM) · landing content-agnostic + `/privacy`
  PDPA + consent v1 versioned + CHECK constraint · `/api/leads` idempotent +
  content-type/body-size/rate-limit + DB-fail ตอบ fail จริง · migration 0001
  (RLS เปิด 0 policy, grant เฉพาะ service_role) · tests: RLS hardening จาก
  pg_catalog + anon REST read/write ถูกปฏิเสธแยก test + service-role positive
- M2: fixture CAS-005 internal (md5 ตรง source Crucible `640c8613`) + integrity
  test · loader → `CourseContent` (validation บอกไฟล์/field) · scoring ตามแผน
  §4-M2-3 ครบ edge · timer deadline-based + fake clock · progress localStorage
  versioned + corrupt reset · full-acceptance e2e: FL-02 ทั้งชุดผ่าน UI 90 ข้อ
  → 105/106 = 99.1% ตรงเป๊ะ (ตั้งใจผิด 1 MCQ), PBQ 21/21, exhibit PBQ-009,
  weakest domain ถูก module · visual matrix 7 states × {1440, 390} ไม่มี defect
- M3-prep: `docs/adr/ADR-draft-single-account.md` (DRAFT — decision matrix 5
  แกน + code evidence 4 product + migration/rollback sketch + คำแนะนำ Option A)
- `PENDING_USER_ACTION.md` ครบตามแผน §5 (Vercel/Cloudflare/DB prod/ADR/push)

**Deviation จากแผนที่ต้องรู้:**
- **Fixture module-1 = 150 MCQ ไม่ใช่ 165** — เลข 165 ในแผน/RIL รอบก่อนเป็นความ
  คลาดเคลื่อนของสคริปต์นับรอบวางแผน (source + manifest ของ source เอง = 150;
  reviewer codex ที่ประเมิน 150 ถูกแล้ว) → integrity test ยึด 150 + บันทึกใน
  `academy-web/fixtures/cas005/README.md`
- MCQ 35 ข้อมี `visual` ref ไป assets/ ที่อยู่นอกสโคป fixture — loader เก็บ
  metadata, player ไม่ render (known limitation)
- Infra เครื่อง dev: disk เต็ม (เหลือ 120MB) ทำ Docker snapshot พังกลาง run —
  กู้ด้วยการลบ lease ค้าง + re-pull + เคลียร์ image เก่า (~9GB คืน); บันทึกใน
  PENDING ข้อ 8

**Evidence:** commits ใน repo นี้ (scaffold → M1 → fixture → M2 core → M2 UI →
M2 e2e → ADR) · artifacts/oneshot-2026-07-31/{m1,m2}/ (screenshots ทุก state) ·
review lane อิสระหลัง build (ผลอยู่ใน handoff ปิด session)

**Residual risk:**
- ยังไม่ deploy จริง — external checkpoints ทั้งหมดรอ founder (PENDING §1–3)
- In-memory rate-limit พอเฉพาะหลัง Zero Trust; public ต้องมี edge rate-limit
- `/player` + fixture = INTERNAL ONLY ห้ามหลุดไป public deploy
- M3 auth จริงยังล็อกด้วย ADR gate (draft พร้อมแล้ว)

---

## 2026-07-31 — One-shot build plan เสร็จ + ผ่าน RIL 2 lane (codex + claude) converge

**Outcome:** แผน execute แบบ one-shot สำหรับ M1+M2+M3-prep พร้อมใช้ที่
`plans/platform-build-oneshot-2026-07-31.md` — ผ่าน review อิสระ 2 lane จน
converge (claude r2 = PASS; codex r3 = technical clear + governance sweep แก้ครบ)

**What changed:**
- แผน 4 revision (rev 1 → rev 4): commits `3ae8109`, `21932b3`, `a2a8e6f`,
  `40d54b4`; governance reconcile ทั้ง `AGENTS.md` + `active_plan.md` เป็น
  build-first ครบทุกจุด
- ทุก fact ในแผน verify จากไฟล์จริง: fixture module-1 = 15 parts / **165 MCQ**,
  FL-02 = 85 MCQ + 5 PBQ / 21 fields / kinds {checks,select,order}, PBQ-009 มี
  `exhibit`, stack ตรึงตาม cyberskills-web, tokens vendored pattern
- จุดเสี่ยงที่แผนดัก: `PGRST_DB_SCHEMAS` prod ยังไม่มี `academy` (external
  checkpoint พร้อม rollback), RLS false-green (assert relrowsecurity + negative
  แยก read/write), timebox → INCOMPLETE ห้าม tick, critical ค้าง = INCOMPLETE

**Evidence:** `reports/reviews/oneshot-plan-ril-2026-07-31.md` (บันทึกทุกรอบ +
verdicts + commits)

**Residual risk:**
- แผนยังไม่ถูก execute — สถานะจริงของ scaffold/local Supabase จะรู้ตอน run
- Demand ต่อ course ยัง unvalidated (founder รับความเสี่ยง build-first;
  รอบ pitch + poll ของ founder เป็นตัวปิด)
- Director submodule pointer ยังไม่ bump (director branch ปัจจุบันเป็นของ
  workstream อื่น — ทำตอนอยู่บน branch ที่ถูกต้อง)

## 2026-07-31 — Founder เคาะ: เริ่ม PLATFORM BUILD ทันที; Phase 0 = defer; ตัด CAS-005 gate จากแผน

**Outcome:** ทิศ execution เปลี่ยนจาก validate-first → **build-first** — เริ่มทำ
platform เลยโดยถือว่ามี demand; แผน build M1–M5 (content-agnostic) อยู่ใน
`active_plan.md` และ one-shot execution plan ละเอียดแยกไฟล์ใน `plans/`

**What changed / decided (founder, in-session 2026-07-31):**
- **เริ่ม build platform ทันที** — "ผมอยากเริ่มทำ platform"; ทุก milestone
  build แบบ content-agnostic (player/engine เสพ Crucible portable JSON)
- **Phase 0 ไม่ทิ้ง แต่ defer** — กลับมาตอนเคาะว่าจะทำ course อะไรบ้าง โดย
  founder จะไป **pitch + poll ผ่าน channels ต่างๆ เอง** (channel inventory
  Lane B = input ของรอบนั้น)
- **ตัด CAS-005 gate ออกจากแผน** — ไม่ได้ focus course ใด course หนึ่งตอนนี้;
  key fix เสร็จสมบูรณ์แล้ว (Crucible `640c8613`, verify 29/29) — เรื่อง codex
  confirm pass ค่อยตัดสินใจใหม่ถ้าจะเอา bank ออก public (หมายเหตุ: codex
  ไม่ติด usage limit แล้ว — founder แจ้ง 2026-07-31)
- Handoff ถัดไป = **one-shot build order**: founder จะสั่ง execute แผนแบบ
  one shot; แผนต้องผ่าน RIL (codex + claude อิสระ) ก่อน close session

**Evidence:** in-session directives 2026-07-31 (บันทึกคำต่อคำในส่วน What
changed); active_plan restructure ใน commit เดียวกับ entry นี้

**Residual risk:**
- Demand ต่อ course ยัง unvalidated จนกว่ารอบ pitch + poll — founder รับ
  ความเสี่ยงโดยเจตนา; mitigation: recurring cost ~0 บน owned infra + ทุก
  milestone เป็น foundation ที่ locked vision ต้องใช้อยู่ดี
- External steps (Vercel/DNS/Zero Trust/GCP) ทำใน one-shot ไม่ได้ — ต้องเป็น
  checkpoint กับ founder ตามแผน

## 2026-07-31 — Lane B: channel inventory brief เสร็จ (รอ founder เคาะ channel)

**Outcome:** inventory ช่องทาง distribution จาก assets ที่มีจริงครบ 8 ช่อง พร้อม
decision brief ให้ founder เคาะได้ทีละช่องโดยไม่ต้องหาข้อมูลเอง —
`reports/reviews/channel-inventory-2026-07-31.md` (read-only ทั้ง lane:
ไม่มีการส่ง email/โพสต์/ติดต่อภายนอกจริง)

**What changed / found:**
- ช่องที่แนะนำเริ่มก่อน: **corporate probe** กับ client เดิม role=owner (KTB,
  Chowbright, ARV, Humanica) + Angler pilot client (รวม 5 org) — ทำได้ทันที
  ไม่ต้องรอ Lane C; IIDA/Trainocate = instructor-only ผ่าน MUIC ไม่ใช่ช่องของเรา
- B2C: FB communities cybersec ไทยรวม ~25–30k follower (Thai Cy Sec ~15.5k,
  CompTIA TH ~8k, Cyber Community TH ~3.9k, 2600 TH) — รอ Lane C + CAS-005 gate
- **ข้อค้นพบ:** เว็บไม่มี analytics ติดตั้ง (traffic = วัดไม่ได้; หน้า privacy
  ห้าม third-party tracking → ต้องเลือกตัว cookieless) และไม่พบ company social
  page — ต้องตั้งใหม่ก่อน campaign คอร์สฟรีตัวแรก
- Guardrails ที่คุมทุกช่องถูกบันทึกใน brief: university-IP (company voice
  เท่านั้น), MUIC ≠ CYBERSKILLS, CAS-005 publish gate, PDPA (Angler target
  lists ใช้ไม่ได้เด็ดขาด)

**Evidence:** brief ผ่าน independent review lane (managed reviewer read-only —
codex ติด usage limit ถึง 5 ส.ค.): **PASS-WITH-FIXES, accuracy 15/15 ข้อ
ตรวจถูกทั้งหมด**, SHOULD-FIX 2 จุด (source-URL mapping, scope ICCS4xx) แก้ครบ
ในรอบเดียว; sources ต่อ claim ระบุไว้ท้าย brief

**Residual risk:**
- ตัวเลข reach ของ dev communities (BorntoDev/สมาคมโปรแกรมเมอร์ไทย) ยังไม่
  verified — ต้องนับจริงถ้า founder เลือกช่องนั้น
- Instructor consent ที่มี = ลง profile เท่านั้น; การขอช่วยแชร์ต้องขอรายคน
- การยิง B2C ทุกช่องยังถูก gate ด้วย Lane C (มีหน้าเว็บให้ชี้) + CAS-005
  codex confirm + push authorization

## 2026-07-31 — Free-tier strategy ขยาย: entry certs ฟรีเต็มรูปเป็นเครื่องจักรโฆษณา

**Outcome:** founder กำหนดทิศทาง free tier ใหม่ (กว้างกว่า "fundamentals ฟรี"
เดิมมาก): **N+, Sec+, ISC2 CC, Basic Linux, Basic Programming แจกฟรีครบทุก
feature** — video, practice, lab, cheatsheet — เจตนา = โฆษณา:
"ถ้าของฟรีดีครบเครื่องขนาดนี้ ของจ่ายตังจะขนาดไหน"

**What changed / decided (founder):**
- Free tier = 5 คอร์ส entry เต็มรูป (ไม่ใช่แค่ fundamentals) — ทิ้งตลาด
  commodity ให้เป็นสนามโฆษณา; paid เหลือขั้นสูง/trend/B2B ที่ trust ถูกแก้แล้ว
- **Release ทีละตัว ไม่พร้อมกัน — founder ยืนยันเอง ("ค่อยๆเรียกแขก")**:
  แต่ละคอร์สฟรีคือ campaign เรียกแขกหนึ่งรอบ ไม่ใช่ catalog dump; ลำดับเสนอ
  Basic Linux → N+ (รอ founder เคาะลำดับจริง)
- CPO guardrails ที่บันทึกคู่กัน: lab ใช้แต้มฟรีรายเดือน (กัน abuse + เพดานต้นทุน);
  ภาระ content freshness ×5 ต้องผ่าน Crucible capacity assessment

**Evidence:** ต้นทุน free tier ~$0.3–0.5/active/เดือน (จาก CF Stream pricing
verified + GCP lab estimate) — ถูกกว่า CPC โฆษณาไทยแต่ได้คนเรียนจริง;
market anchors verified 2026-07-31 (CertMaster $489, Dion Udemy $15–30,
Dion direct $39–69/เดือน) — ดูรายละเอียดใน active_plan ส่วนโมเดลราคา

- **Refresh วน = ค่าโฆษณา (founder ยืนยัน):** ออกครบ 5 ตัวแล้วต้องวนกลับมา
  อัปเดต N+/Sec+ ตาม cert cycle — founder ยอมรับ loop นี้เป็น recurring
  marketing cost โดยเจตนา ("คิดเสียว่าค่าโฆษณา"); โบนัส: ทุก refresh คือ
  re-marketing event + วันที่ "อัปเดตล่าสุด" เป็น trust signal

**Residual risk:**
- งาน Crucible 5 คอร์สเต็มรูป + refresh loop ถาวร = ก้อนลงทุนจริงของ strategy
  นี้ — capacity assessment ยังต้องทำเพื่อ size ภาระ (founder ยอมรับหลักการแล้ว);
  ห้ามใช้ vision นี้ข้าม Phase 0 gate
- ตัวเลขบันไดราคา paid ทั้งหมดเป็น placeholder รอ WTP probe
- ISC2 CC ชนกับของฟรีของ ISC2 เอง — ต้องชนะด้วย lab + path ไม่ใช่แค่ฟรี

## 2026-07-31 — Infra direction เคาะ: Vercel (Phase 0 web) + Cloudflare Stream (มีเงื่อนไข) + Lab GCP ต่อ

**Outcome:** founder เคาะ infra ของ Academy ใน director discussion หลัง close
Lane A — บันทึกลง `active_plan.md` ส่วน "Infra direction":

**What changed / decided (founder):**
- **Phase 0 web = Vercel — ล็อก** (`academy.cyberskills.co.th` CNAME → Vercel
  sin1; admin ครอบ Zero Trust Access)
- **Video post-gate = managed stream ผ่าน Cloudflare Stream ได้ แบบมีเงื่อนไข:**
  ต้องไม่ขัด interactive video (pop-up คำถามระหว่างดู) — เงื่อนไขผ่านโดย design
  guard: ใช้ custom player เสพ HLS/DASH manifest + signed token, **ห้าม build
  บน iframe embed** ของ Stream; ชั้น interactive เป็น player logic ฝั่งเรา
  ไม่ผูก vendor (Bunny เป็น fallback ได้เพราะ HLS มาตรฐานเหมือนกัน)
- **Lab = GCP ต่อ — ล็อก** ("ไม่อยาก rebuild ทุกอย่างใหม่หมด") — reuse Crux
  lab plane; แยก project + budget alarm
- DB = Supabase self-host เดิม (video ไม่เข้า DB); assets/backup = R2; RDC
  บทบาทเดิม

**Evidence:** Cloudflare Stream custom-player + signed-token support ยืนยันจาก
developers.cloudflare.com (using-own-player, securing-your-stream) 2026-07-31;
pricing semantics จาก official docs: storage = prepaid block $5/1,000 นาที,
delivery = $1/1,000 นาทีที่ดู, encode ฟรี, ไม่มี free allowance; cost model +
ตัวอย่าง 3 scenario อยู่ใน active_plan (pilot ≈ $15/เดือน, growth ≈ $70,
scale ≈ $220)

**Residual risk:**
- Pricing ต้อง re-verify ตอน commit จริง (ตัวเลข ณ 2026-07-31)
- "prepaid capacity" ของ Stream storage: ยืนยัน billing behavior จริงตอนเปิดใช้
  (block ขยายเมื่อ catalog โต)
- Zero Trust free tier ~50 seats ต้องตรวจกับ plan จริงตอน setup
- Payment gateway ไทยยังไม่เลือก (DD ตอนใช้จริงตามเดิม)

## 2026-07-31 — Lane A ปิดสมบูรณ์: founder เคาะ 3 disputes + แก้ key ใน Crucible ครบ

**Outcome:** Lane A (critical path ของ Phase 0) จบทั้งเส้นในวันเดียว: audit →
founder decision brief → founder เคาะ ("แก้ตามแนะนำทั้งหมด") → แก้ answer key
3 ข้อใน Crucible พร้อม propagate ทุก artifact → **hard prerequisite ของ publish
gate ปลดแล้ว** (เหลือ optional codex confirm + push Crucible)

**What changed / decided (founder, ลายลักษณ์อักษร ใน session 2026-07-31):**
- PBQ-010 `recoveryOrder`: Preserve → Contain → **Fix root cause → Validate
  clean restore** (eradication ก่อน recovery ตาม NIST SP 800-61)
- M4-082: correct → **A,C,D,E** (เพิ่ม "Map fields")
- M4-067: correct → **A,B,C,E** (เพิ่ม "Sandbox process")

**Evidence:**
- Crucible commit `640c8613` (26 ไฟล์): bank JSON/MD, v2-build rewritten +
  v2-source (re-merge), SV2 regenerate (validator pass 199 files), SV1
  regenerate, full-length-02, practice-suite, v1 generator (กัน regression),
  Crucible completed_log บันทึก decision
- Verification script 29/29 PASS; adversarial review lane อิสระ:
  CORRECT-AND-COMPLETE (scope ตรง, ไม่มีข้ออื่นถูกแตะ, ไม่เหลือ stale key ใน
  deliverable); `git diff --check` ผ่าน

**Residual risk:**
- Cross-model (codex) confirm ยังไม่ได้รัน — usage limit ถึง 5 ส.ค. 2026;
  นัดรัน 1 pass ที่ 3 ข้อนี้ก่อน public distribution
- Crucible commit ยังไม่ push (รอ authorization ตามปกติ)
- `v2-build/work/` คง snapshot ก่อนแก้ไว้โดยตั้งใจ (ประวัติ pipeline) — ไม่ใช่
  deliverable

## 2026-07-31 — Lane A: CAS-005 answer-key dispute audit เสร็จ (founder decision brief พร้อมเคาะ)

**Outcome:** ปิดคำถาม "11 founder-level disputes เหลือกี่ข้อจริง" ด้วยการ audit
จากไฟล์จริงทั้ง pipeline — **เหลือเปิดจริง 3 ข้อ** (PBQ-010, M4-082, M4-067) พร้อม
founder decision brief ทีละข้อที่
`reports/reviews/cas005-dispute-audit-2026-07-31.md`

**What changed / decided:**
- นิยาม "11 disputes" ถูก verify: คือ 11 ธงระดับ `:answer` ใน
  `v2-build/review/findings-academic-iter1.json` (610 ข้อ / 75 ธงรวม)
- ตรวจ key ครบ 600 MCQ + 10 PBQ: **ไม่มี answer key ใดถูกแก้ตลอด pipeline**
  (merge copy byte-for-byte; finalfix แตะเฉพาะ prose) — กฎ "ห้ามแก้ key โดยไม่มี
  founder decision" ไม่เคยถูกละเมิด
- 8 ข้อ reviewer ถอนธงหลัง rewrite prose (iter2 ไม่ recur), M1-136 ลดเหลือ prose
  แล้วปิดใน final loop; 3 ข้อไม่เคยถูกปิด: M4-082 (ธง recur 2 รอบ), M4-067
  (ธงใหม่ iter2), PBQ-010 (ไม่เคยถูก re-review หลัง iter1)
- Universe ครบจริง: full-length + pre/post reuse ข้อจาก module banks ตาม id
  → ไม่มีข้อหลุด review
- Source of truth confirm: bank จริง = `archive/legacy-output/v4.1/practice-tests/`
  (`module-banks/` ต้นฉบับ + `student-version-2/` deliverable); `assessments/` ใหม่ยังว่าง

**Evidence:** report ถูก fact-check โดย independent review lane (read-only
verifier, 6/6 จุด CONFIRMED, 0 factual error); NIST SP 800-61r3 (current, เม.ย.
2025) ยืนยันลำดับ eradication-ก่อน-recovery ผ่าน csrc.nist.gov 2026-07-31;
codex review lane ใช้ไม่ได้ (usage limit ถึง 5 ส.ค.) จึงใช้ managed Claude
verifier ตาม `feedback_managed_subagents_ok_supersedes_blanket_ban`

**Residual risk:**
- 3 disputes ยังเปิดจน founder เคาะ — publish gate ยังปิดเหมือนเดิม
- รายชื่อข้อที่ iter2 ครอบจริง enumerate ไม่ได้แล้ว (out ถูก overwrite) — ข้อสรุป
  "8 ข้อถอนธง" อิงจากธงไม่ recur; ถ้าต้องการชัวร์ 100% สั่ง spot-check batch เดียว
  ได้ตอน Crucible fix session
- การแก้ key + regenerate + re-review เป็นงาน Crucible session แยก ยังไม่เริ่ม

## 2026-07-31 — Implementation direction ล็อก: DIY "build the core, buy the plumbing" + ทิศทาง single-account auth

**Outcome:** ปิดคำถาม Phase 1 "hosted LMS vs DIY" — **ไม่ซื้อ platform, build เอง
แบบซื้อเฉพาะ plumbing** และเพิ่มทิศทาง auth: **single account เข้าได้ทุก product**
(Crux, STAR, Academy, Forge) ซึ่งต้องยกเป็น ADR ระดับ ecosystem ก่อน build จริง

**What changed / decided:**
- เหตุผลหลัก: product ที่ล็อกไว้ (path engine, prove-it lab, ระบบแต้ม, edition
  pricing) ไม่มีขายใน LMS ไหน — ซื้อ platform = จ่ายรายเดือนให้ส่วน commodity
  แล้วยัง build ส่วนที่เป็น product อยู่ดี + vendor lock
- Build: path engine, credit ledger, pricing logic, course player, admin /
  Reuse: Crux lab plane, self-hosted Supabase, cs- design system, Crucible /
  Buy เป็น service จ่ายตามใช้: video streaming + payment (candidates ยังไม่เลือก
  — ต้อง due-diligence ตอนใช้จริง)
- ไม่ขัด validate-before-invest: DIY บน infra ตัวเอง = recurring ~ศูนย์;
  slice แรกของ stack จริง = ตัว Phase 0 เอง (build once, ไม่มีของ throwaway)
- Auth: ยกหลัก "single email identity" เดิมเป็น cross-product single account;
  ระหว่างรอ ADR → Phase 0 ใช้ email เป็น identity key + ออกแบบ auth ให้ consume
  external issuer ได้

**Evidence:** วิเคราะห์เทียบ LearnWorlds (verified $99–299/mo, ไม่มี credit
metering / lab plane / edition pro-rata) ใน director session 2026-07-31;
Crux lab plane + money-safety มีอยู่จริงใน `crux-lms/product/services/lab-plane/`

**Residual risk:**
- Build scope จริงยังไม่ถูก estimate — ห้ามเริ่ม build ก่อน Phase 0 signal ตาม gate เดิม
- Single-account ADR ยังไม่เกิด — ถ้า Academy build auth ไปก่อนโดยไม่ design ให้
  consume external issuer จะสร้าง migration debt
- ตัวเลือก vendor (streaming/payment) ยังไม่ verify ราคา/เงื่อนไขปัจจุบัน

## 2026-07-31 — Product concept + pricing/access model (founder discussion → draft ลงแผน)

**Outcome:** นิยาม product ของ Academy ชัดขึ้นจาก "on-demand courses" เป็น
**personalized, interactive, lab-gated learning** พร้อมโมเดลราคา/สิทธิ์เข้าถึง/
เศรษฐศาสตร์ lab ครบวงจร — บันทึกเป็น draft ใน `active_plan.md` ส่วน
"นิยาม Product + โมเดลราคา/สิทธิ์เข้าถึง" เพื่อใช้เป็นสิ่งที่จะ build เมื่อผ่าน Phase 0 gate
(ไม่เปลี่ยนลำดับ: Phase 0 ยังมาก่อน)

**What changed / decided (founder):**
- Personalized learning path: ประเมินความรู้ (quiz + in-video questions) →
  skip/branch → map กับ career goal; user override เสมอ; ทุกการข้ามได้ cheatsheet
- Lab browser-based เป็น gate ต่อ topic — ใช้หลักการเดียวกับ Crux lab plane
  (ตัว Crux product ยัง ILT-only ใช้ภายใน ไม่เปลี่ยน)
- Fundamentals แจกฟรี absorb cost เอง (ไม่ขายเป็น SKU เดี่ยว — เป็น funnel +
  prerequisite ใน path); premium/cert course ซื้อขาดต่อ edition
- **Access term ล็อก final: 3 ปีเต็ม เลขเดียวทั้ง catalog** — decision path
  ในวันเดียวกัน: เริ่มจากเสนอ 3 → founder ยกหลัก "ประตูทางเดียว" เลือก 2 +
  auto-extend จนจบ edition → **สุดท้าย founder เลือก flat 3 เพื่อความง่าย**
  (คำสัญญาเดียว ประโยคเดียว ไม่มีกติกาซ่อน; ยอมรับว่าเลขที่ประกาศแล้วลดไม่ได้);
  3 ปีครอบ cert cycle เต็ม → ไม่มีเคสซื้อซ้ำของเดิมโดยธรรมชาติ; เคส edition
  ยาวกว่า 3 ปี = ต่ออายุ goodwill รายกรณี ไม่ประกาศเป็นนโยบาย
- ระบบแต้ม lab (academy currency): แถมพอ "จบคอร์ส + ซ้ำ 1–2 รอบ",
  top-up ~ราคาต้นทุน infra (ไม่ใช่ profit line), คืนแต้มบางส่วนเมื่อทำจบ,
  นาฬิกาแต้ม = นาฬิกา access
- Upgrade ข้าม edition: ส่วนลด pro-rata ตามเวลา access ที่เหลือ (ซื้อปลาย edition =
  ลดเยอะ กัน "หลังหัก") + floor ศิษย์เก่า + free-upgrade window ก่อน edition ใหม่ +
  ไม่จัด sale ช่วง transition + ประกาศสูตร public

**Evidence (market verification ระหว่าง discussion 2026-07-31):**
- Pattern พิสูจน์แล้วในตลาด: LearnWorlds interactive video (commodity แล้ว),
  CompTIA CertMaster (adaptive question-first + confidence), N2K/CyberVista
  (diagnostic-first ทั้งบริษัท), Pluralsight Skill IQ, TryHackMe/HTB Academy
  (browser lab + gated progression, anchor ~$10.50/เดือน), Google Cloud Skills
  Boost (lab credits + free 35/เดือน), HTB cubes (คืนแต้มเมื่อจบ module)
- Access ของ official vendor: CompTIA CertMaster = 12 เดือนหลัง activate;
  ISC2 self-paced = 90–180 วัน → fixed 3 ปีของเรา = 4–12 เท่าของ official
- Cautionary: Knewton (adaptive learning overpromise → ขาย outcome ไม่ขาย AI)
- Source URLs อยู่ใน session discussion (director session 2026-07-31)

**Residual risk:**
- Demand ยัง unvalidated — ทั้งหมดคือนิยาม post-gate; Phase 0 ยังไม่เริ่ม และ
  distribution ยังเป็น binding constraint
- ตัวเลขทั้งหมด (แต้ม, floor %, window, ราคา, เลขปี) เป็น placeholder รอ calibrate
  จากต้นทุนวัดจริง
- ภาระ content factory (Crucible): granular + branch + cheatsheet ต่อหน่วย =
  โจทย์โตหลายเท่า ยังไม่ได้ประเมิน
- CAS-005 answer-key disputes ยังค้าง — hard prerequisite เดิมก่อน public distribution

## 2026-06-20 — Governance structure standardized

**Outcome:** Academy governance now follows the director-managed project
structure with project-local ownership for principles, skills, plans, reports,
artifacts, context, and docs.

**What changed / decided:**
- Added project-local governance directories with short ownership READMEs:
  `principles/`, `skills/`, `reports/`, `reports/handoffs/`,
  `reports/sessions/`, `reports/reviews/`, `artifacts/`, `context/`, and
  `docs/`.
- Updated `AGENTS.md` with the required read order, director/ecosystem links,
  and the local governance directory map.
- Kept existing Academy reports in the product repo and did not migrate old
  artifacts or reports in bulk.

**Evidence:**
- Governance structure verified with targeted file/directory checks.
- Director governance validator run from the director repo:
  `rtk bash scripts/validate-governance.sh`.
- Diff hygiene checked with `rtk git diff --check`.

**Residual risk:**
- This is governance scaffold only; it does not resolve Phase 0 validation work
  or the open CAS-005 answer-key disputes.

## 2026-05-26 — Project naming + GTM strategy + repo bootstrap

**Outcome:** CyberSkills Academy defined as a product (planning stage) with a locked name, agreed scope, an honest go-to-market strategy, and a validate-before-invest operating principle. Repository created and registered.

**What changed / decided:**
- **Name locked:** "CyberSkills Academy" (chosen over codename options Doctrine/Pharos/Bastion and momentum names Grow/Go/LevelUp — for clarity, cert-prep credibility, and broad-catalog umbrella fit). Momentum words retained only as optional tagline.
- **Scope:** cert exam-prep courses + sold mock tests/practice banks + trend-driven pro courses (Agentic AI, Risk, ISO, basic pentest, cryptography). Knowledge/courses pillar, parallel to STAR (labs).
- **GTM stance (honest):** standalone open-market sale = low probability; real value = lead magnet + validation engine + funnel to corporate in-house training + live cohorts.
- **Platform:** hosted LMS (LearnWorlds) considered and **deferred** — no recurring cost before validated demand. Validate first on ~$0 infra.
- **Architecture:** content (Crucible, portable) decoupled from delivery (Academy); platform-agnostic subdomain `academy.cyberskills.co.th`; SEO content on main domain funneling in.
- **Repo:** `academy-platform` created and added as a submodule of cyberskills-director at `products/cyberskills/academy-platform` (SSH remote, matching ecosystem convention).
- **Docs:** provider-neutral `AGENTS.md` + this plan pair authored.

**Evidence:**
- Director commit `9f7726d` — "chore: add academy-platform submodule (CyberSkills Academy)".
- Strategy memory: `~/.claude/projects/.../memory/project_academy.md`.
- Source content + review evidence the strategy builds on: `products/personal/crucible-studio/output/cas005/v4.1/practice-tests/` (`student-version-2/`, `v2-build/review/findings-*.json`).

**Residual risk:**
- Distribution capacity unproven — the binding constraint for everything downstream.
- 11 CAS-005 answer-key disputes unresolved — blocks public distribution.
- Delivery platform undecided — Phase 0 must produce a demand signal before committing.

## 2026-08-01 — M3 auth + simulation + i18n + Cloudflare deploy + CRITICAL fix

**Auth ครบวงจร (M3 แกนหลัก)** — รหัส 6 หลักทางอีเมล · middleware allowlist ·
progress ผูกบัญชี (migration 0002/0003) · พิสูจน์ทั้งชุดบน workerd จริง
· e2e ต้องมี session แล้ว (auth.setup.ts ล็อกอินผ่าน API + อ่านอีเมลจริง ไม่ใช่ mock)

**Simulation challenge** — โจทย์จำลองหน้าจอตั้งค่า IPv4 ตัดสินจากสถานะสุดท้าย
ไม่ใช่ลำดับคลิก · สองโจทย์บนหน้าจอเดียวกันที่คำตอบตรงข้ามกัน · โหมด assessed มีแล้ว
แต่ยังไม่ผูกเข้า checkpoint

**Deploy จริงขึ้น Cloudflare** — https://cyberskills-academy.songpon-te.workers.dev
(หน้าร้านอย่างเดียว บัญชีปิด รอ session identity) · เจอ 3 กับดักที่ local ไม่เจอ
บันทึกใน memory `cloudflare-nextjs-deploy-traps`

**i18n EN/TH** — dictionary + สลับได้ + นโยบายความเป็นส่วนตัวสองภาษา + เทสกัน
อักษรไทยหลุดบนหน้าอังกฤษ

**วิดีโอหลายภาษา** — สลับ source ตามภาษาเสียง คืนตำแหน่งที่ดูอยู่ · caption ผ่าน
`<track>` มาตรฐาน · ย้าย quiz ออกจาก overlay มาไว้ใต้วิดีโอ (เดิมล้นจนต้องเลื่อนในกรอบ)

**CRITICAL ที่แก้แล้ว** — client ประกาศเองว่าเรียนจบได้ → ปลอมใบรับรองได้
พบจาก cross-model review พิสูจน์ด้วยสคริปต์โจมตี แก้ที่ราก และมีเทสกันย้อนกลับ

**Copy** — ตัดสำนวนที่อ่านออกว่าเครื่องเขียน 17 จุดในบทเรียน + 13 จุดใน UI
(review ข้ามโมเดลชี้ 20 จุด ตรงกับที่สงสัยตัวเอง: สูตร "X ไม่ใช่ Y" · ประโยคปิด
แบบคติพจน์ · วลีสามจังหวะ)

**ADR single-account** — founder เคาะครบ 5 ข้อ · เปิด asymmetric JWT/JWKS บน Pool A
(ปลด blocker STAR ที่ค้างตั้งแต่ 2026-06-13)

verification: build + lint + vitest 139/139 + playwright 50/50

## 2026-08-11 - Shared-account local browser journey published

**Outcome:** Academy now has a complete local browser journey from sign-in through
CYBERSKILLS Account Center email/code verification, exact callback validation, an opaque
Academy session, and the My learning dashboard. The empty-account state offers a direct
`Browse available courses` action instead of ending the journey without a next step.

**Customer-visible improvements:**
- Malformed authorization requests stop with a clear restart action instead of falling
  through to the visual fixture flow.
- Email and code forms transfer keyboard focus and announce the destination email.
- Expired, revoked, unknown, or unreadable session cookies no longer trap the learner away
  from sign-in; sign-out expires the browser cookie even when durable revocation is not
  confirmed.
- Suspended Academy activation remains signed in at the identity layer but cannot access
  Academy course data, and a valid new account receives no invented entitlement.

**Evidence:** Desktop/mobile Chromium **4/4** with zero console and request failures;
isolated focused **25/25**, full unit **904/904**, ESLint, all TypeScript configs, and
production Next build **29/29**; different independent review **PASS C0/H0/M0/L0**.
Academy commit `9b096307cac6400cc6e7b6a8b7e54a5a770c4d1e` is verified on remote `main`.

**Residual boundary:** This checkpoint is local-only. Production identity runtime,
endpoint, credentials, signing and verification keys, real email delivery, deployment,
operator evidence, and release approval remain disabled and require separate authorization.
