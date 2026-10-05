-- Reverses migration 0043 only. Course settings rows are intentionally left
-- untouched; use the audited launch RPC before this schema rollback if the
-- launch shape itself must be restored.

drop function if exists academy.set_launch_course_visibility(
  jsonb, jsonb, text, text, boolean
);
drop function if exists academy.inspect_launch_course_visibility();
drop function if exists academy.launch_course_state_hash(jsonb);
drop table if exists academy.course_settings_launch_audit;
