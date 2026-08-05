-- Dedicated retention API capability. Bootstrap roles first with
-- ../privileged/academy-retention-api-roles.sql as database superuser.
--
-- Existing purge functions remain the policy authority. This migration adds
-- no-argument wrappers that freeze the founder-approved periods so a retention
-- capability cannot shorten data retention through a PostgREST parameter.

revoke all on schema academy from academy_retention, academy_retention_definer, academy_retention_api_anon, academy_retention_api_authenticator;
revoke all on all tables in schema academy from academy_retention, academy_retention_definer, academy_retention_api_anon, academy_retention_api_authenticator;
revoke all on all sequences in schema academy from academy_retention, academy_retention_definer, academy_retention_api_anon, academy_retention_api_authenticator;
revoke all on all functions in schema academy from academy_retention, academy_retention_definer, academy_retention_api_anon, academy_retention_api_authenticator;

grant usage on schema academy to academy_retention;
grant usage on schema academy to academy_retention_definer;

grant select, delete on academy.attempt to academy_retention_definer;
grant select on academy.node_progress, academy.attempt_appeal to academy_retention_definer;
grant select, delete on academy.leads, academy.users, academy.privacy_request,
  academy.staff_role_audit, academy.staff_role_assignment to academy_retention_definer;

-- The restricted wrapper owner may invoke the existing policy authority, but
-- the API capability itself has no execute grant on these parameterized RPCs.
-- All policy functions execute as that restricted wrapper owner, never as a
-- historical migration owner. Their fully-qualified bodies need only pg_catalog.
alter function academy.purge_expired_attempts(integer, integer)
  security invoker set search_path to pg_catalog;
alter function academy.purge_expired_leads(integer, integer)
  security invoker set search_path to pg_catalog;
alter function academy.purge_inactive_users(integer, integer)
  security invoker set search_path to pg_catalog;
alter function academy.purge_expired_privacy_requests(integer, integer)
  security invoker set search_path to pg_catalog;
alter function academy.purge_expired_staff_authorization_history(integer, integer)
  security invoker set search_path to pg_catalog;

grant execute on function academy.purge_expired_attempts(integer, integer) to academy_retention_definer;
grant execute on function academy.purge_expired_leads(integer, integer) to academy_retention_definer;
grant execute on function academy.purge_inactive_users(integer, integer) to academy_retention_definer;
grant execute on function academy.purge_expired_privacy_requests(integer, integer) to academy_retention_definer;
grant execute on function academy.purge_expired_staff_authorization_history(integer, integer) to academy_retention_definer;

-- The former shared service role must not retain a parallel deletion path.
revoke all on function academy.purge_expired_attempts(integer, integer) from service_role;
revoke all on function academy.purge_expired_leads(integer, integer) from service_role;
revoke all on function academy.purge_inactive_users(integer, integer) from service_role;
revoke all on function academy.purge_expired_privacy_requests(integer, integer) from service_role;
revoke all on function academy.purge_expired_staff_authorization_history(integer, integer) from service_role;

-- The NOLOGIN wrapper owner bypasses RLS but has explicit object grants only on
-- the rows the existing retention functions need. This preserves the Academy
-- table invariant: every table remains default-deny with no RLS policies.

create function academy.run_retention_attempts() returns integer
language sql security definer set search_path to pg_catalog
as $$ select academy.purge_expired_attempts(90, 5000) $$;

create function academy.run_retention_leads() returns integer
language sql security definer set search_path to pg_catalog
as $$ select academy.purge_expired_leads(3, 5000) $$;

create function academy.run_retention_inactive_users() returns integer
language sql security definer set search_path to pg_catalog
as $$ select academy.purge_inactive_users(2, 500) $$;

create function academy.run_retention_privacy_requests() returns integer
language sql security definer set search_path to pg_catalog
as $$ select academy.purge_expired_privacy_requests(3, 500) $$;

create function academy.run_retention_staff_authorization_history() returns integer
language sql security definer set search_path to pg_catalog
as $$ select academy.purge_expired_staff_authorization_history(3, 500) $$;

revoke all on function academy.run_retention_attempts() from public, anon, authenticated, service_role;
revoke all on function academy.run_retention_leads() from public, anon, authenticated, service_role;
revoke all on function academy.run_retention_inactive_users() from public, anon, authenticated, service_role;
revoke all on function academy.run_retention_privacy_requests() from public, anon, authenticated, service_role;
revoke all on function academy.run_retention_staff_authorization_history() from public, anon, authenticated, service_role;
