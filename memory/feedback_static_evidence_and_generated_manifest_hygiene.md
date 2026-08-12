# Static Evidence And Generated Manifest Hygiene

- Date: 2026-08-09
- Scope: Academy public-course locale and share-image work.

## Mistake

The route table's `SSG` label was treated as proof that a public course with a
`?lang` query was prerendered. A later check of the prerender manifest and a
local response showed that only the default generated path was cached; the query
variant returned `Cache-Control: private, no-cache`.

While checking the OpenNext output, a broad text search also emitted generated
manifest material that can contain build-local preview credentials into a local
tool transcript. No production credential, database, deployment, or user-visible
surface was involved.

## Root Cause

Build summaries are not a route-cache contract, and generated deployment
artifacts are not safe to grep broadly. The verification method was too broad
for the claim and for the artifact sensitivity.

## Prevention Control

- `academy-web/scripts/verify-public-share-images.mjs` checks only parsed,
  non-sensitive prerender fields for every known public share PNG and asserts
  that unenumerated image params have no fallback.
- `academy-web/scripts/verify-cf-public-share-images.mjs` checks OpenNext cache
  filenames only. It never prints or searches generated handler/manifest content.
- Future claims that a route is static require the relevant manifest entry and a
  response-cache check when query parameters are involved; a build route table
  alone is insufficient evidence.

## Verification

Run `npm run build`, `npm run verify:public-share-images`, `npm run build:cf`,
and `npm run verify:cf-public-share-images`. These checks emit only route names
and pass/fail status.

## Canonical References

- `academy-web/src/app/courses/[slug]/share/[locale]/route.tsx`
- `academy-web/scripts/verify-public-share-images.mjs`
- `academy-web/scripts/verify-cf-public-share-images.mjs`
