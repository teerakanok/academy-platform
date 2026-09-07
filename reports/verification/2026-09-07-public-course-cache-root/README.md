# Public course cache delivery — root acceptance

Author: external GLM Flash run7ecb643687ae4a636745e3b25934fc3f. Independent reviewer: root controller, did not author implementation. Result: PASS for local source/runtime checkpoint; production proof remains open.

Root inspected the four-file patch and applied its exact retained SHA 1e8f2bca0be268a2e22654b8cc7b959386b171d7c33047c9e17a4cbfcdaa1ab3 to base5bd58861. Existing staticAssetsIncrementalCache reads ASSETS cdn-cgi/_next_cache while direct versions upload publishes only .open-next/assets. Syncing generated cache before upload repairs the causal missing-data seam without changing course availability or authentication.

Commands from academy-web:
- npm ci --ignore-scripts --no-audit --no-fund: exit0,715 packages. Runtime Node25.5 versus declared24 warning remains environment limitation.
- npm run build:cf: exit0; synced83 generated cache assets, asset guard0, final production bundle initialized on real workerd/rawhost404.
- npx --no-install vitest run --project unit: exit0,2441 passed2 skipped.
- node node_modules/workerd/bin/workerd test -Inode_modules --no-verbose .next/course-route-root.capnp academy-final-worker: root actual final bundle, readonly disk ASSETS service, outbound blocked. All16 public localized routes return200 with genuine course h1. Private learning routes redirect307 to sign-in; all3 internal course routes404; rawhost404. This local disk binding is not a substitute for production Cloudflare/browser verification.

Causal RED: temporarily rename only owned generated assets/cdn-cgi/_next_cache outside served assets, same artifact/harness returns404/exit1; finally restore exact directory. GREEN same artifact4representative routes200/exit0. First exploratory assertion rejected a200page because serialized Next RSC contained unused404fallback text; corrected oracle checks rendered h1 and status. It was a harness error, not a production regression.

Cache inventory:47 page entries are public courses/share/OG/index/privacy/robots/sitemap/error pages;36 fetch entries have only Google Fonts hostnames fonts.googleapis.com/fonts.gstatic.com. No private lesson route is prerendered. Content files unchanged from accepted5bd import; unit public projection/authorization contracts unchanged and pass. Build stages generated files only; symlink/mismatch checks fail before deployment. Unknown future private build-time fetches need the same publication review.

Implementation scope hashes in scope.json. Raw command output and exact local harness retained beside this file. Before production: lint baseline adjudication, remaining TypeScript commands, exact commit upload at0, version override GET and realbrowser, then traffic activation and postproof. No DB migration or secret mutation in this change.

Final gates: npm run lint exited1 with exactly3 accepted baseline no-require-imports errors in academy-bound-worker-executor.cjs and16warnings. Separately npx --no-install tsc --noEmit, tsc -p tsconfig.worker.json, and tsc -p ops/academy-retention-worker/tsconfig.json each exited0. git diff --check0. No new lint errors. Root local acceptance complete; production acceptance remains open.
