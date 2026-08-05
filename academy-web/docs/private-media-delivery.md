# Private lesson media delivery

## Boundary

Private MP4, VTT, PDF, and ZIP files must not exist under `public/` or the
Cloudflare ASSETS directory. Source fixtures live under `private-media/` using the
same object keys declared in `src/lib/media/registry.ts`.

After the lesson page has passed account, activation, entitlement, and prerequisite
authorization, it replaces registered content references with the non-secret path
`/course-media/<asset-id>`. The object key remains server-side. An asset ID identifies
an allowed object but cannot authorize delivery by itself.

The first request without a valid grant cookie reaches the same-path OpenNext route.
It re-checks the current session, activation, entitlement, and node prerequisites,
then sets a five-minute HMAC-signed `HttpOnly`, `SameSite=Lax`, path-scoped cookie and
redirects to the same clean path. The outer Worker handles the redirected
`/course-media/` request before OpenNext and reads only from the private `COURSE_MEDIA`
binding when that cookie is valid and bound to the requested asset. Missing, tampered,
ownership-mismatched, and expired cookies return to the authorization route without
reading R2. Responses support byte ranges and use private/no-store caching.

The cookie is a bearer credential and can remain usable for at most five minutes after
access is revoked. It never appears in a URL, browser history, or edge request URL
logs. A new authorization redirect checks access immediately; this five-minute bounded
revocation delay is the current service contract.

## Local adapter

The Next route at the same path authorizes an initial or renewed cookie in every
environment. It additionally serves local fixtures for deterministic E2E only when
both `MEDIA_LOCAL_ROOT` and `MEDIA_SIGNING_SECRET` are explicitly set. Production
must not set `MEDIA_LOCAL_ROOT`; the outer Worker intercepts requests with valid
cookies and requires the private bucket binding.

## External activation gate

Remote R2 topology was prepared and verified on 2026-08-04:

- Private bucket: `cyberskills-academy-media` (APAC, Standard).
- Five registry objects uploaded; remote downloads matched local SHA-256 values.
- Remote preview verified full PDF, suffix range, HEAD, video range, caption,
  tampered token, legacy public URL, and expired-token renewal behavior.
- `COURSE_MEDIA` is tracked in `wrangler.jsonc`.

Do not deploy this checkpoint until the remaining release gates are complete:

1. Apply and verify the pending production database migrations required by the same
   application build.
2. Add a random `MEDIA_SIGNING_SECRET` Worker secret without exposing its value.
3. Build with OpenNext and verify direct legacy `/media/*.mp4|vtt|pdf` URLs fail on a
   real environment where ASSETS binding is active.
4. Verify clean media URLs, cookie issuance/expiry/tampering, byte-range video
   playback, captions, PDF, entitlement revocation, and missing-object behavior on
   that environment.

Local `next start` proves the application contract but cannot close the ASSETS/R2
topology acceptance criterion.
