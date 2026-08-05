-- Local migration compatibility roles. Never use this file as a production
-- bootstrap or include it in a remote role deployment.
--
-- Supabase CLI runs this file before migrations with a role that can create
-- roles but cannot grant BYPASSRLS. These placeholders let the normal local
-- stack apply the Academy grants. The dedicated API's privileged roles remain
-- defined and rehearsed separately under ./privileged/ as production requires.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'academy_runtime') then
    create role academy_runtime nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_api_anon') then
    create role academy_api_anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_api_authenticator') then
    create role academy_api_authenticator nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention') then
    create role academy_retention nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_definer') then
    create role academy_retention_definer nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_api_anon') then
    create role academy_retention_api_anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'academy_retention_api_authenticator') then
    create role academy_retention_api_authenticator nologin noinherit;
  end if;
end
$$;

grant academy_runtime to academy_api_authenticator;
grant academy_api_anon to academy_api_authenticator;
grant academy_retention to academy_retention_api_authenticator;
grant academy_retention_api_anon to academy_retention_api_authenticator;
