-- Disposable local test-stack setup only. This function must never be applied
-- to a production database. psql supplies retention_test_database_id with -v.

begin;

alter database postgres set academy.retention_test_database_id to :'retention_test_database_id';

create or replace function academy.retention_test_database_identity()
returns text
language sql
security invoker
set search_path to pg_catalog
as $$ select current_setting('academy.retention_test_database_id', true) $$;

revoke all on function academy.retention_test_database_identity() from public, anon, authenticated, service_role;
grant execute on function academy.retention_test_database_identity() to academy_retention;

commit;
