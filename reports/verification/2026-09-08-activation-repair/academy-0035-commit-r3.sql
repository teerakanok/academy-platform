BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('academy:migration:0035',0));
DO $guard$ BEGIN
IF current_database()<>'postgres' THEN RAISE EXCEPTION 'wrong database'; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RAISE EXCEPTION 'operator lacks verified capability'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.sync_service_activation(uuid,text,integer)'::regprocedure AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig IS NULL AND md5(prosrc)='cf1feed0de1a4fd0f9480ae07cebc4b9' AND proacl::text='{postgres=X/postgres,academy_runtime=X/postgres}') THEN RAISE EXCEPTION 'function baseline drift'; END IF;
IF EXISTS (SELECT FROM pg_roles WHERE rolname='academy_activation_writer') OR EXISTS (SELECT FROM pg_policy WHERE polrelid='academy.service_activation'::regclass AND polname='academy_service_activation_sync_writer') THEN RAISE EXCEPTION '0035 collision'; END IF;
IF NOT has_function_privilege('academy_runtime','academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)','execute') THEN RAISE EXCEPTION '0034 runtime baseline missing'; END IF;
IF has_table_privilege('academy_runtime','academy.service_activation','INSERT') OR has_table_privilege('academy_runtime','academy.service_activation','UPDATE') THEN RAISE EXCEPTION 'runtime boundary drift'; END IF;
IF NOT EXISTS (SELECT FROM pg_class WHERE oid='academy.service_activation'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'activation RLS state drift'; END IF;
END $guard$;
-- Restore profile activation after the least-privilege table-write removal.
-- The dedicated owner is not a login role and is never granted to another role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'academy_activation_writer') then
    raise exception 'activation writer role already exists; inspect collision before migration'
      using errcode = '55000';
  end if;
  create role academy_activation_writer
    nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
    password null;
end
$$;

alter role academy_activation_writer
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant usage on schema academy to academy_activation_writer;
grant select, insert, update on academy.service_activation
  to academy_activation_writer;

-- Academy authorization tables are default-deny under RLS. Restrict this
-- writer policy to the dedicated function-owner role; runtime keeps no ACL.
create policy academy_service_activation_sync_writer
  on academy.service_activation
  for all
  to academy_activation_writer
  using (true)
  with check (true);

alter function academy.sync_service_activation(uuid, text, integer)
  security definer
  set search_path = pg_catalog, academy;
alter function academy.sync_service_activation(uuid, text, integer)
  owner to academy_activation_writer;

revoke all on function academy.sync_service_activation(uuid, text, integer)
  from public, anon, authenticated, service_role,
    academy_entitlement_operator, academy_staff_admin;
grant execute on function academy.sync_service_activation(uuid, text, integer)
  to academy_runtime;
DO $verify$ BEGIN
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.sync_service_activation(uuid,text,integer)'::regprocedure AND proowner='academy_activation_writer'::regrole AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='cf1feed0de1a4fd0f9480ae07cebc4b9') THEN RAISE EXCEPTION 'function postcondition'; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='academy_activation_writer' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'role postcondition'; END IF;
IF EXISTS (SELECT FROM pg_auth_members WHERE roleid='academy_activation_writer'::regrole OR member='academy_activation_writer'::regrole) THEN RAISE EXCEPTION 'role membership'; END IF;
IF NOT has_function_privilege('academy_runtime','academy.sync_service_activation(uuid,text,integer)','execute') OR has_function_privilege('service_role','academy.sync_service_activation(uuid,text,integer)','execute') THEN RAISE EXCEPTION 'RPC execute boundary'; END IF;
IF has_table_privilege('academy_runtime','academy.service_activation','INSERT') OR has_table_privilege('academy_runtime','academy.service_activation','UPDATE') OR has_table_privilege('academy_runtime','academy.course_entitlement','INSERT') OR has_table_privilege('academy_runtime','academy.staff_role_assignment','INSERT') THEN RAISE EXCEPTION 'runtime direct privilege'; END IF;
IF NOT has_table_privilege('academy_activation_writer','academy.service_activation','SELECT') OR NOT has_table_privilege('academy_activation_writer','academy.service_activation','INSERT') OR NOT has_table_privilege('academy_activation_writer','academy.service_activation','UPDATE') OR has_table_privilege('academy_activation_writer','academy.service_activation','DELETE') OR has_table_privilege('academy_activation_writer','academy.course_entitlement','INSERT') OR has_table_privilege('academy_activation_writer','academy.staff_role_assignment','INSERT') THEN RAISE EXCEPTION 'writer privilege'; END IF;
IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='academy.service_activation'::regclass AND polname='academy_service_activation_sync_writer' AND polroles=ARRAY['academy_activation_writer'::regrole::oid] AND polcmd='*' AND polpermissive AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') THEN RAISE EXCEPTION 'writer policy'; END IF;
IF NOT EXISTS (SELECT FROM pg_class WHERE oid='academy.service_activation'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'activation RLS state drift'; END IF;
END $verify$;
COMMIT;
SELECT 'ACADEMY_0035_COMMITTED';
