-- Reverses migration 0030 privileges without deleting entitlement audit evidence.
begin;

revoke execute on function academy.resolve_entitlement_account(text, text, text)
  from academy_entitlement_operator;
revoke execute on function academy.resolve_staff_account(text, text)
  from academy_staff_admin;
revoke execute on function academy.inspect_staff_role(uuid, uuid, text)
  from academy_staff_admin;
revoke execute on function academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)
  from academy_entitlement_operator;
revoke execute on function academy.inspect_course_entitlement(uuid, uuid, text)
  from academy_entitlement_operator;
revoke usage on schema academy from academy_entitlement_operator;
drop function academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text);
drop function academy.inspect_course_entitlement(uuid, uuid, text);
drop function academy.resolve_entitlement_account(text, text, text);
drop function academy.resolve_staff_account(text, text);
drop function academy.inspect_staff_role(uuid, uuid, text);
drop role academy_entitlement_operator;
revoke usage on schema academy from academy_staff_admin;

-- Restore only the pre-0030 grants that production needed at that revision.
grant select on academy.staff_role_assignment to service_role;
grant select on academy.staff_role_audit to service_role;
grant execute on function academy.has_staff_role(uuid, text) to service_role;
grant execute on function academy.purge_expired_staff_authorization_history(int, int) to service_role;
grant academy_staff_admin to postgres;
alter role academy_staff_admin nologin noinherit password null;
grant insert, update, delete on academy.service_activation to academy_runtime;
grant insert, update, delete on academy.course_entitlement to academy_runtime;
grant all on academy.service_activation to service_role;
grant all on academy.course_entitlement to service_role;
grant execute on function academy.has_course_entitlement(uuid, text) to service_role;
grant execute on function academy.sync_service_activation(uuid, text, integer) to service_role;

commit;
