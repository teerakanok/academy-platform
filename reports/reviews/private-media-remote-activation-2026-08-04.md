# Private media remote activation checkpoint

Date: 2026-08-04
Scope: Cloudflare R2 resource preparation and non-production remote preview

## Changes

- Created the private `cyberskills-academy-media` R2 bucket in APAC with Standard storage.
- Uploaded all five objects declared by the Academy media registry using exact object keys.
- Added the tracked `COURSE_MEDIA` binding to `wrangler.jsonc`.
- Fixed Worker response normalization discovered by remote proof: a full R2 read may
  expose range metadata, but must remain HTTP 200 unless the client sent a Range header.

## Evidence

- Downloaded all five remote keys and compared SHA-256 with local registry fixtures: 5/5 match.
- Remote preview full PDF: 200 and SHA-256 match.
- PDF suffix range: 206 with five-byte body; HEAD: 200.
- Video closed range: 206 with requested 100-byte body.
- Caption: 200 and SHA-256 match.
- Tampered token: 404; legacy public PDF URL: 404.
- Expired authentic grant: 307 to the relative authenticated renewal endpoint.
- Targeted Worker delivery tests: 10 passed with no type errors, including full-read
  range metadata and requested-range-without-metadata normalization.
- OpenNext Cloudflare build passed with the real R2 binding.

`wrangler r2 bucket info` immediately after upload still reported zero objects and zero
bytes. Direct remote reads of every exact key succeeded and matched hashes, so this is
recorded as control-plane metric lag rather than treated as upload evidence.

## Due-care cleanup

- Remote preview stopped.
- Temporary preview signing secret removed and original `.dev.vars` restored.
- Temporary downloads and header files removed.
- No listener remained on the preview port.

## Remaining production gates

- Production `MEDIA_SIGNING_SECRET` is intentionally not set yet because `wrangler secret put`
  can create/deploy a Worker version.
- The Worker was not deployed. The current application build includes database changes that
  require the pending Pool A migration/release gate to close first.
- After that gate, set the production secret, deploy once, and verify authenticated entitlement
  revocation plus missing-object behavior on the deployed topology.
