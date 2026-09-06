-- Least-privilege runtime and audited manual course entitlement operations.
-- The callback session RPC and Identity lifecycle activation RPC remain live;
-- direct writes to authorization tables do not.

-- This migration introduces one new role; never adopt a pre-existing name.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'academy_entitlement_operator') then
    raise exception 'operator role already exists; inspect collision before migration' using errcode = '55000';
  end if;
  -- The staff role must still match its non-login migration-0018 boundary.
  -- Inspect only whether a password exists, never its value.
  if not exists (
    select 1 from pg_authid r
    where r.rolname = 'academy_staff_admin'
      and not (r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb
        or r.rolcreaterole or r.rolreplication or r.rolbypassrls)
      and r.rolpassword is null
      and not exists (select 1 from pg_auth_members m where m.member = r.oid)
      and not exists (
        select 1 from pg_auth_members m join pg_roles member_role on member_role.oid = m.member
        where m.roleid = r.oid and member_role.rolname <> 'postgres'
      )
      and not exists (
        select 1 from pg_shdepend d where d.refclassid = 'pg_authid'::regclass
          and d.refobjid = r.oid and d.deptype = 'o'
      )
  ) then
    raise exception 'unexpected staff administrator role state; inspect before migration' using errcode = '55000';
  end if;
  create role academy_entitlement_operator
    login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
end
$$;

alter role academy_staff_admin login;

-- Migration 0018 granted the shared Pool A service role and migration postgres
-- operator broader Academy control-plane access than the dedicated boundary needs.
revoke all on academy.staff_role_assignment from service_role;
revoke all on academy.staff_role_audit from service_role;
revoke execute on function academy.has_staff_role(uuid, text) from service_role;
revoke execute on function academy.purge_expired_staff_authorization_history(int, int) from service_role;
revoke academy_staff_admin from postgres;

-- Existing runtime callbacks use the session RPC. Service activation is
-- synchronized only through its monotonic RPC, never a table write.
revoke insert, update, delete on academy.service_activation from academy_runtime, service_role;
revoke insert, update, delete on academy.course_entitlement from academy_runtime, service_role;
revoke all on academy.service_activation from service_role;
revoke all on academy.course_entitlement from service_role;
revoke execute on function academy.has_course_entitlement(uuid, text) from service_role;
revoke execute on function academy.sync_service_activation(uuid, text, integer) from service_role;

create table academy.course_entitlement_audit (
  event_id bigint generated always as identity primary key,
  account_id uuid not null references academy.users(id) on delete cascade,
  course_slug text not null,
  action text not null check (action in ('granted', 'revoked')),
  source text not null check (source in ('invitation', 'grant')),
  expires_at timestamptz,
  actor_account_id uuid not null references academy.users(id),
  authorization_reference text not null check (char_length(btrim(authorization_reference)) between 8 and 120),
  occurred_at timestamptz not null default now()
);

alter table academy.course_entitlement_audit enable row level security;
create index course_entitlement_audit_account_idx on academy.course_entitlement_audit(account_id, occurred_at);

