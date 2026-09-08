DO $guard$ BEGIN
IF current_database()<>'postgres' THEN RAISE EXCEPTION 'wrong database'; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RAISE EXCEPTION 'operator lacks verified capability'; END IF;
IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='academy.sync_service_activation(uuid,text,integer)'::regprocedure AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig IS NULL AND md5(prosrc)='cf1feed0de1a4fd0f9480ae07cebc4b9' AND proacl::text='{postgres=X/postgres,academy_runtime=X/postgres}') THEN RAISE EXCEPTION 'function baseline drift'; END IF;
IF EXISTS (SELECT FROM pg_roles WHERE rolname='academy_activation_writer') OR EXISTS (SELECT FROM pg_policy WHERE polrelid='academy.service_activation'::regclass AND polname='academy_service_activation_sync_writer') THEN RAISE EXCEPTION '0035 collision'; END IF;
IF NOT has_function_privilege('academy_runtime','academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)','execute') THEN RAISE EXCEPTION '0034 runtime baseline missing'; END IF;
IF has_table_privilege('academy_runtime','academy.service_activation','INSERT') OR has_table_privilege('academy_runtime','academy.service_activation','UPDATE') THEN RAISE EXCEPTION 'runtime boundary drift'; END IF;
IF NOT EXISTS (SELECT FROM pg_class WHERE oid='academy.service_activation'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'activation RLS state drift'; END IF;
END $guard$;
