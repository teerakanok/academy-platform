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

The required acceptance check is a clean, isolated local Supabase reset through
the latest migration, followed by confirming `academy.course_offer` exists.
