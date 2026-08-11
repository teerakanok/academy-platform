-- Atomically bind a verified canonical principal to its Academy-local profile
-- and record only the Identity Control service-activation projection.

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

  insert into academy.users as profile (issuer, subject, email, last_seen_at)
  values (p_issuer, p_subject, v_email, now())
  on conflict (issuer, subject) do update
    set email = excluded.email,
        last_seen_at = excluded.last_seen_at
  returning profile.id into v_account_id;

  perform academy.sync_service_activation(v_account_id, p_status, p_revision);
  select status, revision
    into strict v_activation_status, v_activation_revision
    from academy.service_activation
   where user_id = v_account_id;
  if v_activation_status is distinct from p_status
     or v_activation_revision is distinct from p_revision then
    raise exception 'stale identity profile activation input' using errcode = '23514';
  end if;
  return v_account_id;
end;
$$;

comment on function academy.commit_identity_profile_activation(text, text, text, text, integer) is
  'Atomically bind the canonical principal to an Academy profile and sync only its service activation';

revoke all on function academy.commit_identity_profile_activation(text, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function academy.commit_identity_profile_activation(text, text, text, text, integer)
  to academy_runtime;
