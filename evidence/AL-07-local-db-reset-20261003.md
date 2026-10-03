# AL-07 local database reset evidence — 2026-10-03

Scope: local migration source and disposable local stack only. No production
database, Pool A role, deploy, credential, or remote Supabase command was
touched.

## Change and history boundary

- Cause: `0034_identity_session_id_digest.sql` used a top-level `LOCK TABLE`.
  The production cutover wrapper supplied a transaction, but Supabase CLI runs
  ordinary migration statements separately, so a clean local reset failed before
  migrations 0035–0040.
- Fix: retain the original fail-fast reapplication check, then execute the
  second marker check, exclusive table locks, collision check, both data
  conversions, and marker insert in one tagged `DO $transition$` statement.
  PostgreSQL treats that statement as one transaction under Supabase CLI, so no
  caller-owned `BEGIN`/`COMMIT` is required.
- Source SHA-256 before: `6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0`.
- Source SHA-256 after: `4b386f21237efc42ef49e5201e92b9188bc11febf5774d2ca88c1ba56ae29df4`.
- Production history: unchanged. The production cutover consumed the original
  immutable packet and left its marker; this source edit changes only future
  disposable-local checksums and must not be replayed to Pool A. The complete
  policy is in `academy-web/docs/local-database-reset.md`.

## Evidence states

- **Source RED → GREEN PASS**: from `academy-web`, the new focused contract in
  `tests/unit/identity-session-digest-migration.test.ts` first failed as expected
  because `$transition$` did not exist (`1 failed / 1 passed / 1 skipped`). After
  the migration change, the focused file passed (`2 passed / 1 skipped`; the real
  PostgreSQL case remains environment-gated).
- **Source PASS**: `npm run test:unit -- tests/unit/identity-session-digest-migration.test.ts tests/unit/local-database-reset.test.ts`
  exited 0 — 2 files, `3 passed / 1 skipped`.
- **Related source PASS**: `npm run test:unit -- tests/unit/identity-session-digest-migration.test.ts tests/unit/local-database-reset.test.ts tests/unit/identity-postgres-transaction-store.test.ts tests/unit/free-course-offer.test.ts`
  exited 0 — 4 files, `39 passed / 2 skipped`.
- **Native PASS**: scoped ESLint on both changed/new test files exited 0, and
  `./node_modules/.bin/tsc --noEmit` exited 0.
- **Native unrelated FAIL**: full `npm run test:unit` exited 1 with `14 failed /
  3148 passed / 2 skipped`. The failures are outside this slice (notably missing
  `/private/tmp/identity-security-correction-cde63a58/...` fixtures, an
  adversarial-script timeout, public-lesson serialization, and sign-out payload);
  the focused and related migration/offer files passed.
- **Local Supabase E2E BLOCKED in worker sandbox**: with `HOME` redirected for
  CLI telemetry, Supabase CLI `2.117.0` reached reset preflight and exited 1:
  `LegacyLocalDbRunningError — Cannot connect to the Docker daemon at
  unix:///var/run/docker.sock`. This is a sandbox/tool prerequisite failure, not
  a migration result.

HOST-E2E (local-only, clean stack):

```bash
cd /Users/teerakanok/Dev/continuations/academy-first-launch-glm-3/academy-web &&
  /opt/homebrew/bin/supabase stop --no-backup &&
  /opt/homebrew/bin/supabase start &&
  /opt/homebrew/bin/supabase db reset --local --no-seed &&
  /opt/homebrew/bin/supabase db psql --local --command="select to_regclass('academy.course_offer') as course_offer, count(*) as offer_count from academy.course_offer;"
```

Expected final query: `course_offer = academy.course_offer` and `offer_count = 8`.
