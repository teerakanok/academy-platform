-- Runtime course management settings (founder/owner controls).
-- Overrides the static build-time publicAvailability in course.json.
-- The founder can publish/unpublish, retire, or edit display metadata
-- without rebuilding the Worker.
create table if not exists academy.course_settings (
  course_slug text primary key,
  title_override text,
  subtitle_override text,
  -- null = inherit from course.json; 'published' | 'unpublished' | 'retired' overrides
  visibility text,
  -- extensible per-course settings for future use (e.g. enrollment caps)
  settings jsonb not null default '{}'::jsonb,
  edited_by uuid references academy.users (id),
  edited_at timestamptz not null default statement_timestamp(),
  constraint course_settings_visibility_check check (
    visibility is null or visibility in ('published', 'unpublished', 'retired')
  ),
  constraint course_settings_settings_shape check (
    jsonb_typeof(settings) = 'object'
  )
);

alter table academy.course_settings owner to postgres;
alter table academy.course_settings enable row level security;

-- Default deny: no policies. Only the server runtime reads/writes through
-- its own grants; browsers never touch this table directly.
revoke all on table academy.course_settings
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on academy.course_settings to academy_runtime;

create index course_settings_visibility_idx
  on academy.course_settings (visibility)
  where visibility is not null;
