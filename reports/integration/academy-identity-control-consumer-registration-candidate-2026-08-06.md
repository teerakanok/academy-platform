# Academy Identity Control Consumer Registration Candidate

**Status:** candidate for Identity Control validation only. It is not a
registration, deployment instruction, or authorization to enable Academy sign-in.

**Prepared:** 2026-08-06  
**Academy source:** `main` at `6f61ffb`  
**Evidence method:** read-only inspection of Academy implementation and its
tracked deployed-state evidence. No external system, credential, key, or
production configuration was read or changed.

## Registration Fields

| Required field | Academy candidate | Evidence and interpretation |
| --- | --- | --- |
| Proposed `client_id` | `UNKNOWN` | The only literal, `academy-web-local`, is a local fake test fixture in `academy-web/tests/unit/identity-transaction.test.ts:15-20`. `academy-web/src/lib/identity/transaction.ts:45-51` requires registered values to be supplied by its caller and forbids Academy from inventing production values. |
| `service_id` | `UNKNOWN` | `academy` appears only in the same local fake fixture (`tests/unit/identity-transaction.test.ts:15-20`). Academy has no production service registry. |
| Exact production callback URI | `UNKNOWN` | Academy custom-domain/exposure remains an open launch decision (`plans/active_plan.md:63-67`). A production callback must be published only after that decision. |
| Currently deployed preview callback candidate (unregistered) | `https://cyberskills-academy.songpon-te.workers.dev/auth/callback` | This is assembled from the deployed Worker URL in `reports/sessions/academy-production-release-2026-08-05.md:44-50` and the implemented callback route in `academy-web/src/app/auth/callback/route.ts:20-50`. It is not a production callback and must not be registered unless Identity Control separately validates a preview registration. |
| Expected result audience | `UNKNOWN` | `academy-api-local` is local fixture data only (`tests/unit/identity-transaction.test.ts:15-20`). `academy-data-api` is a separate Academy-to-PostgREST runtime-token audience, not an Identity Control result audience (`academy-web/src/lib/db/runtime-token.ts:1-31`). |
| Activation policy | `UNKNOWN` for the central policy choice | Academy can consume only an activation result with one of `pending`, `active`, `suspended`, or `deactivated` and revision `>= 1` (`academy-web/src/lib/identity/adapter.ts:22-36`, `academy-web/src/lib/identity/transaction.ts:156-168`). Academy treats only `active` as service-usable and never turns activation into a course entitlement (`academy-web/src/lib/account/access.ts:20-45`). Identity Control must select and publish the registered policy (`open`, `invite_only`, `request_access`, or `unavailable`). |
| Client-assertion active public-key ID/reference | `UNKNOWN` | Academy defines only a server-side assertion provider boundary and deliberately has no signer/key reference (`academy-web/src/lib/identity/adapter.ts:49-73`). No key was generated or inspected. |
| Client-assertion overlap public-key ID/reference | `UNKNOWN` | Same evidence as the active public-key field. The Pool A issuer signing `kid` in the shared registry is an issuer/JWKS key, not evidence of an Academy client-assertion key, so it is intentionally not copied here. |
| Lifecycle event audience | `UNKNOWN` | Academy contains no configured lifecycle consumer audience. Identity Control owns the event names and lifecycle outbox (`ecosystem/IDENTITY_AND_ACCOUNT_CONTRACT.md:209-227`). |
| Lifecycle consumer endpoint | `UNKNOWN` | Academy has no implemented lifecycle consumer route. Its only identity callback route is deliberately unavailable pending released runtime inputs (`academy-web/src/app/auth/callback/route.ts:31-50`). |
| Pull-reconciliation endpoint | `UNKNOWN` | Academy has no implemented pull-reconciliation route or client. The central contract requires a pull reconciliation API, but does not provide an Academy value in this repository (`ecosystem/IDENTITY_AND_ACCOUNT_CONTRACT.md:209-214`). |
| Pull-reconciliation contract | `UNKNOWN` | Academy will need the released Identity Control contract. The existing local projection accepts a received activation status/revision through `sync_service_activation` only (`academy-web/src/lib/account/access.ts:20-29`); it is not a reconciliation client. |
| Current registration config revision | `UNKNOWN` | No non-secret Identity Control registry/config revision is present in Academy. `academy-web/src/lib/identity/registry.ts:20-35` supports only `none` or a non-production fake adapter. |
| Per-client kill-switch owner | `UNKNOWN` | Academy has no client registration or kill-switch configuration. The canonical registry assigns kill-switch status to the future non-secret identity registry, owned by Director/shared infrastructure (`ecosystem/IDENTITY_OPERATIONS_REGISTRY.md:11,34-37`). Identity Control must publish the accountable operator for this client. |

## Consumer Behavior Already Implemented

- Browser callback authority is restricted to exactly one opaque `code` and one
  opaque `state`; email, subject, token, OTP, invitation, and arbitrary return
  values are rejected before any exchange (`academy-web/src/lib/identity/transaction.ts:141-153`).
- A local transaction holds state, PKCE verifier, nonce, registered-client
  fields, and the internal return path server-side; a callback consumes state
  once and checks audience, service, nonce, canonical principal, and activation
  revision (`academy-web/src/lib/identity/transaction.ts:45-206`).
- Academy requires a compact-JWS-shaped client assertion from a server-held
  provider boundary; the browser cannot supply it (`academy-web/src/lib/identity/adapter.ts:49-73`,
  `academy-web/src/lib/identity/transaction.ts:171-204`).
- Direct Academy OTP is limited to an explicit loopback E2E fixture, so it is
  not a consumer-registration alternative (`academy-web/src/lib/auth/legacy-direct-otp.ts:1-39`).

## Identity Control Validation Needed

1. Decide the custom-domain/exposure path, then publish the exact production
   callback allowlist. Identity Control may separately decide whether the
   currently deployed preview callback is eligible for a scoped preview client.
2. Publish the canonical `client_id`, `service_id`, result audience, central
   activation policy, config revision, active/overlap client public-key
   references, and the accountable kill-switch operator.
3. Publish lifecycle event delivery audience/consumer contract and the pull
   reconciliation contract before Academy implements either consumer path.
4. Issue separate authorization for Academy to wire the real adapter, durable
   transaction/session store, lifecycle convergence, and founder bootstrap.

## Explicit Exclusions

This candidate contains no private key, client assertion, token, credential,
or secret. It neither creates a key nor changes an Identity Control, Pool A,
DNS, Worker, or other production configuration.
