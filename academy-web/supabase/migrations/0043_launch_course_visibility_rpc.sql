-- Audited, owner-attributed launch control for runtime course visibility.
-- The launch operator never receives course_settings table rights: it calls
-- these security-definer RPCs, while the RPC derives the sole active owner and
-- records the founder's bounded approval reference with exact before/after rows.

create table academy.course_settings_launch_audit (
  event_id bigint generated always as identity primary key,
  action text not null check (action in ('launch', 'rollback')),
  actor_account_id uuid not null references academy.users(id),
  approval_reference text not null check (
    char_length(btrim(approval_reference)) between 8 and 120
  ),
  before_state jsonb not null,
  after_state jsonb not null,
  rows_changed integer not null check (rows_changed >= 0),
  occurred_at timestamptz not null default statement_timestamp()
);

alter table academy.course_settings_launch_audit owner to postgres;
alter table academy.course_settings_launch_audit enable row level security;
revoke all on table academy.course_settings_launch_audit
  from public, anon, authenticated, service_role, academy_runtime, academy_staff_admin;

create index course_settings_launch_audit_occurred_idx
  on academy.course_settings_launch_audit (occurred_at desc);

create or replace function academy.launch_course_state_hash(p_state jsonb)
returns text
language sql
stable
strict
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(p_state::text, 'UTF8')), 'hex')
$$;

create or replace function academy.inspect_launch_course_visibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_state jsonb;
  v_audit record;
begin
  with expected(course_slug) as (
    values
      ('basic-os-linux'),
      ('git-essentials'),
      ('assembly'),
      ('c-low-level'),
      ('computer-architecture'),
      ('computer-networking'),
      ('operating-systems'),
      ('setup-and-environment')
  )
  select jsonb_agg(
    jsonb_build_object(
      'courseSlug', expected.course_slug,
      'exists', settings.course_slug is not null,
      'titleOverride', settings.title_override,
      'subtitleOverride', settings.subtitle_override,
      'visibility', settings.visibility,
      'settings', coalesce(settings.settings, '{}'::jsonb),
      'editedBy', settings.edited_by::text,
      'editedAt', settings.edited_at
    ) order by expected.course_slug
  )
  into v_state
  from expected expected
  left join academy.course_settings settings
    on settings.course_slug = expected.course_slug;

  select action, approval_reference, occurred_at
    into v_audit
    from academy.course_settings_launch_audit
   order by event_id desc
   limit 1;

  return jsonb_build_object(
    'state', v_state,
    'stateSha256', academy.launch_course_state_hash(v_state),
    'effectiveVisibility', (
      select jsonb_object_agg(
        state->>'courseSlug',
        case
          when (state->>'exists')::boolean and state->>'visibility' is not null
            then state->>'visibility'
          else 'published'
        end
      )
      from jsonb_array_elements(v_state) as state(state)
    ),
    'latestAudit', case when v_audit is null then null else jsonb_build_object(
      'action', v_audit.action,
      'approvalReference', v_audit.approval_reference,
      'occurredAt', v_audit.occurred_at
    ) end
  );
end;
$$;

