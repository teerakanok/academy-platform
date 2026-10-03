-- The Academy Worker uses the dedicated academy_runtime role. The shared
-- service_role is used by other Pool A services, so the early all-privilege
-- grants on core learner data must not remain as a cross-product blast radius.
-- Function grants and the dedicated runtime/operator capabilities are unchanged.

begin;

revoke all on table academy.leads from service_role;
revoke all on table academy.users from service_role;
revoke all on table academy.node_progress from service_role;
revoke all on table academy.attempt from service_role;

commit;
