-- Keep the Academy callback transaction recoverable until the browser can
-- receive one durable Academy session. A short digest-bound lease serializes
-- work; a verified-result checkpoint prevents reuse of a one-time provider code.

alter table academy.identity_authorization_transaction
  add column if not exists claim_digest text,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists session_id text,
  add column if not exists result_issuer text,
  add column if not exists result_subject text,
  add column if not exists result_verified_email text,
  add column if not exists result_activation_status text,
  add column if not exists result_activation_revision bigint,
  add column if not exists last_failure_stage text,
  add column if not exists last_failed_at timestamptz,
  add column if not exists completed_account_id uuid,
  add column if not exists completed_at timestamptz;

-- This migration is deliberately re-runnable in the PostgreSQL matrix. Replace
-- the one constraint whose admitted enum expanded from the earlier draft.
alter table academy.identity_authorization_transaction
  drop constraint if exists identity_authorization_transaction_failure_stage;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_claim_pair'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_claim_pair check (
        (claim_digest is null and claim_expires_at is null)
        or (claim_digest ~ '^[A-Za-z0-9_-]{43}$' and claim_expires_at is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_attempt_count'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_attempt_count
      check (attempt_count between 0 and 3);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_session_id'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_session_id check (
        session_id is null or session_id ~ '^[A-Za-z0-9_-]{43}$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_result_shape'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_result_shape check (
        (
          result_issuer is null
          and result_subject is null
          and result_verified_email is null
          and result_activation_status is null
          and result_activation_revision is null
        ) or (
          result_issuer is not null
          and result_subject is not null
          and result_verified_email is not null
          and result_activation_status in ('pending', 'active', 'suspended', 'deactivated')
          and result_activation_revision between 1 and 9007199254740991
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_failure_stage'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_failure_stage check (
        last_failure_stage is null or last_failure_stage in (
          'client_binding',
          'client_assertion',
          'code_exchange',
          'result_verification',
          'result_checkpoint',
          'profile_activation',
          'session_creation',
          'transaction_finalize'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.identity_authorization_transaction'::regclass
       and conname = 'identity_authorization_transaction_completion_shape'
  ) then
    alter table academy.identity_authorization_transaction
      add constraint identity_authorization_transaction_completion_shape check (
        (completed_account_id is null and completed_at is null)
        or (
          completed_account_id is not null
          and completed_at is not null
          and session_id is not null
          and result_issuer is not null
          and claim_digest is null
          and claim_expires_at is null
        )
      );
  end if;
end
$constraints$;

drop function if exists academy.claim_identity_authorization_transaction(text, text, text, integer);
drop function if exists academy.finalize_identity_authorization_transaction(text, text);

create or replace function academy.claim_identity_authorization_transaction(
  p_state text,
  p_browser_binding_digest text,
  p_claim_digest text,
  p_session_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_session_id text;
  v_exchange_result jsonb := null;
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_browser_binding_digest is null
     or p_browser_binding_digest !~ '^[A-Za-z0-9_-]{43}$'
     or p_claim_digest is null or p_claim_digest !~ '^[A-Za-z0-9_-]{43}$'
     or p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
     or p_lease_seconds is null or p_lease_seconds not between 1 and 60 then
    raise exception 'invalid identity authorization transaction claim' using errcode = '22023';
  end if;

  select * into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_transaction.browser_binding_digest <> p_browser_binding_digest then
    return jsonb_build_object('status', 'browser_mismatch');
  end if;
  if v_transaction.completed_at is not null then
    return jsonb_build_object(
      'status', 'completed',
      'receipt', jsonb_build_object(
        'accountId', v_transaction.completed_account_id,
        'sessionId', v_transaction.session_id,
        'returnPath', v_transaction.return_path
      )
    );
  end if;
  if v_transaction.claim_digest is not null
     and v_transaction.claim_expires_at > v_now then
    return jsonb_build_object('status', 'in_progress');
  end if;
  if v_transaction.attempt_count >= 3 then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'exhausted');
  end if;

  v_session_id := coalesce(v_transaction.session_id, p_session_id);
  if v_transaction.result_issuer is not null then
    v_exchange_result := jsonb_build_object(
      'issuer', v_transaction.result_issuer,
      'subject', v_transaction.result_subject,
      'verifiedEmail', v_transaction.result_verified_email,
      'audience', v_transaction.audience,
      'serviceId', v_transaction.service_id,
      'nonce', v_transaction.nonce,
      'activation', jsonb_build_object(
        'status', v_transaction.result_activation_status,
        'revision', v_transaction.result_activation_revision
      )
    );
  end if;

  update academy.identity_authorization_transaction
     set claim_digest = p_claim_digest,
         claim_expires_at = v_now + make_interval(secs => p_lease_seconds),
         session_id = v_session_id,
         attempt_count = attempt_count + 1
   where state = p_state;

  return jsonb_build_object(
    'status', 'claimed',
    'sessionId', v_session_id,
    'exchangeResult', v_exchange_result,
    'transaction', jsonb_build_object(
      'state', v_transaction.state,
      'codeVerifier', v_transaction.code_verifier,
      'nonce', v_transaction.nonce,
      'browserBindingDigest', v_transaction.browser_binding_digest,
      'client', jsonb_build_object(
        'clientId', v_transaction.client_id,
        'redirectUri', v_transaction.redirect_uri,
        'serviceId', v_transaction.service_id,
        'audience', v_transaction.audience,
        'expectedIssuer', v_transaction.expected_issuer,
        'clientAssertionAudience', v_transaction.client_assertion_audience
      ),
      'returnPath', v_transaction.return_path,
      'expiresAt', to_char(
        v_transaction.expires_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )
  );
end;
$$;

-- A rolled-back Worker still calls the legacy consume RPC. It may consume only
-- a callback that this state machine has never started; otherwise it must leave
-- the row intact so rolling forward can resume without replaying provider code.
create or replace function academy.consume_identity_authorization_transaction(
  p_state text,
  p_browser_binding_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_browser_binding_digest is null
     or p_browser_binding_digest !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity authorization transaction claim' using errcode = '22023';
  end if;

  select * into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_transaction.browser_binding_digest <> p_browser_binding_digest then
    return jsonb_build_object('status', 'browser_mismatch');
  end if;
  if v_transaction.attempt_count <> 0
     or v_transaction.claim_digest is not null
     or v_transaction.claim_expires_at is not null
     or v_transaction.session_id is not null
     or v_transaction.result_issuer is not null
     or v_transaction.result_subject is not null
     or v_transaction.result_verified_email is not null
     or v_transaction.result_activation_status is not null
     or v_transaction.result_activation_revision is not null
     or v_transaction.last_failure_stage is not null
     or v_transaction.last_failed_at is not null
     or v_transaction.completed_account_id is not null
     or v_transaction.completed_at is not null then
    return jsonb_build_object('status', 'unknown');
  end if;

  delete from academy.identity_authorization_transaction where state = p_state;
  return jsonb_build_object(
    'status', 'consumed',
    'transaction', jsonb_build_object(
      'state', v_transaction.state,
      'codeVerifier', v_transaction.code_verifier,
      'nonce', v_transaction.nonce,
      'browserBindingDigest', v_transaction.browser_binding_digest,
      'client', jsonb_build_object(
        'clientId', v_transaction.client_id,
        'redirectUri', v_transaction.redirect_uri,
        'serviceId', v_transaction.service_id,
        'audience', v_transaction.audience,
        'expectedIssuer', v_transaction.expected_issuer,
        'clientAssertionAudience', v_transaction.client_assertion_audience
      ),
      'returnPath', v_transaction.return_path,
      'expiresAt', to_char(
        v_transaction.expires_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )
  );
end;
$$;

create or replace function academy.checkpoint_identity_authorization_exchange(
  p_state text,
  p_claim_digest text,
  p_issuer text,
  p_subject text,
  p_verified_email text,
  p_activation_status text,
  p_activation_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_claim_digest is null or p_claim_digest !~ '^[A-Za-z0-9_-]{43}$'
     or not academy.identity_lifecycle_issuer_is_canonical(p_issuer)
     or p_subject is null or char_length(p_subject) not between 1 and 512
     or p_verified_email is null or char_length(p_verified_email) not between 3 and 320
     or p_verified_email <> lower(btrim(p_verified_email))
     or p_verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_activation_status is null
     or p_activation_status not in ('pending', 'active', 'suspended', 'deactivated')
     or p_activation_revision is null
     or p_activation_revision not between 1 and 9007199254740991 then
    raise exception 'invalid identity authorization exchange checkpoint' using errcode = '22023';
  end if;

  select * into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_transaction.completed_at is not null
     or v_transaction.claim_digest is distinct from p_claim_digest
     or v_transaction.claim_expires_at <= v_now then
    return jsonb_build_object('status', 'claim_mismatch');
  end if;
  if p_issuer <> v_transaction.expected_issuer then
    return jsonb_build_object('status', 'result_mismatch');
  end if;

  if v_transaction.result_issuer is not null then
    if v_transaction.result_issuer is distinct from p_issuer
       or v_transaction.result_subject is distinct from p_subject
       or v_transaction.result_verified_email is distinct from p_verified_email
       or v_transaction.result_activation_status is distinct from p_activation_status
       or v_transaction.result_activation_revision is distinct from p_activation_revision then
      return jsonb_build_object('status', 'result_mismatch');
    end if;
    return jsonb_build_object('status', 'checkpointed');
  end if;

  update academy.identity_authorization_transaction
     set result_issuer = p_issuer,
         result_subject = p_subject,
         result_verified_email = p_verified_email,
         result_activation_status = p_activation_status,
         result_activation_revision = p_activation_revision
   where state = p_state;
  return jsonb_build_object('status', 'checkpointed');
end;
$$;

create or replace function academy.release_identity_authorization_transaction_claim(
  p_state text,
  p_claim_digest text,
  p_failure_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_claim_digest is null or p_claim_digest !~ '^[A-Za-z0-9_-]{43}$'
     or p_failure_stage is null or p_failure_stage not in (
       'client_binding',
       'client_assertion',
       'code_exchange',
       'result_verification',
       'result_checkpoint',
       'profile_activation',
       'session_creation',
       'transaction_finalize'
     ) then
    raise exception 'invalid identity authorization transaction release' using errcode = '22023';
  end if;

  select * into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_transaction.completed_at is not null
     or v_transaction.claim_digest is distinct from p_claim_digest then
    return jsonb_build_object('status', 'claim_mismatch');
  end if;

  update academy.identity_authorization_transaction
     set claim_digest = null,
         claim_expires_at = null,
         last_failure_stage = p_failure_stage,
         last_failed_at = v_now
   where state = p_state;
  return jsonb_build_object('status', 'released');
end;
$$;

create or replace function academy.finalize_identity_authorization_transaction(
  p_state text,
  p_claim_digest text,
  p_account_id uuid,
  p_session_id text,
  p_subject_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_claim_digest is null or p_claim_digest !~ '^[A-Za-z0-9_-]{43}$'
     or p_account_id is null
     or p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
     or not academy.identity_lifecycle_subject_key_is_valid(p_subject_key) then
    raise exception 'invalid identity authorization transaction completion' using errcode = '22023';
  end if;

  select * into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_transaction.completed_at is not null
     or v_transaction.claim_digest is distinct from p_claim_digest
     or v_transaction.claim_expires_at <= v_now then
    return jsonb_build_object('status', 'claim_mismatch');
  end if;
  if v_transaction.result_issuer is null
     or v_transaction.session_id is distinct from p_session_id then
    return jsonb_build_object('status', 'result_mismatch');
  end if;

  perform 1 from academy.users
   where id = p_account_id
     and issuer = v_transaction.result_issuer
     and subject = v_transaction.result_subject
     and email = v_transaction.result_verified_email;
  if not found then return jsonb_build_object('status', 'profile_mismatch'); end if;

  perform 1 from academy.identity_session
   where id = p_session_id
     and issuer = v_transaction.result_issuer
     and subject_key = p_subject_key
     and verified_email = v_transaction.result_verified_email
     and activation_status = v_transaction.result_activation_status
     and activation_revision = v_transaction.result_activation_revision
     and expires_at > v_now;
  if not found then return jsonb_build_object('status', 'session_mismatch'); end if;

  update academy.identity_authorization_transaction
     set claim_digest = null,
         claim_expires_at = null,
         completed_account_id = p_account_id,
         completed_at = v_now
   where state = p_state;
  return jsonb_build_object('status', 'completed');
end;
$$;

comment on function academy.claim_identity_authorization_transaction(text, text, text, text, integer) is
  'Lease one browser-bound Academy callback or return its exact completed receipt';
comment on function academy.consume_identity_authorization_transaction(text, text) is
  'Legacy rollback path; consume only a callback never claimed by the recoverable completion state machine';
comment on function academy.checkpoint_identity_authorization_exchange(text, text, text, text, text, text, bigint) is
  'Checkpoint one verified Identity result so retries never exchange a one-time code twice';
comment on function academy.release_identity_authorization_transaction_claim(text, text, text) is
  'Release one exact callback lease and retain a fixed failure-stage marker';
comment on function academy.finalize_identity_authorization_transaction(text, text, uuid, text, text) is
  'Mark one callback complete only after its exact Academy profile and session exist';

revoke all on function academy.claim_identity_authorization_transaction(text, text, text, text, integer)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.checkpoint_identity_authorization_exchange(text, text, text, text, text, text, bigint)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.release_identity_authorization_transaction_claim(text, text, text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.finalize_identity_authorization_transaction(text, text, uuid, text, text)
  from public, anon, authenticated, service_role, academy_runtime;

grant execute on function academy.claim_identity_authorization_transaction(text, text, text, text, integer)
  to academy_runtime;
grant execute on function academy.checkpoint_identity_authorization_exchange(text, text, text, text, text, text, bigint)
  to academy_runtime;
grant execute on function academy.release_identity_authorization_transaction_claim(text, text, text)
  to academy_runtime;
grant execute on function academy.finalize_identity_authorization_transaction(text, text, uuid, text, text)
  to academy_runtime;
