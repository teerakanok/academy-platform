# Verify authentication with the effective runtime role

Date: 2026-09-08. Scope: Academy profile activation and production SQL operations.

Production login exchanged a valid Identity result but failed with SQLSTATE 42501. Migration 0030 removed direct activation writes while the existing sync function remained SECURITY INVOKER. Earlier tests executing as a privileged database principal did not exercise the runtime permission boundary.

Control: the integration regression in academy-web/tests/integration/identity-lifecycle-enforcement.test.ts now explicitly SET ROLE academy_runtime and verifies activation, lifecycle denial, revision conflict, canonical issuer/subject identity, and denied direct authorization writes. Migration 0035 supplies a dedicated non-login function owner with only activation SELECT/INSERT/UPDATE and a role-specific RLS policy; runtime direct writes remain revoked.

Actual root PostgreSQL evidence reproduced 42501 before the migration and successful activation plus session creation/read afterward, all within ROLLBACK. The negative oracle verifies revision and privilege boundaries. Unit gate: 2452 pass, 2 skip; lint retains the documented 3 baseline errors. These checks do not substitute for the production browser journey.

Operational lesson: PostgreSQL role names do not prove capabilities. The guarded packet initially refused production postgres because rolsuper=false; no migration ran. Read-only catalog and effective-session checks established the already used supabase_admin operator. Preserve the capability guard and use the established operator; never expand an existing role merely to make a script pass.

The tracked 0035 operational packet binds the effective operator capability, exact prior function owner/body/ACL, new role absence, all required writer privileges individually, and RLS policy expressions. Rehearsal must restore the exact baseline after ROLLBACK before COMMIT. has_table_privilege with a comma-separated list means any listed privilege, so positive conjunction checks use separate calls. Causal missing-write and false-policy probes must reject.

Canonical references: academy-web/supabase/migrations/0035_service_activation_runtime_definer.sql; reports/verification/2026-09-08-activation-repair/ (production and operational evidence, populated at acceptance).
