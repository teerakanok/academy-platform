-- Academy-local database-clock lease for one logical Identity lifecycle puller.
-- This migration adds no puller, scheduler, transport, key, or runtime wiring.

create table if not exists academy.identity_lifecycle_pull_leases (
  consumer_id text primary key,
  claim_token uuid not null,
  claimed_by text not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null,
  constraint ck_identity_lifecycle_pull_lease_consumer
    check (consumer_id = 'academy-web'),
  constraint ck_identity_lifecycle_pull_lease_token check (
    claim_token::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint ck_identity_lifecycle_pull_lease_worker check (
    claimed_by ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  constraint ck_identity_lifecycle_pull_lease_window check (
    lease_until >= updated_at + interval '1 second'
    and lease_until <= updated_at + interval '5 minutes'
  )
);

alter table academy.identity_lifecycle_pull_leases enable row level security;

create or replace function academy.identity_lifecycle_worker_id_is_valid(
  p_value text
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select p_value is not null
    and p_value ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
$function$;

create or replace function academy.identity_lifecycle_claim_token_is_valid(
  p_value text
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select p_value is not null
    and p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$function$;

create or replace function academy.identity_lifecycle_lease_duration_is_valid(
  p_value numeric
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when p_value is null or p_value::text in ('NaN', 'Infinity', '-Infinity') then false
    else p_value = trunc(p_value) and p_value between 1000 and 300000
  end
$function$;

create or replace function academy.claim_identity_lifecycle_pull_lease(
  p_claimed_by text,
  p_lease_duration_ms numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := transaction_timestamp();
  v_claim_token uuid := gen_random_uuid();
  v_claimed_by text;
  v_lease_until timestamptz;
begin
  if not academy.identity_lifecycle_worker_id_is_valid(p_claimed_by) then
    raise exception 'Identity lifecycle pull lease worker ID is invalid';
  end if;
  if not academy.identity_lifecycle_lease_duration_is_valid(p_lease_duration_ms) then
    raise exception 'Identity lifecycle pull lease duration is invalid';
  end if;

  insert into academy.identity_lifecycle_pull_leases (
    consumer_id,
    claim_token,
    claimed_by,
    lease_until,
    updated_at
  ) values (
    'academy-web',
    v_claim_token,
    p_claimed_by,
    v_now + (p_lease_duration_ms::bigint * interval '1 millisecond'),
    v_now
  ) on conflict (consumer_id) do update set
    claim_token = excluded.claim_token,
    claimed_by = excluded.claimed_by,
    lease_until = excluded.lease_until,
    updated_at = excluded.updated_at
  where academy.identity_lifecycle_pull_leases.lease_until <= v_now
  returning claim_token, claimed_by, lease_until
    into v_claim_token, v_claimed_by, v_lease_until;

  if not found then return null; end if;
  return jsonb_build_object(
    'claimToken', v_claim_token::text,
    'claimedBy', v_claimed_by,
    'leaseUntil', to_char(
      v_lease_until at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  );
end
$function$;

create or replace function academy.renew_identity_lifecycle_pull_lease(
  p_claim_token text,
  p_claimed_by text,
  p_lease_duration_ms numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := transaction_timestamp();
  v_token uuid;
  v_claimed_by text;
  v_lease_until timestamptz;
begin
  if not academy.identity_lifecycle_claim_token_is_valid(p_claim_token) then
    raise exception 'Identity lifecycle pull lease claim token is invalid';
  end if;
  if not academy.identity_lifecycle_worker_id_is_valid(p_claimed_by) then
    raise exception 'Identity lifecycle pull lease worker ID is invalid';
  end if;
  if not academy.identity_lifecycle_lease_duration_is_valid(p_lease_duration_ms) then
    raise exception 'Identity lifecycle pull lease duration is invalid';
  end if;

  update academy.identity_lifecycle_pull_leases set
    lease_until = v_now + (p_lease_duration_ms::bigint * interval '1 millisecond'),
    updated_at = v_now
  where consumer_id = 'academy-web'
    and claim_token = p_claim_token::uuid
    and claimed_by = p_claimed_by
    and lease_until > v_now
  returning claim_token, claimed_by, lease_until
    into v_token, v_claimed_by, v_lease_until;

  if not found then return null; end if;
  return jsonb_build_object(
    'claimToken', v_token::text,
    'claimedBy', v_claimed_by,
    'leaseUntil', to_char(
      v_lease_until at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  );
end
$function$;

create or replace function academy.release_identity_lifecycle_pull_lease(
  p_claim_token text,
  p_claimed_by text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_count bigint;
begin
  if not academy.identity_lifecycle_claim_token_is_valid(p_claim_token) then
    raise exception 'Identity lifecycle pull lease claim token is invalid';
  end if;
  if not academy.identity_lifecycle_worker_id_is_valid(p_claimed_by) then
    raise exception 'Identity lifecycle pull lease worker ID is invalid';
  end if;

  delete from academy.identity_lifecycle_pull_leases
  where consumer_id = 'academy-web'
    and claim_token = p_claim_token::uuid
    and claimed_by = p_claimed_by
    and lease_until > transaction_timestamp();
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$function$;

create or replace function academy.commit_identity_lifecycle_page_under_lease(
  p_claim_token text,
  p_claimed_by text,
  p_expected_cursor text,
  p_next_cursor text,
  p_approved_config_revision bigint,
  p_configuration_health text,
  p_observed_config_revision bigint,
  p_projections jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if not academy.identity_lifecycle_claim_token_is_valid(p_claim_token) then
    raise exception 'Identity lifecycle pull lease claim token is invalid';
  end if;
  if not academy.identity_lifecycle_worker_id_is_valid(p_claimed_by) then
    raise exception 'Identity lifecycle pull lease worker ID is invalid';
  end if;

  perform 1
  from academy.identity_lifecycle_pull_leases
  where consumer_id = 'academy-web'
    and claim_token = p_claim_token::uuid
    and claimed_by = p_claimed_by
    and lease_until > transaction_timestamp()
  for update;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'Identity lifecycle pull lease conflict';
  end if;

  perform academy.commit_identity_lifecycle_page(
    p_expected_cursor,
    p_next_cursor,
    p_approved_config_revision,
    p_configuration_health,
    p_observed_config_revision,
    p_projections
  );
end
$function$;

revoke all on table academy.identity_lifecycle_pull_leases
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_worker_id_is_valid(text)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_claim_token_is_valid(text)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_lease_duration_is_valid(numeric)
  from public, academy_runtime;
revoke all on function academy.claim_identity_lifecycle_pull_lease(text, numeric)
  from public, academy_runtime;
revoke all on function academy.renew_identity_lifecycle_pull_lease(text, text, numeric)
  from public, academy_runtime;
revoke all on function academy.release_identity_lifecycle_pull_lease(text, text)
  from public, academy_runtime;
revoke all on function academy.commit_identity_lifecycle_page_under_lease(
  text, text, text, text, bigint, text, bigint, jsonb
) from public, academy_runtime;

-- The original page RPC remains available only to the migration owner for
-- isolated administrative and test use. Runtime code can commit only under a lease.
revoke all on function academy.commit_identity_lifecycle_page(
  text, text, bigint, text, bigint, jsonb
) from academy_runtime;

grant usage on schema academy to academy_runtime;
grant execute on function academy.claim_identity_lifecycle_pull_lease(text, numeric)
  to academy_runtime;
grant execute on function academy.renew_identity_lifecycle_pull_lease(text, text, numeric)
  to academy_runtime;
grant execute on function academy.release_identity_lifecycle_pull_lease(text, text)
  to academy_runtime;
grant execute on function academy.commit_identity_lifecycle_page_under_lease(
  text, text, text, text, bigint, text, bigint, jsonb
) to academy_runtime;
