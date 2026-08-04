# Private lesson media delivery

## Boundary

Private MP4, VTT, PDF, and ZIP files must not exist under `public/` or the
Cloudflare ASSETS directory. Source fixtures live under `private-media/` using the
same object keys declared in `src/lib/media/registry.ts`.

After the lesson page has passed account, activation, entitlement, and prerequisite
authorization, it replaces registered content references with an HMAC-signed
`/api/media/open?token=<grant>` URL. The grant binds an opaque registry asset ID,
course, node, and expiry; the object key remains server-side.

The open endpoint re-checks the current session, activation, entitlement, and node
prerequisites, then redirects to a five-minute delivery grant. The outer Worker handles
`/course-media/` before OpenNext and reads only from the
private `COURSE_MEDIA` binding. Tampered, missing, and ownership-mismatched grants
fail closed. An expired but authentic delivery grant returns through the open endpoint,
which re-checks the current session and course authorization before issuing another
five-minute grant. Responses support byte ranges and use private/no-store caching.

A delivery URL is a bearer credential and can remain usable for at most five minutes
after access is revoked. New opens and redirects check authorization immediately. This
five-minute bounded revocation delay is the current service contract.

## Local adapter

The Next route at the same path exists only for deterministic local E2E. It returns
404 unless both `MEDIA_LOCAL_ROOT` and `MEDIA_SIGNING_SECRET` are explicitly set.
Production must not set `MEDIA_LOCAL_ROOT`; the outer Worker intercepts the request
and requires the private bucket binding.

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
4. Verify valid grants, expiry, tampering, byte-range video playback, captions, PDF,
   entitlement revocation, and missing-object behavior on that environment.

Local `next start` proves the application contract but cannot close the ASSETS/R2
topology acceptance criterion.