create or replace function academy.resolve_entitlement_account(
  p_issuer text,
  p_subject text,
  p_email_hint text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_account_id uuid;
  v_email_hint text;
begin
  if p_issuer is null or char_length(p_issuer) not between 8 and 2048
     or p_subject is null or p_subject !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_email_hint is not null
       and (char_length(p_email_hint) not between 3 and 320
            or p_email_hint <> lower(btrim(p_email_hint))
            or p_email_hint !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  then
    raise exception 'invalid entitlement identity input' using errcode = '22023';
  end if;

  select id into v_account_id
    from academy.users
   where issuer = p_issuer and subject = p_subject;
  if not found then
    raise exception 'canonical identity did not resolve to exactly one Academy account' using errcode = 'P0002';
  end if;

  if p_email_hint is not null then
    select lower(email) into v_email_hint from academy.users where id = v_account_id;
    if v_email_hint is distinct from p_email_hint then
      raise exception 'email hint did not match canonical identity' using errcode = '42501';
    end if;
  end if;

  return v_account_id;
end;
$$;

create or replace function academy.resolve_staff_account(
  p_issuer text,
  p_subject text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_account_id uuid;
begin
  if p_issuer is null or char_length(p_issuer) not between 8 and 2048
     or p_subject is null or char_length(btrim(p_subject)) not between 1 and 255
  then
    raise exception 'invalid staff identity input' using errcode = '22023';
  end if;

  select id into v_account_id
    from academy.users
   where issuer = p_issuer and subject = btrim(p_subject);
  if not found then
    raise exception 'staff identity did not resolve to exactly one Academy account' using errcode = 'P0002';
  end if;

  return v_account_id;
end;
$$;

create or replace function academy.set_course_entitlement(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_course_slug text,
  p_enabled boolean,
  p_source text,
  p_expires_at timestamptz,
  p_authorization_reference text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_existing academy.course_entitlement%rowtype;
  v_audit_source text;
  v_audit_expires_at timestamptz;
  v_changed boolean := false;
begin
  if p_actor_account_id is null or p_target_account_id is null
     or p_enabled is null
     or p_course_slug is null
     or p_course_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
     or p_source not in ('invitation', 'grant')
     or p_expires_at is not null and p_expires_at <= now()
     or p_authorization_reference is null
     or char_length(btrim(p_authorization_reference)) not between 8 and 120
  then
    raise exception 'invalid course entitlement input' using errcode = '22023';
  end if;
  -- Serialize authorization with owner grants/revocations before observing membership.
  perform pg_advisory_xact_lock(hashtextextended('academy.staff_role_assignment', 0));
  if not academy.has_staff_role(p_actor_account_id, 'owner') then
    raise exception 'owner staff role required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('academy.course_entitlement:' || p_target_account_id::text || ':' || p_course_slug, 0)
  );
  select * into v_existing
    from academy.course_entitlement
   where user_id = p_target_account_id and course_slug = p_course_slug
   for update;

  if p_enabled then
    if v_existing.user_id is null
       or v_existing.revoked_at is not null
       or v_existing.source is distinct from p_source
       or v_existing.expires_at is distinct from p_expires_at
    then
      insert into academy.course_entitlement(user_id, course_slug, source, granted_at, expires_at, revoked_at)
      values (p_target_account_id, p_course_slug, p_source, now(), p_expires_at, null)
      on conflict (user_id, course_slug) do update set
        source = excluded.source,
        granted_at = case when course_entitlement.revoked_at is null then course_entitlement.granted_at else excluded.granted_at end,
        expires_at = excluded.expires_at,
        revoked_at = null;
      v_changed := true;
    end if;
    v_audit_source := p_source;
    v_audit_expires_at := p_expires_at;
  elsif v_existing.user_id is not null and v_existing.revoked_at is null then
    update academy.course_entitlement
       set revoked_at = now()
    where user_id = p_target_account_id and course_slug = p_course_slug;
    v_changed := true;
    v_audit_source := v_existing.source;
    v_audit_expires_at := v_existing.expires_at;
  end if;

  if v_changed then
    insert into academy.course_entitlement_audit(
      account_id, course_slug, action, source, expires_at,
      actor_account_id, authorization_reference
    ) values (
      p_target_account_id, p_course_slug, case when p_enabled then 'granted' else 'revoked' end,
      v_audit_source, v_audit_expires_at, p_actor_account_id, btrim(p_authorization_reference)
    );
  end if;

  return v_changed;
end;
$$;

create or replace function academy.inspect_staff_role(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_role text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_active boolean;
  v_last_audit_reference text;
begin
  if p_actor_account_id is null or p_target_account_id is null
     or p_role not in ('owner', 'learner-support', 'privacy-officer', 'content-ops')
  then
    raise exception 'invalid staff role inspection input' using errcode = '22023';
  end if;

  select revoked_at is null into v_active
    from academy.staff_role_assignment
   where account_id = p_target_account_id and role = p_role;
  select authorization_reference into v_last_audit_reference
    from academy.staff_role_audit
   where account_id = p_target_account_id and role = p_role
   order by event_id desc limit 1;

  return jsonb_build_object(
    'actorAuthorized', academy.has_staff_role(p_actor_account_id, 'owner'),
    'active', v_active = true,
    'lastAuditReference', v_last_audit_reference
  );
end;
$$;

create or replace function academy.inspect_course_entitlement(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_course_slug text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if p_actor_account_id is null or p_target_account_id is null
     or p_course_slug is null or p_course_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
  then
    raise exception 'invalid course entitlement inspection input' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'actorAuthorized', academy.has_staff_role(p_actor_account_id, 'owner'),
    'active', academy.has_course_entitlement(p_target_account_id, p_course_slug)
  );
end;
$$;

comment on table academy.course_entitlement_audit is
  'Append-only manual course entitlement decisions; rows are written only by the owner-authorized RPC';
comment on function academy.resolve_entitlement_account(text, text, text) is
  'Resolve a canonical issuer/subject pair for the dedicated entitlement operator; email is a verification hint only';
comment on function academy.resolve_staff_account(text, text) is
  'Resolve a canonical issuer/subject pair for the dedicated staff operator without exposing account tables';
comment on function academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text) is
  'Idempotently grant or revoke one course scope through an owner actor, with a bounded reference and durable audit';
comment on function academy.inspect_course_entitlement(uuid, uuid, text) is
  'Return operator dry-run authorization and active-scope state without mutation';

revoke all on academy.course_entitlement_audit
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;
revoke all on function academy.resolve_entitlement_account(text, text, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;
revoke all on function academy.resolve_staff_account(text, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_entitlement_operator;
revoke all on function academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;
revoke all on function academy.inspect_staff_role(uuid, uuid, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_entitlement_operator;
revoke all on function academy.inspect_course_entitlement(uuid, uuid, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;

grant usage on schema academy to academy_entitlement_operator;
grant usage on schema academy to academy_staff_admin;
grant execute on function academy.resolve_staff_account(text, text)
  to academy_staff_admin;
grant execute on function academy.inspect_staff_role(uuid, uuid, text)
  to academy_staff_admin;
grant execute on function academy.resolve_entitlement_account(text, text, text)
  to academy_entitlement_operator;
grant execute on function academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)
  to academy_entitlement_operator;
grant execute on function academy.inspect_course_entitlement(uuid, uuid, text)
  to academy_entitlement_operator;

-- Preserve the two live production runtime contracts named by the review:
-- callback session creation and monotonic Identity service activation.
grant execute on function academy.sync_service_activation(uuid, text, integer)
  to academy_runtime;
grant execute on function academy.create_identity_session(text, text, text, text, text, bigint, integer)
  to academy_runtime;
