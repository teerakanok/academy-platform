-- Academy-owned, one-time authorization callback transactions. The runtime can
-- use only the two RPCs below; raw browser bindings never cross this boundary.

create table if not exists academy.identity_authorization_transaction (
  state text not null,
  code_verifier text not null,
  nonce text not null,
  browser_binding_digest text not null,
  client_id text not null,
  redirect_uri text not null,
  service_id text not null,
  audience text not null,
  expected_issuer text not null,
  client_assertion_audience text not null,
  return_path text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default date_trunc('milliseconds', clock_timestamp()),
  primary key (state),
  constraint identity_authorization_transaction_state_format
    check (state ~ '^[A-Za-z0-9_-]{16,160}$'),
  constraint identity_authorization_transaction_verifier_format
    check (char_length(code_verifier) between 43 and 128
      and code_verifier ~ '^[A-Za-z0-9._~-]+$'),
  constraint identity_authorization_transaction_nonce_format
    check (nonce ~ '^[A-Za-z0-9_-]{16,160}$'),
  constraint identity_authorization_transaction_binding_digest_format
    check (browser_binding_digest ~ '^[A-Za-z0-9_-]{43}$'),
  constraint identity_authorization_transaction_client_id_length
    check (char_length(client_id) between 1 and 80),
  constraint identity_authorization_transaction_redirect_uri_length
    check (char_length(redirect_uri) between 1 and 2048),
  constraint identity_authorization_transaction_service_id_length
    check (char_length(service_id) between 1 and 80),
  constraint identity_authorization_transaction_audience_length
    check (char_length(audience) between 1 and 512),
  constraint identity_authorization_transaction_expected_issuer_length
    check (char_length(expected_issuer) between 1 and 2048),
  constraint identity_authorization_transaction_assertion_audience_length
    check (char_length(client_assertion_audience) between 1 and 512),
  constraint identity_authorization_transaction_return_path_format
    check (char_length(return_path) between 1 and 2048
      and left(return_path, 1) = '/'
      and left(return_path, 2) <> '//'
      and left(return_path, 2) <> '/\'),
  constraint identity_authorization_transaction_expiry_order
    check (expires_at > created_at)
);

create index if not exists identity_authorization_transaction_expiry_idx
  on academy.identity_authorization_transaction (expires_at, state);

alter table academy.identity_authorization_transaction enable row level security;

create or replace function academy.create_identity_authorization_transaction(
  p_state text,
  p_code_verifier text,
  p_nonce text,
  p_browser_binding_digest text,
  p_client_id text,
  p_redirect_uri text,
  p_service_id text,
  p_audience text,
  p_expected_issuer text,
  p_client_assertion_audience text,
  p_return_path text,
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
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_code_verifier is null
     or char_length(p_code_verifier) not between 43 and 128
     or p_code_verifier !~ '^[A-Za-z0-9._~-]+$'
     or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_browser_binding_digest is null
     or p_browser_binding_digest !~ '^[A-Za-z0-9_-]{43}$'
     or p_client_id is null or char_length(p_client_id) not between 1 and 80
     or p_redirect_uri is null or char_length(p_redirect_uri) not between 1 and 2048
     or p_service_id is null or char_length(p_service_id) not between 1 and 80
     or p_audience is null or char_length(p_audience) not between 1 and 512
     or p_expected_issuer is null or char_length(p_expected_issuer) not between 1 and 2048
     or p_client_assertion_audience is null
     or char_length(p_client_assertion_audience) not between 1 and 512
     or p_return_path is null or char_length(p_return_path) not between 1 and 2048
     or left(p_return_path, 1) <> '/'
     or left(p_return_path, 2) in ('//', '/\')
     or p_ttl_seconds is null or p_ttl_seconds not between 1 and 600 then
    raise exception 'invalid identity authorization transaction input' using errcode = '22023';
  end if;

  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);

  -- Reclaim the same expired state first, then bound general cleanup work per
  -- authorization start so abandoned rows cannot grow without bound.
  delete from academy.identity_authorization_transaction
   where state = p_state and expires_at <= v_now;

  with expired as (
    select state
      from academy.identity_authorization_transaction
     where expires_at <= v_now
     order by expires_at, state
     limit 100
     for update skip locked
  )
  delete from academy.identity_authorization_transaction as target
   using expired
   where target.state = expired.state;

  insert into academy.identity_authorization_transaction (
    state,
    code_verifier,
    nonce,
    browser_binding_digest,
    client_id,
    redirect_uri,
    service_id,
    audience,
    expected_issuer,
    client_assertion_audience,
    return_path,
    expires_at,
    created_at
  ) values (
    p_state,
    p_code_verifier,
    p_nonce,
    p_browser_binding_digest,
    p_client_id,
    p_redirect_uri,
    p_service_id,
    p_audience,
    p_expected_issuer,
    p_client_assertion_audience,
    p_return_path,
    v_expires_at,
    v_now
  )
  on conflict (state) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- The unique-index arbitration above can wait behind another transaction.
  -- Start the durable TTL only after this insert has actually won.
  v_now := date_trunc('milliseconds', clock_timestamp());
  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);
  update academy.identity_authorization_transaction
     set created_at = v_now,
         expires_at = v_expires_at
   where state = p_state;

  return jsonb_build_object(
    'status', 'created',
    'expiresAt', to_char(v_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

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
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_transaction academy.identity_authorization_transaction%rowtype;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,160}$'
     or p_browser_binding_digest is null
     or p_browser_binding_digest !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity authorization transaction claim' using errcode = '22023';
  end if;

  select *
    into v_transaction
    from academy.identity_authorization_transaction
   where state = p_state
   for update;

  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;

  -- Row-lock acquisition can wait across the expiry boundary. Classify using
  -- the database clock after the lock is held, not the pre-wait snapshot.
  v_now := date_trunc('milliseconds', clock_timestamp());

  if v_transaction.expires_at <= v_now then
    delete from academy.identity_authorization_transaction where state = p_state;
    return jsonb_build_object('status', 'expired');
  end if;

  if v_transaction.browser_binding_digest <> p_browser_binding_digest then
    return jsonb_build_object('status', 'browser_mismatch');
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

comment on table academy.identity_authorization_transaction is
  'One-time Academy authorization callback state; stores only a browser-binding digest';
comment on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) is 'Create one durable Academy authorization transaction using the database clock';
comment on function academy.consume_identity_authorization_transaction(text, text) is
  'Atomically verify and consume one Academy authorization transaction';

revoke all on table academy.identity_authorization_transaction
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.consume_identity_authorization_transaction(text, text)
  from public, anon, authenticated, service_role, academy_runtime;

grant usage on schema academy to academy_runtime;
grant execute on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) to academy_runtime;
grant execute on function academy.consume_identity_authorization_transaction(text, text)
  to academy_runtime;
