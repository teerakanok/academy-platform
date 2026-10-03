-- Reverses only migration 0041. This deliberately restores the broad early
-- grants; use it only for a reviewed rollback decision, then redeploy 0041.

begin;

grant all on table academy.leads to service_role;
grant all on table academy.users to service_role;
grant all on table academy.node_progress to service_role;
grant all on table academy.attempt to service_role;

commit;
