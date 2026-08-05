# Academy Retention Scheduler

## Boundary

Retention is a separate Cloudflare Worker (`cyberskills-academy-retention`) and
dedicated PostgREST API. It is not the Academy web Worker and it does not share
the application runtime JWT secret, database authenticator, or database role.

The retention Worker has one daily UTC cron and no public application route. It
creates a 60-second `HS256` credential with only:

```text
role=academy_retention
aud=academy-retention-api
```

The retention API exposes schema `academy` only. The API capability cannot read
tables directly or choose a retention period. It can call exactly five
no-argument wrappers, each of which fixes the approved policy:

| Wrapper | Fixed policy |
| --- | --- |
| `run_retention_attempts` | attempts: 90 days; batch 5,000 |
| `run_retention_leads` | waitlist/marketing leads: 3 years; batch 5,000 |
| `run_retention_inactive_users` | inactive accounts: 2 years; batch 500 |
| `run_retention_privacy_requests` | privacy requests: 3 years; batch 500 |
| `run_retention_staff_authorization_history` | staff authorization history: 3 years; batch 500 |

The underlying purge functions remain responsible for unresolved appeals, case
holds, evidence bounds, and idempotent deletion.

Those five underlying policy functions are `SECURITY INVOKER` with
`search_path=pg_catalog`. They therefore run as the restricted wrapper owner,
not as the historical migration operator that originally created them.

`academy_retention_definer` is a NOLOGIN, non-superuser `BYPASSRLS` role. It
has no API authenticator membership and has explicit grants only on the tables
and five pre-existing purge functions necessary for those wrappers. This keeps
Academy tables on their existing default-deny RLS model without adding allow
policies to user data.

## Host Configuration

Keep `ops/academy-retention-api/.env.academy-retention-api` on the database host
only. It is untracked and mode `0600`.

```dotenv
PGRST_DB_URI=postgres://academy_retention_api_authenticator:<host-only-password>@db:5432/postgres
PGRST_JWT_SECRET=<dedicated-retention-jwt-secret>
```

Generate the authenticator password and JWT secret on the host. Do not place
either in Git, Cloudflare Tunnel configuration, shell history, logs, or the
Academy web Worker. The password belongs only in this env file; the JWT secret
is also entered as a secret for `cyberskills-academy-retention`.

## Deployment Order

1. Back up the Academy schema and role inventory. Rehearse the database change
   in a transaction and roll it back before the real apply.
2. As database superuser, apply
   `supabase/privileged/academy-retention-api-roles.sql`. It creates the
   authenticator, the execute-only capability, and the independent definer
   owner with a fail-closed membership check.
3. Apply migration `0020_dedicated_retention_api.sql` to Pool A `postgres`.
   Immediately afterwards, as database superuser, apply
   `supabase/privileged/academy-retention-api-function-owners.sql`. This step
   is required: it changes the five `SECURITY DEFINER` wrappers to the
   non-login `academy_retention_definer` owner and grants only wrapper execute
   to `academy_retention`.
4. Create the host-only env file above, then validate and start the dedicated
   API without printing values:

   ```sh
   chmod 600 ops/academy-retention-api/.env.academy-retention-api
   docker compose --env-file ops/academy-retention-api/.env.academy-retention-api \
     -f ops/academy-retention-api/docker-compose.yml config --quiet
   docker compose --env-file ops/academy-retention-api/.env.academy-retention-api \
     -f ops/academy-retention-api/docker-compose.yml up -d
   docker compose -f ops/academy-retention-api/docker-compose.yml ps
   curl --fail --silent --show-error http://127.0.0.1:50601/
   ```

   Expected: both containers report healthy/running and the loopback health
   request succeeds. No credential is shown by these commands.
5. Add one exact Cloudflare Tunnel ingress:
   `academy-retention.cyberskills.co.th` to `http://127.0.0.1:50601`.
   Run `cloudflared tunnel ingress validate` against the host config before
   restarting the tunnel. It must not replace the existing Academy data API
   ingress.
6. Enter secrets interactively for the retention Worker and deploy it:

   ```sh
   npx wrangler secret put ACADEMY_RETENTION_API_URL \
     --config ops/academy-retention-worker/wrangler.jsonc
   npx wrangler secret put ACADEMY_RETENTION_API_JWT_SECRET \
     --config ops/academy-retention-worker/wrangler.jsonc
   npx wrangler deploy --config ops/academy-retention-worker/wrangler.jsonc
   ```

   The URL is `https://academy-retention.cyberskills.co.th` with no path,
   query, credentials, or trailing API route. The Worker accepts only an HTTPS
   origin in production.
7. Do not insert production fixtures. Cloudflare has no production "run now"
   control for cron triggers. Verify the next daily event through Workers Logs
   and the Worker Trigger Events view; Trigger Events can take up to 30 minutes
   to appear. Expected first-run outcome is five `retention.purge_complete`
   records with non-negative integer `deleted` and `rounds` fields, normally
   all zero for an unchanged dataset. Confirm that direct table access and the
   original parameterized purge RPCs still return access denied.

