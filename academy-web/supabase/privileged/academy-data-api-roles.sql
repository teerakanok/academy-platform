-- Privileged role bootstrap for the dedicated Academy PostgREST API.
--
-- Execute only as the database superuser before migration 0019. Supabase's
-- normal migration runner intentionally cannot create a BYPASSRLS role.
-- This script never sets a password on an existing authenticator role; that
-- password is host-only operational state.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'academy_runtime') then
    create role academy_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_api_anon') then
    create role academy_api_anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_api_authenticator') then
    create role academy_api_authenticator login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
  end if;
end
$$;

alter role academy_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
alter role academy_api_anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role academy_api_authenticator login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant academy_runtime to academy_api_authenticator;
grant academy_api_anon to academy_api_authenticator;

-- NOINHERIT does not prevent SET ROLE. Do not silently continue when an
-- operator has introduced another membership on either side of this boundary.
do $$
begin
  if exists (
    select 1
      from pg_auth_members membership
      join pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_roles member_role on member_role.oid = membership.member
     where (granted_role.rolname in ('academy_runtime', 'academy_api_anon', 'academy_api_authenticator')
         or member_role.rolname in ('academy_runtime', 'academy_api_anon', 'academy_api_authenticator'))
       and not (
         (granted_role.rolname = 'academy_runtime' and member_role.rolname = 'academy_api_authenticator')
         or (granted_role.rolname = 'academy_api_anon' and member_role.rolname = 'academy_api_authenticator')
       )
  ) then
    raise exception 'Academy data API role boundary has unexpected membership';
  end if;
end
$$;

comment on role academy_runtime is
  'Trusted Academy backend role for dedicated PostgREST only; BYPASSRLS with explicit Academy object allowlist';
comment on role academy_api_authenticator is
  'LOGIN role for dedicated Academy PostgREST; password provisioned host-side and may SET ROLE only to Academy roles';
comment on role academy_api_anon is
  'Default-deny anonymous role for dedicated Academy PostgREST';

commit;
