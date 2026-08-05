-- Dedicated Academy data API boundary.
--
-- This role is a trusted Academy backend capability, not a learner role. It
-- bypasses RLS because existing Academy server operations are explicitly
-- server-authorized and all Academy tables intentionally have default-deny RLS.
-- Its blast radius is bounded by explicit Academy-only object grants and by a
-- separate PostgREST authenticator that has no membership in service_role.
-- Role bootstrap belongs in ../roles.sql because BYPASSRLS and role membership
-- require a database superuser; this migration runs with normal schema-owner
-- authority only.

-- Re-establish an allowlist if this migration is reapplied after an operator
-- experiment. PUBLIC has no executable Academy function surface after this.
revoke all on schema academy from public;
revoke all on all tables in schema academy from public;
revoke all on all sequences in schema academy from public;
revoke all on all functions in schema academy from public;

revoke all on schema academy from academy_runtime, academy_api_anon, academy_api_authenticator;
revoke all on all tables in schema academy from academy_runtime, academy_api_anon, academy_api_authenticator;
revoke all on all sequences in schema academy from academy_runtime, academy_api_anon, academy_api_authenticator;
revoke all on all functions in schema academy from academy_runtime, academy_api_anon, academy_api_authenticator;

grant usage on schema academy to academy_runtime;

-- Account/bootstrap and waitlist flows.
grant select, insert, update on academy.users to academy_runtime;
grant select, insert, update on academy.leads to academy_runtime;
grant insert on academy.consent_events to academy_runtime;

-- Learner access, progress, and attempt state. Entitlement mutation is an
-- existing trusted Academy server contract; it is never a browser capability.
grant select, insert, update on academy.service_activation to academy_runtime;
grant select, insert, update on academy.course_entitlement to academy_runtime;
grant select, insert, update on academy.course_progress_epoch to academy_runtime;
grant select, insert, delete on academy.course_progress_reset_operation to academy_runtime;
grant select, insert, update, delete on academy.node_progress to academy_runtime;
grant select, insert, update on academy.attempt to academy_runtime;

grant execute on function academy.has_course_entitlement(uuid, text) to academy_runtime;
grant execute on function academy.has_staff_role(uuid, text) to academy_runtime;
grant execute on function academy.status_rank(text) to academy_runtime;
grant execute on function academy.merge_simulation_evidence(jsonb, jsonb) to academy_runtime;
grant execute on function academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)
  to academy_runtime;
grant execute on function academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int)
  to academy_runtime;
grant execute on function academy.consume_attempt(uuid, uuid, text, text, text) to academy_runtime;
grant execute on function academy.finalize_attempt(uuid, uuid, uuid, jsonb) to academy_runtime;
grant execute on function academy.capture_progress_epoch(uuid, text) to academy_runtime;
grant execute on function academy.progress_write_allowed(uuid, text, bigint) to academy_runtime;
grant execute on function academy.commit_attempt_result(uuid, uuid, uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb)
  to academy_runtime;
grant execute on function academy.commit_node_progress(uuid, text, text, text, bigint, jsonb, jsonb, jsonb)
  to academy_runtime;
grant execute on function academy.reset_course_progress(uuid, text, uuid) to academy_runtime;
grant execute on function academy.sync_service_activation(uuid, text, integer) to academy_runtime;
grant execute on function academy.inspect_attempt(uuid, uuid, text, text, text) to academy_runtime;
grant execute on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text)
  to academy_runtime;
grant execute on function academy.withdraw_marketing_consent(uuid, timestamptz) to academy_runtime;
