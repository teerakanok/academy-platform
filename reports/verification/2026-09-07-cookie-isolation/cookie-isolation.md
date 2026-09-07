# SEC-ACADEMY-011 browser cookie isolation — local verification

## Result

- Production session authority is `__Host-academy_session` with `Path=/`,
  `HttpOnly`, `SameSite=Lax`, and `Secure`; it never emits `Domain`.
- Production login binding is state-specific
  `__Host-academy_identity_binding_<32-character-prefix>` with the same root
  path and protection. A sibling `Domain=` cookie cannot inject either name.
- Production parsing is exact-one for the `__Host-` name only. Legacy
  `academy_session` is rejected as authority. Malformed or duplicate accepted
  names fail closed; a valid `__Host-` cookie remains authoritative when a
  hostile legacy cookie is also present.
- Middleware, durable session lookup, callback completion, sign-out, private
  media authorization, and Worker media delivery use the same accepted
  production session. Private media retains its session-digest grant binding.
- Explicit `http://localhost` local fixtures may issue/read unprefixed cookies;
  this path remains disabled in production.

## Transition and rollback

- Successful production completion and sign-out expire host-only legacy
  `academy_session`. They cannot overwrite a sibling-injected `Domain=` cookie,
  but production rejects the legacy name, so such residue cannot authorize or
  deny access through the accepted cookie namespace.
- Existing unprefixed durable browser sessions stop working and require one new
  sign-in. There is no bearer fallback in production.
- Rolling application code back across this cutover makes new-prefix cookies
  unreadable, requiring affected users to sign in again. In-flight callbacks that
  span the cutover fail closed and can be retried only on a compatible side.

## Commands and evidence

Working directory: `academy-web`

1. `NODE_ENV=production npx vitest run --project unit tests/unit/host-session-cookie-isolation.test.ts`
   before the fix: exit 1, 3/3 tests failed because issuance used
   `academy_session`, parsing accepted it, and middleware accepted it
   (`red-targeted.txt`).
2. Same targeted check after the fix: exit 0, 3/3 passed
   (`green-targeted.txt`).
3. Focused callback/local/media/signout set: exit 0, 78/78 after fixes recorded
   in session output; final focused media/callback/isolation rerun: 34/34.
4. `npx vitest run --project unit` once after all final updates: exit 0; 151
   files, 2,445 passed, 2 skipped (`unit-full-final.txt`).
5. `npm run lint`: exit 1 at ESLint with exactly three
   `@typescript-eslint/no-require-imports` errors in
   `scripts/academy-bound-worker-executor.cjs`; no other errors
   (`lint-typescript.txt`).
6. `npx tsc --noEmit && npx tsc -p tsconfig.worker.json && npx tsc -p ops/academy-retention-worker/tsconfig.json`:
   exit 0 (`typescript.txt`).
7. `npm run build:cf`: blocked before compilation by sandbox EPERM
   `listen 127.0.0.1` in `verify:workerd` (`build-cf.txt`).
8. `npm run build`: blocked by restricted DNS (`ENOTFOUND
   fonts.googleapis.com`) while fetching three `next/font` families
   (`build-next.txt`).

## Remaining gates

- Owner-present production sign-in, callback, dashboard, sign-out, and
  authenticated private-media acceptance.
- Unblocked Cloudflare workerd and Next production build checks.
- Independent material-auth-boundary review and production deployment remain
  owner-controlled.
