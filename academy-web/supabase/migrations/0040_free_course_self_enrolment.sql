-- Free-course self-enrolment (founder decision 2026-09-17).
--
-- A learner may enrol themselves only in a course the database itself records
-- as offered free. The runtime cannot make a course free by naming its slug:
-- the offer table has no runtime, service, browser, or operator privilege and
-- changes only through a reviewed migration applied by the database owner.
-- Every non-free course keeps the owner-authorized grant path from 0030.

do $$
begin
  if not exists (
    select 1 from pg_proc
     where pronamespace = 'academy'::regnamespace
       and proname = 'set_course_entitlement'
       and pg_get_function_identity_arguments(oid)
         = 'p_actor_account_id uuid, p_target_account_id uuid, p_course_slug text, p_enabled boolean, p_source text, p_expires_at timestamp with time zone, p_authorization_reference text'
  ) then
    raise exception 'course entitlement hardening is not installed' using errcode = '55000';
  end if;
  if to_regclass('academy.course_offer') is not null then
    raise exception 'course offer table already exists; inspect collision before migration' using errcode = '55000';
  end if;
  -- The audit source check must still be the exact 0030 shape before it is widened.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'academy.course_entitlement_audit'::regclass
       and conname = 'course_entitlement_audit_source_check'
       and contype = 'c'
       and pg_get_constraintdef(oid)
         = 'CHECK ((source = ANY (ARRAY[''invitation''::text, ''grant''::text])))'
  ) then
    raise exception 'unexpected entitlement audit source constraint; inspect before migration' using errcode = '55000';
  end if;
end
$$;

create table academy.course_offer (
  course_slug text primary key
    check (course_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  -- Only 'free' exists today. A paid model needs its own reviewed migration and
  -- a purchase path; nothing in this migration can grant a non-free course.
  model text not null check (model in ('free')),
  created_at timestamptz not null default now()
);

alter table academy.course_offer enable row level security;
revoke all on academy.course_offer
  from public, anon, authenticated, service_role, academy_runtime,
    academy_staff_admin, academy_entitlement_operator, academy_activation_writer;

-- Must match every content/courses/*/course.json that declares offer.model = free
-- (enforced by tests/unit/free-course-offer.test.ts).
insert into academy.course_offer (course_slug, model) values
  ('assembly', 'free'),
  ('basic-os-linux', 'free'),
  ('c-low-level', 'free'),
  ('computer-architecture', 'free'),
  ('computer-networking', 'free'),
  ('git-essentials', 'free'),
  ('operating-systems', 'free'),
  ('setup-and-environment', 'free');

alter table academy.course_entitlement_audit
  drop constraint course_entitlement_audit_source_check;
alter table academy.course_entitlement_audit
  add constraint course_entitlement_audit_source_check
  check (source in ('invitation', 'grant', 'free'));

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

comment on table academy.course_offer is
  'Database authority for which courses a learner may self-enrol in; written only by reviewed owner migrations';
comment on function academy.enrol_free_course(uuid, text) is
  'Idempotently self-enrol an active learner in a course the offer table records as free, with durable audit; never overrides an owner revocation';

revoke all on function academy.enrol_free_course(uuid, text)
  from public, anon, authenticated, service_role,
    academy_entitlement_operator, academy_staff_admin, academy_activation_writer;
grant execute on function academy.enrol_free_course(uuid, text)
  to academy_runtime;
