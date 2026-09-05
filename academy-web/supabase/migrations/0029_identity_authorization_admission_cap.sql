-- Bound all Academy authorization admissions across runtime instances. The
-- control row is operator-owned; runtime callers still see only the RPC.

create table if not exists academy.identity_authorization_admission_capacity (
  singleton boolean primary key,
  outstanding_limit integer not null,
  constraint identity_authorization_admission_capacity_singleton
    check (singleton),
  constraint identity_authorization_admission_limit_range
    check (outstanding_limit between 1 and 1000)
);

insert into academy.identity_authorization_admission_capacity (singleton, outstanding_limit)
values (true, 1000)
on conflict (singleton) do nothing;

alter table academy.identity_authorization_admission_capacity enable row level security;

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
  v_outstanding_limit integer;
  v_outstanding_count bigint;
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

  perform pg_advisory_xact_lock(2147483001, 29001);

  delete from academy.identity_authorization_transaction
   where state = p_state and expires_at <= v_now;

  -- Wait for a concurrent deletion before deciding whether the state survives.
  perform 1
    from academy.identity_authorization_transaction
   where state = p_state
   for update;
  if found then
    return jsonb_build_object('status', 'duplicate');
  end if;

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

  select outstanding_limit into v_outstanding_limit
    from academy.identity_authorization_admission_capacity
   where singleton;
  if not found then
    raise exception 'identity authorization admission capacity is unavailable' using errcode = 'P0002';
  end if;

  select count(*) into v_outstanding_count
    from academy.identity_authorization_transaction
   where expires_at > v_now;
  if v_outstanding_count >= v_outstanding_limit then
    return jsonb_build_object('status', 'capacity_exhausted');
  end if;

  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);

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

comment on table academy.identity_authorization_admission_capacity is
  'Operator-owned database-wide outstanding Academy authorization limit';
comment on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) is 'Create one authorization transaction under a cross-instance atomic outstanding cap';

revoke all on table academy.identity_authorization_admission_capacity
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role, academy_runtime;
grant execute on function academy.create_identity_authorization_transaction(
  text, text, text, text, text, text, text, text, text, text, text, integer
) to academy_runtime;
