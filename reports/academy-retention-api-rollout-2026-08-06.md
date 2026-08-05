# Academy Retention API Rollout

## Completed

- Source capability: `b8192ea`.
- Database target: Pool A `postgres`, schema `academy` only.
- Backup: `/root/academy-db-backups/20260805T173744Z-retention-api/academy-schema.dump`
  (112,047 bytes; SHA-256 receipt retained beside the dump).
- Transaction rehearsal with `supabase_admin` completed and rolled back before
  the real apply.
- Applied role bootstrap, migration `0020_dedicated_retention_api.sql`, and
  wrapper owner/grant script.
- Verified all five wrappers are owned by `academy_retention_definer`, use
  `SECURITY DEFINER` and `search_path=pg_catalog`.
- Verified `academy_retention` can execute a wrapper, while it and
  `service_role` cannot execute the parameterized attempt purge function.
- Dedicated PostgREST runs on host loopback `127.0.0.1:50601`; API and health
  sidecar are healthy. Its host-only env file is mode `0600`.
- Cloudflare Tunnel ingress and DNS route for
  `academy-retention.cyberskills.co.th` were added and validated.
- Worker `cyberskills-academy-retention` version
  `d2c0f761-c387-46d1-b28d-654b44a9af25` is deployed at 100% with only
  `ACADEMY_RETENTION_API_URL` and `ACADEMY_RETENTION_API_JWT_SECRET` secrets.
- Deployment log confirms daily cron `0 3 * * *`.

## Pending Verification

Cloudflare has no production one-shot cron invocation. The next scheduled event
must be checked in Worker Trigger Events and logs for five
`retention.purge_complete` records, or a surfaced `retention.purge_failed`
record. Do not call the production PostgREST purge RPC manually merely to force
a retry.
