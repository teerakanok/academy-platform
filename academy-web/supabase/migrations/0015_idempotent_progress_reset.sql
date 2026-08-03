-- 0015_idempotent_progress_reset.sql -- transactional access recheck + reset receipts

create table if not exists academy.course_progress_reset_operation (
  user_id uuid not null references academy.users (id) on delete cascade,
  course_slug text not null,
  operation_id uuid not null,
  progress_epoch bigint not null check (progress_epoch >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, course_slug, operation_id)
);

comment on table academy.course_progress_reset_operation is
  'Receipt ของ reset operation; operation ID เดิมต้องไม่เพิ่ม epochหรือลบ progress รอบใหม่';

alter table academy.course_progress_reset_operation enable row level security;
grant all on academy.course_progress_reset_operation to service_role;
create index course_progress_reset_operation_completed_idx
  on academy.course_progress_reset_operation (user_id, course_slug, completed_at desc);

create or replace function academy.reset_course_progress(
  p_user_id uuid,
  p_course_slug text,
  p_operation_id uuid
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
  -- Lock ตามลำดับเดียวกับ progress_write_allowed เพื่อให้ reset/revoke/write
  -- มีจุดตัดสินใน transaction เดียวกันและไม่สร้าง deadlock ข้ามเส้นทาง
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_course_slug || '|' || p_operation_id::text, 0)
  );

  select r.progress_epoch into v_epoch
    from academy.course_progress_reset_operation r
   where r.user_id = p_user_id
     and r.course_slug = p_course_slug
     and r.operation_id = p_operation_id;
  if found then
    return true;
  end if;

  insert into academy.course_progress_epoch (user_id, course_slug, epoch)
  values (p_user_id, p_course_slug, 1)
  on conflict (user_id, course_slug)
  do update set epoch = academy.course_progress_epoch.epoch + 1
  returning epoch into v_epoch;

  delete from academy.node_progress
   where user_id = p_user_id and course_slug = p_course_slug;

  insert into academy.course_progress_reset_operation
    (user_id, course_slug, operation_id, progress_epoch)
  values (p_user_id, p_course_slug, p_operation_id, v_epoch);

  -- Idempotency receipts must be bounded. Keep the current operation plus the 127
  -- most recent receipts for this learner/course; the current row is excluded from
  -- pruning so an immediate status check always finds it even when timestamps tie.
  delete from academy.course_progress_reset_operation r
   where r.ctid in (
     select old.ctid
       from academy.course_progress_reset_operation old
      where old.user_id = p_user_id
        and old.course_slug = p_course_slug
        and old.operation_id <> p_operation_id
      order by old.completed_at desc, old.operation_id desc
      offset 127
   );
  return true;
end;
$$;

comment on function academy.reset_course_progress(uuid, text, uuid) is
  'Idempotent reset: revalidate access, increment epoch, delete progress, persist receipt atomically';

-- Compatibility for trusted fixture/older application callers during a rolling release.
-- It receives the same transactional access guard, while current product code always uses
-- the operation-ID signature above.
create or replace function academy.reset_course_progress(
  p_user_id uuid,
  p_course_slug text
)
returns void
language plpgsql
security invoker
as $$
begin
  if not academy.reset_course_progress(p_user_id, p_course_slug, gen_random_uuid()) then
    raise exception 'course access denied during progress reset' using errcode = '42501';
  end if;
end;
$$;

revoke all on function academy.reset_course_progress(uuid, text, uuid) from public, anon, authenticated;
grant execute on function academy.reset_course_progress(uuid, text, uuid) to service_role;
