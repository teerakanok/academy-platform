-- Enforce the durable Identity lifecycle projection against Academy profiles,
-- activation, and opaque sessions. No live database operation is performed here.

do $$
begin
  if not exists (
    select 1 from pg_proc
     where pronamespace = 'academy'::regnamespace
       and proname = 'commit_identity_lifecycle_page_under_lease'
  ) or not exists (
    select 1 from pg_proc
     where pronamespace = 'academy'::regnamespace
       and proname = 'commit_identity_profile_activation'
  ) then
    raise exception 'Identity lifecycle prerequisites are not installed' using errcode = '55000';
  end if;
end
$$;

create index if not exists identity_session_principal_idx
  on academy.identity_session (issuer, subject_key, expires_at, id);

create or replace function academy.identity_subject_key(p_subject text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $$
declare
  v_offset integer := 1;
  v_code_point integer;
  v_result text := '';
begin
  if p_subject is null or length(p_subject) < 1 or length(p_subject) > 512 then
    return null;
  end if;

  while v_offset <= length(p_subject)
  loop
    v_code_point := ascii(substr(p_subject, v_offset, 1));
    if v_code_point = 0 then
      return null;
    elsif v_code_point <= 65535 then
      v_result := v_result || lpad(to_hex(v_code_point), 4, '0');
    else
      v_code_point := v_code_point - 65536;
      v_result := v_result
        || lpad(to_hex(55296 + (v_code_point / 1024)), 4, '0')
        || lpad(to_hex(56320 + (v_code_point % 1024)), 4, '0');
    end if;
    v_offset := v_offset + 1;
  end loop;

  return v_result;
end
$$;

create or replace function academy.identity_lifecycle_allows_profile_activation(
  p_issuer text,
  p_subject text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_state text;
  v_health text;
  v_configuration_health text;
  v_subject_key text;
begin
  if not academy.identity_lifecycle_issuer_is_canonical(p_issuer) then
    return false;
  end if;
  v_subject_key := academy.identity_subject_key(p_subject);
  if v_subject_key is null
    or not academy.identity_lifecycle_subject_key_is_valid(v_subject_key) then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(jsonb_build_array(p_issuer, v_subject_key)::text, 0)
  );
  select c.configuration_health
    into v_configuration_health
    from academy.identity_lifecycle_consumer_checkpoint c
   where c.consumer_id = 'academy-web';
  if found and v_configuration_health <> 'ready' then
    return false;
  end if;
  select l.state, l.health
    into v_state, v_health
    from academy.identity_lifecycle_projection l
   where l.consumer_id = 'academy-web'
     and l.issuer = p_issuer
     and l.subject_key = v_subject_key;
  return not found or (v_health = 'ready' and v_state = 'active');
end
$$;

create or replace function academy.apply_identity_lifecycle_projection_effects(
  p_projections jsonb,
  p_allow_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_projection jsonb;
  v_current jsonb;
  v_health jsonb;
  v_issuer text;
  v_subject_key text;
  v_state text;
  v_revision bigint;
  v_account_id uuid;
  v_status text;
  v_activation_revision bigint;
  v_revoked integer;
begin
  if p_projections is null
    or jsonb_typeof(p_projections) is distinct from 'array'
    or jsonb_array_length(p_projections) > 100
    or p_allow_active is null then
    raise exception 'Identity lifecycle effect projection count is invalid' using errcode = '22023';
  end if;

  for v_projection in select value from jsonb_array_elements(p_projections)
  loop
    v_current := v_projection -> 'current';
    v_health := v_projection -> 'health';
    continue when v_current is null or (v_health ->> 'status') is distinct from 'ready';

    v_issuer := v_current ->> 'issuer';
    v_subject_key := v_current ->> 'subjectKey';
    v_state := v_current ->> 'state';
    v_revision := (v_current ->> 'revision')::bigint;
    if not academy.identity_lifecycle_issuer_is_canonical(v_issuer)
      or not academy.identity_lifecycle_subject_key_is_valid(v_subject_key)
      or v_state not in ('active', 'disabled', 'deleted')
      or v_revision not between 1 and 9007199254740991 then
      raise exception 'Identity lifecycle effect projection is invalid' using errcode = '22023';
    end if;

    -- A producer config revision must be approved before it can restore access.
    -- Revocations remain immediate so reconciliation cannot widen access.
    continue when v_state = 'active' and not p_allow_active;

    perform pg_advisory_xact_lock(
      hashtextextended(jsonb_build_array(v_issuer, v_subject_key)::text, 0)
    );

    select u.id into v_account_id
      from academy.users u
     where u.issuer = v_issuer
       and academy.identity_subject_key(u.subject) = v_subject_key
       for update of u;

    if v_account_id is not null then
      v_status := case v_state when 'active' then 'active' else 'suspended' end;
      if v_state = 'deleted' then v_status := 'deactivated'; end if;

      if not academy.sync_service_activation(v_account_id, v_status, v_revision::integer) then
        select a.status, a.revision
          into v_status, v_activation_revision
          from academy.service_activation a
         where a.user_id = v_account_id;
        if v_activation_revision is distinct from v_revision
          or v_status is distinct from (
            case v_state when 'active' then 'active' when 'deleted' then 'deactivated' else 'suspended' end
          ) then
          raise exception 'Identity lifecycle activation projection is stale' using errcode = '23514';
        end if;
      end if;

      if v_state = 'deleted' then
        delete from academy.users where id = v_account_id;
      end if;
    end if;

    loop
      v_revoked := academy.revoke_identity_sessions_for_principal(
        v_issuer, v_subject_key, 1000
      );
      exit when v_revoked < 1000;
    end loop;
  end loop;
end
$$;

create or replace function academy.approve_identity_lifecycle_config_revision(
  p_approved_revision bigint
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_current_revision bigint;
  v_configuration_health text;
  v_observed_revision bigint;
  v_projections jsonb;
begin
  if p_approved_revision is null
    or p_approved_revision not between 1 and 9007199254740991 then
    raise exception 'Identity lifecycle approved config revision is invalid' using errcode = '22023';
  end if;

  select c.approved_config_revision, c.configuration_health, c.observed_config_revision
    into v_current_revision, v_configuration_health, v_observed_revision
    from academy.identity_lifecycle_consumer_checkpoint c
   where c.consumer_id = 'academy-web'
   for update;
  if not found then
    return false;
  end if;
  if v_configuration_health = 'ready' then
    if p_approved_revision = v_current_revision then return false; end if;
    raise exception 'Identity lifecycle config revision was not observed' using errcode = '23514';
  end if;
  if p_approved_revision = v_current_revision then
    return false;
  end if;
  if p_approved_revision is distinct from v_observed_revision
    or p_approved_revision <= v_current_revision then
    raise exception 'Identity lifecycle config revision is not an observed successor'
      using errcode = '23514';
  end if;

  update academy.identity_lifecycle_consumer_checkpoint
     set approved_config_revision = p_approved_revision,
         configuration_health = 'ready',
         observed_config_revision = null,
         updated_at = transaction_timestamp()
   where consumer_id = 'academy-web';

  select coalesce(jsonb_agg(jsonb_build_object(
    'current', jsonb_build_object(
      'issuer', l.issuer,
      'subjectKey', l.subject_key,
      'state', l.state,
      'revision', l.revision
    ),
    'health', jsonb_build_object('status', 'ready'),
    'highestKnownRevision', l.highest_known_revision
  ) order by l.issuer, l.subject_key), '[]'::jsonb)
    into v_projections
    from academy.identity_lifecycle_projection l
   where l.consumer_id = 'academy-web'
     and l.health = 'ready';
  perform academy.apply_identity_lifecycle_projection_effects(v_projections, true);
  return true;
end
$$;

create or replace function academy.guard_identity_session_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_subject text;
  v_email text;
  v_activation_status text;
  v_activation_revision bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(jsonb_build_array(new.issuer, new.subject_key)::text, 0)
  );

  select u.subject, u.email, a.status, a.revision
    into v_subject, v_email, v_activation_status, v_activation_revision
    from academy.users u
    join academy.service_activation a on a.user_id = u.id
   where u.issuer = new.issuer
     and academy.identity_subject_key(u.subject) = new.subject_key
   for update of u, a;

  if not found
    or v_email is distinct from new.verified_email
    or v_activation_status is distinct from new.activation_status
    or v_activation_revision is distinct from new.activation_revision
    or not academy.identity_lifecycle_allows_profile_activation(new.issuer, v_subject) then
    raise exception 'canonical Identity principal cannot issue a session' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists identity_session_principal_guard on academy.identity_session;
create trigger identity_session_principal_guard
before insert on academy.identity_session
for each row execute function academy.guard_identity_session_insert();

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
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_expires_at timestamptz;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$'
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
    raise exception 'invalid identity session input' using errcode = '22023';
  end if;

  -- Lifecycle revocation takes this lock before touching session rows. Session
  -- issuance must use the same order, including before its expired-row cleanup.
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

create or replace function academy.revoke_identity_sessions_for_principal(
  p_issuer text,
  p_subject_key text,
  p_limit integer default 1000
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_deleted integer;
begin
  if not academy.identity_lifecycle_issuer_is_canonical(p_issuer)
    or not academy.identity_lifecycle_subject_key_is_valid(p_subject_key)
    or p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'invalid identity principal session revocation input' using errcode = '22023';
  end if;

  with doomed as (
    select id
      from academy.identity_session
     where issuer = p_issuer
       and subject_key = p_subject_key
     order by expires_at, id
     limit p_limit
       for update
  )
  delete from academy.identity_session as target
   using doomed
   where target.id = doomed.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

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
  perform academy.apply_identity_lifecycle_projection_effects(
    p_projections,
    p_configuration_health = 'ready'
  );
end
$function$;

create or replace function academy.commit_identity_profile_activation(
  p_issuer text,
  p_subject text,
  p_verified_email text,
  p_status text,
  p_revision integer
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, academy
as $$
declare
  v_account_id uuid;
  v_activation_revision integer;
  v_activation_status text;
  v_current academy.users%rowtype;
  v_email text;
begin
  if p_issuer is null or btrim(p_issuer) = ''
     or p_subject is null or btrim(p_subject) = ''
     or p_verified_email is null
     or p_status is null or p_status not in ('pending', 'active', 'suspended', 'deactivated')
     or p_revision is null or p_revision < 1 then
    raise exception 'invalid identity profile activation input' using errcode = '22023';
  end if;

  v_email := lower(btrim(p_verified_email));
  if char_length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid verified email' using errcode = '22023';
  end if;

  if not academy.identity_lifecycle_allows_profile_activation(p_issuer, p_subject) then
    raise exception 'canonical Identity principal is not active' using errcode = '23514';
  end if;

  insert into academy.users as profile (issuer, subject, email, last_seen_at)
  values (p_issuer, p_subject, v_email, now())
  on conflict (issuer, subject) do nothing
  returning profile.id into v_account_id;

  if v_account_id is null then
    select * into v_current
      from academy.users profile
     where profile.issuer = p_issuer and profile.subject = p_subject
       for update;
    v_account_id := v_current.id;

    if not academy.sync_service_activation(v_account_id, p_status, p_revision) then
      select a.status, a.revision
        into v_activation_status, v_activation_revision
        from academy.service_activation a
       where a.user_id = v_account_id;
      if v_activation_revision <> p_revision or v_activation_status <> p_status then
        raise exception 'stale identity profile activation input' using errcode = '23514';
      end if;
      if v_current.email <> v_email then
        raise exception 'stale verified email cannot replace a newer email' using errcode = '23514';
      end if;
    else
      update academy.users
         set email = v_email, last_seen_at = now()
       where id = v_account_id;
    end if;
  else
    perform academy.sync_service_activation(v_account_id, p_status, p_revision);
  end if;

  select a.status, a.revision
    into strict v_activation_status, v_activation_revision
    from academy.service_activation a
   where a.user_id = v_account_id;
  if v_activation_status is distinct from p_status
     or v_activation_revision is distinct from p_revision then
    raise exception 'stale identity profile activation input' using errcode = '23514';
  end if;
  return v_account_id;
end
$$;

comment on function academy.identity_subject_key(text) is
  'Encode a well-formed Identity subject with the portable UTF-16 code-unit key used by durable sessions';
comment on function academy.identity_lifecycle_allows_profile_activation(text, text) is
  'Serialize callback provisioning with lifecycle commits and expose only whether the durable principal is ready and active';
comment on function academy.apply_identity_lifecycle_projection_effects(jsonb, boolean) is
  'Atomically enforce lifecycle effects while withholding active grants for an unapproved producer config revision';
comment on function academy.approve_identity_lifecycle_config_revision(bigint) is
  'Approve only an observed successor revision and apply its previously withheld ready effects';
comment on function academy.guard_identity_session_insert() is
  'Serialize session issuance with lifecycle commits and recheck the canonical profile and activation';
comment on function academy.revoke_identity_sessions_for_principal(text, text, integer) is
  'Delete one bounded indexed batch of sessions for one canonical principal';
comment on function academy.commit_identity_lifecycle_page_under_lease(text, text, text, text, bigint, text, bigint, jsonb) is
  'Commit one fenced lifecycle page and its authorization effects in one transaction';

revoke all on function academy.identity_subject_key(text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.apply_identity_lifecycle_projection_effects(jsonb, boolean)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.approve_identity_lifecycle_config_revision(bigint)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.guard_identity_session_insert()
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.revoke_identity_sessions_for_principal(text, text, integer)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.identity_lifecycle_allows_profile_activation(text, text)
  from public, anon, authenticated, service_role;
grant execute on function academy.identity_lifecycle_allows_profile_activation(text, text)
  to academy_runtime;
grant execute on function academy.approve_identity_lifecycle_config_revision(bigint)
  to academy_runtime;
