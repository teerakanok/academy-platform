# Academy Data API Boundary

## Purpose

Academy application requests use a dedicated PostgREST instance and a scoped
database capability. They must not use the shared Pool A `service_role` key.

| Component | Responsibility | Credential scope |
| --- | --- | --- |
| Academy Worker | validates Academy session and calls the data API | `ACADEMY_DATA_API_JWT_SECRET`, only to mint short-lived Academy runtime JWTs |
| Dedicated Academy PostgREST | validates JWT, exposes only schema `academy`, and switches database role | database login `academy_api_authenticator` |
| `academy_runtime` | trusted backend work for the Academy app | explicit Academy table/function allowlist only |
| `academy_api_anon` | unauthenticated request fallback | no Academy schema privilege |
| Pool A shared PostgREST | existing multi-product Supabase API | does not receive or trust Academy data API JWTs |

The runtime token has `role=academy_runtime`, `aud=academy-data-api`, and a
60-second lifetime. It is signed only in the Academy Worker and is intentionally
incompatible with the Pool A JWT keys.

## Security Boundary

`academy_runtime` has `BYPASSRLS` because Academy's existing server-side
operations require trusted multi-row and cross-user database work while every
Academy table has default-deny RLS. Its scope is still constrained:

- it is `NOLOGIN`, cannot create roles/databases, and has no membership in
  `service_role`, `academy_staff_admin`, or another product role;
- the dedicated API exposes only `academy`, so the Worker has no SQL transport
  to other Pool A schemas;
- grants exclude retention purges, privacy requests, attempt appeals, staff
  mutation/audit, and marketing exports; entitlement grant/revocation remains
  a trusted Academy server operation and has no browser route;
- the API authenticator can set role only to `academy_runtime` or the empty
  anonymous role.

This is a trusted backend capability, not a per-learner authorization model.
Academy routes must continue authenticating the learner and binding every user
ID to that authenticated session before calling the data layer.

## Runtime Contract

Required Worker-only configuration:

```text
ACADEMY_DATA_API_URL=https://academy-data.<controlled-host>
ACADEMY_DATA_API_JWT_SECRET=<at-least-32-random-bytes>
```

The API endpoint must be a dedicated route to the dedicated PostgREST instance,
not `https://supabase.cyberskills.co.th`. It must configure:

```text
PGRST_DB_SCHEMAS=academy
PGRST_DB_ANON_ROLE=academy_api_anon
PGRST_JWT_AUD=academy-data-api
PGRST_JWT_SECRET=<ACADEMY_DATA_API_JWT_SECRET>
```

The database URI uses the separately provisioned `academy_api_authenticator`
password. Neither that password, the runtime JWT secret, nor a Pool A
service-role key belongs in Git, `.env.example`, logs, or a Worker variable.

The production compose artifact is
`ops/academy-data-api/docker-compose.yml`. Its adjacent untracked
`.env.academy-data-api` contains only:

```text
PGRST_DB_URI=postgres://academy_api_authenticator:<host-only-password>@db:5432/postgres
PGRST_JWT_SECRET=<same value as ACADEMY_DATA_API_JWT_SECRET>
```

It uses the existing `supabase_default` Docker network, binds only
`127.0.0.1:50600`, and pins immutable production-tested image digests. The
Cloudflare tunnel, not Docker, is the only intended external route. The adjacent
`academy-data-api-health` service must report `healthy`; `unhealthy` after its
six retries is a rollout failure and triggers rollback before Worker settings
are changed.

The tunnel gets one exact ingress rule for `academy-data.cyberskills.co.th`
pointing to `http://127.0.0.1:50600`. It must not use a wildcard hostname or a
Docker-network address, and no other tunnel ingress may target this service.

## Rollout and Rollback

1. Back up the Academy schema and roles; apply
   `academy-web/supabase/privileged/academy-data-api-roles.sql` as the database
   superuser, then migration `0019` in the `postgres` database with a
   transaction rollback rehearsal.
2. Provision the authenticator password on the database host and configure a
   dedicated PostgREST container with an internal health check.
3. Route an isolated controlled hostname through the existing tunnel. Confirm
   the shared Supabase endpoint and containers remain unchanged.
4. Set the two Academy Worker settings as secrets, deploy, then verify valid
   Academy requests, anonymous denial, invalid-token denial, and cross-schema
   denial.
5. For emergency rollback/revocation, first run `ALTER ROLE
   academy_api_authenticator NOLOGIN PASSWORD NULL`, then revoke both Academy
   role memberships, remove the Worker settings, and stop the route/container.
   Restore only after a new authenticator password and runtime JWT secret are
   provisioned together. Keep schema/data; drop roles and revert `0019` only
   after a separately rehearsed rollback is approved.

Retention remains a separate future credential and scheduler rollout. It must
not use `academy_runtime` or the shared Pool A `service_role` key.
