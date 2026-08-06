# Academy Identity Control Consumer Registration Candidate

**Status:** Identity Control approved Consumer Registry v1 policy. This report
is still an Academy-side evidence record, not a production registration,
deployment instruction, or authorization to enable Academy sign-in.

**Prepared:** 2026-08-06  
**Academy source revision:** `main` at `32bbc13`.  
**Canonical sources:**
`products/cyberskills/identity-control/config/consumer-registry-v1.approved.json`
and `products/cyberskills/identity-control/docs/integration/consumer-registry-v1.md`.
**Academy evidence:** identity boundary implementation, local tests, and the
deployed-state report cited below. No external system, credential, private key,
or production configuration was read or changed.

## Registration Fields

| Required field | Academy candidate | Evidence and interpretation |
| --- | --- | --- |
| Proposed `client_id` | `academy-web` | Identity Control approved registry v1 (`clients[]` entry with `clientId=academy-web`). Academy local client values remain caller-supplied; Academy does not invent a production ID (`academy-web/src/lib/identity/transaction.ts`). |
| `service_id` | `academy` | Identity Control approved registry v1 (`clients[]` entry with `serviceId=academy`). |
| Exact production callback URI | `https://academy.cyberskills.co.th/auth/callback` | Identity Control approved registry v1. Academy callback parsing is implemented at `academy-web/src/app/auth/callback/route.ts`; the custom-domain production exposure and registration remain release-gated. |
| Currently deployed preview callback | `https://cyberskills-academy.songpon-te.workers.dev/auth/callback` | Preview Worker URL from `reports/sessions/academy-production-release-2026-08-05.md:44-50` plus the callback route. This is not the canonical production callback and must not be registered or enabled as production. |
| Expected result audience | `https://academy.cyberskills.co.th` | Identity Control approved registry v1 (`clients.academy.resultAudience`). Academy validates the returned audience against the transaction client before accepting a result. |
| Client-assertion audience | `https://accounts.cyberskills.co.th/v1/code/exchange` | Identity Control approved registry v1 and `codeExchangeAudience`. The signer boundary receives this audience explicitly; no signer or key is present yet (`academy-web/src/lib/identity/adapter.ts`, `academy-web/src/lib/identity/transaction.ts`). |
| Activation policy | `open` | Identity Control approved registry v1. This permits Academy service activation/profile creation only; Academy grants course access only after its own entitlement, resource authorization, and prerequisite checks (`academy-web/src/lib/account/access.ts`, `academy-web/src/lib/account/course-access.ts`). |
| Initial registry state | `disabled` | Identity Control approved registry v1 (`clients[]` Academy entry `enabled: false`). Academy real adapter and production sign-in remain disabled (`academy-web/src/lib/identity/registry.ts`, `academy-web/src/app/auth/callback/route.ts`). |
| Current registration config revision | `1` | Identity Control approved registry v1 (`clients[]` Academy entry `configRevision`). The projection is non-secret evidence only and is not loaded as runtime configuration (`academy-web/src/lib/identity/consumer-policy.ts`). |
| Client-assertion active public-key ID/reference | `null` (not published) | Approved registry v1 has `verificationKeys.active: null`. Academy runtime owns the future private key; no key was generated or inspected. |
| Client-assertion overlap public-key ID/reference | `[]` (none published) | Approved registry v1 has `verificationKeys.overlap: []`. Rotation and key-ceremony evidence remain blocked. |
| Lifecycle transport | `authenticated_pull` | Identity Control approved registry v1. Academy has only local activation projection logic; no inbound generic webhook is implemented. |
| Lifecycle event audience | `null` (not published) | Approved registry v1 leaves `lifecycle.eventAudience` null; no event audience is assumed by Academy. |
| Lifecycle consumer endpoint | `null` (not published) | Approved registry v1 leaves `lifecycle.publisherEndpoint` null. Identity Control owns lifecycle publication and must publish any future consumer contract. |
| Pull-reconciliation endpoint | `null` (not published) | The approved record does not publish an Academy endpoint. Academy has not created or guessed one. |
| Pull-reconciliation contract | `null` (not published) | The transport is approved as authenticated pull, but endpoint, request/response shape, authorization inputs, and replay/reconciliation details are not published in the Academy evidence set. |
| Per-client kill-switch owner | `null` (not published) | Approved registry v1 leaves `killSwitchOwner` null. Academy must not name an operator or implement a production switch from inference. |

## Consumer Behavior Prepared Locally

- Browser callback authority is restricted to exactly one opaque `code` and one
  opaque `state`; subject, email, token, OTP, invitation, and arbitrary return
  values are rejected before exchange (`academy-web/src/lib/identity/transaction.ts`).
- Local transaction persistence now has an in-memory implementation and a
  restart-safe file implementation with an exclusive inter-process lock,
  atomic replace, mode `0600` data, mode `0700` directory, one-time consume,
  expiry, and fail-closed corruption handling. The file store is deliberately
  not wired into Worker production; lock contention or a stale lock also fails
  closed rather than attempting an unsafe reclaim.
- A local durable opaque session store is prepared with lifecycle/activation
  claims only. It serializes create/get/revoke/expiry updates with the same
  exclusive lock, has no course-entitlement claims, uses an HttpOnly
  host-scoped cookie without a parent-domain `Domain` attribute, and is not
  wired into the current direct-OTP session path.
- The code-exchange signer boundary receives the approved assertion audience;
  Academy does not generate, store, or transmit a private key.
- Activation remains separate from course entitlement. Regression tests prove
  that an active activation without an Academy-owned entitlement is denied.
- Direct Academy OTP remains an explicit loopback fixture only. It is not a
  production identity path.

## Remaining Identity Control Gates

1. Identity Control must publish the registered public-key reference and key
   ceremony/rotation evidence before any real client assertion is configured.
2. Identity Control must publish lifecycle pull endpoint/contract and the named
   kill-switch operator; Academy must then implement conformance and
   reconciliation locally before requesting a production enablement change.
3. Academy must obtain separate production authorization, wire the released
   real adapter, and keep the initial registry state disabled until the
   conformance rehearsal and deployment evidence pass.
4. Founder bootstrap occurs only after canonical sign-in is enabled and must
   create ownership from `(canonical_issuer, subject)`, never a generated UUID
   or email equality.

## Explicit Exclusions

This candidate contains no private key, client assertion, token, credential, or
secret. It does not generate keys or change Identity Control, Pool A, DNS,
Worker deployment, production config, or account ownership.
