# Academy System Inventory

Status date: `2026-09-01`

## Current production snapshot

| Surface | Current state | Evidence / notes |
| --- | --- | --- |
| Canonical domain | `https://academy.cyberskills.co.th` | behind Cloudflare Access; unauthenticated requests return Access gate `302` |
| Raw worker endpoint | `https://cyberskills-academy.songpon-te.workers.dev` | reachable; current read-only probe returned `200` |
| Active deployment | `03da9d32-9c4f-4144-bf7e-15cfd7f1b1e9` | read-only deployment inventory |
| Active version | `45608684-9bc0-4745-8694-ae01ff8877d2` | read-only deployment inventory |
| Residue check | `PASS` | current no-traffic residue verification passed |

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

## Known gaps still requiring future rehearsal

- Full Academy-specific backup restore rehearsal on top of the shared Pool A
  backup system is not yet recorded in this repo.
- End-to-end restore of Academy R2 media objects from a product-specific backup
  copy is not yet recorded here.
- Identity dependency recovery still depends on the shared Identity Control
  maintenance guide and owner-held secrets inventory.
