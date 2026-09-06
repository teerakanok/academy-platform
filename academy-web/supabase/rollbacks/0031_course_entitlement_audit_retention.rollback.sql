-- Reverses the bounded retention surface without deleting surviving evidence.
begin;

revoke select, delete on academy.course_entitlement_audit from academy_retention_definer;
revoke select on academy.course_entitlement from academy_retention_definer;

revoke execute on function academy.purge_expired_course_entitlement_history(integer, integer)
  from academy_retention_definer;
drop function academy.run_retention_course_entitlement_history();
drop function academy.purge_expired_course_entitlement_history(integer, integer);

-- Do not recreate the deleted user foreign keys: either could make account
-- purge fail or silently destroy surviving audit evidence on rollback.
commit;
