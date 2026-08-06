# Academy Identity Control Preparation Review

**Date:** 2026-08-06  
**Academy source baseline:** `f0f0771` plus this local preparation diff  
**Pinned Identity Control source inspected:** `a301746`  
**Scope:** local, reversible Academy preparation only. No external or production
system was contacted or changed.

## Canonical Inputs

- Director `ecosystem/IDENTITY_AND_ACCOUNT_CONTRACT.md`
- Director `ecosystem/IDENTITY_OPERATIONS_REGISTRY.md`
- Identity Control `docs/integration/product-preparation.md`
- Identity Control `docs/api/openapi.yaml`
- Identity Control `packages/contracts/src/index.ts`
- Academy `plans/active_plan.md` and `plans/completed_log.md`

Identity Control session direction states that Gate 3 policy is approved but
reviewed production change records are still in preparation. That approval does
not authorize a runtime, endpoint registry, credential, deployment, Pool A
mutation, DNS change, or product redirect.

## Ownership Boundary

| Concern | Owner | Academy may do | Academy must not do |
| --- | --- | --- | --- |
| Canonical principal `(canonical_issuer, subject)` | Identity Control | Store it on a local profile projection | Derive it from email, browser input, or a product label |
| Account Center and email OTP | Identity Control | Redirect only after released registry/configuration | Send OTP, create principals, or use direct GoTrue as production identity |
| Service activation and lifecycle | Identity Control | Persist a received activation revision and revalidate it | Treat activation as a course entitlement or mutate lifecycle |
| Authorization code and client registry | Identity Control | Store server-side state/PKCE/nonce and exchange an opaque code | Guess client ID, service ID, audience, callback, endpoint, key, or secret |
| Orders, invitations, course entitlement, progress, attempts, certificates | Academy | Authorize these records locally after all prior layers pass | Grant them from account creation, activation, browser payment redirect, or email equality |

The enforced order remains:

```text
account exists -> service activation -> Academy course entitlement -> resource authorization
```

## Current Academy Assessment

### Already aligned

- Academy local `users` use issuer plus subject as the ownership key; email is a
  mutable verified attribute.
- `service_activation` is separate from `course_entitlement`; its monotonic
  revision logic rejects equal-revision conflicts and stale updates.
- Resource guards require activation, entitlement, and prerequisite state rather
  than treating a session as course access.
- Academy no longer links a waitlist lead to a user by email. Migration `0021`
  removes legacy `leads.user_id` associations while retaining the lead and its
  consent evidence.
- Existing callback route was truthfully unavailable while no adapter was
  configured, and the production build keeps account access closed.
- Academy runtime uses its dedicated data boundary and does not receive shared
  Pool A auth-admin or service-role credentials.

### Remediated in this preparation slice

- `src/lib/identity/transaction.ts` provides local in-memory and restart-safe
  file transaction contracts. Both generate state, PKCE verifier, and nonce
  server-side; consume state once; expire it; validate the exchange result's
  audience, service, nonce, principal and activation fields; and refuse arbitrary
  return URLs. The file implementation is local-only evidence preparation, not
  a Cloudflare production persistence choice.
- Callback parsing now permits exactly one opaque `code` and one opaque `state`.
  It rejects duplicate, unknown, principal, email, token, OTP, invitation, and
  return-url query parameters before an adapter call.
- The fake adapter requires an explicit local-only issuer. It cannot resemble a
  canonical issuer by default and remains disallowed in production.
- The local exchange boundary requires a compact-JWS-shaped client assertion
  from a server-held signer boundary. It validates the required shape but does
  not invent a key, signer, or key-rotation implementation.
- The historical direct Academy GoTrue OTP route is now an explicit loopback E2E
  fixture. A non-loopback request is rejected before route parsing or provider
  access, and a non-loopback sign-in page does not render its form, even if
  public Supabase values are copied into a deployment.

## Deliberately Unwired Until Identity Control Releases It

