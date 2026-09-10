-- progress_write_allowed takes FOR SHARE row locks on service_activation and
-- course_entitlement. FOR SHARE requires UPDATE privilege, which the
-- least-privilege table-write removal (0030, restored behind a definer in
-- 0035) took away from academy_runtime — so every authenticated progress
-- write failed with "permission denied for table service_activation" even
-- though plain reads kept working (academy_runtime holds BYPASSRLS, which
-- never bypasses ACL checks). First surfaced by the 2026-09-10 production
-- learner canary; the defect predates the 3f08bc0a activation and affects
-- every version relying on these invoker-mode RPCs.
--
-- The guard stays invoker-mode in shape but moves behind a SECURITY DEFINER
-- owned by postgres, matching the schema's prevailing ownership and the
-- documented migration ownership rule. The body is unchanged; only the
-- execution context and execute grants move.
alter function academy.progress_write_allowed(uuid, text, bigint)
  security definer
  set search_path = pg_catalog, academy;

alter function academy.progress_write_allowed(uuid, text, bigint)
  owner to postgres;

revoke all on function academy.progress_write_allowed(uuid, text, bigint)
  from public, anon, authenticated, service_role,
    academy_entitlement_operator, academy_staff_admin, academy_activation_writer;
grant execute on function academy.progress_write_allowed(uuid, text, bigint)
  to academy_runtime;
