create or replace function academy.identity_session_id_digest(p_session_id text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select rtrim(
    translate(
      encode(sha256(convert_to(p_session_id, 'UTF8')), 'base64'),
      '+/',
      '-_'
    ),
    '='
  )
$$;

revoke all on function academy.identity_session_id_digest(text)
  from public, anon, authenticated, service_role, academy_runtime;

create table if not exists academy.identity_session_id_digest_transition (
  migration_name text primary key,
  applied_at timestamptz not null default statement_timestamp()
);

alter table academy.identity_session_id_digest_transition
  enable row level security;

do $$
begin
  if exists (
    select 1
      from academy.identity_session_id_digest_transition
     where migration_name = '0034_identity_session_id_digest'
  ) then
    raise exception 'identity session digest transition was already applied'
      using errcode = '23514';
  end if;
end
$$;

lock table academy.identity_session,
            academy.identity_authorization_transaction
  in access exclusive mode;

do $$
declare
  v_digest_collisions bigint;
begin
  select count(*) into v_digest_collisions
  from (
    select academy.identity_session_id_digest(id) as digest
      from academy.identity_session
     group by academy.identity_session_id_digest(id)
    having count(*) > 1
  ) as collisions;

  if v_digest_collisions > 0 then
    raise exception 'identity session digest transition would collide'
      using errcode = '23514';
  end if;
end
$$;

update academy.identity_session
   set id = academy.identity_session_id_digest(id);

-- Legacy completed receipts held random raw bearers that cannot be converted
-- into the deterministic retry bearer. Clear only linkage/lease state so the
-- retained verified result can issue a fresh digest-bound receipt on retry.
update academy.identity_authorization_transaction
   set claim_digest = null,
       claim_expires_at = null,
       session_id = null,
       completed_account_id = null,
       completed_at = null,
       attempt_count = 0
 where session_id is not null
    or completed_at is not null
    or claim_digest is not null;

create or replace function academy.create_identity_session_digest(
  p_session_id text,
  p_issuer text,
  p_subject_key text,
  p_verified_email text,
  p_activation_status text,
  p_activation_revision bigint,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_expires_at timestamptz;
begin
  if p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
     or not academy.identity_lifecycle_issuer_is_canonical(p_issuer)
     or not academy.identity_lifecycle_subject_key_is_valid(p_subject_key)
     or p_verified_email is null or char_length(p_verified_email) not between 3 and 320
     or p_verified_email <> lower(btrim(p_verified_email))
     or p_verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_activation_status is null
     or p_activation_status not in ('pending', 'active', 'suspended', 'deactivated')
     or p_activation_revision is null
     or p_activation_revision not between 1 and 9007199254740991
     or p_ttl_seconds is null or p_ttl_seconds not between 1 and 2592000 then
    raise exception 'invalid identity session digest input' using errcode = '22023';
  end if;

  -- Preserve 0032's lock order: principal before expired-session row locks.
  perform pg_advisory_xact_lock(
    hashtextextended(jsonb_build_array(p_issuer, p_subject_key)::text, 0)
  );

  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);

  with expired as (
    select id from academy.identity_session
     where expires_at <= v_now
     order by expires_at, id
     limit 100
     for update skip locked
  )
  delete from academy.identity_session as target
   using expired
   where target.id = expired.id;

  insert into academy.identity_session (
    id, issuer, subject_key, verified_email, activation_status,
    activation_revision, created_at, expires_at
  ) values (
    p_session_id, p_issuer, p_subject_key, p_verified_email, p_activation_status,
    p_activation_revision, v_now, v_expires_at
  ) on conflict (id) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);
  update academy.identity_session
     set created_at = v_now,
         expires_at = v_expires_at
   where id = p_session_id;

  return jsonb_build_object(
    'status', 'created',
    'session', academy.identity_session_json(
      p_session_id, p_issuer, p_subject_key, p_verified_email, p_activation_status,
      p_activation_revision, v_now, v_expires_at
    )
  );
end;
$$;

