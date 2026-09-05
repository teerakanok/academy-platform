# Sign-in loop and host-gate evidence — 2026-09-05

## Route and cause

- Production Cloudflare builds intentionally clear the legacy `NEXT_PUBLIC_SUPABASE_*` fixture variables. The old middleware therefore redirected every protected request, including `/dashboard` immediately after `/auth/callback` set `academy_session`.
- Controller RED on the original source is retained at `/private/tmp/cyberskills-prod-cde63a58/academy-red.log`: `3 failed / 2 passed`. It proves the valid-cookie dashboard request returned `307`, the no-cookie API request returned `307` instead of JSON `401`, and `/api/auth/me` skipped `currentUser()`.
- Deeper continuation review found `/dashboard` itself trusted the middleware boundary: a valid-shaped forged cookie could render the dashboard shell without a server-side durable lookup. RED `rtk vitest run --project unit tests/unit/dashboard-page.test.ts` failed `2/2` because `currentUser()` was never called.

## Changed authorization path

- Production middleware now treats the opaque cookie as a coarse prefilter: missing/malformed cookie redirects protected pages with `next=` and returns JSON `401` for protected APIs; valid shape continues to Node.
- `/api/auth/me` and `/dashboard` call `currentUser()`. Dashboard redirects to `/sign-in?next=%2Fdashboard` when the authoritative lookup returns no user.
- `currentUser()` parses the opaque ID, requires the full production runtime gate, calls `read_identity_session`, and resolves an Academy account only for returned claims. Protected lesson/course/access-required pages, media, progress, attempt, explanation and skill-map APIs already use this path; internal player routes use the staff guard built on it.
- Adversarial production-mode tests pass real `AcademyPostgresIdentitySessionStore` responses through `currentUser()`: forged (`unknown`), expired (`expired`) and post-revocation (`revoked` then `unknown`) sessions all return `null` without account resolution.

## Host gate

- Commit `c6a67e0` remains intact. `worker.ts` rejects unserved hosts before rate limiting, media or OpenNext. Canonical/loopback hosts are allowed; raw `workers.dev` receives empty uncacheable `404` unless an operator temporarily names it in `ACADEMY_SERVED_HOSTS`.
- The operations runbook now distinguishes the current pre-gate `200` baseline from the host-gated target `404`, so release and rollback probes cannot apply the wrong expectation.

## Gates

- Focused authorization/store suite: `43 passed / 0 failed`.
- Required final unit command `npx vitest run --project unit`: `2,135 passed / 0 failed` across 140 files; raw log `/private/tmp/cyberskills-prod-cde63a58/academy-final-unit.log`.
- Required `npm run lint`: exit `1`, exactly the accepted baseline of 3 `@typescript-eslint/no-require-imports` errors in unchanged `scripts/academy-bound-worker-executor.cjs` and 16 warnings; no new finding. Raw log: `/private/tmp/cyberskills-prod-cde63a58/academy-final-lint.log`.
- `npm run build:cf`: exit `0`; workerd `11/11`, production compilation, type validation, 65 static pages and OpenNext bundle all complete. Raw log: `/private/tmp/cyberskills-prod-cde63a58/academy-final-build.log`.
- Independent review: `PASS`, no findings, on exact 9-file scope SHA-256 `2346a352a77833e68a3ca75316936648192adf4b3d4a62ad27324f0475466df7`; receipt `reports/reviews/academy-signin-loop-host-gate-independent-review-20260905.json`.
- No secret value, database, mail, Cloudflare setting, traffic, or deployment was read or changed.

## Remaining risks

- Local evidence cannot prove the deployed Worker or a real issued cookie. Deployment smoke must confirm raw host `404`, canonical Access behavior, real-cookie `/dashboard`, `/api/auth/me`, protected API denial after sign-out, and the owner-present journey.
- `ACADEMY_SERVED_HOSTS` can deliberately reopen a named raw host; release evidence must confirm it is not set except for a bounded probe.
- Lifecycle suspend/deactivate propagation and revoke-by-principal remain SEC-ACADEMY-003 and are outside this auth-loop/host slice.
