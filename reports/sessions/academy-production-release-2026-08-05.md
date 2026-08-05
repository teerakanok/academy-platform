# Academy production release evidence — 2026-08-05

## Scope

- Production Pool A database `postgres`; writes limited to schema `academy`, global
  NOLOGIN role `academy_staff_admin`, and shared `PGRST_DB_SCHEMAS` configuration.
- Cloudflare Worker `cyberskills-academy`; private R2 binding and media signing secret.
- Auth/runtime database credentials remain intentionally out of scope.

## Backup and rollback

- Server backup: `/root/academy-db-backups/20260805T073146Z` (mode `700`; files `600`).
- Schema-only custom dump: 665,160 bytes, 1,541 readable restore entries,
  SHA-256 `e13ce164a25917cca9f4f9007071cb30ce7fdb63a4d1acb50e162680abb0e45c`.
- Roles-only dump: 8,042 bytes,
  SHA-256 `37dbbf474ba2deb05b41fcb7e6a604a8625f1b46731df90fcccd45cabcbb2c92`.
- Pre-change Supabase `.env` and pre-PostgREST-edit `.env` are retained in the same
  access-controlled backup directory. Their contents were not printed or copied locally.
- Migration SQL release: `/root/academy-releases/20260805T073146Z`; all 18 server hashes
  matched the tracked local files before execution.
- Rollback was dry-validated without persisting a rollback: the saved `.env` reproduced
  the current file by adding only `academy`; `DROP SCHEMA academy CASCADE`, membership
  revoke, and `DROP ROLE academy_staff_admin` completed inside a bounded transaction that
  ended with `ROLLBACK`; the Academy schema and role both remained present afterward.
- Exact rollback order is: restore `supabase.env.pre-pgrst` to the canonical `.env`, run
  `docker compose up -d --no-deps rest`, drop schema `academy`, revoke
  `academy_staff_admin` from `postgres`, drop that NOLOGIN role, then verify the `public`
  and pre-existing product profiles before declaring recovery complete.

## Database result

- Migrations `0001`–`0018` committed in one `BEGIN`/`COMMIT` with `ON_ERROR_STOP`.
- `academy`: 13 base tables, 1 view, 28 functions, zero base tables without RLS.
- `academy_staff_admin`: NOLOGIN; membership granted only to the migration operator
  required by the tracked staff bootstrap contract.
- PostgREST `academy` profile returned HTTP 200; a nonexistent profile returned HTTP 406
  with `PGRST106`.
- With the production anon identity, an Academy table read and a read-only Academy RPC
  were both denied with HTTP 401 / SQLSTATE `42501`. The pre-existing `public` and `helm`
  profiles both continued to return HTTP 200.
- Only `supabase-rest` was recreated; no other running container ID changed and the
  database remained healthy.

## Worker result

- Active version: `566b1d4e-ed2e-434e-9ca6-3a66282fadfb`.
- URL: `https://cyberskills-academy.songpon-te.workers.dev`.
- Remote secret inventory contains only `MEDIA_SIGNING_SECRET`; local `.dev.vars` and
  `.env.local` were removed from the build/deploy environment and restored mode `600`.
- `/`, `/courses`, `/sign-in`, and `/robots.txt` returned HTTP 200.
- All five registered legacy MP4/VTT/PDF paths returned HTTP 404 twice after propagation.
- A tampered `/course-media/` grant returned HTTP 404.

## Checkpoint review

- Code/debt: C0/H0/M0/L0 after deriving regression cases from all five registry assets
  and preserving the public SVG pass-through; focused tests 15/15.
- Security: C0/H0/M0/L0 after production anon denial, pre-existing profile, and bounded
  rollback-rehearsal evidence closed the initial findings.
- UX/premium: C0/H0/M0/L1, PASS. Visual N/A because the production diff changes no
  DOM/CSS/layout. The owned Low and its closure trigger are recorded below.

## Open gates

- `academy.users=0` and active owner count is zero. Bootstrap requires the founder's real
  `(issuer, subject)` after first sign-in; email or an invented UUID is not acceptable.
- The Worker intentionally has no Supabase URL, anon key, or service-role key. Auth remains
  closed and the scheduled retention handler is not operational until a least-privilege
  Academy credential is designed and verified against cross-schema denial.
- Public launch still requires the rate-limit/log-redaction, restricted case-system,
  legal-review, and exposure decisions listed in `plans/active_plan.md`.
- Owned UX low: Academy frontend must hide or reframe the stale “By continuing…” copy in
  the auth-closed sign-in state before account launch, then rerun closed-state E2E/visual
  verification. It does not create a dead end in the current closed-account release.
