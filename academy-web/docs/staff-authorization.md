# Academy staff authorization

## V1 decision

The founder is the only staff member at launch, but authorization is role-based rather
than a single unrestricted admin flag. One account may hold multiple roles.

| Role | Allowed responsibility | Explicitly outside the role |
|---|---|---|
| `owner` | Assign/revoke staff roles; all Academy staff capabilities | No bypass of learner authorization or evidence rules |
| `learner-support` | Reserved policy label for a future enrollment/support workflow | No capability is wired in v1 |
| `privacy-officer` | Reserved policy label for a future privacy/appeal workflow | No capability is wired in v1 |
| `content-ops` | Internal content/player operations | Learner PII, privacy cases, role administration |

`owner` implies the other three roles. Every other role is exact: holding one does not
grant another.

## Enforcement

- `academy.staff_role_assignment` is the current-state source of truth.
- `academy.staff_role_audit` records every effective grant and revocation.
- Browser database roles cannot read either table or execute staff functions.
- The shared runtime `service_role` can check roles but cannot change them.
- Only the non-login `academy_staff_admin` control-plane role can execute role changes.
- Server code checks `academy.has_staff_role` on every protected request.
- `INTERNAL_SURFACES=on` only enables the route family; `/player` still requires
  `content-ops` or `owner` and is forced dynamic so authorization is never prerendered.
- Only `content-ops` is connected to a product surface in this checkpoint. The support
  and privacy roles must not be represented as operator access until their workflows
  enforce those roles.
- Active staff roles hold account-retention deletion together with their authorization
  history. After revocation, assignments and pseudonymous audit history are retained for
  three years, then purged in bounded jobs.

## Bootstrap and changes

There is no staff UI in v1. The migration grants the Supabase `postgres` migration
operator permission to assume the non-login `academy_staff_admin` role. That operator
uses `scripts/manage-staff-role.mjs`. The script is dry-run by
default and requires `--apply` to change state. Its `DATABASE_URL` must be supplied by the
approved control-plane environment, never by the shared application runtime.

1. The founder signs in once so an `academy.users` account exists.
2. Resolve that account by stable issuer and subject, never by email as identity.
3. Run the script without `--apply`; review the action, role, and current state.
4. If no active owner exists, bootstrap only that same account as its own first owner.
5. Later grants/revocations must name the approving active owner as actor and include an
   8-120 character authorization reference from the approved change record.
6. Re-run with `--apply`; the script verifies the resulting assignment without printing PII.

If the founder changes identity provider or subject, create/sign in the replacement
account, grant it `owner` while the previous owner is still active, verify the new owner,
then revoke the old owner. The database prevents revoking the final owner.

The function prevents a non-owner change, self-revocation of owner, and revocation of
the final owner. Production bootstrap remains part of the Pool A migration/release gate.
