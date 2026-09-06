# Academy System Inventory

Status date: `2026-09-05`; production release evidence: `../../reports/releases/2026-09-05-production-session-host-gate.md`

## Current production snapshot

| Surface | Current state | Evidence / notes |
| --- | --- | --- |
| Canonical domain | `https://academy.cyberskills.co.th` | behind Cloudflare Access; unauthenticated requests return Access gate `302` |
| Raw worker endpoint | `https://cyberskills-academy.songpon-te.workers.dev` | host-gated: `/`, `/courses`, `/api/leads` return empty no-store `404` |
| Active deployment | version `6c2e3881-4836-4bee-8bd1-b6e5368b6def` at 100% | `wrangler versions deploy` exit 0, followed by GET smoke 2026-09-05 |
| Active version | `6c2e3881-4836-4bee-8bd1-b6e5368b6def` | source `c5a169b9`, version 42, tag `release-c5a169b9e567`; predecessor `d4717406` retained for rollback |
| Residue check | historical PASS; current cleanup not run | all prior versions retained; no release artifact or rollback target deleted |
| Shared Identity runtime | `60920c9cc08bae2befc22f5c8ddbce5f678fefe9` | Account Center/control API immutable release active; exact GoTrue `v2.186.0`, OTP ambiguity recovery, code-only templates, server-enforced CAPTCHA, and Google Workspace relay |
| Academy client-assertion diagnostic | source `eb99d9d58f2fe59a0998f2d5dc07842aca0b839d`; not deployed | independently reviewed candidate-only diagnostic; the only attempted run stopped before upload because the Access operator session was unavailable |

## Managed components

| Component | Purpose | Boundary | Key identifiers | Secret-bearing |
| --- | --- | --- | --- | --- |
| Academy web Worker | canonical runtime for Academy site and app routes | Cloudflare Workers | worker name `cyberskills-academy`; domain `academy.cyberskills.co.th` | yes |
| Academy raw preview route | provider route for direct probing | Cloudflare Workers | `cyberskills-academy.songpon-te.workers.dev` | no additional |
| Cloudflare Access gate | protects canonical Academy surface before public launch | Cloudflare Zero Trust | covers `/`, `/courses`, `/auth/callback` and other Academy paths | policy only |
| Academy data API | dedicated PostgREST surface for schema `academy` | self-hosted PostgREST behind Cloudflare tunnel | `academy-data.cyberskills.co.th` | yes |
| Academy retention worker | scheduled retention executor | Cloudflare Worker, separate from web runtime | worker `cyberskills-academy-retention`; cron `0 3 * * *` | yes |
| Academy retention API | dedicated retention PostgREST | self-hosted PostgREST behind Cloudflare tunnel | local compose under `academy-web/ops/academy-retention-api/` | yes |
| Academy private media | private lesson assets | Cloudflare R2 | bucket `cyberskills-academy-media`; Worker binding `COURSE_MEDIA` | yes |
| Pool A schema | Academy relational data | shared self-hosted Supabase / Postgres | schema `academy` only | yes |
| Identity dependency | sign-in and callback contract | shared Identity Control + shared issuer contract | callback `https://academy.cyberskills.co.th/auth/callback` | yes |
| Immutable release store | installed release payloads and recovery tooling | Academy host filesystem | `/opt/academy/releases/<sha256>` | no direct secret values |

## Ownership and blast radius

| Area | Academy may change directly | Shared / cross-product caution |
| --- | --- | --- |
| Academy Worker code and release packaging | yes | keep source/release digest coherent |
| Academy schema objects | yes, with due-care | Pool A host, shared PostgREST, shared auth are cross-product |
| Academy data API container / tunnel route | yes | do not affect shared Supabase route or wildcard tunnel rules |
| Academy retention worker and API | yes | separate credential boundary from Academy runtime |
| Academy media bucket objects and binding | yes | do not disturb other R2 backup patterns |
| Identity issuer / publisher / shared auth | no unilateral change | owned by shared Identity Control / ecosystem contract |

## Production-relevant directories in this repo

| Path | Purpose |
| --- | --- |
| `docs/maintenance/` | maintenance index, inventory, secret registry, runbook |
| `docs/academy-data-api.md` | runtime data API boundary and rollback contract |
| `academy-web/docs/private-media-delivery.md` | private media / R2 delivery boundary |
| `academy-web/docs/academy-retention-scheduler.md` | retention rollout and rollback details |
| `academy-web/ops/academy-retention-api/` | retention API compose assets |
| `academy-web/ops/identity/` | production identity-operation helpers and manifests |
| `academy-web/scripts/academy-production-*.mjs` | controlled production operation tooling |
| `academy-web/scripts/academy-macos-*.mjs` | immutable release packaging and recovery tooling |
| `academy-web/supabase/` | migrations, privileged SQL, templates |

## Known recovery facts

- Canonical Academy domain is live behind Access, not public-open.
- Academy runtime uses a dedicated data API and must not fall back to Pool A
  `service_role`.
- Retention credentials are separate from Academy runtime credentials.
- Private media is delivered through signed cookie + private R2 binding, not
  public `ASSETS`.
- Identity runtime is coupled to the shared Identity Control contract; Academy
  must not invent, merge, or repair learner identity independently.
- Production sign-in uses two distinct, fresh Turnstile challenges. The second
  proof is call-local to the OTP request and is never persisted or reused.
- Shared Identity uses exact request deadlines: `5,000 ms` for ordinary GoTrue
  requests, `10,000 ms` for OTP start, and `15,000 ms` at the Account Center
  boundary. A post-dispatch transport timeout or lost response is retained as
  recoverable `ambiguous`; it must not trigger an automatic resend. The original
  code can be verified once within the challenge TTL, subject to bounded attempts,
  expiry, and replay refusal.
- Academy's identity client-assertion Worker binding exists as `secret_text`, but
  provider metadata cannot prove that its resident value imports, matches the
  registered public fingerprint, signs correctly, or is admitted by Identity.
  Do not call this binding healthy until the reviewed in-place diagnostic passes.
- For pinned GoTrue `v2.186.0`, a direct OTP request with no CAPTCHA proof fails
  as exact HTTP `500` / `unexpected_failure` before provider invocation. Treat
  only that exact image-bound response, with user count unchanged, as the
  expected denial; other `500` responses are incidents.

## Known gaps still requiring future rehearsal

- Full Academy-specific backup restore rehearsal on top of the shared Pool A
  backup system is not yet recorded in this repo.
- End-to-end restore of Academy R2 media objects from a product-specific backup
  copy is not yet recorded here.
- Durable off-host custody for `IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK` has not
  been recovered. The bounded custody receipt is
  `reports/reviews/academy-identity-client-assertion-custody-recovery-20260903.json`;
  the only provider-resident candidate is not exportable through a supported
  interface.
- Client-assertion admission remains unclassified. Renew one bounded Cloudflare
  Access operator session, then run the independently reviewed candidate-only
  diagnostic exactly once before any rotation or OTP retry.
- The authenticated Academy callback, entitled lesson, progress persistence,
  responsive `412x915` view, sign-out, and session-owned progress cleanup still
  require one owner-present production canary walkthrough.
