# Edge Rate Limit

Academy protects these public mutations before OpenNext runs:

| Route | Actor | Target | Route ceiling |
|---|---:|---:|---:|
| `POST /api/leads` | 10 / 60 seconds | email: 5 / 60 seconds | 300 / 60 seconds |
| `POST /api/leads/unsubscribe` | 10 / 60 seconds | token: 10 / 60 seconds | 300 / 60 seconds |
| `POST /api/auth/otp` | 10 / 60 seconds | email: 5 / 60 seconds | 300 / 60 seconds |
| `POST /api/auth/verify` | 10 / 60 seconds | email: 10 / 60 seconds | 600 / 60 seconds |
| `GET /api/auth/identity/start` | 10 / 60 seconds | — | 600 / 60 seconds |
| `POST /api/auth/identity/start` | 10 / 60 seconds | — | 600 / 60 seconds |
| `GET /auth/callback` | 10 / 60 seconds | — | 600 / 60 seconds |

The outer Worker uses `cf-connecting-ip`, never client-supplied `X-Forwarded-For`.
After OpenNext authenticates a learner, the progress, reset, and simulation/grading
routes apply a second quota layer through `getCloudflareContext().env` and the same
`EDGE_RATE_LIMITER` Durable Object binding. The account key comes only from the
authenticated `currentUser()` account ID; the course key comes from a validated course
slug. Client headers and body fields cannot select the account.
IPv6 actors aggregate to their /64; IPv4 addresses remain /128; malformed
addresses fail closed. For routes with an actual recipient or unsubscribe
target, the Worker reads that field from a request clone through a bounded
16,384-byte reader, then derives an HMAC-based Durable Object name. Identity
navigation does not invent an email target. Each actor, target, and route
ceiling uses its own opaque object; no object name contains the IP, email, or
token. Objects store only a fixed-window count and expiry, then clear storage
by alarm.

The Worker canonicalizes one trailing slash before its exact method:path lookup
and preserves query strings. A visible encoded path gets one strict decode at
the admission boundary: malformed input, encoded slashes/backslashes/control
bytes, dot segments, double encoding, or a decoded method:path that matches a
protected rule returns `404`. Harmless percent-encoded public paths—such as
localized course names and spaced asset filenames—remain public without losing
their original encoded form. URL parsers can normalize invalid raw input before
a Worker observes it; `//`, `\`, NUL, and explicit dot segments are therefore
also rejected rather than treated as proof about the original bytes.

Identity routes verify the resulting signed marker inside OpenNext before any
authorization transaction or code exchange; missing or forged markers fail closed.
Explicit loopback fixtures may bypass only after their separate flag plus host
fixture gate passes; production never has that bypass.

Authenticated learner quotas use separate opaque account and account-course object
names. Progress allows 120 requests/account/minute and 60/account-course/minute;
Practice grading allows 60/account/minute and 30/account-course/minute, half the
progress budgets while admitting a 30-request learner burst. Destructive
reset is tighter at 6/account/hour and 3/account-course/hour. These ceilings cover
ordinary UI bursts while bounding authenticated authorization, database, and grading
work. A missing binding or secret, malformed authenticated identity, or Durable Object
failure returns 503 before entitlement checks or the protected mutation.

This remains Durable Object coordination per opaque scope-route pair, not an
in-memory fallback. Counters remain consistent across Academy Worker instances.

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
