-- Source-only preparation; requires independent review and explicit migration authority before application.
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'academy_runtime' and rolbypassrls) then
    raise exception 'academy_runtime must have the dedicated runtime BYPASSRLS role from privileged/academy-data-api-roles.sql';
  end if;
end $$;

create table academy.profile_source_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  qa_exclusions_initialized boolean not null default false,
  revision bigint not null default 1,
  authorization_reference text not null,
  check (not enabled or qa_exclusions_initialized)
);
alter table academy.profile_source_policy enable row level security;
revoke all on academy.profile_source_policy from public, anon, authenticated, academy_runtime, service_role;
grant select on academy.profile_source_policy to academy_runtime;

create function academy.set_profile_source_policy(
  p_actor_account_id uuid, p_enabled boolean, p_qa_exclusions_initialized boolean, p_authorization_reference text
) returns void language plpgsql security definer set search_path = pg_catalog, academy as $$
begin
  if not academy.has_staff_role(p_actor_account_id, 'owner') then raise exception 'owner role required' using errcode = '42501'; end if;
  if p_enabled is null or p_qa_exclusions_initialized is null or p_authorization_reference is null
    or p_authorization_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
    raise exception 'explicit source policy and opaque authorization reference required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-source-policy',0));
  insert into academy.profile_source_policy(id,enabled,qa_exclusions_initialized,authorization_reference)
  values (true,p_enabled,p_qa_exclusions_initialized,p_authorization_reference)
  on conflict (id) do update set enabled=excluded.enabled,qa_exclusions_initialized=excluded.qa_exclusions_initialized,
    revision=academy.profile_source_policy.revision+1,authorization_reference=excluded.authorization_reference;
end;
$$;
revoke all on function academy.set_profile_source_policy(uuid, boolean, boolean, text) from public, anon, authenticated, academy_runtime, service_role;
grant execute on function academy.set_profile_source_policy(uuid, boolean, boolean, text) to academy_staff_admin;

create table academy.profile_activity_classification (
  user_id uuid primary key references academy.users(id) on delete cascade,
  is_test boolean not null,
  revision bigint not null default 1,
  authorization_reference text not null,
  classified_at timestamptz not null default now()
);
create table academy.profile_activity_classification_audit (
  user_id uuid not null references academy.users(id) on delete cascade,
  revision bigint not null,
  is_test boolean not null,
  actor_account_id uuid not null,
  authorization_reference text not null,
  classified_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table academy.profile_activity_classification enable row level security;
alter table academy.profile_activity_classification_audit enable row level security;
revoke all on academy.profile_activity_classification, academy.profile_activity_classification_audit
  from public, anon, authenticated, academy_runtime, service_role;
grant select on academy.profile_activity_classification to academy_runtime;

create function academy.set_profile_activity_classification(
  p_actor_account_id uuid, p_target_account_id uuid, p_is_test boolean, p_authorization_reference text
) returns void language plpgsql security definer set search_path = pg_catalog, academy as $$
declare v_revision bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'profile source requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  perform 1 from academy.users where id = p_target_account_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-account:' || p_target_account_id::text,0));
  if not academy.has_staff_role(p_actor_account_id, 'owner') then
    raise exception 'owner role required' using errcode = '42501';
  end if;
  if p_is_test is null or p_authorization_reference is null
    or p_authorization_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
    raise exception 'explicit classification and opaque authorization reference required' using errcode = '22023';
  end if;
  insert into academy.profile_activity_classification(user_id, is_test, authorization_reference)
  values (p_target_account_id, p_is_test, p_authorization_reference)
  on conflict (user_id) do update set is_test = excluded.is_test,
    revision = academy.profile_activity_classification.revision + 1,
    authorization_reference = excluded.authorization_reference, classified_at = now()
  returning revision into v_revision;
  insert into academy.profile_activity_classification_audit(user_id, revision, is_test, actor_account_id, authorization_reference)
  values (p_target_account_id, v_revision, p_is_test, p_actor_account_id, p_authorization_reference);
  if p_is_test then perform academy.queue_profile_withdrawals(p_target_account_id); end if;
end;
$$;
revoke all on function academy.set_profile_activity_classification(uuid, uuid, boolean, text)
  from public, anon, authenticated, academy_runtime, service_role;
grant execute on function academy.set_profile_activity_classification(uuid, uuid, boolean, text) to academy_staff_admin;

