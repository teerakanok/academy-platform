# Academy production checkpoint — 2026-09-05

Source `c5a169b9e567507b1788b6052bfad1e56c325f8e`, branch `impl/production-cde63a58-academy`.
Candidate/active version `6c2e3881-4836-4bee-8bd1-b6e5368b6def` (`release-c5a169b9e567`), 100% traffic.
Previous version `d4717406-58be-43b4-87bb-bc1be260ecdd` is retained as rollback target.

Independent code review PASS; all 9 reviewed file hashes still matched after commit.
Unit 2,135/2,135 passed; build:cf exit 0; lint only accepted baseline 3 errors/16 warnings.
See `reports/reviews/academy-signin-loop-host-gate-independent-review-20260905.json`.

## Executed release path

1. `npm run build:cf` — exit 0, workerd checks and OpenNext build complete.
2. `wrangler versions upload --name cyberskills-academy --keep-vars --tag release-c5a169b9e567` with source message — exit 0, version above returned.
3. `wrangler versions deploy d4717406-58be-43b4-87bb-bc1be260ecdd@100 6c2e3881-4836-4bee-8bd1-b6e5368b6def@0 --name cyberskills-academy --yes` with split message — exit 0.
4. GET smoke with `Cloudflare-Workers-Version-Overrides: cyberskills-academy="6c2e3881-4836-4bee-8bd1-b6e5368b6def"`: raw root 404 (old version without override 200), canonical root/sign-in 302 Access, robots 200.
5. `wrangler versions deploy 6c2e3881-4836-4bee-8bd1-b6e5368b6def@100 --name cyberskills-academy --yes` with activation message — exit 0, 100% confirmed by CLI.

This repeats the real split/override path recorded in `reports/sessions/academy-production-readiness-2026-09-03.md`.
The Worker exports a Durable Object, so preview URL generation is unavailable; no preview hostname was invented.
No runtime secret, DB, or Access policy was changed. Metadata was reduced to binding names only;
`ACADEMY_SERVED_HOSTS` override was absent in the serving predecessor and uploaded candidate.

## Observed after activation, without override or cookies

| GET | Result |
|---|---|
| raw workers.dev `/`, `/courses`, `/api/leads` | 404, body 0 bytes, cache-control: no-store |
| canonical root | 302, text/html (Access) |
| canonical robots.txt | 200, text/plain |
| canonical api/auth/me | 302, text/html (Access; not an application auth result) |

All curl commands exited 0. Host bypass is closed for these observed paths.
Authenticated sign-in/session/entitlement/progress/sign-out remain PENDING, not proved by the GET checks.
Safari UI automation refused actions because the user was actively changing the app; no OTP was sent.
Owner was asked to complete the real dashboard journey in their browser without sharing OTP in chat.
Other product/security/content work continues independently. Do not replace this version with a content release while that journey is pending.

No live authority is carried by this record into another session.
