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
