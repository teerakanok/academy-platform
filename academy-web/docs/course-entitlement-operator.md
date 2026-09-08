# Audited course entitlement operations

## Scope

This is the initial manual B2B/university enrollment path. No payment provider is
selected, no public entitlement UI exists, and the Academy Worker cannot grant or
revoke a course. Runtime remains behind Cloudflare Access and receives only reads,
progress functions, Identity callback/session RPCs, and the monotonic service
activation RPC.

The entitlement database role is `academy_entitlement_operator`. It is a direct
PostgreSQL login with only three executable functions:

- `academy.resolve_entitlement_account`
- `academy.inspect_course_entitlement`
- `academy.set_course_entitlement`

It has no table privilege and cannot call staff-role mutation. The application
runtime, shared `service_role`, browser roles, and `academy_staff_admin` cannot
execute the entitlement RPC. An active Academy `owner` staff actor is required
inside the mutating function; a learner or runtime principal cannot self-issue
access.

## Migration review

Before production, run the transaction rehearsal first and require both reported
privilege checks to be false/true as shown by the command:

```bash
cd academy-web
DATABASE_URL='<approved migration/operator URI, never printed>' \
  node scripts/apply-course-entitlement-hardening.mjs --dry-run
```

The rehearsal executes migration `0030`, queries role capabilities, and always
issues `ROLLBACK`. After independent review, and only after a Pool A backup and
production change record exist, replace `--dry-run` with `--apply`; that path
issues `COMMIT` only after the same checks pass.

The reversible SQL for `0030` is
`supabase/rollbacks/0030_least_privilege_course_entitlement.rollback.sql`. When
`0031` is installed, first apply
`supabase/rollbacks/0031_course_entitlement_audit_retention.rollback.sql`. These
rollbacks remove dedicated privilege and retention surfaces but intentionally
retain `academy.course_entitlement_audit` as evidence. A migration rollback is
never an automatic destructive response for existing authenticated sessions;
handle those sessions through the documented operator incident process. Do not
run a rollback merely to erase an audit record. Scheduled retention is the only
audit deletion path and uses the existing three-year authorization-history
retention bound with a 500-row batch.

## Dedicated role provisioning

Migration `0030` creates the login with no password. A database host operator
must set the password through an approved host-only vault flow (for example
`psql`'s `\password academy_entitlement_operator`), then store only the resulting
connection reference in the approved controller environment. Never put a value in
Git, command history, application runtime variables, logs, or a worker secret.

Disable the capability during an incident with:

```sql
alter role academy_entitlement_operator nologin password null;
```

Re-enable only with a newly provisioned password and a recorded approval.

## Owner bootstrap and identity lookup

1. Bootstrap the first Academy owner with the direct `academy_staff_admin`
   workflow in `docs/staff-authorization.md`.
2. Obtain the actor and target canonical Identity issuer plus subject UUID. The
   subject is mandatory; email is never an identity key.
3. `--actor-email-hint` and `--target-email-hint` are optional confirmation
   hints. The database rejects a hint that does not match the canonical account,
   but never substitutes an email for the subject.

Do not infer Songpon's subject from an email or hard-code a founder subject. Live
production use must read the subject from the canonical Identity Control record.

## Grant and revoke

Run without `--apply` first. Each command requires a bounded course slug, either
`grant` or `invitation` source, and an 8-120 character authorization reference.
The dry run reports whether the named actor is an active owner and whether the
course scope is currently active:

```bash
DATABASE_URL='<approved entitlement-operator URI, never printed>' \
  node scripts/manage-course-entitlement.mjs --grant \
  --actor-issuer '<issuer>' --actor-subject '<canonical-uuid>' \
  --target-issuer '<issuer>' --target-subject '<canonical-uuid>' \
  --course setup-and-environment --source grant \
  --reference '<approved-change-reference>'
```

For a dated cohort grant, add `--expires-at '<future-RFC3339>'`. Re-running the
same grant is a no-op. Change `--grant` to `--revoke` for revocation; repeated
revocation is a no-op. Add `--apply` only after the dry run and reference are
approved. Add `--rehearse` instead of `--apply` to execute the same audited RPC in a
transaction, verify the resulting entitlement and latest audit, roll back, and verify that the
original entitlement and audit are restored. `--rehearse` cannot be combined with `--apply`.

Every effective grant/revoke writes one append-only audit row containing only
canonical target and actor UUIDs, course scope, action, source, expiry, and
reference. Account purge may remove identities while retaining those UUIDs;
scheduled retention holds active entitlement evidence and expires it only after
the existing three-year authorization-history bound following revocation or expiry. The operator has no direct audit-table
access. Independent auditors should query the RLS-protected table through the
approved Pool A owner/audit process; do not expose it to `service_role`.

Migration 0030 refuses an existing `academy_entitlement_operator` name and unexpected staff-admin role state before enabling login. Investigate collisions explicitly; do not drop or reset an existing role to force migration. The staff role must match its prior non-login boundary and have no existing password. Owner revocation and entitlement changes share an authorization lock. Rollback disables staff login and clears any password provisioned after migration.

Entitlement audit follows the existing authorization-history hold: retain evidence while a matching entitlement is active and for three years after it ends through revocation or expiry; old event rows become eligible only when that hold no longer applies. Account deletion preserves UUID audit attribution.