create function academy.capture_attempt_profile_source() returns trigger
language plpgsql set search_path = '' as $$
declare v_principal jsonb; v_policy academy.profile_source_policy%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'profile source requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  perform 1 from academy.users where id = new.user_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-account:' || new.user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-source-policy',0));
  if jsonb_typeof(new.params -> 'profileEvidence') = 'object' then
    select jsonb_build_object('issuer', u.issuer, 'subject', u.subject) into v_principal
      from academy.users u where u.id = new.user_id;
    select * into v_policy from academy.profile_source_policy where id;
    -- No trusted per-activity purpose reaches this issuance path. Neither an
    -- account-wide classification nor policy approval establishes learner context.
    new.params := jsonb_set(new.params, '{profileEvidence}',
      (new.params -> 'profileEvidence') || jsonb_build_object('principal',v_principal,
        'actorRole','unknown','testActivity',null,
        'policyRevision',case when v_policy.enabled and v_policy.qa_exclusions_initialized then v_policy.revision else null end,
        'classificationRevision',null));
  end if;
  return new;
end;
$$;
create trigger capture_attempt_profile_source before insert on academy.attempt
for each row execute function academy.capture_attempt_profile_source();
revoke all on function academy.capture_attempt_profile_source() from public, anon, authenticated;

create table academy.attempt_profile_result (
  attempt_id uuid primary key,
  user_id uuid not null references academy.users(id) on delete cascade,
  snapshot jsonb,
  passed boolean not null,
  recorded_at timestamptz not null,
  export_started_at timestamptz,
  delivered_at timestamptz
);
alter table academy.attempt_profile_result enable row level security;
revoke all on academy.attempt_profile_result from public, anon, authenticated, service_role, academy_runtime;
grant select, insert on academy.attempt_profile_result to academy_runtime;
grant update (delivered_at) on academy.attempt_profile_result to academy_runtime;

-- Tombstones outlive source-account erasure until Core acknowledges the withdrawal.
create table academy.profile_result_revocation (
  attempt_id uuid primary key,
  snapshot jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  check ((delivered_at is null and snapshot is not null) or (delivered_at is not null and snapshot is null))
);
alter table academy.profile_result_revocation enable row level security;
revoke all on academy.profile_result_revocation from public, anon, authenticated, academy_runtime, service_role;
grant select on academy.profile_result_revocation to academy_runtime;
grant update (delivered_at, snapshot) on academy.profile_result_revocation to academy_runtime;

