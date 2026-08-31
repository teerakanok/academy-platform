# Academy Secret Registry

Status date: `2026-09-01`

This registry records what must be kept, where it belongs, and the stable record
name when durable vault storage applies. It must never store secret values.

## Storage policy

- Source of truth for production secrets: owner-controlled vault, expected
  system `Bitwarden`.
- Repo storage: never.
- Terminal history / screenshots / chat: never.
- Host-local env files are allowed only where the referenced runbook says so and
  only with restrictive permissions.

## Secret inventory

| Secret / credential | Used by | Storage location | Expected record name | Notes |
| --- | --- | --- | --- | --- |
| `ACADEMY_DATA_API_JWT_SECRET` | Academy web Worker and dedicated Academy data API | Bitwarden + host-local env on data API host | `Academy - Data API JWT Secret` | same value on Worker secret and PostgREST env |
| `academy_api_authenticator` password | dedicated Academy data API PostgREST login | Bitwarden + host-local `.env.academy-data-api` | `Academy - Data API DB Authenticator` | DB login only; never in repo |
| `ACADEMY_RETENTION_API_JWT_SECRET` | retention Worker and retention API | Bitwarden + host-local retention env | `Academy - Retention API JWT Secret` | separate from runtime JWT secret |
| retention DB authenticator password | retention PostgREST login | Bitwarden + host-local env | `Academy - Retention API DB Authenticator` | separate from runtime authenticator |
| `MEDIA_SIGNING_SECRET` | Academy web Worker media grant signing | Bitwarden + Cloudflare Worker secret | `Academy - Media Signing Secret` | minimum 32 bytes |
| `RATE_LIMIT_KEY_SECRET` | Academy web Worker edge abuse marker | Bitwarden + Cloudflare Worker secret | `Academy - Rate Limit Key Secret` | rotate on abuse marker compromise |
| `IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK` | Academy identity runtime client assertion | Bitwarden only + staged protected input during deployment | `Academy - Identity Client Assertion Private JWK` | do not put in plain env files |
| `IDENTITY_RESULT_KEY_SET_DOCUMENT` | Academy identity runtime result verification | protected public runtime config inventory; optionally record provenance in Bitwarden or controlled doc store | `Academy - Identity Result Key Set Document` | deployment input and config inventory item, but not an owner-held secret value |
| Cloudflare OAuth / Wrangler operator session | deployment and production read/write tooling | operator runtime session on the active machine; recovery notes may reference Bitwarden records for underlying operator accounts, but the OAuth session itself is not a durable Bitwarden secret | `Academy - Cloudflare Operator Access` | runtime session only; re-auth instead of trying to restore a session blob |
| Pool A superuser / privileged DB access | migrations, restore, privileged SQL | owner vault only | `Pool A - Privileged DB Access` | shared infra, cross-product blast radius |
| Tunnel operator credential | Cloudflare tunnel route management | owner vault only | `Cloudflare - Tunnel Operator Access` | shared infra; do not product-local copy |

## Non-secret identifiers that still need inventory

These are not secrets and may be written in docs:

- worker `cyberskills-academy`
- raw route `cyberskills-academy.songpon-te.workers.dev`
- canonical domain `academy.cyberskills.co.th`
- data API host `academy-data.cyberskills.co.th`
- private media bucket `cyberskills-academy-media`
- schema `academy`
- retention cron `0 3 * * *`

## What the owner must verify in Bitwarden

- Each row whose storage location names Bitwarden as a durable source exists with
  a stable record name. Do not store the ephemeral OAuth session; the protected
  public key-set document needs only provenance unless the owner chooses to vault it.
- Shared credentials are marked clearly as shared, not Academy-only.
- Records distinguish runtime secret, operator credential, and recovery secret.
- Records for rotated values keep rotation date and replacement procedure.

## Rotation policy

- Do not rotate just because time passed.
- Rotate when a secret is exposed, control is lost, access scope changes, or the
  owner can no longer recover the correct record confidently.
- When one side of a paired secret changes, update the paired consumer in the
  same change window:
  - `ACADEMY_DATA_API_JWT_SECRET` with PostgREST `PGRST_JWT_SECRET`
  - `ACADEMY_RETENTION_API_JWT_SECRET` with retention API `PGRST_JWT_SECRET`
  - identity client assertion material together with release staging inputs
