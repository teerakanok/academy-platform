# SEC-ACADEMY-010 — Session-bound private media grants

## Outcome

- Media grants now carry a SHA-256 base64url digest of the exact opaque Academy session. The raw session is never placed in the signed payload.
- Issuance parses exactly one valid Academy session cookie and runs it through the existing verified `currentUser()` plus `authorizeCourseResource()` path before creating the grant.
- Outer Worker delivery requires a valid-format session cookie, verifies the HMAC, validates asset/course/node scope, compares the session digest constant-time, and performs these checks before `COURSE_MEDIA.get()`.
- Deterministic local delivery applies the equivalent binding before reading local media. Invalid grants defer to authorization; missing authentication fails closed as `401`.
- Missing, malformed, duplicate, wrong-session, expired, tampered, ownership-mismatched, and legacy unbound grants cannot read media directly. A valid same-session request still preserves GET, HEAD, R2 range normalization, private/no-store, the 5-minute TTL, and path-scoped HttpOnly issuance.

## Changed paths

- `academy-web/src/lib/media/grant.ts`
- `academy-web/src/lib/media/cookie.ts`
- `academy-web/src/lib/media/worker-delivery.ts`
- `academy-web/src/app/(site)/course-media/[assetId]/route.ts`
- `academy-web/tests/unit/media-grant.test.ts`
- `academy-web/tests/unit/media-delivery.test.ts`
- `academy-web/tests/unit/media-route.test.ts`
- `academy-web/tests/workerd/signer-worker.ts`
- `reports/security/2026-09-05-security-review-checklist.md`
- `reports/security/2026-09-07-sec-academy-010-session-bound-media-grants.md`

No migration was added or replayed. DB0034 remains unchanged. No protected `.env`, credential, token-named, products, `.git`, hook, or governance-control file was modified. No live provider, SSH, database, deploy, email, secret read, or live Wrangler command was used.

## Commands and exits

1. `npm ci` — exit `0`; installed 715 packages from the exact lockfile. Warning: Node `25.5.0` does not match declared `24.x`.
2. Supplied focus command `npx --no-install vitest run --project unit tests/media-grant.test.ts tests/media-delivery.test.ts tests/media-route.test.ts tests/security-wiring.test.ts` — exit `1`; confirmed paths differ in this checkout (`No test files found`), while the configured unit include is `tests/unit/**/*.test.ts`.
3. RED: `npx --no-install vitest run --project unit tests/unit/media-grant.test.ts tests/unit/media-delivery.test.ts tests/unit/media-route.test.ts tests/unit/security-wiring.test.ts` against binding-free behavior — exit `1`; 4 failed, 56 passed. The legacy grant received a `200` media response and no-session issuance returned `307`.
4. GREEN: same corrected focused command on final source — exit `0`; 4 files, 60/60 tests passed.
5. `npx --no-install vitest run --project unit` — exit `0`; 150 files, 2,441 passed, 2 skipped.
6. `npm run lint` — exit `1`; exactly the three known baseline errors in `academy-web/scripts/academy-bound-worker-executor.cjs` (`no-require-imports`). No unrelated error was suppressed.
7. Changed-file-only `npx eslint src/lib/media/cookie.ts src/lib/media/grant.ts src/lib/media/worker-delivery.ts 'src/app/(site)/course-media/[assetId]/route.ts' tests/unit/media-grant.test.ts tests/unit/media-delivery.test.ts tests/unit/media-route.test.ts tests/workerd/signer-worker.ts` — exit `0`.
8. `npx tsc --noEmit` — exit `0`.
9. `npx tsc -p tsconfig.worker.json` — exit `0`.
10. `npx tsc -p ops/academy-retention-worker/tsconfig.json` — exit `0`.
11. `npm run verify:workerd` — exit `1`; Wrangler/Miniflare failed with sandbox `EPERM` for local log writing under the user-preferences path and listening on `127.0.0.1`. No workerd PASS is claimed.
12. In the prior isolated execution, `npm run build:cf` — exit `1` at its `verify:workerd` prerequisite for the same sandbox `EPERM` failures. It was not rerun and no build PASS is claimed.

## Validation detail

- Unit coverage exercises grant-only, missing, malformed, duplicate, wrong-session, legacy-unbound, expired, tampered, scope-mismatch, GET, HEAD, closed/open/suffix range, session-bound issuance, and safe legacy reauthorization.
- The test asserting `COURSE_MEDIA.get()` was not called proves the copied/legacy grant never reaches R2. Positive GET and range tests prove same-session delivery reaches the mocked R2 binding.
- The real workerd harness source now covers the local R2 binding for grant-alone and wrong-session denial before `get()`, followed by same-session GET, `bytes=100-199`, and HEAD. This source coverage could not execute in this sandbox.
- The edge session parser intentionally mirrors the accepted raw-header parser’s exact-one and malformed/duplicate behavior. It lives beside media delivery to avoid pulling Node-only session-store code into the edge bundle; SEC-ACADEMY-011 prefix work must update both parsers together.

## Residual risk

- The signed grant remains valid for up to five minutes by design. This fix prevents copying it to another browser session; it does not provide immediate server-side revocation.
- Production deployment, independent root review, real workerd execution, and final Cloudflare bundle verification remain required.
- Existing delivery logging remains scope-only; this bounded bearer-sharing fix does not add per-account delivery attribution or change admission/rate-limit behavior.

## Root acceptance update — 2026-09-07

Root reproduced the baseline delivery vulnerability (HTTP 200 without session; test exit 1), restored exact candidate bytes, and obtained 16/16 delivery plus 60/60 focused and full unit PASS. All three type gates and `npm run build:cf` passed, including real workerd and final bundle startup. Independent security source review PASS. The earlier sandbox failures remain historical evidence; production remains pending. See [root raw evidence](../verification/2026-09-07-media-session-binding-root/README.md).

## Production update — 2026-09-07T06:10Z

Source90866d8 is serving on Worker56c2e7bd at100%, verified by actual deployments list and canonical/raw-host GETs plus a root-viewed real Chrome sign-in capture. See [production evidence](../verification/2026-09-07-media-session-binding-production/README.md). Authenticated media acceptance and immediate-revocation/logging residuals remain open.