| Required integration input | Why Academy cannot create it locally |
| --- | --- |
| Account Center endpoint and production readiness | Identity Control owns runtime deployment |
| Registered client ID, service ID, exact callback and audience | Identity Control owns client registry and allowlist |
| Client assertion, public-key overlap and rotation metadata | Identity Control owns key/rotation contract |
| Canonical issuer literal | It must be observed from a signed production token, not inferred from a URL |
| Production transaction/session persistence and Academy session signing | The local file stores are only restart-test preparation; production storage and session signing still require the released runtime topology and separate review |
| Founder owner bootstrap | It begins only after the founder signs in through canonical identity; no UUID or email substitute is permitted |

## Verification

- Failing-first tests were added for absent local direct-OTP boundary and for
  the transaction/callback contract.
- Focused tests: 13 passed across transaction, direct-OTP, and sign-in tests.
- Full unit suite: 50 files, 420 tests passed.
- Lint/typecheck: passed with zero errors; one pre-existing unused-disable
  warning remains in `src/lib/content/registry.generated.ts`.
- Cloudflare production build with public Supabase values cleared: passed.
- `git diff --check`: passed.

### Checkpoint RIL

Independent code/debt, security, and UX review found no critical finding. The
following findings were corrected before final verification:

| Severity | Finding | Correction |
| --- | --- | --- |
| High | A new principal inherited waitlist consent through email equality | Removed the auto-link, added migration `0021`, and changed the database regression expectation to remain unlinked |
| Medium | Revision `0` was accepted though the canonical exchange contract starts at `1` | Reject revisions below `1` |
| Medium | A fake fixture could use a production-looking issuer | Allow only `localhost` or reserved `.invalid` issuer values |
| Medium | Exchange boundary omitted client assertion | Required compact-JWS-shaped server-held assertion in adapter and transaction boundary |
| Medium | `/api/auth/me` and sign-in rendering could inspect or show legacy GoTrue behavior on a public host | Applied the same loopback fixture guard before either path |

The new regression tests first failed in four independent cases, then the
focused boundary suite passed 26/26 after correction. A final strict-expiry
regression also failed first, then passed after treating the exact expiry
millisecond as expired. Final verification passed 50 files and 420 unit tests;
the code/debt, security, and UX re-reviews each reported no remaining C/H/M/L
finding.

Not applicable to the original preparation slice: migration rehearsal,
production deployment, remote adapter call, browser redirect E2E, production
durable-store rollout, key rotation test, and Account Center visual review. Each
depends on the released runtime inputs above; none was simulated as a production
claim. The later local-only durable transaction/session tests are recorded in
the approval update below.

## Remaining Integration Gates

1. Identity Control publishes a ready, authorized production Account Center and
   non-secret client registry values.
2. Academy receives separate authorization to implement the real adapter,
   durable transaction/session design, callback exchange, and lifecycle pull or
   event reconciliation.
3. Academy proves redirect, code exchange, session host scope, failure/replay,
   entitlement separation, and cross-schema denial against that exact release.

## Post-approval local preparation addendum — Consumer Registry v1

Identity Control approved the non-secret Consumer Registry v1 policy on
2026-08-06. Academy recorded the canonical values and kept the initial registry
state disabled in
`reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`.
The local contract projection is not production configuration.

The follow-up local tests cover policy fidelity, assertion-audience propagation,
restart-safe transaction consume/expiry/corruption handling, exclusive-lock
serialization, restart-safe opaque session get/revoke/expiry, host-scoped
cookie attributes, and the activation-without-entitlement denial. Full unit
verification after this update passed 53 files and 429 tests; lint/typecheck,
Cloudflare build, and gitleaks also passed. No DNS, key generation, deployment,
credential, Identity Control mutation, or owner bootstrap occurred.
The local lock intentionally fails closed on stale contention; it does not claim
production-grade crash recovery.
4. The founder signs in once through canonical identity, then Academy performs
   the recorded staff-bootstrap dry-run/apply flow.
