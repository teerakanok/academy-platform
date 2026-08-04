-- Academy staff authorization v1: explicit roles, owner-controlled changes, audited.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'academy_staff_admin') then
    create role academy_staff_admin nologin noinherit;
  end if;
end
$$;

create table academy.staff_role_assignment (
  account_id uuid not null references academy.users(id) on delete cascade,
  role text not null check (role in ('owner', 'learner-support', 'privacy-officer', 'content-ops')),
  granted_at timestamptz not null default now(),
  granted_by uuid not null,
  revoked_at timestamptz,
  revoked_by uuid,
  primary key (account_id, role),
  constraint staff_role_revocation_complete check (
    (revoked_at is null and revoked_by is null) or
    (revoked_at is not null and revoked_by is not null)
  )
);

create table academy.staff_role_audit (
  event_id bigint generated always as identity primary key,
  account_id uuid not null,
  role text not null check (role in ('owner', 'learner-support', 'privacy-officer', 'content-ops')),
  action text not null check (action in ('granted', 'revoked')),
  actor_account_id uuid not null,
  authorization_reference text not null check (char_length(btrim(authorization_reference)) between 8 and 120),
  occurred_at timestamptz not null default now()
);

alter table academy.staff_role_assignment enable row level security;
alter table academy.staff_role_audit enable row level security;

create or replace function academy.purge_inactive_users(
  p_inactive_years int default 2,
  p_limit int default 500
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  if p_inactive_years < 1 or p_inactive_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid account retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select u.id
      from academy.users u
     where u.last_seen_at < now() - make_interval(years => p_inactive_years)
       and not exists (
         select 1 from academy.attempt_appeal ap
          where ap.user_id = u.id and ap.resolved_at is null
       )
       and not exists (
         select 1 from academy.staff_role_assignment sr
          where sr.account_id = u.id and sr.revoked_at is null
       )
     order by u.last_seen_at
     limit p_limit
  )
  delete from academy.users u
   using doomed d
   where u.id = d.id
     and u.last_seen_at < now() - make_interval(years => p_inactive_years)
     and not exists (
       select 1 from academy.attempt_appeal ap
        where ap.user_id = u.id and ap.resolved_at is null
     )
     and not exists (
       select 1 from academy.staff_role_assignment sr
        where sr.account_id = u.id and sr.revoked_at is null
     );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function academy.purge_inactive_users is
  'Delete inactive Academy accounts after two years; unresolved appeals and active staff roles hold the account';

create or replace function academy.purge_expired_staff_authorization_history(
  p_retain_years int default 3,
  p_limit int default 500
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_audit_deleted integer;
  v_assignment_deleted integer;
begin
  if p_retain_years < 3 or p_retain_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid staff audit retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select event_id from academy.staff_role_audit e
     where e.occurred_at < now() - make_interval(years => p_retain_years)
       and not exists (
         select 1 from academy.staff_role_assignment a
          where a.account_id = e.account_id
            and a.role = e.role
            and (
              a.revoked_at is null
              or a.revoked_at >= now() - make_interval(years => p_retain_years)
            )
       )
     order by occurred_at limit p_limit
  )
  delete from academy.staff_role_audit a using doomed d where a.event_id = d.event_id;
  get diagnostics v_audit_deleted = row_count;

  with doomed as (
    select account_id, role from academy.staff_role_assignment
     where revoked_at < now() - make_interval(years => p_retain_years)
     order by revoked_at limit p_limit
  )
  delete from academy.staff_role_assignment a using doomed d
   where a.account_id = d.account_id and a.role = d.role and a.revoked_at is not null;
  get diagnostics v_assignment_deleted = row_count;

  return v_audit_deleted + v_assignment_deleted;
end;
$$;

revoke all on academy.staff_role_assignment from public, anon, authenticated, service_role;
revoke all on academy.staff_role_audit from public, anon, authenticated, service_role;
grant select on academy.staff_role_assignment to service_role;
grant select on academy.staff_role_audit to service_role;
grant usage on schema academy to academy_staff_admin;
grant academy_staff_admin to postgres;

