-- Reverses migration 0040 self-enrolment authority without deleting entitlement
-- or audit evidence. Entitlements already granted with source 'free' stay valid
-- (course_entitlement has always allowed 'free'); revoke them, if required, only
-- through the audited owner operator path.
begin;

revoke execute on function academy.enrol_free_course(uuid, text)
  from academy_runtime;
drop function academy.enrol_free_course(uuid, text);
drop table academy.course_offer;

-- Restore the exact 0030 audit source check only when no self-enrolment audit
-- evidence exists; otherwise keep the widened check so evidence is retained.
do $$
begin
  if not exists (select 1 from academy.course_entitlement_audit where source = 'free') then
    alter table academy.course_entitlement_audit
      drop constraint course_entitlement_audit_source_check;
    alter table academy.course_entitlement_audit
      add constraint course_entitlement_audit_source_check
      check (source in ('invitation', 'grant'));
  end if;
end
$$;

commit;
