-- Make runtime visibility authoritative even when a caller bypasses the web route.
-- A missing/null course_settings row keeps the published default used by free offers.
create or replace function academy.enrol_free_course(
  p_user_id uuid,
  p_course_slug text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_activation_status text;
  v_visibility text;
  v_existing academy.course_entitlement%rowtype;
  v_granted_at timestamptz;
begin
  if p_user_id is null
     or p_course_slug is null
     or p_course_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
  then
    raise exception 'invalid free enrolment input' using errcode = '22023';
  end if;

  if not exists (
    select 1 from academy.course_offer
     where course_slug = p_course_slug and model = 'free'
  ) then
    raise exception 'course is not offered free' using errcode = '42501';
  end if;

  select visibility into v_visibility
    from academy.course_settings
   where course_slug = p_course_slug
   for share;
  if coalesce(v_visibility, 'published') <> 'published' then
    raise exception 'course is not published' using errcode = '42501';
  end if;

  -- Serialize with owner grants/revocations of the same scope.
  perform pg_advisory_xact_lock(
    hashtextextended('academy.course_entitlement:' || p_user_id::text || ':' || p_course_slug, 0)
  );

  select status into v_activation_status
    from academy.service_activation
   where user_id = p_user_id
   for share;
  if v_activation_status is distinct from 'active' then
    raise exception 'service activation is not active' using errcode = '55000';
  end if;

  select * into v_existing
    from academy.course_entitlement
   where user_id = p_user_id and course_slug = p_course_slug
   for update;

  if v_existing.user_id is not null
     and v_existing.revoked_at is null
     and (v_existing.expires_at is null or v_existing.expires_at > now())
  then
    -- Idempotent: an active scope, from any source, is returned unchanged.
    return jsonb_build_object(
      'enrolled', true,
      'changed', false,
      'source', v_existing.source
    );
  end if;

  if v_existing.user_id is not null and v_existing.revoked_at is not null then
    -- A revocation is an audited owner decision; self-enrolment never overrides it.
    raise exception 'course access was revoked by an owner' using errcode = '42501';
  end if;

  insert into academy.course_entitlement(user_id, course_slug, source, granted_at, expires_at, revoked_at)
  values (p_user_id, p_course_slug, 'free', now(), null, null)
  on conflict (user_id, course_slug) do update set
    source = excluded.source,
    granted_at = excluded.granted_at,
    expires_at = null,
    revoked_at = null
  returning granted_at into v_granted_at;

  insert into academy.course_entitlement_audit(
    account_id, course_slug, action, source, expires_at,
    actor_account_id, authorization_reference
  ) values (
    p_user_id, p_course_slug, 'granted', 'free', null,
    p_user_id, 'self-enrol:free-offer'
  );

  return jsonb_build_object(
    'enrolled', true,
    'changed', true,
    'source', 'free'
  );
end;
$$;

comment on function academy.enrol_free_course(uuid, text) is
  'Idempotently self-enrol an active learner in a published course the offer table records as free, with durable audit; never overrides an owner revocation';
