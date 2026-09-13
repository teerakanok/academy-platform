-- Explicit v3 OTP receipts preserve authentication method/time across durable completion.
-- Existing non-null receipt timestamps were admitted by the strict v2 WebAuthn contract.
-- Never backfill auth_time from session creation or current clocks.
alter table academy.identity_session drop constraint identity_session_authentication_check;
alter table academy.identity_session add constraint identity_session_authentication_check
  check ((authentication_method = 'legacy_unknown' and authentication_time is null)
    or (authentication_method in ('webauthn_uv', 'email_otp') and authentication_time is not null
      and authentication_time between 0 and 9007199254740991));
alter table academy.identity_authorization_transaction
  add column result_authentication_method text,
  add column result_version integer;
update academy.identity_authorization_transaction
  set result_authentication_method = 'webauthn_uv', result_version = 2
  where result_authentication_time is not null;
alter table academy.identity_authorization_transaction add constraint identity_authorization_result_assurance_check
  check ((result_authentication_time is null and result_authentication_method is null and result_version is null)
    or (result_authentication_time is not null and result_authentication_method is not null and result_version is not null
      and ((result_version = 2 and result_authentication_method = 'webauthn_uv')
        or (result_version = 3 and result_authentication_method in ('webauthn_uv', 'email_otp')))));


create or replace function academy.identity_session_json_v2(p_session academy.identity_session)
returns jsonb language sql stable set search_path = pg_catalog, academy as $$
  select jsonb_set(academy.identity_session_json(
    p_session.id, p_session.issuer, p_session.subject_key, p_session.verified_email,
    p_session.activation_status, p_session.activation_revision, p_session.created_at, p_session.expires_at
  ), '{claims,authentication}', case when p_session.authentication_method in ('webauthn_uv', 'email_otp')
    then jsonb_build_object('method', p_session.authentication_method, 'auth_time', p_session.authentication_time)
    else jsonb_build_object('method', 'legacy_unknown') end)
$$;

