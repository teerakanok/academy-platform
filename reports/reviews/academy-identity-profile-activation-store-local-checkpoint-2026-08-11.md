# Academy Identity Profile Activation Store - Local Checkpoint - 2026-08-11

**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`

## Outcome

Academy now has one local durable boundary for the part of a successful
Identity Control callback that Academy owns: bind the verified canonical
principal to one Academy profile and synchronize the service-activation
projection in the same PostgreSQL statement transaction.

The TypeScript store accepts only `issuer`, `subject`, `verifiedEmail`, and the
two-field activation projection. It snapshots exact own enumerable data
descriptors, normalizes the verified email, captures the injected RPC method
once with its receiver, calls one named RPC, validates the returned account
UUID, and returns a fresh projection. Input, RPC, response, and construction
failures collapse to one fixed detail-free error.

Migration `0024_identity_profile_activation.sql` adds
`academy.commit_identity_profile_activation(text,text,text,text,integer)`. The
function upserts `academy.users` by `(issuer, subject)`, invokes the existing
revision-aware `academy.sync_service_activation`, and returns the Academy
account ID. It then reads the durable activation inside the same statement and
requires its status and revision to match the input. An exact duplicate is
accepted, while a same-revision conflict or stale lower revision rolls the
preceding profile write back. The function body has no course-entitlement or
staff-role mutation.

## Ownership Boundary

| Concern | Owner | This checkpoint does |
|---|---|---|
| Canonical principal and activation decision | Identity Control | Receives an already verified projection; it does not identify or merge people |
| Academy profile and activation copy | Academy | Commits them atomically through one named RPC |
| Course entitlement and resource authorization | Academy commerce/access layers | Remains a separate capability and table path |
| Founder/staff roles | Academy staff-control plane | Remains outside the callback profile capability |
| Callback/session orchestration | Future approved Academy runtime | Remains unwired |

The SQL function is `SECURITY INVOKER`. Default `PUBLIC`, `anon`,
`authenticated`, and `service_role` execution are revoked; execution is granted
to the existing `academy_runtime` role. This proves the function's callable
surface, not a full reduction of the existing runtime role: migration 0019
still gives that role broader Academy table privileges for other application
operations. Any production role split or ACL tightening remains a separate
reviewed migration.

## TDD And Verification

The test-only RED stopped before collection because
`@/lib/identity/profile-activation-store` did not exist. No implementation or
migration file existed at that point.

Current Node 24.18.0 evidence:

| Gate | Result |
|---|---|
| Focused unit | `21/21` PASS |
| Local PostgreSQL integration | `11/11` PASS |
| Academy Identity + callback units | `29 files / 448 tests` PASS |
| Full Academy unit suite | `100 files / 1,137 tests` PASS |
| Identity Control API + authorization + assertion | `3 files / 59 tests` PASS |
| Full Academy lint and all TypeScript configs | PASS; one pre-existing generated-registry warning |

The first integration attempt reported `ECONNREFUSED 127.0.0.1:54322` because
the Academy local Supabase stack was absent. The author then started that
project's local stack with CLI output redirected to a mode-0600 temporary log,
ran the migration and integration cases, stopped the stack with no backup, and
removed both temporary logs. A final status check returned `No such container:
supabase_db_academy-web`, matching the initial resource baseline.

Integration coverage executes the real PostgreSQL function and proves:

- one profile plus activation and zero entitlement/staff rows;
- repeated canonical `(issuer, subject)` binding returns one account;
- equal email across different subjects never merges accounts;
- an exact duplicate may refresh the verified email without changing activation;
- same-revision conflicts and stale lower revisions roll profile changes back;
- concurrent repeats converge on one profile;
- invalid email/status/revision leave no profile residue; and
- only `academy_runtime` has function execution among the four tested roles.

The broader Identity unit command was first invoked through an absolute `npm`
path without prepending Node 24 to `PATH`; `/usr/bin/env node` therefore selected
the workstation's Node 25 and one known CryptoKey Proxy portability test failed.
The authoritative rerun pinned Node 24 through `PATH` and passed all `448/448`.
No source change was made in response to the unsupported-runtime result.

## First Independent RIL And Remediation

The first different independent review bound the original freeze and returned
`C0/H1/M0/L0`. H-01 found that the function used `PERFORM` for
`sync_service_activation` and ignored its boolean result. The accepted helper
returns `false` for a stale lower revision, so a stale `active` projection could
have updated the profile and returned success while the durable activation
remained a newer `suspended` revision.

The remediation added two real-PostgreSQL cases before changing SQL. The RED
run passed 10 cases and failed the stale-revision case because the call resolved
successfully and persisted the new email. Migration 0024 now reads the durable
activation after synchronization and raises when status or revision differs
from the input. The statement transaction therefore rolls the profile write
back for stale or conflicting input while retaining exact duplicate behavior.
The GREEN integration rerun passed `11/11`.

The original manifest became invalid when those two frozen files changed, as
required by the checkpoint contract. The remediated bytes were published under
a new manifest and reviewed by a different independent reviewer.

## Conformance And Runtime State

This checkpoint does not promote `academy.activation-profile-only`. The
canonical conformance ledger remains `15/23 (65.2%)` because the production
callback/session transaction is still unwired. The new store is referenced only
by its unit and integration tests; no route, Worker, registry, or runtime entry
imports it.

Registry enablement, `releaseApproval`, and `runtimeWired` remain false. The
checkpoint creates no session, cookie, entitlement, role, course access,
production credential, deployment value, or release authority.

## Remaining Gates

Before this boundary can participate in a real callback, Academy still needs:

1. the approved durable callback state/recovery transaction;
2. the released Identity Control endpoint, client assertion, replay, and
   result-key contracts;
3. trusted Origin/Fetch Metadata and browser-binding policy at the route;
4. a production persistence credential/role review, including the existing
   broader `academy_runtime` ACL;
5. host-scoped session issuance and recovery evidence;
6. operator, deployment, independent production rehearsal, and explicit
   release authorization.

Production remains **NO-GO**. No Pool A production database, shared Auth,
network service, route, Worker, registry, key, cookie, deployment, or release
state was changed.

## Review

The first independent review returned `C0/H1/M0/L0`. A different independent
closure reviewer bound the remediated seven-file manifest before semantic
review and returned final `C0/H0/M0/L0`. The reviewer confirmed that
`sync_service_activation` holds the activation row lock through the outer
statement, migration 0024 rechecks the durable status/revision before returning,
stale or conflicting input rolls the profile write back, and exact duplicates
remain accepted.

Fresh closure evidence passed focused unit `21/21`, Academy Identity and callback
`29 files / 450 tests`, Identity Control producer `59/59`, scoped ESLint and
TypeScript, reader-first, whitespace, secret, and staged-empty gates. The
reviewer retained the frozen real-PostgreSQL `11/11` evidence rather than
starting another local stack. UI and visual review are N/A because the
checkpoint adds no rendered surface or user-facing copy.
