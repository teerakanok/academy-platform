# AL-14: public course overview visibility enforcement

## Change

- Added a single runtime-aware `getVisiblePublicCourse()` helper and used it on:
  - `/courses/<slug>` legacy overview redirect
  - `/courses/<slug>/<locale>` localized syllabus page and metadata
  - `/courses/<slug>/opengraph-image`
  - `/courses/<slug>/share/<locale>`
- Unpublished and retired courses now hit the `notFound()` boundary (or route-handler 404), while the published control still redirects/renders/emits images.
- Catalog settings reads now fail closed: `loadAllCourseOverrides()` propagates database errors instead of returning an empty map that re-exposes every statically public course.
- Every direct course surface is `force-dynamic`; the localized share-image verifier now rejects immutable/static output and keeps the unenumerated-locale fallback gate.

## Verification

- **Source PASS:** `git diff --check` exit `0`; `node --check scripts/verify-public-share-images.mjs` exit `0`.
- **Focused unit PASS:** `npm run test:unit -- tests/unit/public-course-visibility.test.ts` — 1 file / 11 tests passed.
- **Related unit PASS:** `npm run test:unit -- tests/unit/public-course-route.test.ts tests/unit/public-course-share-route.test.ts tests/unit/sitemap.test.ts tests/unit/course-access.test.ts tests/unit/course-visibility-migration.test.ts tests/unit/free-course-journey.test.ts tests/unit/public-course-visibility.test.ts` — 7 files / 45 tests passed.
- **Final focused unit PASS:** `npm run test:unit -- tests/unit/public-course-visibility.test.ts tests/unit/public-course-route.test.ts tests/unit/public-course-share-route.test.ts` — 3 files / 16 tests passed.
- **Full unit PASS with known baseline:** `npm run test:unit -- --testTimeout 15000` — 163 files passed, 4 files failed, 3,200 tests passed, 13 failed, 2 skipped. The 13 failures match the known pre-existing baseline (identity client assertion x11, public lesson x1, sign-out x1); no new failure was introduced.
- **Typecheck PASS:** `npx tsc --noEmit` exit `0`; `npx tsc -p tsconfig.worker.json` exit `0`.
- **Changed-file lint PASS:** `npx eslint` on all changed TypeScript/JavaScript files exit `0`.
- **Production build BLOCKED in sandbox:** `npm run build` reached Next compilation but failed only while `next/font` tried to download Google Fonts (`getaddrinfo ENOTFOUND fonts.googleapis.com`). No application type/build error was reported before that network boundary.
- **Share-image manifest verifier NOT_RUN:** the blocked build did not produce `.next/prerender-manifest.json`; syntax was checked instead.

## Host verification

- `HOST-E2E: npm run build` (cwd `academy-web`)
- `HOST-E2E: npm run verify:public-share-images` (cwd `academy-web`, after a successful build)