create or replace function academy.set_launch_course_visibility(
  p_visibility jsonb,
  p_restore_state jsonb,
  p_approval_reference text,
  p_expected_state_sha256 text,
  p_rollback boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_required_visibility constant jsonb := $json$
  {
    "basic-os-linux": "published",
    "git-essentials": "published",
    "assembly": "unpublished",
    "c-low-level": "unpublished",
    "computer-architecture": "unpublished",
    "computer-networking": "unpublished",
    "operating-systems": "unpublished",
    "setup-and-environment": "unpublished"
  }
  $json$::jsonb;
  v_before jsonb;
  v_before_sha256 text;
  v_after jsonb;
  v_owner_ids uuid[];
  v_actor uuid;
  v_audit record;
  v_rows_changed integer := 0;
  v_row_count integer;
  v_item record;
begin
  if p_approval_reference is null
     or btrim(p_approval_reference) <> p_approval_reference
     or char_length(p_approval_reference) not between 8 and 120
  then
    raise exception 'invalid launch approval reference' using errcode = '22023';
  end if;
  if p_expected_state_sha256 is null
     or p_expected_state_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid launch state hash' using errcode = '22023';
  end if;
  if p_rollback is null then
    raise exception 'rollback flag is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('academy.course_settings:launch', 0)
  );

  with expected(course_slug) as (
    values
      ('basic-os-linux'),
      ('git-essentials'),
      ('assembly'),
      ('c-low-level'),
      ('computer-architecture'),
      ('computer-networking'),
      ('operating-systems'),
      ('setup-and-environment')
  )
  select jsonb_agg(
    jsonb_build_object(
      'courseSlug', expected.course_slug,
      'exists', settings.course_slug is not null,
      'titleOverride', settings.title_override,
      'subtitleOverride', settings.subtitle_override,
      'visibility', settings.visibility,
      'settings', coalesce(settings.settings, '{}'::jsonb),
      'editedBy', settings.edited_by::text,
      'editedAt', settings.edited_at
    ) order by expected.course_slug
  )
  into v_before
  from expected expected
  left join academy.course_settings settings
    on settings.course_slug = expected.course_slug
    on settings.course_slug = expected.course_slug;

  v_before_sha256 := academy.launch_course_state_hash(v_before);
  if v_before_sha256 <> p_expected_state_sha256 then
    raise exception 'course visibility baseline changed before launch mutation'
      using errcode = '40001';
  end if;

  select array_agg(account_id order by account_id) into v_owner_ids
    from academy.staff_role_assignment
   where role = 'owner' and revoked_at is null;
  if coalesce(array_length(v_owner_ids, 1), 0) <> 1 then
    raise exception 'launch mutation requires exactly one active owner'
      using errcode = '42501';
  end if;
  v_actor := v_owner_ids[1];

  select action, approval_reference, before_state, after_state
    into v_audit
    from academy.course_settings_launch_audit
   order by event_id desc
   limit 1;

  if p_rollback
     and v_audit.action = 'rollback'
     and v_audit.approval_reference = p_approval_reference
     and v_audit.after_state = v_before
  then
    return jsonb_build_object(
      'action', 'rollback', 'changed', false, 'auditWritten', false,
      'stateSha256', v_before_sha256
    );
  end if;

  if not p_rollback then
    if p_visibility is null or p_visibility <> v_required_visibility then
      raise exception 'launch visibility target is not the founder-approved shape'
        using errcode = '22023';
    end if;

    if v_audit.action = 'launch'
       and v_audit.approval_reference = p_approval_reference
       and v_audit.after_state = v_before
    then
      return jsonb_build_object(
        'action', 'launch', 'changed', false, 'auditWritten', false,
        'stateSha256', v_before_sha256
      );
    end if;

    for v_item in select * from jsonb_each_text(p_visibility) loop
      insert into academy.course_settings(
        course_slug, visibility, edited_by, edited_at
      ) values (
        v_item.key, v_item.value, v_actor, statement_timestamp()
      )
      on conflict (course_slug) do update set
        visibility = excluded.visibility,
        edited_by = excluded.edited_by,
        edited_at = excluded.edited_at
      where academy.course_settings.visibility is distinct from excluded.visibility
         or academy.course_settings.edited_by is distinct from excluded.edited_by;
      get diagnostics v_row_count = row_count;
      v_rows_changed := v_rows_changed + v_row_count;
    end loop;
  else
    if p_restore_state is null then
      raise exception 'rollback requires the protected pre-launch state' using errcode = '22023';
    end if;
    if v_audit.action is distinct from 'launch'
       or academy.launch_course_state_hash(v_audit.before_state)
          <> academy.launch_course_state_hash(p_restore_state)
    then
      raise exception 'rollback state is not bound to the audited launch baseline'
        using errcode = '42501';
    end if;
    if v_audit.approval_reference <> p_approval_reference then
      raise exception 'rollback approval reference does not match the launch'
        using errcode = '42501';
    end if;

    delete from academy.course_settings settings
     where settings.course_slug in (
       select state->>'courseSlug'
         from jsonb_array_elements(v_audit.before_state) as state(state)
        where (state->>'exists')::boolean is false
     );
    get diagnostics v_row_count = row_count;
    v_rows_changed := v_rows_changed + v_row_count;

    for v_item in select * from jsonb_array_elements(p_restore_state) as state(state) loop
      if (v_item.state->>'exists')::boolean then
        insert into academy.course_settings as settings (
          course_slug, title_override, subtitle_override, visibility,
          settings, edited_by, edited_at
        ) values (
          v_item.state->>'courseSlug',
          nullif(v_item.state->>'titleOverride', ''),
          nullif(v_item.state->>'subtitleOverride', ''),
          nullif(v_item.state->>'visibility', ''),
          coalesce(v_item.state->'settings', '{}'::jsonb),
          (v_item.state->>'editedBy')::uuid,
          (v_item.state->>'editedAt')::timestamptz
        )
        on conflict (course_slug) do update set
          title_override = excluded.title_override,
          subtitle_override = excluded.subtitle_override,
          visibility = excluded.visibility,
          settings = excluded.settings,
          edited_by = excluded.edited_by,
          edited_at = excluded.edited_at;
        get diagnostics v_row_count = row_count;
        v_rows_changed := v_rows_changed + v_row_count;
      end if;
    end loop;
  end if;

  with expected(course_slug) as (
    values
      ('basic-os-linux'),
      ('git-essentials'),
      ('assembly'),
      ('c-low-level'),
      ('computer-architecture'),
      ('computer-networking'),
      ('operating-systems'),
      ('setup-and-environment')
  )
  select jsonb_agg(
    jsonb_build_object(
      'courseSlug', expected.course_slug,
      'exists', settings.course_slug is not null,
      'titleOverride', settings.title_override,
      'subtitleOverride', settings.subtitle_override,
      'visibility', settings.visibility,
      'settings', coalesce(settings.settings, '{}'::jsonb),
      'editedBy', settings.edited_by::text,
      'editedAt', settings.edited_at
    ) order by expected.course_slug
  )
  into v_after
  from expected expected
  left join academy.course_settings settings
    on settings.course_slug = expected.course_slug;

  insert into academy.course_settings_launch_audit(
    action, actor_account_id, approval_reference,
    before_state, after_state, rows_changed
  ) values (
    case when p_rollback then 'rollback' else 'launch' end,
    v_actor,
    p_approval_reference,
    v_before,
    v_after,
    v_rows_changed
  );

  return jsonb_build_object(
    'action', case when p_rollback then 'rollback' else 'launch' end,
    'changed', true,
    'auditWritten', true,
    'stateSha256', academy.launch_course_state_hash(v_after)
  );
end;
$$;

comment on table academy.course_settings_launch_audit is
  'Append-only exact launch/rollback course visibility state with owner and founder approval reference';
comment on function academy.launch_course_state_hash(jsonb) is
  'Canonical SHA-256 for the exact eight-course launch state';
comment on function academy.inspect_launch_course_visibility() is
  'Return the exact launch course state and sanitized latest audit for the dedicated launch operator';
comment on function academy.set_launch_course_visibility(jsonb, jsonb, text, text, boolean) is
  'Apply or exactly restore the founder-approved launch visibility through the sole active owner with durable audit';

revoke all on function academy.launch_course_state_hash(jsonb)
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.inspect_launch_course_visibility()
  from public, anon, authenticated, service_role, academy_runtime;
revoke all on function academy.set_launch_course_visibility(jsonb, jsonb, text, text, boolean)
  from public, anon, authenticated, service_role, academy_runtime;

grant execute on function academy.inspect_launch_course_visibility()
  to academy_staff_admin;
grant execute on function academy.set_launch_course_visibility(jsonb, jsonb, text, text, boolean)
  to academy_staff_admin;