create or replace function academy.has_staff_role(
  p_account_id uuid,
  p_required_role text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    p_required_role in ('owner', 'learner-support', 'privacy-officer', 'content-ops')
    and exists (
      select 1 from academy.staff_role_assignment a
      where a.account_id = p_account_id
        and a.revoked_at is null
        and (a.role = p_required_role or a.role = 'owner')
    );
$$;

create or replace function academy.set_staff_role(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_role text,
  p_enabled boolean,
  p_authorization_reference text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_has_owner boolean;
  v_changed_count integer := 0;
begin
  if p_role not in ('owner', 'learner-support', 'privacy-officer', 'content-ops') then
    raise exception 'invalid staff role' using errcode = '22023';
  end if;
  if char_length(btrim(p_authorization_reference)) < 8 or char_length(btrim(p_authorization_reference)) > 120 then
    raise exception 'authorization reference must be 8-120 characters' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('academy.staff_role_assignment', 0));
  select exists (
    select 1 from academy.staff_role_assignment where role = 'owner' and revoked_at is null
  ) into v_has_owner;

  if v_has_owner and not academy.has_staff_role(p_actor_account_id, 'owner') then
    raise exception 'owner role required' using errcode = '42501';
  end if;
  if not v_has_owner and not (p_enabled and p_role = 'owner' and p_actor_account_id = p_target_account_id) then
    raise exception 'first assignment must bootstrap the acting owner' using errcode = '42501';
  end if;

  if p_enabled then
    insert into academy.staff_role_assignment(account_id, role, granted_by)
    values (p_target_account_id, p_role, p_actor_account_id)
    on conflict (account_id, role) do update
      set granted_at = now(), granted_by = excluded.granted_by, revoked_at = null, revoked_by = null
      where academy.staff_role_assignment.revoked_at is not null;
    get diagnostics v_changed_count = row_count;
  else
    if p_role = 'owner' and p_actor_account_id = p_target_account_id then
      raise exception 'owner cannot revoke own owner role' using errcode = '42501';
    end if;
    if p_role = 'owner' and exists (
      select 1 from academy.staff_role_assignment
       where account_id = p_target_account_id and role = 'owner' and revoked_at is null
    ) and (
      select count(*) from academy.staff_role_assignment where role = 'owner' and revoked_at is null
    ) <= 1 then
      raise exception 'cannot revoke the final owner role' using errcode = '42501';
    end if;
    update academy.staff_role_assignment
      set revoked_at = now(), revoked_by = p_actor_account_id
      where account_id = p_target_account_id and role = p_role and revoked_at is null;
    get diagnostics v_changed_count = row_count;
  end if;

  if v_changed_count > 0 then
    insert into academy.staff_role_audit(account_id, role, action, actor_account_id, authorization_reference)
    values (
      p_target_account_id,
      p_role,
      case when p_enabled then 'granted' else 'revoked' end,
      p_actor_account_id,
      btrim(p_authorization_reference)
    );
  end if;
  return v_changed_count > 0;
end;
$$;

revoke all on function academy.has_staff_role(uuid, text) from public, anon, authenticated;
revoke all on function academy.set_staff_role(uuid, uuid, text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function academy.purge_expired_staff_authorization_history(int, int) from public, anon, authenticated;
grant execute on function academy.has_staff_role(uuid, text) to service_role;
grant execute on function academy.set_staff_role(uuid, uuid, text, boolean, text) to academy_staff_admin;
grant execute on function academy.purge_expired_staff_authorization_history(int, int) to service_role;

comment on table academy.staff_role_assignment is
  'Current Academy staff roles; owner implies every role and all changes go through set_staff_role';
comment on table academy.staff_role_audit is
  'Append-only audit evidence for staff role grants and revocations';
comment on function academy.purge_expired_staff_authorization_history is
  'Bounded three-year purge for revoked staff assignments and audit events not supporting an active role';
