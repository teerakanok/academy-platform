# Edge Rate Limit

Academy protects these public mutations before OpenNext runs:

| Route | Limit |
|---|---:|
| `POST /api/leads` | 10 requests / 60 seconds / actor |
| `POST /api/leads/unsubscribe` | 10 requests / 60 seconds / actor |
| `POST /api/auth/otp` | 10 requests / 60 seconds / actor |
| `POST /api/auth/verify` | 10 requests / 60 seconds / actor |

The outer Worker uses `cf-connecting-ip`, never client-supplied `X-Forwarded-For`.
It derives an HMAC-based Durable Object name from the actor and route. The object
stores only a fixed-window count and expiry, then clears its storage by alarm.
It does not persist an IP address, email address, token, or request body.

This is intentionally a Durable Object per opaque actor-route pair, not a single
global limiter. The counter remains consistent across Academy Worker instances
without turning all traffic into one coordination bottleneck.

## Release Order

1. Generate a new random secret with at least 32 bytes of entropy and set it as
   Worker secret `RATE_LIMIT_KEY_SECRET` using `wrangler secret put`.
2. Deploy the Academy Worker. Wrangler applies migration
   `v1-edge-rate-limiter`, creating the SQLite-backed `EdgeRateLimiter` class.
3. Verify one protected route stays below the limit and a bounded test request
   sequence receives `429` with `Retry-After`. Never use a real learner email,
   unsubscribe token, or production database mutation for that check.
4. Inspect Worker logs for unexpected `503` responses. A missing secret, missing
   binding, or Durable Object failure is fail-closed and must be fixed before
   public traffic is enabled.

The source change alone does not create a Cloudflare resource or change the
currently deployed Worker.

## Production Rollout — 2026-08-06

`RATE_LIMIT_KEY_SECRET` was generated through standard input without recording
its value, then the Academy Worker was deployed as version
`b85b7a6d-ceaa-4708-81fd-0d8096462251`. The production proof used eleven
invalid JSON lead requests, so it sent neither an email nor a database mutation:
the first ten returned `400`, and the eleventh returned `429` with
`Retry-After: 53`.

The first upload version, `7426e155-5d1c-4b12-996c-419db1d8deb6`, was not
accepted as evidence: Wrangler auto-detected OpenNext and deployed its inner
worker, which omitted the exported Durable Object class and caused intermittent
`503`. A rollback was correctly rejected because migration
`v1-edge-rate-limiter` had already been applied. The forward deployment used
the configured `worker.ts` entrypoint with `--autoconfig=false`, restoring the
expected limiter behavior. `deploy:cf` includes that flag permanently; do not
deploy this project with bare `wrangler deploy`.
