-- 0013_integrity_batch.sql — claim fencing, atomic result commit, monotonic activation
--
-- attempt grading remains in the application because its rules come from the portable
-- course format. The database owns the state transition: only the current claim token
-- may atomically write node_progress and attempt.outcome.

alter table academy.attempt
  add column if not exists claim_token uuid,
  add column if not exists progress_epoch bigint not null default 0;

comment on column academy.attempt.claim_token is
  'Fencing token ของ claim ปัจจุบัน; reclaim เปลี่ยน token ทำให้ request เก่า commit ไม่ได้';

create table if not exists academy.course_progress_epoch (
  user_id uuid not null references academy.users (id) on delete cascade,
  course_slug text not null,
  epoch bigint not null default 0 check (epoch >= 0),
  primary key (user_id, course_slug)
);

comment on table academy.course_progress_epoch is
  'Generation fence ต่อผู้เรียนและคอร์ส; reset เพิ่มค่าเพื่อกัน request เก่าเขียน progress กลับมา';

alter table academy.course_progress_epoch enable row level security;
grant all on academy.course_progress_epoch to service_role;

-- Attempts issued before a reset must not be reused or committed afterward. Keep the
-- existing signature so callers do not need a second read-before-write round trip.
create or replace function academy.issue_attempt(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text,
  p_params jsonb,
  p_challenge_version text,
  p_ttl_minutes int default 60,
  p_max_per_window int default 3,
  p_window_minutes int default 30
)
returns table (attempt_id uuid, expires_at timestamptz, params jsonb)
language plpgsql
security invoker
as $$
declare
  v_active_id uuid;
  v_active_expires timestamptz;
  v_active_params jsonb;
  v_epoch bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_course_slug || '|' || p_node_id, 0)
  );

  insert into academy.course_progress_epoch (user_id, course_slug, epoch)
  values (p_user_id, p_course_slug, 0)
  on conflict (user_id, course_slug) do nothing;

  select e.epoch into strict v_epoch
    from academy.course_progress_epoch e
   where e.user_id = p_user_id and e.course_slug = p_course_slug
   for share;

  select a.attempt_id, a.expires_at, a.params
    into v_active_id, v_active_expires, v_active_params
    from academy.attempt a
   where a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.progress_epoch = v_epoch
     and a.consumed_at is null
     and a.expires_at > now()
   order by a.created_at desc
   limit 1;

  if v_active_id is not null then
    attempt_id := v_active_id;
    expires_at := v_active_expires;
    params := v_active_params;
    return next;
    return;
  end if;

  if (
    select count(*)
      from academy.attempt a
     where a.user_id = p_user_id
       and a.course_slug = p_course_slug
       and a.node_id = p_node_id
       and a.created_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_max_per_window then
    return;
  end if;

  return query
  insert into academy.attempt
    (user_id, course_slug, node_id, challenge_id, params, challenge_version, expires_at, progress_epoch)
  values
    (p_user_id, p_course_slug, p_node_id, p_challenge_id, p_params, p_challenge_version,
     now() + make_interval(mins => p_ttl_minutes), v_epoch)
  returning academy.attempt.attempt_id, academy.attempt.expires_at, academy.attempt.params;
end;
$$;

drop function if exists academy.consume_attempt(uuid, uuid, text, text, text);

create or replace function academy.consume_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text
)
returns table (params jsonb, challenge_version text, outcome jsonb, claim_token uuid, claim_state text)
language plpgsql
security invoker
as $$
begin
  return query
  update academy.attempt a
     set consumed_at = now(),
         claim_token = gen_random_uuid()
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.progress_epoch = coalesce((
       select e.epoch
         from academy.course_progress_epoch e
        where e.user_id = p_user_id and e.course_slug = p_course_slug
     ), 0)
     and (
       a.consumed_at is null
       or (a.outcome is null and a.consumed_at < now() - interval '30 seconds')
     )
     and a.expires_at > now()
  returning a.params, a.challenge_version, a.outcome, a.claim_token, 'claimed'::text;

  if found then
    return;
  end if;

  -- Completed retry returns the stored outcome. A concurrent live claim is distinct
  -- from an invalid attempt so the UI can reconcile instead of burning another quota.
  return query
  select a.params,
         a.challenge_version,
         a.outcome,
         null::uuid,
         case when a.outcome is not null then 'completed' else 'in-progress' end
    from academy.attempt a
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.progress_epoch = coalesce((
       select e.epoch
         from academy.course_progress_epoch e
        where e.user_id = p_user_id and e.course_slug = p_course_slug
     ), 0)
     and (
       a.outcome is not null
       or (
         a.outcome is null
         and a.consumed_at is not null
         and a.consumed_at >= now() - interval '30 seconds'
         and a.expires_at > now()
       )
     );
