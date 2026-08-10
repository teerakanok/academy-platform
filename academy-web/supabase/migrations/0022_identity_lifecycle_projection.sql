-- Academy-local durable checkpoint for already verified Identity lifecycle pages.
-- This migration does not create a puller, transport, user link, or runtime schedule.

create or replace function academy.identity_lifecycle_subject_key_is_valid(
  p_value text
) returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_offset integer;
begin
  if p_value is null
    or length(p_value) not between 4 and 2048
    or length(p_value) % 4 <> 0
    or p_value !~ '^[0-9a-f]+$' then
    return false;
  end if;
  for v_offset in 1..length(p_value) by 4
  loop
    if substring(p_value from v_offset for 4) = '0000' then
      return false;
    end if;
  end loop;
  return true;
end
$function$;

create or replace function academy.identity_lifecycle_issuer_is_canonical(
  p_value text
) returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_host text;
  v_label text;
begin
  if p_value is null
    or octet_length(p_value) > 2048
    or length(p_value) > 512
    or p_value !~ '^https://[a-z0-9.-]+/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*$' then
    return false;
  end if;
  v_host := split_part(substring(p_value from 9), '/', 1);
  if length(v_host) > 253
    or v_host ~ '^[0-9.]+$'
    or v_host like '.%'
    or v_host like '%.'
    or array_length(string_to_array(v_host, '.'), 1) < 2 then
    return false;
  end if;
  foreach v_label in array string_to_array(v_host, '.')
  loop
    if length(v_label) not between 1 and 63
      or v_label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
      return false;
    end if;
  end loop;
  return true;
end
$function$;

create table if not exists academy.identity_lifecycle_consumer_checkpoint (
  consumer_id text primary key,
  cursor_sequence text,
  approved_config_revision bigint not null,
  configuration_health text not null,
  observed_config_revision bigint,
  updated_at timestamptz not null default transaction_timestamp(),
  constraint ck_identity_lifecycle_checkpoint_consumer
    check (consumer_id = 'academy-web'),
  constraint ck_identity_lifecycle_checkpoint_cursor check (
    cursor_sequence is null or case
      when cursor_sequence ~ '^(0|[1-9][0-9]{0,18})$'
      then cursor_sequence::numeric <= 9223372036854775807
      else false
    end
  ),
  constraint ck_identity_lifecycle_checkpoint_approved_revision
    check (approved_config_revision between 1 and 9007199254740991),
  constraint ck_identity_lifecycle_checkpoint_configuration check (
    (configuration_health = 'ready' and observed_config_revision is null)
    or (configuration_health = 'config_revision_changed'
      and observed_config_revision is not null
      and observed_config_revision between 1 and 9007199254740991
      and observed_config_revision <> approved_config_revision)
  )
);

create table if not exists academy.identity_lifecycle_projection (
  consumer_id text not null,
  issuer text not null,
  subject_key text not null,
  state text not null,
  revision bigint not null,
  health text not null,
  highest_known_revision bigint not null,
  observed_state text,
  observed_revision bigint,
  conflict_reason text,
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (consumer_id, issuer, subject_key),
  constraint ck_identity_lifecycle_projection_consumer
    check (consumer_id = 'academy-web'),
  constraint ck_identity_lifecycle_projection_principal check (
    academy.identity_lifecycle_issuer_is_canonical(issuer)
    and academy.identity_lifecycle_subject_key_is_valid(subject_key)
  ),
  constraint ck_identity_lifecycle_projection_state
    check (state in ('active', 'disabled', 'deleted')),
  constraint ck_identity_lifecycle_projection_revision
    check (revision between 1 and 9007199254740991),
  constraint ck_identity_lifecycle_projection_highest_known check (
    highest_known_revision between revision and 9007199254740991
  ),
  constraint ck_identity_lifecycle_projection_health check (
    (health = 'ready'
      and highest_known_revision = revision
      and observed_state is null
      and observed_revision is null
      and conflict_reason is null)
    or (health = 'gap'
      and observed_state is not null
      and observed_revision is not null
      and observed_state in ('active', 'disabled', 'deleted')
      and observed_revision > revision
      and observed_revision <= highest_known_revision
      and conflict_reason is null)
    or (health = 'conflict'
      and observed_state is null
      and observed_revision is null
      and conflict_reason is not null
      and conflict_reason in ('event_conflict', 'unresolved_conflict'))
  )
);

