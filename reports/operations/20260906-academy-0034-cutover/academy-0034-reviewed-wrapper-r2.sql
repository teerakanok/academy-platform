\set ON_ERROR_STOP on
\if :{?academy_digest_commit}
\else
  \quit
\endif
\if :{?migration_file}
\else
  \quit
\endif

-- This table and its one raw ID live only for this psql connection. No selected
-- result contains an ID, cookie, claim, email, subject, or authorization state.
create temporary table academy_digest_0034_pre (
  snapshot jsonb not null,
  raw_session_id text,
  compatibility_status text not null
) on commit preserve rows;

insert into academy_digest_0034_pre (snapshot, raw_session_id, compatibility_status)
select jsonb_build_object(
  'session_count', (select count(*) from academy.identity_session),
  'stored_id_set_sha256', (select encode(sha256(convert_to(coalesce(string_agg(id, ',' order by id), ''), 'UTF8')), 'hex') from academy.identity_session),
  'expected_digest_set_sha256', (select encode(sha256(convert_to(coalesce(string_agg(rtrim(translate(encode(sha256(convert_to(id, 'UTF8')), 'base64'), '+/', '-_'), '='), ',' order by rtrim(translate(encode(sha256(convert_to(id, 'UTF8')), 'base64'), '+/', '-_'), '=')), ''), 'UTF8')), 'hex') from academy.identity_session),
  'transaction_count', (select count(*) from academy.identity_authorization_transaction),
  'active_claim_count', (select count(*) from academy.identity_authorization_transaction where claim_expires_at > clock_timestamp()),
  'link_claim_completion_count', (select count(*) from academy.identity_authorization_transaction where claim_digest is not null or claim_expires_at is not null or session_id is not null or completed_account_id is not null or completed_at is not null),
  'marker_present', to_regclass('academy.identity_session_id_digest_transition') is not null,
  'legacy_create_present', to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)') is not null,
  'legacy_claim_present', to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)') is not null,
  'digest_create_present', to_regprocedure('academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)') is not null,
  'legacy_function_catalog_sha256', encode(sha256(convert_to(concat_ws('|',
    coalesce(pg_get_functiondef(to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)')), '<absent>'),
    coalesce(pg_get_functiondef(to_regprocedure('academy.read_identity_session(text)')), '<absent>'),
    coalesce(pg_get_functiondef(to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')), '<absent>'),
    coalesce(pg_get_functiondef(to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')), '<absent>')
  ), 'UTF8')), 'hex'),
  'legacy_owner_catalog_sha256', (select encode(sha256(convert_to(string_agg(name || '=' || owner, '|' order by name), 'UTF8')), 'hex') from (values
    ('create_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)')), '<absent>')),
    ('read_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.read_identity_session(text)')), '<absent>')),
    ('revoke_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.revoke_identity_session(text)')), '<absent>')),
    ('claim_identity_authorization_transaction', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')), '<absent>')),
    ('finalize_identity_authorization_transaction', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')), '<absent>')),
    ('identity_session', coalesce((select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_session'::regclass), '<absent>')),
    ('identity_authorization_transaction', coalesce((select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_authorization_transaction'::regclass), '<absent>'))
  ) as owners(name, owner))
),
  (select id
     from academy.identity_session
    where expires_at > clock_timestamp() + interval '120 seconds'
    order by id
    limit 1),
  case when exists (
    select 1 from academy.identity_session
     where expires_at > clock_timestamp() + interval '120 seconds'
  ) then 'checked_unexpired_120s_margin'
  else 'skipped_no_unexpired_120s_margin'
  end;

-- The transition executes as postgres; retain snapshot access only for that role
-- within this one connection. The temporary table vanishes on disconnect.
grant select on academy_digest_0034_pre to postgres;

do $$
declare v jsonb;
begin
  select snapshot into v from academy_digest_0034_pre;
  if (v->>'marker_present')::boolean
     or (v->>'digest_create_present')::boolean
     or not (v->>'legacy_create_present')::boolean
     or not (v->>'legacy_claim_present')::boolean
     or (v->>'active_claim_count')::bigint <> 0 then
    raise exception '0034 prestate rejected';
  end if;
end $$;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Actual production prestate: only these two legacy callback functions are
-- supabase_admin-owned; every other object below is postgres-owned. Normalize
-- exactly those two owners while this transaction is still supabase_admin.
do $$
begin
  if (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')) is distinct from 'supabase_admin'
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')) is distinct from 'supabase_admin'
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)')) is distinct from 'postgres'
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.read_identity_session(text)')) is distinct from 'postgres'
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.revoke_identity_session(text)')) is distinct from 'postgres'
     or (select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_session'::regclass) is distinct from 'postgres'
     or (select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_authorization_transaction'::regclass) is distinct from 'postgres' then
    raise exception '0034 owner prestate rejected';
  end if;
end $$;
alter function academy.claim_identity_authorization_transaction(text,text,text,text,integer) owner to postgres;
alter function academy.finalize_identity_authorization_transaction(text,text,uuid,text,text) owner to postgres;
set local role postgres;

-- This is the drain guard that matters: it runs after the exclusive locks have
-- been obtained, immediately before the exact migration body.
lock table academy.identity_session,
           academy.identity_authorization_transaction
  in access exclusive mode;
do $$
begin
  if exists (
    select 1 from academy.identity_authorization_transaction
     where claim_expires_at > clock_timestamp()
  ) then
    raise exception '0034 transaction-time active claim guard rejected';
  end if;
end $$;

-- Exact body only; caller supplies the reviewed file and must separately hash it.
\i :migration_file

do $$
declare v jsonb; v_raw text; v_status text; v_read jsonb; v_code text;
begin
  select snapshot, raw_session_id, compatibility_status into v, v_raw, v_status from academy_digest_0034_pre;
  if (select count(*) from academy.identity_session) <> (v->>'session_count')::bigint
     or (select encode(sha256(convert_to(coalesce(string_agg(id, ',' order by id), ''), 'UTF8')), 'hex') from academy.identity_session) <> v->>'expected_digest_set_sha256'
     or (select count(*) from academy.identity_authorization_transaction) <> (v->>'transaction_count')::bigint
     or (select count(*) from academy.identity_authorization_transaction where claim_digest is not null or claim_expires_at is not null or session_id is not null or completed_account_id is not null or completed_at is not null) <> 0
     or (select count(*) from academy.identity_session_id_digest_transition) <> 1
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')) is distinct from 'postgres'
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')) is distinct from 'postgres'
     or to_regprocedure('academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)') is null
     or not coalesce((select bool_and(has_function_privilege('academy_runtime', p, 'execute')) from unnest(array[
       to_regprocedure('academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)')::oid,
       to_regprocedure('academy.read_identity_session_digest(text)')::oid,
       to_regprocedure('academy.revoke_identity_session_digest(text)')::oid,
       to_regprocedure('academy.claim_identity_authorization_transaction_digest(text,text,text,text,integer)')::oid,
       to_regprocedure('academy.finalize_identity_authorization_transaction_digest(text,text,uuid,text,text)')::oid
     ]) as p), false)
     or not coalesce((select bool_and(not has_function_privilege('anon', p, 'execute') and not has_function_privilege('service_role', p, 'execute')) from unnest(array[
       to_regprocedure('academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)')::oid,
       to_regprocedure('academy.read_identity_session_digest(text)')::oid,
       to_regprocedure('academy.revoke_identity_session_digest(text)')::oid,
       to_regprocedure('academy.claim_identity_authorization_transaction_digest(text,text,text,text,integer)')::oid,
       to_regprocedure('academy.finalize_identity_authorization_transaction_digest(text,text,uuid,text,text)')::oid
     ]) as p), false) then
    raise exception '0034 transition postcondition rejected';
  end if;
  if v_status = 'checked_unexpired_120s_margin' then
    select academy.read_identity_session(v_raw) into v_read;
    if v_read->>'status' <> 'active' or v_read #>> '{session,id}' <> v_raw then
      raise exception 'legacy raw session compatibility rejected';
    end if;
  elsif v_status <> 'skipped_no_unexpired_120s_margin' or v_raw is not null then
    raise exception 'legacy raw session representative state rejected';
  end if;
  begin
    perform academy.claim_identity_authorization_transaction(repeat('a', 16), repeat('a', 43), repeat('b', 43), repeat('c', 43), 30);
    raise exception 'legacy claim unexpectedly returned';
  exception when sqlstate '55000' then
    null;
  end;
end $$;

\if :academy_digest_commit
  commit;
  do $$
  declare v jsonb;
  begin
    select snapshot into v from academy_digest_0034_pre;
    if to_regclass('academy.identity_session_id_digest_transition') is null
       or (select count(*) from academy.identity_session_id_digest_transition) <> 1
       or (select count(*) from academy.identity_session) <> (v->>'session_count')::bigint
       or (select encode(sha256(convert_to(coalesce(string_agg(id, ',' order by id), ''), 'UTF8')), 'hex') from academy.identity_session) <> v->>'expected_digest_set_sha256'
       or (select count(*) from academy.identity_authorization_transaction) <> (v->>'transaction_count')::bigint
       or (select count(*) from academy.identity_authorization_transaction where claim_expires_at > clock_timestamp()) <> 0
       or (select count(*) from academy.identity_authorization_transaction where claim_digest is not null or claim_expires_at is not null or session_id is not null or completed_account_id is not null or completed_at is not null) <> 0 then
      raise exception '0034 commit verification rejected';
    end if;
  end $$;
\else
  rollback;
  do $$
  declare v jsonb;
  begin
    select snapshot into v from academy_digest_0034_pre;
    if (select jsonb_build_object(
      'session_count', (select count(*) from academy.identity_session),
      'stored_id_set_sha256', (select encode(sha256(convert_to(coalesce(string_agg(id, ',' order by id), ''), 'UTF8')), 'hex') from academy.identity_session),
      'expected_digest_set_sha256', (select encode(sha256(convert_to(coalesce(string_agg(rtrim(translate(encode(sha256(convert_to(id, 'UTF8')), 'base64'), '+/', '-_'), '='), ',' order by rtrim(translate(encode(sha256(convert_to(id, 'UTF8')), 'base64'), '+/', '-_'), '=')), ''), 'UTF8')), 'hex') from academy.identity_session),
      'transaction_count', (select count(*) from academy.identity_authorization_transaction),
      'active_claim_count', (select count(*) from academy.identity_authorization_transaction where claim_expires_at > clock_timestamp()),
      'link_claim_completion_count', (select count(*) from academy.identity_authorization_transaction where claim_digest is not null or claim_expires_at is not null or session_id is not null or completed_account_id is not null or completed_at is not null),
      'marker_present', to_regclass('academy.identity_session_id_digest_transition') is not null,
      'legacy_create_present', to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)') is not null,
      'legacy_claim_present', to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)') is not null,
      'digest_create_present', to_regprocedure('academy.create_identity_session_digest(text,text,text,text,text,bigint,integer)') is not null,
      'legacy_function_catalog_sha256', encode(sha256(convert_to(concat_ws('|',
        coalesce(pg_get_functiondef(to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)')), '<absent>'),
        coalesce(pg_get_functiondef(to_regprocedure('academy.read_identity_session(text)')), '<absent>'),
        coalesce(pg_get_functiondef(to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')), '<absent>'),
        coalesce(pg_get_functiondef(to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')), '<absent>')
      ), 'UTF8')), 'hex'),
      'legacy_owner_catalog_sha256', (select encode(sha256(convert_to(string_agg(name || '=' || owner, '|' order by name), 'UTF8')), 'hex') from (values
        ('create_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.create_identity_session(text,text,text,text,text,bigint,integer)')), '<absent>')),
        ('read_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.read_identity_session(text)')), '<absent>')),
        ('revoke_identity_session', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.revoke_identity_session(text)')), '<absent>')),
        ('claim_identity_authorization_transaction', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.claim_identity_authorization_transaction(text,text,text,text,integer)')), '<absent>')),
        ('finalize_identity_authorization_transaction', coalesce((select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)')), '<absent>')),
        ('identity_session', coalesce((select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_session'::regclass), '<absent>')),
        ('identity_authorization_transaction', coalesce((select pg_get_userbyid(relowner) from pg_class where oid = 'academy.identity_authorization_transaction'::regclass), '<absent>'))
      ) as owners(name, owner))
    )) <> v then
      raise exception '0034 rollback did not restore baseline';
    end if;
  end $$;
\endif

-- Emit no values except the completion marker and checked/skipped status.
select 'academy_0034_transition_verified' as result,
       (select compatibility_status from academy_digest_0034_pre) as legacy_raw_session_compatibility;