-- Lifecycle sync locks activation before the account lock. Runtime cannot take
-- this row lock directly because its activation UPDATE privilege was revoked.
create function academy.lock_profile_source_activation(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from academy.service_activation where user_id = p_user_id for share;
end;
$$;
alter function academy.lock_profile_source_activation(uuid) owner to postgres;
revoke all on function academy.lock_profile_source_activation(uuid)
  from public, anon, authenticated, service_role, academy_staff_admin;
grant execute on function academy.lock_profile_source_activation(uuid) to academy_runtime;

create function academy.queue_profile_withdrawals(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into academy.profile_result_revocation(attempt_id,snapshot)
  select attempt_id,snapshot from academy.attempt_profile_result
    where user_id=p_user_id and (delivered_at is not null or export_started_at is not null)
  on conflict (attempt_id) do nothing;
$$;
revoke all on function academy.queue_profile_withdrawals(uuid) from public, anon, authenticated, academy_runtime, service_role;

create function academy.revoke_profile_source_on_account_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'profile source revocation requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  if tg_table_name = 'users' then
    v_user_id := old.id;
    perform academy.lock_profile_source_activation(v_user_id);
  else
    v_user_id := old.user_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-account:' || v_user_id::text,0));
  perform academy.queue_profile_withdrawals(v_user_id);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function academy.revoke_profile_source_on_account_change() from public, anon, authenticated, academy_runtime, service_role;
create trigger revoke_profile_before_user_erasure before delete on academy.users
for each row execute function academy.revoke_profile_source_on_account_change();
create trigger revoke_profile_on_activation_change before update of status on academy.service_activation
for each row when (old.status = 'active' and new.status is distinct from 'active')
execute function academy.revoke_profile_source_on_account_change();
create trigger revoke_profile_on_activation_delete before delete on academy.service_activation
for each row execute function academy.revoke_profile_source_on_account_change();

create function academy.freeze_attempt_profile_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.params is distinct from old.params
    or new.user_id is distinct from old.user_id
    or new.course_slug is distinct from old.course_slug
    or new.node_id is distinct from old.node_id
    or new.challenge_id is distinct from old.challenge_id
    or new.challenge_version is distinct from old.challenge_version then
    raise exception 'attempt grading and identity snapshot is immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger freeze_attempt_profile_source before update on academy.attempt
for each row execute function academy.freeze_attempt_profile_source();
revoke all on function academy.freeze_attempt_profile_source() from public, anon, authenticated;

create or replace function academy.commit_attempt_result(
  p_attempt_id uuid,
  p_user_id uuid,
  p_claim_token uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text,
  p_outcome jsonb,
  p_status text,
  p_checkpoint_results jsonb default null,
  p_video_cue_results jsonb default null,
  p_simulation_evidence jsonb default null
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_attempt academy.attempt%rowtype;
  v_passed boolean;
  v_updated integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'profile source requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  if p_claim_token is null
     or p_outcome is null
     or jsonb_typeof(p_outcome) <> 'object'
     or jsonb_typeof(p_outcome -> 'passed') <> 'boolean'
     or p_outcome <> jsonb_build_object('passed', (p_outcome ->> 'passed')::boolean) then
    raise exception 'attempt outcome must be exactly {passed:boolean}' using errcode = '22023';
  end if;
  v_passed := (p_outcome ->> 'passed')::boolean;
  if p_status is null or (v_passed and p_status not in ('completed', 'tested-out'))
     or (not v_passed and p_status <> 'in-progress') then
    raise exception 'progress status conflicts with attempt outcome' using errcode = '22023';
  end if;

  perform 1 from academy.users where id = p_user_id for key share;
  if not found then return false; end if;
  perform academy.lock_profile_source_activation(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('academy.profile-account:' || p_user_id::text,0));

  select a.* into v_attempt
    from academy.attempt a
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
   for update;

  if not found
     or v_attempt.outcome is not null
     or v_attempt.claim_token is distinct from p_claim_token then
    return false;
  end if;

  if not academy.progress_write_allowed(p_user_id, p_course_slug, v_attempt.progress_epoch) then
    return false;
  end if;

  perform academy.record_node_progress(
    p_user_id,
    p_course_slug,
    p_node_id,
    p_status,
    p_checkpoint_results,
    p_video_cue_results,
    p_simulation_evidence,
    case when v_passed then p_attempt_id else null end,
    case when v_passed then v_attempt.challenge_version else null end
  );

  update academy.attempt a
     set outcome = p_outcome,
         claim_token = null
   where a.attempt_id = p_attempt_id
     and a.claim_token = p_claim_token
     and a.outcome is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'attempt claim changed during commit' using errcode = '40001';
  end if;
  insert into academy.attempt_profile_result (attempt_id, user_id, snapshot, passed, recorded_at)
  select a.attempt_id, a.user_id, a.params -> 'profileEvidence', v_passed, clock_timestamp()
    from academy.attempt a where a.attempt_id = p_attempt_id;
  return true;
end;
$$;

-- Marks an immutable event before HTTP can start. Revocation takes the same account
-- lock, so deletion/disable/exclusion observes either no possible send or this mark.
create function academy.prepare_profile_result_export(p_source_keys text[])
returns table(source_key text) language plpgsql security definer set search_path = '' as $$
declare v_candidate record; v_marked uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'profile source export requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  if p_source_keys is null or cardinality(p_source_keys) > 200
    or exists (select 1 from unnest(p_source_keys) k where k is null
      or k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[01]$') then
    raise exception 'invalid profile source keys' using errcode = '22023';
  end if;

  -- Every batch acquires users/account locks in the same order. Do not take the
  -- global policy lock here: holding it while advancing to another account could
  -- deadlock with an attempt issuer that already holds that account lock.
  for v_candidate in
    select r.attempt_id,r.user_id from academy.attempt_profile_result r
    where r.attempt_id::text || ':0' = any(p_source_keys)
    order by r.user_id,r.attempt_id
  loop
    perform 1 from academy.users where id = v_candidate.user_id for key share;
    if not found then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended('academy.profile-account:' || v_candidate.user_id::text,0));

    -- This statement runs after the lock wait under READ COMMITTED. Recheck the
    -- current state, rather than trusting readPending's earlier snapshot.
    update academy.attempt_profile_result r
      set export_started_at = coalesce(r.export_started_at,clock_timestamp())
      where r.attempt_id = v_candidate.attempt_id and r.user_id = v_candidate.user_id
        and r.delivered_at is null
        and exists (select 1 from academy.users u where u.id = r.user_id
          and u.issuer = r.snapshot #>> '{principal,issuer}' and u.subject = r.snapshot #>> '{principal,subject}')
        and exists (select 1 from academy.service_activation a where a.user_id = r.user_id and a.status = 'active')
        and exists (select 1 from academy.profile_source_policy p where p.id and p.enabled and p.qa_exclusions_initialized)
        and not exists (select 1 from academy.profile_activity_classification c where c.user_id = r.user_id and c.is_test)
        and not exists (select 1 from academy.profile_result_revocation v where v.attempt_id = r.attempt_id)
      returning r.attempt_id into v_marked;
    if found then return query select v_marked::text || ':0'; end if;
  end loop;

  -- A withdrawal is still deliverable after the account/source rows are erased.
  return query select v.attempt_id::text || ':1' from academy.profile_result_revocation v
    where v.delivered_at is null and v.snapshot is not null and v.attempt_id::text || ':1' = any(p_source_keys)
    order by v.attempt_id;
end;
$$;
revoke all on function academy.prepare_profile_result_export(text[]) from public, anon, authenticated;
grant execute on function academy.prepare_profile_result_export(text[]) to academy_runtime;

commit;

