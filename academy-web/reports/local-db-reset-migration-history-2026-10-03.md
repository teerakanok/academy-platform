# Local database reset and migration history

`supabase db reset` replays the Academy migrations from an empty local database.
Migration `0035_service_activation_runtime_definer.sql` already creates
`academy_activation_writer` with `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`,
`NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`. Its following
`ALTER ROLE` repeated those same values and failed under the local Supabase
migration role, which can create the constrained role but cannot alter its
`SUPERUSER` attribute. Removing that redundant statement leaves the role's
resulting attributes and the rest of migration 0035 unchanged.

This edits the bytes of the already-applied migration file, so its source
SHA-256 changes. Supabase's migration history records applied migration
versions in `supabase_migrations.schema_migrations`; `db push` compares local
migration versions with that history and skips versions already applied. If
production already records version 0035, it will not replay this edited file,
so its previously applied database effect and migration-history row remain
unchanged. No production database was accessed or modified, and no migration
history repair was run. This statement follows the documented CLI behavior:
[Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

Round 3 adds the non-superuser local ownership path. `roles.sql`, which only
the disposable local stack executes, now pre-creates the exact constrained
`academy_activation_writer` and grants that role to the local `postgres`
migration role. Migration 0035 accepts only that exact role shape and grants
`CREATE` on schema `academy` just long enough for `OWNER TO`, then revokes it.
The final ACL is unchanged: the owner remains non-login/non-inherit and has no
schema-create privilege.

The production-consumed source SHA-256 for 0035 is
`2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4`. The
subsequent local-only source edits change the checksum recorded by a new
disposable local ledger, not an already-recorded production history row or
database object. No production database, role, migration ledger, or linked
Supabase project was accessed or changed.

The required acceptance check is a clean, isolated local Supabase reset through
the latest migration, followed by confirming `academy.course_offer` exists.
