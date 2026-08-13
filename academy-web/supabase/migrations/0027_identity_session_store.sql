-- Durable Academy-owned Identity sessions. This migration adds no runtime
-- wiring and stores only canonical principal, activation, and expiry claims.

create table if not exists academy.identity_session (
  id text,
  issuer text not null,
  subject_key text not null,
  verified_email text not null,
  activation_status text not null,
  activation_revision bigint not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (id),
  constraint identity_session_id_format check (id ~ '^[A-Za-z0-9_-]{43}$'),
  constraint identity_session_principal check (
    academy.identity_lifecycle_issuer_is_canonical(issuer)
    and academy.identity_lifecycle_subject_key_is_valid(subject_key)
  ),
  constraint identity_session_email_canonical check (
    char_length(verified_email) between 3 and 320
    and verified_email = lower(btrim(verified_email))
    and verified_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint identity_session_activation_status check (
    activation_status in ('pending', 'active', 'suspended', 'deactivated')
  ),
  constraint identity_session_activation_revision check (
    activation_revision between 1 and 9007199254740991
  ),
  constraint identity_session_expiry_order check (expires_at > created_at)
);

alter table academy.identity_session enable row level security;

create index if not exists identity_session_expiry_idx
  on academy.identity_session (expires_at, id);

create or replace function academy.identity_session_json(
  p_id text,
  p_issuer text,
  p_subject_key text,
  p_verified_email text,
  p_activation_status text,
  p_activation_revision bigint,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', p_id,
    'claims', jsonb_build_object(
      'issuer', p_issuer,
      'subjectKey', p_subject_key,
      'verifiedEmail', p_verified_email,
      'activation', jsonb_build_object(
        'status', p_activation_status,
        'revision', p_activation_revision
      ),
      'createdAt', to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char(p_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )
$function$;

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

  -- Unique-index arbitration can wait behind another writer. Anchor the TTL
  -- after this transaction has won rather than before that wait.
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

create or replace function academy.read_identity_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_now timestamptz;
  v_session academy.identity_session%rowtype;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid identity session id' using errcode = '22023';
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
  delete from academy.identity_session where id = p_session_id;
  if found then return jsonb_build_object('status', 'revoked'); end if;
  return jsonb_build_object('status', 'absent');
end;
$$;

comment on table academy.identity_session is
  'Opaque Academy Identity sessions containing only canonical principal and activation claims';

revoke all on table academy.identity_session
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.create_identity_session(text, text, text, text, text, bigint, integer)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.read_identity_session(text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.revoke_identity_session(text)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.identity_session_json(text, text, text, text, text, bigint, timestamptz, timestamptz)
  from public, anon, authenticated, service_role, academy_runtime;

grant execute on function academy.create_identity_session(text, text, text, text, text, bigint, integer)
  to academy_runtime;
grant execute on function academy.read_identity_session(text) to academy_runtime;
grant execute on function academy.revoke_identity_session(text) to academy_runtime;
