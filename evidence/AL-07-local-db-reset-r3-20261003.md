# AL-07 local database reset evidence — round 3, 2026-10-03

Scope: source, static migration analysis, and documentation only. No production
database, Pool A role, linked Supabase project, deploy, credential, or remote
migration operation was accessed or changed.

## Change and base

- The branch merges both required source commits:
  - `cd1327e8a8637eca07d93b0dd7fec8cffb8275e9` — migration 0034 keeps its
    transition in one CLI-runnable `DO $transition$` statement.
  - `a4c3f2ccec005210fa456e6f6ee742722a4209cd` — migration 0035 removes the
    redundant `ALTER ROLE`.
- Local-only `supabase/roles.sql` now pre-creates the exact constrained
  `academy_activation_writer` and grants that role to the local non-superuser
  `postgres` migration role. Production never executes this bootstrap.
- Migration 0035 accepts only an exact pre-created constrained role (or creates
  one when absent) and temporarily grants `CREATE` on schema `academy` around
  the function `OWNER TO`, then revokes it. This addresses both PostgreSQL
  checks behind the host round-2 `must be able to SET ROLE` failure while
  preserving the reviewed final ACL.

## Production history boundary

The production-consumed 0035 source SHA-256 is
`2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4`. The new
local compatibility bytes change the checksum recorded only by a new disposable
local migration ledger. Because production already records version 0035, the
edited file is not replayed there; its recorded history row and applied objects
remain unchanged. `roles.sql` is local-only. The durable explanation is in
`academy-web/docs/local-database-reset.md` and
`academy-web/reports/local-db-reset-migration-history-2026-10-03.md`.

## Evidence states

- **Source RED PASS**: after adding the authority contract, focused
  `./node_modules/.bin/vitest run tests/unit/local-database-reset.test.ts --project unit`
  exited 1 with `1 failed | 2 passed` because `roles.sql` did not create/grant
  `academy_activation_writer`.
- **Source GREEN PASS**: `./node_modules/.bin/vitest run tests/unit/local-database-reset.test.ts tests/unit/service-activation-runtime-definer.test.ts tests/unit/identity-session-digest-migration.test.ts tests/unit/free-course-offer.test.ts --project unit`
  exited 0 — `4 files`, `15 passed`, `1 skipped`.
- **Native PASS**: scoped
  `./node_modules/.bin/eslint tests/unit/local-database-reset.test.ts tests/unit/service-activation-runtime-definer.test.ts`
  followed by `./node_modules/.bin/tsc --noEmit` exited 0.
- **Static audit PASS**: after stripping SQL line comments, migrations 0036–0040
  contain no top-level `LOCK TABLE`, `ALTER ROLE`, `SET ROLE`, or role-attribute
  keywords. The only `OWNER TO` targets are the executing `postgres` role:
  0037 function owner, 0038 `course_certificates`, and 0039 `course_settings`.
  0036 and 0040 have no `OWNER TO`. This is also enforced by the new unit
  contract. Current source hashes: roles.sql
  `4c45c725417c01f510c68efd677dc347ba4ad475c0b3d23dafbc025a3589b09f`; 0035
  `000859eda14334117b6afaa8f2191648a67f90648f32223ddf423889d715facb`.
- **Native clean-chain NOT_RUN**: this worker cannot run Docker/Supabase by the
  AL-07 revision-3 contract, so no reset or database execution is claimed.
- **Full unit sweep NOT_RUN**: unrelated known failures were already under
  AL-06 and this slice changed only migration authority/runbook contracts; the
  focused related files above passed.
- **Workspace checks PASS**: `git diff --check` exited 0, and both required base
  commits are ancestors of HEAD.

HOST-E2E (host-owned isolated non-superuser psql chain):

```sh
cd <host-isolated-r3-checkout>/academy-web/supabase &&
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f roles.sql &&
  for file in migrations/*.sql; do
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$file" || exit 1
  done &&
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "select to_regclass('academy.course_offer') as course_offer, count(*) as offer_count from academy.course_offer;"
```

Acceptance requires every command to exit 0 and the final row to show
`academy.course_offer` with `offer_count = 8`.
