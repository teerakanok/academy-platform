-- Restore profile activation after the least-privilege table-write removal.
-- Outside local reset bootstrap, the dedicated owner is not a login role and is
-- not granted to a runtime, service, or operator role. roles.sql creates an
-- exact local copy and grants it only to the local postgres migration role so
-- OWNER TO can execute without superuser privileges.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'academy_activation_writer') then
    create role academy_activation_writer
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
      password null;
  elsif not exists (
    select 1 from pg_roles
     where rolname = 'academy_activation_writer'
       and rolcanlogin = false
       and rolinherit = false
       and rolsuper = false
       and rolcreatedb = false
       and rolcreaterole = false
       and rolreplication = false
       and rolbypassrls = false
  ) then
    raise exception 'activation writer role already exists with unexpected attributes; inspect collision before migration'
      using errcode = '55000';
  end if;
end
$$;

-- CREATE ROLE above already establishes these least-privilege attributes.
-- Do not restate them with ALTER ROLE: Supabase's local migration role can
-- create this constrained role but cannot alter SUPERUSER, even to say
-- NOSUPERUSER. Removing the redundant ALTER keeps local db reset working.

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

-- PostgreSQL requires the incoming function owner to have CREATE on its schema
-- for the transfer. Grant it only around the statement and leave the reviewed
-- final ACL without schema-create authority.
grant create on schema academy to academy_activation_writer;
alter function academy.sync_service_activation(uuid, text, integer)
  owner to academy_activation_writer;
revoke create on schema academy from academy_activation_writer;

revoke all on function academy.sync_service_activation(uuid, text, integer)
  from public, anon, authenticated, service_role,
    academy_entitlement_operator, academy_staff_admin;
grant execute on function academy.sync_service_activation(uuid, text, integer)
  to academy_runtime;