create or replace function academy.create_identity_session_digest_v3(
  p_session_id text, p_issuer text, p_subject_key text, p_verified_email text,
  p_activation_status text, p_activation_revision bigint, p_ttl_seconds integer,
  p_auth_time bigint, p_auth_method text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, academy as $$
declare
  v_result jsonb;
  v_session academy.identity_session%rowtype;
  v_now timestamptz;
begin
  if p_auth_method is null or p_auth_method not in ('webauthn_uv', 'email_otp') then
    raise exception 'invalid authentication method' using errcode = '22023';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 1 and 43200 then
    raise exception 'invalid identity session lifetime' using errcode = '22023';
  end if;
  -- The existing creator validates all inputs and obtains the principal lock;
  -- its insert trigger enforces the current lifecycle and activation projection.
  v_result := academy.create_identity_session_digest(p_session_id, p_issuer,
    p_subject_key, p_verified_email, p_activation_status, p_activation_revision, p_ttl_seconds);
  v_now := date_trunc('milliseconds', clock_timestamp());
  if not academy.identity_authentication_receipt_is_fresh(p_auth_time, v_now) then
    raise exception 'fresh identity authentication required' using errcode = '22023';
  end if;
  if v_result ->> 'status' = 'duplicate' then return v_result; end if;
  if v_result ->> 'status' is distinct from 'created' then
    raise exception 'identity session creation failed' using errcode = '22023';
  end if;
  update academy.identity_session set authentication_method = p_auth_method,
    authentication_time = p_auth_time, last_seen_at = created_at
    where id = p_session_id returning * into v_session;
  return jsonb_build_object('status', 'created', 'session', academy.identity_session_json_v2(v_session));
end;
$$;

create or replace function academy.checkpoint_identity_authorization_exchange_v3(
  p_state text,
  p_claim_digest text,
  p_issuer text,
  p_subject text,
  p_verified_email text,
  p_activation_status text,
  p_activation_revision bigint,
  p_auth_time bigint, p_auth_method text, p_result_version integer
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
  if p_auth_method is null or p_result_version is null or not (
    (p_result_version = 2 and p_auth_method = 'webauthn_uv')
    or (p_result_version = 3 and p_auth_method in ('webauthn_uv', 'email_otp'))) then
    raise exception 'invalid versioned authentication method' using errcode = '22023';
  end if;
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

  if not academy.identity_authentication_receipt_is_fresh(p_auth_time, v_now) then
    return jsonb_build_object('status', 'reauthentication_required');
  end if;

  if v_transaction.result_issuer is not null then
    if v_transaction.result_authentication_method is distinct from p_auth_method
       or v_transaction.result_version is distinct from p_result_version
       or v_transaction.result_authentication_time is distinct from p_auth_time
       or v_transaction.result_issuer is distinct from p_issuer
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
         result_activation_revision = p_activation_revision,
         result_authentication_time = p_auth_time,
         result_authentication_method = p_auth_method,
         result_version = p_result_version
   where state = p_state;
  return jsonb_build_object('status', 'checkpointed');
end;
$$;

create or replace function academy.claim_identity_authorization_transaction_digest(
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
     or p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
     or p_lease_seconds is null or p_lease_seconds not between 1 and 60 then
    raise exception 'invalid identity authorization transaction digest claim'
      using errcode = '22023';
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
  if v_transaction.result_issuer is not null
     and not academy.identity_authentication_receipt_is_fresh(v_transaction.result_authentication_time, v_now) then
    return jsonb_build_object('status', 'reauthentication_required');
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
      'version', v_transaction.result_version,
      'authentication', jsonb_build_object('method', v_transaction.result_authentication_method, 'auth_time', v_transaction.result_authentication_time),
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

create or replace function academy.finalize_identity_authorization_transaction_digest(
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
     or p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
     or not academy.identity_lifecycle_subject_key_is_valid(p_subject_key) then
    raise exception 'invalid identity authorization transaction digest completion'
      using errcode = '22023';
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
     or v_transaction.session_id is distinct from p_session_id
     or academy.identity_subject_key(v_transaction.result_subject) is distinct from p_subject_key then
    return jsonb_build_object('status', 'result_mismatch');
  end if;

  -- Acquire the same principal lock as disable/delete before the final session check.
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(v_transaction.result_issuer, p_subject_key)::text, 0));
  v_now := date_trunc('milliseconds', clock_timestamp());
  if not academy.identity_authentication_receipt_is_fresh(v_transaction.result_authentication_time, v_now) then
    return jsonb_build_object('status', 'reauthentication_required');
  end if;
  if academy.read_identity_session_digest(p_session_id) ->> 'status' is distinct from 'active' then
    return jsonb_build_object('status', 'session_mismatch');
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
     and authentication_method = v_transaction.result_authentication_method
     and authentication_time = v_transaction.result_authentication_time
     and expires_at > v_now;
  if not found then return jsonb_build_object('status', 'session_mismatch'); end if;

  -- All principal/session locks have now been acquired. Re-read the DB clock
  -- immediately before finalization; waiting must not extend any lease/expiry.
  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_transaction.expires_at <= v_now or v_transaction.claim_expires_at <= v_now then
    return jsonb_build_object('status', 'claim_mismatch');
  end if;
  if not academy.identity_authentication_receipt_is_fresh(v_transaction.result_authentication_time, v_now) then
    return jsonb_build_object('status', 'reauthentication_required');
  end if;
  perform 1 from academy.identity_session where id = p_session_id
    and expires_at > v_now and created_at + interval '12 hours' > v_now
    and coalesce(last_seen_at,created_at) + interval '30 minutes' > v_now;
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

-- Preserve old v2 callers as WebAuthn-only. These wrappers do not accept a method argument.
create or replace function academy.create_identity_session_digest_v2(
  p_session_id text, p_issuer text, p_subject_key text, p_verified_email text,
  p_activation_status text, p_activation_revision bigint, p_ttl_seconds integer, p_auth_time bigint
) returns jsonb language sql security definer set search_path = pg_catalog, academy as $$
  select academy.create_identity_session_digest_v3(p_session_id, p_issuer, p_subject_key,
    p_verified_email, p_activation_status, p_activation_revision, p_ttl_seconds, p_auth_time, 'webauthn_uv')
$$;
create or replace function academy.checkpoint_identity_authorization_exchange_v2(
  p_state text, p_claim_digest text, p_issuer text, p_subject text, p_verified_email text,
  p_activation_status text, p_activation_revision bigint, p_auth_time bigint
) returns jsonb language sql security definer set search_path = pg_catalog, academy as $$
  select academy.checkpoint_identity_authorization_exchange_v3(p_state, p_claim_digest, p_issuer,
    p_subject, p_verified_email, p_activation_status, p_activation_revision, p_auth_time, 'webauthn_uv', 2)
$$;
revoke all on function academy.create_identity_session_digest_v3(text,text,text,text,text,bigint,integer,bigint,text),
  academy.checkpoint_identity_authorization_exchange_v3(text,text,text,text,text,text,bigint,bigint,text,integer)
  from public, anon, authenticated, service_role, academy_runtime;
grant execute on function academy.create_identity_session_digest_v3(text,text,text,text,text,bigint,integer,bigint,text),
  academy.checkpoint_identity_authorization_exchange_v3(text,text,text,text,text,text,bigint,bigint,text,integer)
  to academy_runtime;
comment on column academy.identity_session.authentication_time is
  'Exact verified v2/v3 authentication time; never envelope issuance or local session creation time';