create or replace function academy.read_identity_session_digest(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_session academy.identity_session%rowtype;
begin
  if p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session digest' using errcode = '22023';
  end if;
  select * into v_session from academy.identity_session
   where id = p_session_id for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_session.expires_at <= v_now then
    delete from academy.identity_session where id = p_session_id;
    return jsonb_build_object('status', 'expired');
  end if;
  return jsonb_build_object(
    'status', 'active',
    'session', academy.identity_session_json(
      v_session.id, v_session.issuer, v_session.subject_key, v_session.verified_email,
      v_session.activation_status, v_session.activation_revision,
      v_session.created_at, v_session.expires_at
    )
  );
end;
$$;

create or replace function academy.revoke_identity_session_digest(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session digest' using errcode = '22023';
  end if;
  delete from academy.identity_session where id = p_session_id;
  if found then return jsonb_build_object('status', 'revoked'); end if;
  return jsonb_build_object('status', 'absent');
end;
$$;

create or replace function academy.create_identity_session(
  p_session_id text,
  p_issuer text,
  p_subject_key text,
  p_verified_email text,
  p_activation_status text,
  p_activation_revision bigint,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_result jsonb;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session id' using errcode = '22023';
  end if;
  v_result := academy.create_identity_session_digest(
    academy.identity_session_id_digest(p_session_id),
    p_issuer, p_subject_key, p_verified_email, p_activation_status,
    p_activation_revision, p_ttl_seconds
  );
  if v_result->>'status' = 'created' then
    v_result := jsonb_set(v_result, '{session,id}', to_jsonb(p_session_id));
  end if;
  return v_result;
end;
$$;

create or replace function academy.read_identity_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_result jsonb;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session id' using errcode = '22023';
  end if;
  v_result := academy.read_identity_session_digest(
    academy.identity_session_id_digest(p_session_id)
  );
  if v_result->>'status' = 'active' then
    v_result := jsonb_set(v_result, '{session,id}', to_jsonb(p_session_id));
  end if;
  return v_result;
end;
$$;

create or replace function academy.revoke_identity_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session id' using errcode = '22023';
  end if;
  return academy.revoke_identity_session_digest(
    academy.identity_session_id_digest(p_session_id)
  );
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
begin
  raise exception 'legacy raw authorization completion is disabled after digest transition'
    using errcode = '55000';
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
begin
  raise exception 'legacy raw authorization completion is disabled after digest transition'
    using errcode = '55000';
end;
$$;

comment on column academy.identity_session.id is
  'SHA-256 base64url digest of the browser-held opaque Academy session bearer';
comment on column academy.identity_authorization_transaction.session_id is
  'SHA-256 base64url digest matching identity_session.id; legacy raw linkage is reset for deterministic retry';
comment on function academy.create_identity_session_digest(text, text, text, text, text, bigint, integer) is
  'Create one Academy session from an already-digested opaque bearer';
comment on function academy.claim_identity_authorization_transaction_digest(text, text, text, text, integer) is
  'Lease one browser-bound callback using an already-digested deterministic session receipt';
comment on function academy.finalize_identity_authorization_transaction_digest(text, text, uuid, text, text) is
  'Finalize one callback after matching its digest-bound Academy profile and session';

revoke all on table academy.identity_session_id_digest_transition
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.create_identity_session_digest(text, text, text, text, text, bigint, integer)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.read_identity_session_digest(text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.revoke_identity_session_digest(text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.claim_identity_authorization_transaction_digest(text, text, text, text, integer)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.finalize_identity_authorization_transaction_digest(text, text, uuid, text, text)
  from public, anon, authenticated, service_role, academy_runtime;

grant execute on function academy.create_identity_session_digest(text, text, text, text, text, bigint, integer)
  to academy_runtime;
grant execute on function academy.read_identity_session_digest(text) to academy_runtime;
grant execute on function academy.revoke_identity_session_digest(text) to academy_runtime;
grant execute on function academy.claim_identity_authorization_transaction_digest(text, text, text, text, integer)
  to academy_runtime;
grant execute on function academy.finalize_identity_authorization_transaction_digest(text, text, uuid, text, text)
  to academy_runtime;

insert into academy.identity_session_id_digest_transition (migration_name)
values ('0034_identity_session_id_digest');
