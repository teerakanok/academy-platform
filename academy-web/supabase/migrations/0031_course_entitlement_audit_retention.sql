-- Preserve audited manual entitlement decisions after account deletion, while
-- applying the same fixed three-year authorization-history retention bound.

do $$
declare
  v_account_fk boolean;
  v_actor_fk boolean;
  v_user_fk_count integer;
begin
  if not exists (
    select 1 from pg_proc
     where pronamespace = 'academy'::regnamespace
       and proname = 'set_course_entitlement'
       and pg_get_function_identity_arguments(oid)
         = 'p_actor_account_id uuid, p_target_account_id uuid, p_course_slug text, p_enabled boolean, p_source text, p_expires_at timestamp with time zone, p_authorization_reference text'
  ) then
    raise exception 'course entitlement hardening is not installed' using errcode = '55000';
  end if;

  select count(*) into v_user_fk_count
    from pg_constraint c
    join unnest(c.conkey) attribute_index(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = attribute_index.attnum
   where c.conrelid = 'academy.course_entitlement_audit'::regclass
     and c.contype = 'f'
     and c.confrelid = 'academy.users'::regclass
     and a.attname in ('account_id', 'actor_account_id');

  if v_user_fk_count > 2 then
    raise exception 'unexpected entitlement audit user foreign keys' using errcode = '55000';
  end if;

  select exists (
    select 1 from pg_constraint where conname = 'course_entitlement_audit_account_id_fkey'
      and conrelid = 'academy.course_entitlement_audit'::regclass and contype = 'f'
  ), exists (
    select 1 from pg_constraint where conname = 'course_entitlement_audit_actor_account_id_fkey'
      and conrelid = 'academy.course_entitlement_audit'::regclass and contype = 'f'
  ) into v_account_fk, v_actor_fk;

  if not v_account_fk or not v_actor_fk then
    raise exception 'expected entitlement audit user foreign keys are missing' using errcode = '55000';
  end if;

  if exists (
    select 1
      from pg_constraint c
      join unnest(c.conkey) attribute_index(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = attribute_index.attnum
     where c.conrelid = 'academy.course_entitlement_audit'::regclass
       and c.contype = 'f'
       and c.confrelid = 'academy.users'::regclass
       and c.conname not in (
         'course_entitlement_audit_account_id_fkey',
         'course_entitlement_audit_actor_account_id_fkey'
       )
  ) then
    raise exception 'unexpected entitlement audit user foreign keys' using errcode = '55000';
  end if;
end
$$;

alter table academy.course_entitlement_audit
  drop constraint if exists course_entitlement_audit_account_id_fkey,
  drop constraint if exists course_entitlement_audit_actor_account_id_fkey;

create or replace function academy.purge_expired_course_entitlement_history(
  p_retain_years int default 3,
  p_limit int default 500
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_deleted integer;
begin
  if p_retain_years < 3 or p_retain_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid entitlement audit retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select e.event_id
      from academy.course_entitlement_audit e
     where e.occurred_at < now() - make_interval(years => p_retain_years)
       and not exists (
         select 1 from academy.course_entitlement a
          where a.user_id = e.account_id and a.course_slug = e.course_slug
            and (least(a.revoked_at, a.expires_at) is null
              or least(a.revoked_at, a.expires_at) >= now() - make_interval(years => p_retain_years))
       )
     order by occurred_at
     limit p_limit
  )
  delete from academy.course_entitlement_audit a
   using doomed d
   where a.event_id = d.event_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function academy.purge_expired_course_entitlement_history(integer, integer) is
  'Retain active/recent entitlement authority evidence; purge after the existing three-year history bound, invoker-authorized';

grant select, delete on academy.course_entitlement_audit to academy_retention_definer;
grant select on academy.course_entitlement to academy_retention_definer;

grant execute on function academy.purge_expired_course_entitlement_history(integer, integer)
  to academy_retention_definer;
revoke all on function academy.purge_expired_course_entitlement_history(integer, integer)
  from public, anon, authenticated, service_role, academy_retention;

create function academy.run_retention_course_entitlement_history()
returns integer
language sql
security definer
set search_path = pg_catalog
as $$ select academy.purge_expired_course_entitlement_history(3, 500) $$;

revoke all on function academy.run_retention_course_entitlement_history()
  from public, anon, authenticated, service_role;
