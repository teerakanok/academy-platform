-- Bounded latest-audit inspection for transactional administrative rehearsals.
create or replace function academy.inspect_staff_role_audit(
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
  v_audit record;
begin
  if p_actor_account_id is null or p_target_account_id is null
     or p_role not in ('owner', 'learner-support', 'privacy-officer', 'content-ops')
  then
    raise exception 'invalid staff role audit inspection input' using errcode = '22023';
  end if;

  select event_id::text as event_id, action, authorization_reference, occurred_at
    into v_audit
    from academy.staff_role_audit
   where account_id = p_target_account_id and role = p_role
   order by event_id desc limit 1;

  return case when v_audit is null then null else jsonb_build_object(
    'eventId', v_audit.event_id,
    'action', v_audit.action,
    'authorizationReference', v_audit.authorization_reference,
    'occurredAt', v_audit.occurred_at
  ) end;
end;
$$;

create or replace function academy.inspect_course_entitlement_audit(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_course_slug text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_audit record;
begin
  if p_actor_account_id is null or p_target_account_id is null
     or p_course_slug is null or p_course_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
  then
    raise exception 'invalid course entitlement audit inspection input' using errcode = '22023';
  end if;

  select event_id::text as event_id, account_id::text as account_id, course_slug, action, source,
         expires_at, actor_account_id::text as actor_account_id, authorization_reference, occurred_at
    into v_audit
    from academy.course_entitlement_audit
   where account_id = p_target_account_id and course_slug = p_course_slug
   order by event_id desc limit 1;

  return case when v_audit is null then null else jsonb_build_object(
    'eventId', v_audit.event_id,
    'accountId', v_audit.account_id,
    'courseSlug', v_audit.course_slug,
    'action', v_audit.action,
    'source', v_audit.source,
    'expiresAt', v_audit.expires_at,
    'actorAccountId', v_audit.actor_account_id,
    'authorizationReference', v_audit.authorization_reference,
    'occurredAt', v_audit.occurred_at
  ) end;
end;
$$;

revoke all on function academy.inspect_staff_role_audit(uuid, uuid, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_entitlement_operator;
revoke all on function academy.inspect_course_entitlement_audit(uuid, uuid, text)
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;
grant execute on function academy.inspect_staff_role_audit(uuid, uuid, text)
  to academy_staff_admin;
grant execute on function academy.inspect_course_entitlement_audit(uuid, uuid, text)
  to academy_entitlement_operator;
