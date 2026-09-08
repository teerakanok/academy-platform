BEGIN;
DROP FUNCTION academy.inspect_staff_role_audit(uuid,uuid,text);
DROP FUNCTION academy.inspect_course_entitlement_audit(uuid,uuid,text);
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('academy:migration:0036',0));
DO $guard$ BEGIN
IF current_database()<>'academy_activation_50505a66b8f0' OR current_user<>'fixture_owner' THEN RAISE EXCEPTION 'wrong target or operator'; END IF;
IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='academy' AND p.proname IN ('inspect_staff_role_audit','inspect_course_entitlement_audit')) THEN RAISE EXCEPTION '0036 function collision'; END IF;
IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='academy' AND c.relname IN ('staff_role_audit','course_entitlement_audit') AND c.relowner='fixture_owner'::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity)<>2 THEN RAISE EXCEPTION 'audit table baseline drift'; END IF;
IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('academy_staff_admin','academy_entitlement_operator') AND NOT rolsuper AND NOT rolbypassrls)<>2 THEN RAISE EXCEPTION 'operator boundary drift'; END IF;
END $guard$;
SET LOCAL ROLE fixture_owner;
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

DO $verify$ BEGIN
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND proowner='fixture_owner'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='678670779a4257c0268ab48ddbab169e') THEN RAISE EXCEPTION 'function body or owner drift: inspect_staff_role_audit'; END IF;
IF NOT has_function_privilege('academy_staff_admin','academy.inspect_staff_role_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('fixture_owner'::regrole::oid,'academy_staff_admin'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_staff_role_audit'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND proowner='fixture_owner'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='72e8b23c4d6353638958617804eb7ec4') THEN RAISE EXCEPTION 'function body or owner drift: inspect_course_entitlement_audit'; END IF;
IF NOT has_function_privilege('academy_entitlement_operator','academy.inspect_course_entitlement_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('fixture_owner'::regrole::oid,'academy_entitlement_operator'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_course_entitlement_audit'; END IF;
END $verify$;
RESET ROLE;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('academy:migration:0036',0));
DO $guard$ BEGIN IF current_database()<>'academy_activation_50505a66b8f0' OR current_user<>'fixture_owner' THEN RAISE EXCEPTION 'wrong target or operator'; END IF; END $guard$;
DO $verify$ BEGIN
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND proowner='fixture_owner'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='678670779a4257c0268ab48ddbab169e') THEN RAISE EXCEPTION 'function body or owner drift: inspect_staff_role_audit'; END IF;
IF NOT has_function_privilege('academy_staff_admin','academy.inspect_staff_role_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('fixture_owner'::regrole::oid,'academy_staff_admin'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_staff_role_audit'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND proowner='fixture_owner'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='72e8b23c4d6353638958617804eb7ec4') THEN RAISE EXCEPTION 'function body or owner drift: inspect_course_entitlement_audit'; END IF;
IF NOT has_function_privilege('academy_entitlement_operator','academy.inspect_course_entitlement_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('fixture_owner'::regrole::oid,'academy_entitlement_operator'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_course_entitlement_audit'; END IF;
END $verify$;
DROP FUNCTION academy.inspect_staff_role_audit(uuid,uuid,text);
DROP FUNCTION academy.inspect_course_entitlement_audit(uuid,uuid,text);
DO $verify$ BEGIN IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='academy' AND p.proname IN ('inspect_staff_role_audit','inspect_course_entitlement_audit')) THEN RAISE EXCEPTION 'inverse incomplete'; END IF; END $verify$;
ROLLBACK;
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='academy' AND p.proname IN ('inspect_staff_role_audit','inspect_course_entitlement_audit');
