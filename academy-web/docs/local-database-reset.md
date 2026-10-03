# Local Academy database reset

This page is for a disposable Supabase stack on the developer's machine. It
never authorizes `--linked`, remote reset, remote push, or any Pool A operation.

## Create a clean local database

Run from `academy-web/` with Docker running:

```bash
supabase start
supabase db reset --local --no-seed
```

On a first boot, PostgREST can report `503` until the reset creates the
configured `academy` schema. If that happens, finish the reset and restart the
local stack; do not point the command at a remote project.

Confirm that the complete chain, including the database authority for free
self-enrolment, exists:

```bash
supabase db psql --local --command="select to_regclass('academy.course_offer') as course_offer, count(*) as offer_count from academy.course_offer;"
```

The expected relation is `academy.course_offer`; the current reviewed seed has
eight free offers. The local migration ledger can also be inspected with:

```sql
select version, name
from supabase_migrations."schema-migrations"
order by version desc;
```

## Migration 0034 checksum and production history

`0034_identity_session_id_digest.sql` originally used a top-level `LOCK TABLE`.
That is valid under the production cutover wrapper's transaction, but Supabase
CLI executes migration statements individually, so a clean local reset stopped
with `LOCK TABLE can only be used in transaction blocks`. The source now keeps
the reapplication guard, exclusive locks, collision check, both data
conversions, and completion marker together in one `$transition$` `DO` block.
The successful transition effect is unchanged; a direct local execution now
gets the same atomic boundary without requiring a caller-owned transaction.

This intentionally changes the source-file checksum for local replay. A clean
local reset rebuilds its disposable Supabase migration ledger and records the
new checksum there. It does not mutate production history or the production
`academy.identity_session_id_digest_transition` marker: Pool A migration 0034
was consumed by the immutable reviewed cutover packet at source SHA-256
`6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0`, and that
migration must not be re-applied. Future Pool A changes continue through the
canonical owner and reviewed migration workflow. Never reconcile this checksum
divergence by linking this checkout or replaying 0034.

## Migration 0035 local ownership and production history

The local Supabase migration role is not a superuser. PostgreSQL therefore
requires it to be a member of `academy_activation_writer` before migration 0035
can transfer `academy.sync_service_activation` to that owner, and the incoming
owner needs `CREATE` on schema `academy` at the instant of the function-owner
transfer. `supabase/roles.sql` now creates the same constrained owner for a
disposable local stack and grants it only to the local `postgres` migration
role. Migration 0035 accepts that exact pre-created role and grants
`CREATE` on the schema only around `OWNER TO`, revoking it immediately
afterward. The reviewed final role attributes, table/function grants, and
runtime boundary are unchanged.

Production does not execute `roles.sql`. Its recorded migration 0035 was
consumed at source SHA-256
`2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4`;
this local compatibility edit changes only the source checksum for a new
disposable ledger and must not be replayed or reconciled against Pool A.
