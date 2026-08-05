-- Run as database superuser immediately after migration 0020. This keeps the
-- SECURITY DEFINER owner independent from the normal schema migration role.

begin;

alter function academy.run_retention_attempts() owner to academy_retention_definer;
alter function academy.run_retention_leads() owner to academy_retention_definer;
alter function academy.run_retention_inactive_users() owner to academy_retention_definer;
alter function academy.run_retention_privacy_requests() owner to academy_retention_definer;
alter function academy.run_retention_staff_authorization_history() owner to academy_retention_definer;

grant execute on function academy.run_retention_attempts() to academy_retention;
grant execute on function academy.run_retention_leads() to academy_retention;
grant execute on function academy.run_retention_inactive_users() to academy_retention;
grant execute on function academy.run_retention_privacy_requests() to academy_retention;
grant execute on function academy.run_retention_staff_authorization_history() to academy_retention;

commit;
