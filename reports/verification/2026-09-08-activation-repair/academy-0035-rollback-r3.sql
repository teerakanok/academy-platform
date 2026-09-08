BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('academy:migration:0035',0));
DO $verify$ BEGIN
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.sync_service_activation(uuid,text,integer)'::regprocedure AND proowner='academy_activation_writer'::regrole AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, academy'] AND md5(prosrc)='cf1feed0de1a4fd0f9480ae07cebc4b9') THEN RAISE EXCEPTION 'function postcondition'; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='academy_activation_writer' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'role postcondition'; END IF;
IF EXISTS (SELECT FROM pg_auth_members WHERE roleid='academy_activation_writer'::regrole OR member='academy_activation_writer'::regrole) THEN RAISE EXCEPTION 'role membership'; END IF;
IF NOT has_function_privilege('academy_runtime','academy.sync_service_activation(uuid,text,integer)','execute') OR has_function_privilege('service_role','academy.sync_service_activation(uuid,text,integer)','execute') THEN RAISE EXCEPTION 'RPC execute boundary'; END IF;
IF has_table_privilege('academy_runtime','academy.service_activation','INSERT') OR has_table_privilege('academy_runtime','academy.service_activation','UPDATE') OR has_table_privilege('academy_runtime','academy.course_entitlement','INSERT') OR has_table_privilege('academy_runtime','academy.staff_role_assignment','INSERT') THEN RAISE EXCEPTION 'runtime direct privilege'; END IF;
IF NOT has_table_privilege('academy_activation_writer','academy.service_activation','SELECT') OR NOT has_table_privilege('academy_activation_writer','academy.service_activation','INSERT') OR NOT has_table_privilege('academy_activation_writer','academy.service_activation','UPDATE') OR has_table_privilege('academy_activation_writer','academy.service_activation','DELETE') OR has_table_privilege('academy_activation_writer','academy.course_entitlement','INSERT') OR has_table_privilege('academy_activation_writer','academy.staff_role_assignment','INSERT') THEN RAISE EXCEPTION 'writer privilege'; END IF;
IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='academy.service_activation'::regclass AND polname='academy_service_activation_sync_writer' AND polroles=ARRAY['academy_activation_writer'::regrole::oid] AND polcmd='*' AND polpermissive AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') THEN RAISE EXCEPTION 'writer policy'; END IF;
IF NOT EXISTS (SELECT FROM pg_class WHERE oid='academy.service_activation'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'activation RLS state drift'; END IF;
END $verify$;
ALTER FUNCTION academy.sync_service_activation(uuid,text,integer) OWNER TO postgres;
ALTER FUNCTION academy.sync_service_activation(uuid,text,integer) SECURITY INVOKER RESET search_path;
DROP POLICY academy_service_activation_sync_writer ON academy.service_activation;
REVOKE ALL ON academy.service_activation FROM academy_activation_writer;
REVOKE ALL ON SCHEMA academy FROM academy_activation_writer;
DO $undo$ BEGIN
IF EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='academy_activation_writer'::regrole) THEN RAISE EXCEPTION 'unexpected writer dependencies; retain role'; END IF;
END $undo$;
DROP ROLE academy_activation_writer;
DO $guard$ BEGIN
IF current_database()<>'postgres' THEN RAISE EXCEPTION 'wrong database'; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RAISE EXCEPTION 'operator lacks verified capability'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.sync_service_activation(uuid,text,integer)'::regprocedure AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig IS NULL AND md5(prosrc)='cf1feed0de1a4fd0f9480ae07cebc4b9' AND proacl::text='{postgres=X/postgres,academy_runtime=X/postgres}') THEN RAISE EXCEPTION 'function baseline drift'; END IF;
IF EXISTS (SELECT FROM pg_roles WHERE rolname='academy_activation_writer') OR EXISTS (SELECT FROM pg_policy WHERE polrelid='academy.service_activation'::regclass AND polname='academy_service_activation_sync_writer') THEN RAISE EXCEPTION '0035 collision'; END IF;
IF NOT has_function_privilege('academy_runtime','academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)','execute') THEN RAISE EXCEPTION '0034 runtime baseline missing'; END IF;
IF has_table_privilege('academy_runtime','academy.service_activation','INSERT') OR has_table_privilege('academy_runtime','academy.service_activation','UPDATE') THEN RAISE EXCEPTION 'runtime boundary drift'; END IF;
IF NOT EXISTS (SELECT FROM pg_class WHERE oid='academy.service_activation'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'activation RLS state drift'; END IF;
END $guard$;
COMMIT;
