-- Close first-login and existing-session fail-open seams without changing 0032.
-- No live database operation is performed by this source migration.

create table if not exists academy.identity_lifecycle_authorization_fences (
  consumer_id text not null,
  issuer text not null,
  subject_key text not null,
  fenced_state text not null,
  revision bigint not null,
  fenced_at timestamptz not null default transaction_timestamp(),
  primary key (consumer_id, issuer, subject_key),
  constraint ck_identity_lifecycle_fence_consumer check (consumer_id = 'academy-web'),
  constraint ck_identity_lifecycle_fence_principal check (
    academy.identity_lifecycle_issuer_is_canonical(issuer)
    and academy.identity_lifecycle_subject_key_is_valid(subject_key)
  ),
  constraint ck_identity_lifecycle_fence_state check (fenced_state in ('disabled', 'deleted')),
  constraint ck_identity_lifecycle_fence_revision
    check (revision between 1 and 9007199254740991)
);

alter table academy.identity_lifecycle_authorization_fences enable row level security;

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
  select configuration_health
    into v_configuration_health
    from academy.identity_lifecycle_consumer_checkpoint
   where consumer_id = 'academy-web';
  if not found or v_configuration_health <> 'ready' then
    return false;
  end if;

  select state, health
    into v_state, v_health
    from academy.identity_lifecycle_projection
   where consumer_id = 'academy-web'
     and issuer = p_issuer
     and subject_key = v_subject_key;
  return found
    and v_health = 'ready'
    and v_state = 'active'
    and not exists (
      select 1 from academy.identity_lifecycle_authorization_fences fence
       where fence.consumer_id = 'academy-web'
         and fence.issuer = p_issuer
         and fence.subject_key = v_subject_key
    );
end;
$$;

