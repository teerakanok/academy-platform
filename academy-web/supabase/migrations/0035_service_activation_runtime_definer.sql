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
