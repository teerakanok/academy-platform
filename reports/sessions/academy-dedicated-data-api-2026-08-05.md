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

Production rollout completed on 2026-08-05:

- Fresh backup at `/root/academy-db-backups/20260805T162324Z-dedicated-api`
  (schema SHA-256 `ba46ad0017857d64743b64f66f7e3e464fe5ec34af5c886db6c27ea313328d5f`,
  role export SHA-256 `5694895c1417e12223d88446271a168bf72edc87982e6c5edaac268f3a6479a9`).
- `academy-data-api-roles.sql` was applied as database superuser; migration
  `0019` passed a transaction rollback rehearsal and then applied to Pool A
  `postgres`.
- The dedicated digest-pinned PostgREST and health sidecar are running on the
  database host. The service binds only `127.0.0.1:50600`; the health sidecar
  reports `healthy`.
- The tunnel has one exact ingress for `academy-data.cyberskills.co.th` to
  `http://127.0.0.1:50600`. Its configuration was validated before restart;
  rollback copy: `/etc/cloudflared/config.yml.pre-academy-data-api-20260805T162624Z`.
- The Academy Worker has the two required runtime settings as secret bindings
  and was deployed as version `4861c000-d987-40ac-971e-d6e47e1a92e0`.
- External acceptance: valid runtime request `200`; anonymous `401`; forged
  `service_role` claim `403`; cross-schema request `406`. A harmless unknown
  unsubscribe-token request through the deployed Worker returned `200`, proving
  the Worker-to-data-API path without creating or exposing learner data.
- The shared Pool A gateway was not reconfigured or recreated. Its unauthenticated
  public gateway responses remain protected (`401`).

## Next Gate

Activate the real account runtime and bootstrap the first owner from an actual
stable identity. Retention remains a separate limited-credential rollout and
must not use this runtime role or a shared Pool A service role.