For local scheduling behavior, use only a disposable Supabase stack. The local
`supabase/roles.sql` compatibility placeholders are not a production bootstrap:
never run remote `db reset --linked` or include roles in a remote deployment.
For Pool A, use the privileged deployment order above. Bootstrap the privileged
local roles and migrations from a clean schema first:

```sh
npx supabase db reset --local --version 0018 --no-seed
# The CLI grants local custom roles to `postgres`; remove only those generated
# membership edges so the same fail-closed production boundary can be rehearsed.
docker exec supabase_db_academy-web psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "revoke academy_runtime, academy_api_anon, academy_api_authenticator, academy_retention, academy_retention_definer, academy_retention_api_anon, academy_retention_api_authenticator from postgres cascade;"
docker exec -i supabase_db_academy-web psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/privileged/academy-data-api-roles.sql
docker exec -i supabase_db_academy-web psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/privileged/academy-retention-api-roles.sql
npx supabase migration up --local
docker exec -i supabase_db_academy-web psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/privileged/academy-retention-api-function-owners.sql
```

Set the local authenticator password interactively; it is not echoed or written
to shell history:

```sh
docker exec -it supabase_db_academy-web psql -U supabase_admin -d postgres \
  -c '\\password academy_retention_api_authenticator'
```

Create the ignored `ops/academy-retention-api/.env.academy-retention-api` with
local-only values. Its JWT secret must match the Worker `.dev.vars` secret below.

```dotenv
PGRST_DB_URI=postgres://academy_retention_api_authenticator:<local-only-password>@db:5432/postgres
PGRST_JWT_SECRET=<local-test-only-secret>
ACADEMY_RETENTION_API_PORT=3102
```

Start the dedicated local API with the tracked local override, then require its
loopback health check to pass before starting the Worker:

```sh
docker compose --env-file ops/academy-retention-api/.env.academy-retention-api \
  -f ops/academy-retention-api/docker-compose.yml \
  -f ops/academy-retention-api/docker-compose.local.yml up -d
docker compose -f ops/academy-retention-api/docker-compose.yml \
  -f ops/academy-retention-api/docker-compose.local.yml ps
curl --fail --silent --show-error http://127.0.0.1:3102/
```

First provision the test-only database sentinel with a fresh non-secret
identifier; the integration suite aborts before purge RPCs unless the API
returns this exact identifier. The sentinel SQL is never part of a production
migration.

```sh
test_database_id="academy-retention-local-$(openssl rand -hex 16)"
docker exec -i supabase_db_academy-web psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 -v retention_test_database_id="$test_database_id" \
  -f tests/fixtures/academy-retention-test-sentinel.sql
```

Create the ignored `ops/academy-retention-worker/.dev.vars` beside the Worker
Wrangler config with a loopback API URL and a local-only JWT secret. Do not use
a production URL or secret.

```dotenv
ACADEMY_RETENTION_API_URL=http://127.0.0.1:3102
ACADEMY_RETENTION_API_JWT_SECRET=<local-test-only-secret>
```

Then start Wrangler from the config directory so it reads that file, and use
the documented scheduled endpoint:

```sh
cd ops/academy-retention-worker
npx wrangler dev --config wrangler.jsonc
curl --fail --silent --show-error \
  'http://127.0.0.1:8787/cdn-cgi/handler/scheduled?format=json'
```

Expected: the structured result succeeds and the terminal has five
`retention.purge_complete` logs with non-negative integer counts. Remove
`.dev.vars` and stop the local test containers after the rehearsal. When running
the real API contract suite, set the same identifier as
`TEST_ACADEMY_RETENTION_DATABASE_ID`; the test must stay skipped unless all
`TEST_*` values and the destructive opt-in are deliberately supplied.

## Monitoring And Recovery

The Academy platform owner is the operational owner; until that role is
bootstrapped, the founder is the escalation owner. A failed scheduled event or
any `retention.purge_failed` log is investigated immediately. One
`retention.backlog_remaining` warning is reviewed before the next daily run;
two consecutive warnings are escalated because the bounded backlog is not
draining.

1. Check the retention Worker event and its structured logs. Identify the
   wrapper name, HTTP status, and failure class; do not copy authorization
   headers or env values into tickets.
2. On the database host, confirm API health and inspect only recent container
   logs:

   ```sh
   curl --fail --silent --show-error http://127.0.0.1:50601/
   docker compose -f ops/academy-retention-api/docker-compose.yml logs --since 30m academy-retention-api
   ```

3. For transient health or network failures, leave the policy unchanged. The
   next cron retries every wrapper independently; completed deletions are
   idempotent and a failed wrapper is included in the next run. Do not invoke
   PostgREST manually with production credentials merely to force a retry.
4. For an unexpected delete count, a 403 policy failure, malformed API result,
   or suspected credential exposure, stop the retention path before retrying:
   disable the authenticator (`NOLOGIN` and remove its password), revoke both
   authenticator membership edges, remove the retention Worker secrets, and
   stop the retention API containers. Preserve the Academy web Worker and its
   data API. Reissue both retention credentials together, restore the role
   scripts, then re-run the direct-table-denial and five-wrapper smoke checks.
