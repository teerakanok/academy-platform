begin;

revoke all on function academy.inspect_course_entitlement_audit(uuid, uuid, text)
  from academy_entitlement_operator;
revoke all on function academy.inspect_staff_role_audit(uuid, uuid, text)
  from academy_staff_admin;
drop function academy.inspect_course_entitlement_audit(uuid, uuid, text);
drop function academy.inspect_staff_role_audit(uuid, uuid, text);

commit;