alter table academy.identity_lifecycle_consumer_checkpoint enable row level security;
alter table academy.identity_lifecycle_projection enable row level security;

create or replace function academy.identity_lifecycle_has_exact_keys(
  p_value jsonb,
  p_expected text[]
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when jsonb_typeof(p_value) <> 'object' then false
    else coalesce(
      (select array_agg(actual.key order by actual.key)
        from jsonb_object_keys(p_value) as actual(key)),
      array[]::text[]
    ) = coalesce(
      (select array_agg(expected.key order by expected.key)
        from unnest(p_expected) as expected(key)),
      array[]::text[]
    )
  end
$function$;

create or replace function academy.identity_lifecycle_json_positive_safe_integer(
  p_value jsonb
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when jsonb_typeof(p_value) = 'number'
      and p_value #>> '{}' ~ '^[1-9][0-9]{0,15}$'
    then (p_value #>> '{}')::numeric <= 9007199254740991
    else false
  end
$function$;

create or replace function academy.identity_lifecycle_cursor_is_valid(
  p_cursor text
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select p_cursor is null or case
    when p_cursor ~ '^(0|[1-9][0-9]{0,18})$'
    then p_cursor::numeric <= 9223372036854775807
    else false
  end
$function$;

create or replace function academy.commit_identity_lifecycle_page(
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
declare
  v_checkpoint academy.identity_lifecycle_consumer_checkpoint%rowtype;
  v_projection jsonb;
  v_current jsonb;
  v_health jsonb;
  v_observed jsonb;
  v_existing academy.identity_lifecycle_projection%rowtype;
  v_seen text[] := array[]::text[];
  v_principal_key text;
  v_issuer text;
  v_subject_key text;
  v_state text;
  v_revision bigint;
  v_health_status text;
  v_highest_known_revision bigint;
  v_observed_state text;
  v_observed_revision bigint;
  v_conflict_reason text;
begin
  if not academy.identity_lifecycle_cursor_is_valid(p_expected_cursor)
    or not academy.identity_lifecycle_cursor_is_valid(p_next_cursor) then
    raise exception 'Identity lifecycle cursor is invalid';
  end if;
  if p_approved_config_revision is null
    or p_approved_config_revision not between 1 and 9007199254740991 then
    raise exception 'Identity lifecycle approved config revision is invalid';
  end if;
  if p_configuration_health = 'ready' then
    if p_observed_config_revision is not null then
      raise exception 'Identity lifecycle configuration projection is invalid';
    end if;
  elsif p_configuration_health = 'config_revision_changed' then
    if p_observed_config_revision is null
      or p_observed_config_revision not between 1 and 9007199254740991
      or p_observed_config_revision = p_approved_config_revision then
      raise exception 'Identity lifecycle configuration projection is invalid';
    end if;
  else
    raise exception 'Identity lifecycle configuration projection is invalid';
  end if;
  if p_projections is null
    or jsonb_typeof(p_projections) is distinct from 'array' then
    raise exception 'Identity lifecycle page projection count is invalid';
  end if;
  if jsonb_array_length(p_projections) > 100 then
    raise exception 'Identity lifecycle page projection count is invalid';
  end if;

  insert into academy.identity_lifecycle_consumer_checkpoint (
    consumer_id,
    cursor_sequence,
    approved_config_revision,
    configuration_health,
    observed_config_revision
  ) values (
    'academy-web',
    null,
    p_approved_config_revision,
    p_configuration_health,
    p_observed_config_revision
  ) on conflict (consumer_id) do nothing;

  select * into strict v_checkpoint
  from academy.identity_lifecycle_consumer_checkpoint
  where consumer_id = 'academy-web'
  for update;

  if v_checkpoint.cursor_sequence is distinct from p_expected_cursor then
    raise exception using
      errcode = '40001',
      message = 'Identity lifecycle cursor conflict';
  end if;
  if v_checkpoint.approved_config_revision <> p_approved_config_revision then
    raise exception 'Identity lifecycle approved config revision conflict';
  end if;
  if v_checkpoint.configuration_health = 'config_revision_changed'
    and p_configuration_health <> 'config_revision_changed' then
    raise exception 'Identity lifecycle configuration fence requires reconciliation';
  end if;

  for v_projection in select value from jsonb_array_elements(p_projections)
  loop
    if not academy.identity_lifecycle_has_exact_keys(
      v_projection,
      array['current', 'health', 'highestKnownRevision']
    ) then
      raise exception 'Identity lifecycle page projection schema is invalid';
    end if;
    v_current := v_projection -> 'current';
    v_health := v_projection -> 'health';
    if not academy.identity_lifecycle_has_exact_keys(
      v_current,
      array['issuer', 'revision', 'state', 'subjectKey']
    ) then
      raise exception 'Identity lifecycle current projection schema is invalid';
    end if;
    if jsonb_typeof(v_current -> 'issuer') <> 'string'
      or jsonb_typeof(v_current -> 'subjectKey') <> 'string'
      or jsonb_typeof(v_current -> 'state') <> 'string'
      or not academy.identity_lifecycle_json_positive_safe_integer(v_current -> 'revision')
      or not academy.identity_lifecycle_json_positive_safe_integer(
        v_projection -> 'highestKnownRevision'
      ) then
      raise exception 'Identity lifecycle current projection is invalid';
    end if;

    v_issuer := v_current ->> 'issuer';
    v_subject_key := v_current ->> 'subjectKey';
    v_state := v_current ->> 'state';
    v_revision := (v_current ->> 'revision')::bigint;
    v_highest_known_revision := (v_projection ->> 'highestKnownRevision')::bigint;
    if not academy.identity_lifecycle_issuer_is_canonical(v_issuer)
      or not academy.identity_lifecycle_subject_key_is_valid(v_subject_key)
      or v_state not in ('active', 'disabled', 'deleted')
      or v_highest_known_revision < v_revision then
      raise exception 'Identity lifecycle current projection values are invalid';
    end if;

    v_principal_key := jsonb_build_array(v_issuer, v_subject_key)::text;
    if v_principal_key = any(v_seen) then
      raise exception 'Identity lifecycle page contains duplicate projection updates';
    end if;
    v_seen := array_append(v_seen, v_principal_key);

    v_observed_state := null;
    v_observed_revision := null;
    v_conflict_reason := null;
    if jsonb_typeof(v_health -> 'status') <> 'string' then
      raise exception 'Identity lifecycle projection health is invalid';
    end if;
    v_health_status := v_health ->> 'status';
    if v_health_status = 'ready' then
      if not academy.identity_lifecycle_has_exact_keys(v_health, array['status'])
        or v_highest_known_revision <> v_revision then
        raise exception 'Identity lifecycle ready projection is invalid';
      end if;
    elsif v_health_status = 'gap' then
      if not academy.identity_lifecycle_has_exact_keys(v_health, array['observed', 'status']) then
        raise exception 'Identity lifecycle gap projection schema is invalid';
      end if;
      v_observed := v_health -> 'observed';
      if not academy.identity_lifecycle_has_exact_keys(
        v_observed,
        array['issuer', 'revision', 'state', 'subjectKey']
      )
        or jsonb_typeof(v_observed -> 'issuer') <> 'string'
        or jsonb_typeof(v_observed -> 'subjectKey') <> 'string'
        or jsonb_typeof(v_observed -> 'state') <> 'string'
        or not academy.identity_lifecycle_json_positive_safe_integer(v_observed -> 'revision')
        or v_observed ->> 'issuer' <> v_issuer
        or v_observed ->> 'subjectKey' <> v_subject_key then
        raise exception 'Identity lifecycle gap observation is invalid';
      end if;
      v_observed_state := v_observed ->> 'state';
      v_observed_revision := (v_observed ->> 'revision')::bigint;
      if v_observed_state not in ('active', 'disabled', 'deleted')
        or v_observed_revision <= v_revision
        or v_observed_revision > v_highest_known_revision then
        raise exception 'Identity lifecycle gap observation values are invalid';
      end if;
    elsif v_health_status = 'conflict' then
      if not academy.identity_lifecycle_has_exact_keys(v_health, array['reason', 'status'])
        or jsonb_typeof(v_health -> 'reason') <> 'string'
        or v_health ->> 'reason' not in ('event_conflict', 'unresolved_conflict') then
        raise exception 'Identity lifecycle conflict projection is invalid';
      end if;
      v_conflict_reason := v_health ->> 'reason';
    else
      raise exception 'Identity lifecycle projection health is invalid';
    end if;

    select * into v_existing
    from academy.identity_lifecycle_projection
    where consumer_id = 'academy-web'
      and issuer = v_issuer
      and subject_key = v_subject_key
    for update;
    if found then
      if v_revision < v_existing.revision
        or v_revision = v_existing.revision and v_state <> v_existing.state
        or v_highest_known_revision < v_existing.highest_known_revision then
        raise exception 'Identity lifecycle projection would regress durable state';
      end if;
      if v_existing.health = 'gap' then
        if v_health_status not in ('gap', 'conflict')
          or v_revision <> v_existing.revision
          or v_state <> v_existing.state then
          raise exception 'Identity lifecycle projection fence requires reconciliation';
        end if;
        if v_health_status = 'gap' then
          v_observed_state := v_existing.observed_state;
          v_observed_revision := v_existing.observed_revision;
        end if;
      elsif v_existing.health = 'conflict' then
        if v_health_status <> 'conflict'
          or v_revision <> v_existing.revision
          or v_state <> v_existing.state then
          raise exception 'Identity lifecycle projection fence requires reconciliation';
        end if;
      end if;
    end if;

    insert into academy.identity_lifecycle_projection (
      consumer_id,
      issuer,
      subject_key,
      state,
      revision,
      health,
      highest_known_revision,
      observed_state,
      observed_revision,
      conflict_reason,
      updated_at
    ) values (
      'academy-web',
      v_issuer,
      v_subject_key,
      v_state,
      v_revision,
      v_health_status,
      v_highest_known_revision,
      v_observed_state,
      v_observed_revision,
      v_conflict_reason,
      transaction_timestamp()
    ) on conflict (consumer_id, issuer, subject_key) do update set
      state = excluded.state,
      revision = excluded.revision,
      health = excluded.health,
      highest_known_revision = excluded.highest_known_revision,
      observed_state = excluded.observed_state,
      observed_revision = excluded.observed_revision,
      conflict_reason = excluded.conflict_reason,
      updated_at = transaction_timestamp();
  end loop;

  update academy.identity_lifecycle_consumer_checkpoint set
    cursor_sequence = p_next_cursor,
    configuration_health = p_configuration_health,
    observed_config_revision = p_observed_config_revision,
    updated_at = transaction_timestamp()
  where consumer_id = 'academy-web';
end
$function$;

create or replace function academy.read_identity_lifecycle_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'cursor', checkpoint.cursor_sequence,
    'configuration', jsonb_build_object(
      'approvedRevision', checkpoint.approved_config_revision,
      'health', case
        when checkpoint.configuration_health = 'ready'
        then jsonb_build_object('status', 'ready')
        else jsonb_build_object(
          'status', 'config_revision_changed',
          'observedRevision', checkpoint.observed_config_revision
        )
      end
    ),
    'projections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'current', jsonb_build_object(
            'issuer', projection.issuer,
            'subjectKey', projection.subject_key,
            'state', projection.state,
            'revision', projection.revision
          ),
          'health', case projection.health
            when 'ready' then jsonb_build_object('status', 'ready')
            when 'gap' then jsonb_build_object(
              'status', 'gap',
              'observed', jsonb_build_object(
                'issuer', projection.issuer,
                'subjectKey', projection.subject_key,
                'state', projection.observed_state,
                'revision', projection.observed_revision
              )
            )
            else jsonb_build_object(
              'status', 'conflict',
              'reason', projection.conflict_reason
            )
          end,
          'highestKnownRevision', projection.highest_known_revision
        ) order by projection.issuer collate "C", projection.subject_key collate "C"
      )
      from academy.identity_lifecycle_projection as projection
      where projection.consumer_id = checkpoint.consumer_id
    ), '[]'::jsonb)
  )
  from academy.identity_lifecycle_consumer_checkpoint as checkpoint
  where checkpoint.consumer_id = 'academy-web'
$function$;

revoke all on table academy.identity_lifecycle_consumer_checkpoint
  from public, academy_runtime;
revoke all on table academy.identity_lifecycle_projection
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_has_exact_keys(jsonb, text[])
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_json_positive_safe_integer(jsonb)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_cursor_is_valid(text)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_subject_key_is_valid(text)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_issuer_is_canonical(text)
  from public, academy_runtime;
revoke all on function academy.commit_identity_lifecycle_page(text, text, bigint, text, bigint, jsonb)
  from public, academy_runtime;
revoke all on function academy.read_identity_lifecycle_snapshot()
  from public, academy_runtime;

grant usage on schema academy to academy_runtime;
grant execute on function academy.commit_identity_lifecycle_page(text, text, bigint, text, bigint, jsonb)
  to academy_runtime;
grant execute on function academy.read_identity_lifecycle_snapshot()
  to academy_runtime;
