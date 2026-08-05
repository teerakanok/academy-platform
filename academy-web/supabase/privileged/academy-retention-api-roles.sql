-- Privileged role bootstrap for the isolated Academy retention API.
--
-- Run as database superuser before migration 0020. The authenticator password
-- is host-only state and is deliberately never set or printed by this script.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'academy_retention') then
    create role academy_retention nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_definer') then
    create role academy_retention_definer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_api_anon') then
    create role academy_retention_api_anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_api_authenticator') then
    create role academy_retention_api_authenticator login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
  end if;
end
$$;

alter role academy_retention nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role academy_retention_definer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
alter role academy_retention_api_anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role academy_retention_api_authenticator login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant academy_retention to academy_retention_api_authenticator;
grant academy_retention_api_anon to academy_retention_api_authenticator;

-- Fail closed on any membership that would widen either side of this API.
do $$
begin
  if exists (
    select 1
      from pg_auth_members membership
      join pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_roles member_role on member_role.oid = membership.member
     where (granted_role.rolname in ('academy_retention', 'academy_retention_definer', 'academy_retention_api_anon', 'academy_retention_api_authenticator')
         or member_role.rolname in ('academy_retention', 'academy_retention_definer', 'academy_retention_api_anon', 'academy_retention_api_authenticator'))
       and not (
         (granted_role.rolname = 'academy_retention' and member_role.rolname = 'academy_retention_api_authenticator')
         or (granted_role.rolname = 'academy_retention_api_anon' and member_role.rolname = 'academy_retention_api_authenticator')
       )
  ) then
    raise exception 'Academy retention API role boundary has unexpected membership';
  end if;
end
$$;

comment on role academy_retention is
  'Dedicated Academy retention capability: execute-only access to bounded purge functions';
comment on role academy_retention_definer is
  'NOLOGIN BYPASSRLS owner for fixed Academy retention wrappers; explicit Academy object grants only and no API authenticator membership';
comment on role academy_retention_api_authenticator is
  'LOGIN role for dedicated Academy retention PostgREST; password is provisioned host-side';
comment on role academy_retention_api_anon is
  'Default-deny anonymous role for dedicated Academy retention PostgREST';

commit;