end;
$$;

comment on function academy.consume_attempt is
  'Claim attempt ด้วย fencing token; แยก claimed/completed/in-progress เพื่อ reconcile concurrent request';

-- Invalid submissions still need to close their current claim so they cannot become a
-- free reclaim after 30 seconds. Unlike the old function, this transition is fenced and
-- reports whether it actually won.
drop function if exists academy.finalize_attempt(uuid, uuid, jsonb);

create or replace function academy.finalize_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_claim_token uuid,
  p_outcome jsonb
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_updated integer;
begin
  if p_claim_token is null
     or p_outcome is null
     or jsonb_typeof(p_outcome) <> 'object'
     or jsonb_typeof(p_outcome -> 'passed') <> 'boolean'
     or p_outcome <> jsonb_build_object('passed', (p_outcome ->> 'passed')::boolean) then
    raise exception 'attempt outcome must be exactly {passed:boolean}' using errcode = '22023';
  end if;

  update academy.attempt a
     set outcome = p_outcome,
         claim_token = null
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.claim_token = p_claim_token
     and a.outcome is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function academy.capture_progress_epoch(
  p_user_id uuid,
  p_course_slug text
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_epoch bigint;
begin
  insert into academy.course_progress_epoch (user_id, course_slug, epoch)
  values (p_user_id, p_course_slug, 0)
  on conflict (user_id, course_slug) do nothing;

  select e.epoch into strict v_epoch
    from academy.course_progress_epoch e
   where e.user_id = p_user_id and e.course_slug = p_course_slug;
  return v_epoch;
end;
$$;

create or replace function academy.progress_write_allowed(
  p_user_id uuid,
  p_course_slug text,
  p_expected_epoch bigint
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_activation_status text;
  v_entitled boolean;
  v_epoch bigint;
begin
  select a.status into v_activation_status
    from academy.service_activation a
   where a.user_id = p_user_id
   for share;
  if v_activation_status is distinct from 'active' then
    return false;
  end if;

  select true into v_entitled
    from academy.course_entitlement e
   where e.user_id = p_user_id
     and e.course_slug = p_course_slug
     and e.revoked_at is null
     and (e.expires_at is null or e.expires_at > now())
   for share;
  if coalesce(v_entitled, false) is not true then
    return false;
  end if;

  insert into academy.course_progress_epoch (user_id, course_slug, epoch)
  values (p_user_id, p_course_slug, 0)
  on conflict (user_id, course_slug) do nothing;
  select e.epoch into strict v_epoch
    from academy.course_progress_epoch e
   where e.user_id = p_user_id and e.course_slug = p_course_slug
   for share;
  return p_expected_epoch is not null and p_expected_epoch = v_epoch;
end;
$$;

-- The valid grading path. PostgreSQL executes a function call in one transaction, so a
-- failed/mismatched fence cannot leave progress and outcome on different versions.
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
  if p_claim_token is null
     or p_outcome is null
     or jsonb_typeof(p_outcome) <> 'object'
     or jsonb_typeof(p_outcome -> 'passed') <> 'boolean'
     or p_outcome <> jsonb_build_object('passed', (p_outcome ->> 'passed')::boolean) then
    raise exception 'attempt outcome must be exactly {passed:boolean}' using errcode = '22023';
  end if;
  v_passed := (p_outcome ->> 'passed')::boolean;
  if (v_passed and p_status not in ('completed', 'tested-out'))
     or (not v_passed and p_status <> 'in-progress') then
    raise exception 'progress status conflicts with attempt outcome' using errcode = '22023';
  end if;

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
  return true;
end;
$$;

comment on function academy.commit_attempt_result is
  'Fenced transaction: claim/access/reset รุ่นปัจจุบันเท่านั้นที่เขียน progress และ outcome พร้อมกันได้';

create or replace function academy.commit_node_progress(
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_status text,
  p_expected_epoch bigint,
  p_checkpoint_results jsonb default null,
  p_video_cue_results jsonb default null,
  p_simulation_evidence jsonb default null
)
returns boolean
language plpgsql
security invoker
as $$
begin
  if not academy.progress_write_allowed(p_user_id, p_course_slug, p_expected_epoch) then
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
    null,
    null
  );
  return true;
end;
$$;

comment on function academy.commit_node_progress is
  'Generic progress mutation ที่ revalidate access และ reset generation ใน transaction สุดท้าย';

create or replace function academy.reset_course_progress(
  p_user_id uuid,
  p_course_slug text
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into academy.course_progress_epoch (user_id, course_slug, epoch)
  values (p_user_id, p_course_slug, 1)
  on conflict (user_id, course_slug)
  do update set epoch = academy.course_progress_epoch.epoch + 1;

  delete from academy.node_progress
   where user_id = p_user_id and course_slug = p_course_slug;
end;
$$;

comment on function academy.reset_course_progress is
  'เพิ่ม generation fence และลบ progress ใน transaction เดียวเพื่อกัน request ก่อน reset เขียนกลับมา';

-- Identity events may arrive out of order. Higher revision wins; the same revision is
-- idempotent only when status agrees, otherwise the issuer stream is inconsistent.
create or replace function academy.sync_service_activation(
  p_user_id uuid,
  p_status text,
  p_revision integer
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_current academy.service_activation%rowtype;
begin
  if p_status not in ('pending', 'active', 'suspended', 'deactivated') or p_revision < 0 then
    raise exception 'invalid activation status or revision' using errcode = '22023';
  end if;

  insert into academy.service_activation (user_id, status, revision, synced_at)
  values (p_user_id, p_status, p_revision, now())
  on conflict (user_id) do nothing;
  if found then
    return true;
  end if;

  select * into strict v_current
    from academy.service_activation
   where user_id = p_user_id
   for update;

  if p_revision > v_current.revision then
    update academy.service_activation
       set status = p_status, revision = p_revision, synced_at = now()
     where user_id = p_user_id;
    return true;
  end if;
  if p_revision = v_current.revision and p_status <> v_current.status then
    raise exception 'activation revision conflict: same revision has different status'
      using errcode = '23514';
  end if;
  return false;
end;
$$;

comment on function academy.sync_service_activation is
  'Apply activation เฉพาะ revision ที่สูงกว่า; revision เท่ากันต้องมีสถานะเดียวกัน';

grant execute on function academy.consume_attempt(uuid, uuid, text, text, text) to service_role;
grant execute on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int) to service_role;
grant execute on function academy.finalize_attempt(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function academy.capture_progress_epoch(uuid, text) to service_role;
grant execute on function academy.progress_write_allowed(uuid, text, bigint) to service_role;
grant execute on function academy.commit_attempt_result(uuid, uuid, uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function academy.commit_node_progress(uuid, text, text, text, bigint, jsonb, jsonb, jsonb) to service_role;
grant execute on function academy.reset_course_progress(uuid, text) to service_role;
grant execute on function academy.sync_service_activation(uuid, text, integer) to service_role;

revoke all on function academy.consume_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int) from public, anon, authenticated;
revoke all on function academy.finalize_attempt(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function academy.capture_progress_epoch(uuid, text) from public, anon, authenticated;
revoke all on function academy.progress_write_allowed(uuid, text, bigint) from public, anon, authenticated;
revoke all on function academy.commit_attempt_result(uuid, uuid, uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function academy.commit_node_progress(uuid, text, text, text, bigint, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function academy.reset_course_progress(uuid, text) from public, anon, authenticated;
revoke all on function academy.sync_service_activation(uuid, text, integer) from public, anon, authenticated;
