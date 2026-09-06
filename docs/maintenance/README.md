# Academy Maintenance

Maintenance entry point for CyberSkills Academy.

For source preparation, version upload, smoke and activation, use
[`academy-production-release.md`](./academy-production-release.md).

Read this folder before any Academy production operation, incident response,
backup verification, restore rehearsal, rollback, or secret-handling change.

## Read order

1. [`academy-system-inventory.md`](./academy-system-inventory.md)
2. [`academy-secret-registry.md`](./academy-secret-registry.md)
3. [`academy-operations-runbook.md`](./academy-operations-runbook.md)
4. Current production checkpoint:
   [`../../reports/sessions/academy-production-readiness-2026-09-03.md`](../../reports/sessions/academy-production-readiness-2026-09-03.md)
5. Supporting boundary docs:
   - [`../academy-data-api.md`](../academy-data-api.md)
   - [`../../academy-web/docs/private-media-delivery.md`](../../academy-web/docs/private-media-delivery.md)
   - [`../../academy-web/docs/academy-retention-scheduler.md`](../../academy-web/docs/academy-retention-scheduler.md)
   - [`../../academy-web/docs/staff-authorization.md`](../../academy-web/docs/staff-authorization.md)
   - [`../../academy-web/docs/course-entitlement-operator.md`](../../academy-web/docs/course-entitlement-operator.md)
   - [`../../academy-web/docs/privacy/request-runbook.md`](../../academy-web/docs/privacy/request-runbook.md)

## Scope

This folder records only:

- current production topology and ownership boundaries;
- secret names, storage locations, and expected vault records, never values;
- backup, restore, rollback, and verification procedures;
- known recovery gaps that still require future rehearsal.

This folder does not replace director-level shared infra records. For Pool A,
shared Supabase, `ssh-db`, shared Cloudflare, or ecosystem identity ownership,
read the director repo records first, then return here for Academy-specific
constraints.

For retention migration incidents, preserve evidence and any authenticated
sessions for explicit operator review first. A migration rollback must not be
used as an automatic destructive response; revoke the affected runtime or
operator credential separately, document the session handling decision, and run
only the approved bounded retention path when deletion is finally authorized.