create or replace function academy.fence_identity_lifecycle_page_failure(
  p_projections jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_projection jsonb;
  v_current jsonb;
  v_health text;
  v_observed jsonb;
  v_issuer text;
  v_subject_key text;
  v_state text;
  v_revision bigint;
begin
  if p_projections is null
     or jsonb_typeof(p_projections) is distinct from 'array'
     or jsonb_array_length(p_projections) > 100 then
    raise exception 'Identity lifecycle failure fence projection count is invalid'
      using errcode = '22023';
  end if;

  for v_projection in select value from jsonb_array_elements(p_projections)
  loop
    if not academy.identity_lifecycle_has_exact_keys(
      v_projection, array['current', 'health', 'highestKnownRevision']
    ) then
      raise exception 'Identity lifecycle failure fence projection schema is invalid'
        using errcode = '22023';
    end if;
    v_current := v_projection -> 'current';
    if not academy.identity_lifecycle_has_exact_keys(
      v_current, array['issuer', 'revision', 'state', 'subjectKey']
    ) or jsonb_typeof(v_current -> 'issuer') <> 'string'
       or jsonb_typeof(v_current -> 'subjectKey') <> 'string'
       or jsonb_typeof(v_current -> 'state') <> 'string'
       or not academy.identity_lifecycle_json_positive_safe_integer(v_current -> 'revision') then
      raise exception 'Identity lifecycle failure fence current projection is invalid'
        using errcode = '22023';
    end if;

    v_issuer := v_current ->> 'issuer';
    v_subject_key := v_current ->> 'subjectKey';
    v_state := v_current ->> 'state';
    v_revision := (v_current ->> 'revision')::bigint;
    if not academy.identity_lifecycle_issuer_is_canonical(v_issuer)
       or not academy.identity_lifecycle_subject_key_is_valid(v_subject_key)
       or v_state not in ('active', 'disabled', 'deleted') then
      raise exception 'Identity lifecycle failure fence current projection is invalid'
        using errcode = '22023';
    end if;

    v_health := v_projection -> 'health' ->> 'status';
    if v_health = 'gap' then
      v_observed := v_projection -> 'health' -> 'observed';
      if not academy.identity_lifecycle_has_exact_keys(
        v_observed, array['issuer', 'revision', 'state', 'subjectKey']
      ) or jsonb_typeof(v_observed -> 'issuer') <> 'string'
         or jsonb_typeof(v_observed -> 'subjectKey') <> 'string'
         or jsonb_typeof(v_observed -> 'state') <> 'string'
         or not academy.identity_lifecycle_json_positive_safe_integer(v_observed -> 'revision')
         or v_observed ->> 'issuer' is distinct from v_issuer
         or v_observed ->> 'subjectKey' is distinct from v_subject_key then
        raise exception 'Identity lifecycle failure fence observation is invalid'
          using errcode = '22023';
      end if;
      v_state := v_observed ->> 'state';
      v_revision := (v_observed ->> 'revision')::bigint;
      if v_state not in ('active', 'disabled', 'deleted') then
        raise exception 'Identity lifecycle failure fence observation is invalid'
          using errcode = '22023';
      end if;
    elsif v_health <> 'ready' then
      raise exception 'Identity lifecycle failure fence health is invalid'
        using errcode = '22023';
    end if;

    continue when v_state not in ('disabled', 'deleted');
    perform pg_advisory_xact_lock(
      hashtextextended(jsonb_build_array(v_issuer, v_subject_key)::text, 0)
    );
    insert into academy.identity_lifecycle_authorization_fences (
      consumer_id, issuer, subject_key, fenced_state, revision
    ) values (
      'academy-web', v_issuer, v_subject_key, v_state, v_revision
    ) on conflict (consumer_id, issuer, subject_key) do update set
      fenced_state = excluded.fenced_state,
      revision = excluded.revision,
      fenced_at = transaction_timestamp()
    where excluded.revision >= academy.identity_lifecycle_authorization_fences.revision;
  end loop;
end;
$$;

create or replace function academy.clear_identity_lifecycle_authorization_fences(
  p_projections jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_projection jsonb;
begin
  if p_projections is null
     or jsonb_typeof(p_projections) is distinct from 'array'
     or jsonb_array_length(p_projections) > 100 then
    raise exception 'Identity lifecycle authorization fence clear count is invalid'
      using errcode = '22023';
  end if;

  for v_projection in select value from jsonb_array_elements(p_projections)
  loop
    delete from academy.identity_lifecycle_authorization_fences fence
     where fence.consumer_id = 'academy-web'
       and fence.issuer = v_projection -> 'current' ->> 'issuer'
       and fence.subject_key = v_projection -> 'current' ->> 'subjectKey';
  end loop;
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
  v_configuration_health text;
  v_state text;
  v_health text;
  v_email text;
  v_activation_status text;
  v_activation_revision bigint;
begin
  if p_session_id is null
     or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session digest' using errcode = '22023';
  end if;

  select issuer, subject_key into v_session from academy.identity_session
   where id = p_session_id;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  perform pg_advisory_xact_lock(
    hashtextextended(jsonb_build_array(v_session.issuer, v_session.subject_key)::text, 0)
  );
  select * into v_session from academy.identity_session
   where id = p_session_id for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_session.expires_at <= v_now then
    delete from academy.identity_session where id = p_session_id;
    return jsonb_build_object('status', 'expired');
  end if;

  select c.configuration_health, l.state, l.health, u.email, a.status, a.revision
    into v_configuration_health, v_state, v_health, v_email,
         v_activation_status, v_activation_revision
    from academy.identity_lifecycle_consumer_checkpoint c
    join academy.identity_lifecycle_projection l
      on l.consumer_id = c.consumer_id
     and l.issuer = v_session.issuer
     and l.subject_key = v_session.subject_key
    join academy.users u
      on u.issuer = v_session.issuer
     and academy.identity_subject_key(u.subject) = v_session.subject_key
    join academy.service_activation a on a.user_id = u.id
   where c.consumer_id = 'academy-web';
  if not found
     or v_configuration_health <> 'ready'
     or v_health <> 'ready'
     or v_state <> 'active'
     or exists (
       select 1 from academy.identity_lifecycle_authorization_fences fence
        where fence.consumer_id = c.consumer_id
          and fence.issuer = v_session.issuer
          and fence.subject_key = v_session.subject_key
     )
     or v_email is distinct from v_session.verified_email
     or v_activation_status is distinct from v_session.activation_status
     or v_activation_revision is distinct from v_session.activation_revision then
    return jsonb_build_object('status', 'unknown');
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
  perform academy.clear_identity_lifecycle_authorization_fences(p_projections);
end;
$function$;

comment on function academy.identity_lifecycle_allows_profile_activation(text, text) is
  'Fail closed unless the durable checkpoint and exact canonical principal projection are ready and active';
comment on function academy.fence_identity_lifecycle_page_failure(jsonb) is
  'Durably deny disabled or deleted principals after a rolled-back lifecycle page';
comment on function academy.clear_identity_lifecycle_authorization_fences(jsonb) is
  'Clear failure fences only after the same projected principals commit successfully';
comment on function academy.read_identity_session_digest(text) is
  'Serialize durable session reads with lifecycle commits and fail closed on any projection mismatch';

revoke all on function academy.identity_lifecycle_allows_profile_activation(text, text)
  from public, anon, authenticated, service_role;
grant execute on function academy.identity_lifecycle_allows_profile_activation(text, text)
  to academy_runtime;
revoke all on function academy.fence_identity_lifecycle_page_failure(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function academy.fence_identity_lifecycle_page_failure(jsonb)
  to academy_runtime;
revoke all on function academy.clear_identity_lifecycle_authorization_fences(jsonb)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.read_identity_session_digest(text)
  from public, anon, authenticated, service_role, academy_runtime;
grant execute on function academy.read_identity_session_digest(text) to academy_runtime;
revoke all on table academy.identity_lifecycle_authorization_fences
  from public, anon, authenticated, service_role, academy_runtime;
