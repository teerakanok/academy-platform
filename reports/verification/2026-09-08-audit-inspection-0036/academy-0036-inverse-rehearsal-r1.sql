BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('academy:migration:0036',0));
DO $guard$ BEGIN IF current_database()<>'postgres' OR current_user<>'supabase_admin' THEN RAISE EXCEPTION 'wrong target or operator'; END IF; END $guard$;
DO $verify$ BEGIN
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND proowner='postgres'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='678670779a4257c0268ab48ddbab169e') THEN RAISE EXCEPTION 'function body or owner drift: inspect_staff_role_audit'; END IF;
IF NOT has_function_privilege('academy_staff_admin','academy.inspect_staff_role_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_staff_role_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('postgres'::regrole::oid,'academy_staff_admin'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_staff_role_audit'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND proowner='postgres'::regrole AND prosecdef AND provolatile='s' AND prorettype='jsonb'::regtype AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='72e8b23c4d6353638958617804eb7ec4') THEN RAISE EXCEPTION 'function body or owner drift: inspect_course_entitlement_audit'; END IF;
IF NOT has_function_privilege('academy_entitlement_operator','academy.inspect_course_entitlement_audit(uuid,uuid,text)','execute') OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='academy.inspect_course_entitlement_audit(uuid,uuid,text)'::regprocedure AND (a.grantee NOT IN ('postgres'::regrole::oid,'academy_entitlement_operator'::regrole::oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'function ACL drift: inspect_course_entitlement_audit'; END IF;
END $verify$;
DROP FUNCTION academy.inspect_staff_role_audit(uuid,uuid,text);
DROP FUNCTION academy.inspect_course_entitlement_audit(uuid,uuid,text);
DO $verify$ BEGIN IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='academy' AND p.proname IN ('inspect_staff_role_audit','inspect_course_entitlement_audit')) THEN RAISE EXCEPTION 'inverse incomplete'; END IF; END $verify$;
ROLLBACK;
