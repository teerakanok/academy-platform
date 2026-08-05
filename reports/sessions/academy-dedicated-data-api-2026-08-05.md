# Academy Dedicated Data API Checkpoint

**Date:** 2026-08-05

## Outcome

Academy no longer has an application code path that requires Pool A's shared
`service_role`. The product now has a deployable dedicated PostgREST boundary:

- `academy_runtime` is a `NOLOGIN` trusted Academy backend role with a defined
  Academy-only table/function allowlist;
- `academy_api_authenticator` can switch only to `academy_runtime` or the empty
  anonymous role, and privileged bootstrap fails when any other direct or
  indirect membership edge exists;
- the Worker signs a 60-second `HS256` JWT scoped to
  `role=academy_runtime` and `aud=academy-data-api`;
- application code uses a server-only adapter to the dedicated endpoint and
  cannot use a Pool A service-role key;
- the production compose artifact pins image digests, binds loopback port
  `50600`, and exposes readiness through an internal health sidecar.

## Local Evidence

- Staged local bootstrap: migrations `0001`-`0018`, privileged role script as
  `supabase_admin`, then `0019` as normal schema owner all applied successfully.
- Dedicated local PostgREST accepted a valid runtime request with `200`.
  Anonymous and malformed JWT requests returned `401`; a JWT carrying
  `service_role` returned `403`; `Accept-Profile: helm` returned
  `406/PGRST106`.
- Authenticator could `SET ROLE academy_runtime`; attempting `SET ROLE
  service_role` was denied. A deliberately injected extra membership caused the
  privileged bootstrap to fail closed.
- The internal health image successfully probed the dedicated PostgREST service
  across the Docker network.
- `npm test` with the dedicated local endpoint: 49 files, 498 tests passed.
  `npm run lint` and both TypeScript checks passed; one pre-existing generated
  registry warning remains. `npm run build:cf` completed successfully.
- Independent review final verdicts: Code `C0/H0/M0/L0`, Security
  `C0/H0/M0/L0`, UX `C0/H0/M0/L0`; visual review N/A because no DOM/CSS surface
  changed.

## Production State

No production database role, container, tunnel, Worker secret, or deployment
was changed by this checkpoint. The existing shared Pool A API and Academy
preview remain unchanged.

## Next Deployment Gate

1. Create a fresh Academy schema/role backup and rehearse the rollback.
2. Apply `supabase/privileged/academy-data-api-roles.sql` as database
   superuser, then `0019_dedicated_runtime_api.sql` to Pool A `postgres`.
3. Provision the authenticator password and runtime JWT secret only on their
   intended hosts; deploy `ops/academy-data-api/docker-compose.yml`.
4. Add exactly one tunnel ingress for `academy-data.cyberskills.co.th` to
   `http://127.0.0.1:50600`; verify health before setting Worker secrets.
5. Deploy the Worker, run the four runtime API smoke paths, then retire any
   stale local application `SUPABASE_SERVICE_ROLE_KEY` configuration.

Retention remains a separate limited-credential rollout. It must not use this
runtime role or a shared Pool A service role.
