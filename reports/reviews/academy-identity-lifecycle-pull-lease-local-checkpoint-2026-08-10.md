# Academy Identity Lifecycle Pull Lease — Local Checkpoint

**Date:** 2026-08-10

**Status:** FINAL INDEPENDENT RIL PASS C0/H0/M0/L0; PRODUCTION NO-GO

**Authority:** Academy-local test evidence only; runtime and release authority remain false

## Outcome

Academy now has an unwired PostgreSQL lease boundary for one logical Identity
lifecycle puller. The lease uses the database clock, permits durations from
1,000 through 300,000 milliseconds, and binds every renew, release, and page
commit to an opaque UUIDv4 claim token plus bounded worker ID.

Migration `0023_identity_lifecycle_pull_lease.sql` adds one singleton
`academy-web` lease row and four security-definer RPCs: claim, renew, release,
and page commit under lease. A fenced page commit locks and validates the active
lease row in the same database transaction before invoking the accepted `0022`
aggregate page commit. A stale, expired, reclaimed, or foreign token cannot
renew, release, or advance the aggregate cursor.

The production TypeScript class and runtime-facing port expose snapshot read,
lease operations, and `commitPageUnderLease` only. The production source does
not name the old unfenced commit RPC; integration coverage reaches that RPC only
through its test-local `rawCommit` helper. Migration `0023` revokes the old
unfenced commit RPC from `academy_runtime`. PUBLIC and `academy_runtime` cannot
write the lease table directly.

This checkpoint adds no pull cycle, scheduler, route, Worker/Wrangler binding,
endpoint, key, audience policy, lifecycle traffic, account mapping, or deploy.

## Invariants

1. Claim uses `transaction_timestamp()` and a database-generated canonical
   UUIDv4 token. An active singleton lease has one winner; an expired row may be
   reclaimed with a new token.
2. Lease duration is an exact integer in `1000..300000` at both TypeScript and
   SQL boundaries. Worker IDs use the same bounded ASCII grammar at both layers.
3. Renew and release require the exact active token and worker. Stale operations
   return no success and cannot change the current owner.
4. Fenced commit locks the active lease row, validates token, worker, and expiry,
   then runs the complete `0022` aggregate commit in the same transaction.
5. Any aggregate error rolls back every projection, configuration latch, and
   cursor write. The lease remains explicit so the owner can release it or let
   the database-clock deadline expire before bounded recovery.
6. Lease input parsers snapshot validated data descriptors once and project
   fresh values. Proxy `get` traps cannot replace or expose unvalidated bytes
   after validation.
7. The concrete production store has no `commitPage` key and its source has no
   exact unfenced RPC literal. `academy_runtime` can execute only leased
   lifecycle writes; PUBLIC has no RPC authority, and neither role has direct
   lease-table privileges.

## Independent RIL Remediation

The first independent review returned **FAIL C0/H0/M1/L0**. M-01 found that the
narrow runtime interface omitted `commitPage`, but the exported concrete
production class still implemented and exposed it. SQL privileges prevented a
runtime-role bypass, yet the import boundary carried more authority than its
declared runtime contract.

The remediation removed the unfenced interface, method, and exact unfenced RPC
literal from the production module. Existing aggregate tests now call the
unfenced `0022` RPC only through the integration file's `rawCommit` helper. A
test-first RED proved the old concrete class still exposed `commitPage`; GREEN
now checks the concrete class at type and runtime plus the production-source RPC
boundary. The SQL revoke remains unchanged. A different independent reviewer
verified the eleven-file authority manifest and closed the checkpoint at
`C0/H0/M0/L0`.

## TDD Evidence

| Gate | Result |
|---|---|
| Initial RED | 2 suites failed: the lease module was missing and the store had no `claimPullLease`; 23 existing page-store assertions passed |
| Image-pin RED | Harness collection first failed on missing immutable-image helpers; the content-addressed-ID transition then failed 4/13 argv, architecture, and ownership assertions |
| Descriptor snapshot RED | 1 failed / 27 passed because the store re-read a validated Proxy through `get` |
| M-01 boundary RED | Page-store unit: 1 failed / 23 passed because the concrete production class still exposed `commitPage` |
| M-01 focused GREEN | Lease + page-store: 2 files / 28 tests passed; concrete production class/source expose no unfenced write |
| Final independent re-review | PASS `C0/H0/M0/L0`; authority manifest verified at 11 files; reviewer reran focused 28/28, Identity 89/89, harness 13/13, disposable PostgreSQL 27/27 with cleanup, Node 24 typecheck, diff, reader, and secret gates |
| Focused lease + page store | 2 files / 28 tests passed on Node 24.18.0 |
| Identity regression | 9 files / 89 tests passed on Node 24.18.0 |
| Harness authority | 13/13 `node:test` assertions passed |
| Disposable PostgreSQL | 1 file / 27 tests passed; migrations `0022` and `0023` applied fresh and reapplied; cleanup verified |
| Post-run container inventory | Hardened local-authority query returned `ownedContainerCount: 0` |
| Full unit regression | 80 files / 751 tests passed on Node 24.18.0 |
| Lint and typechecks | Passed; one pre-existing warning in `registry.generated.ts` |
| Next production build | Passed; 29 static pages generated |
| OpenNext/Cloudflare build | Passed with adapter 1.20.2 |
| Production and dev audits | Both offline audits reported 0 vulnerabilities |
| Dependency inspection | `npm ls --all` exited 0; local `@emnapi/runtime@1.11.3` remained extraneous after the existing build/toolchain state |
| Secret scan | `gitleaks detect --source . --no-banner --redact` found no leaks |
| Visual | N/A: no route, component, copy, layout, or browser state changed |

The PostgreSQL matrix covers one-winner claim, reclaim after expiry, stale-token
renew/release/commit refusal, exact duration and identity bounds, same-transaction
lease-row locking, rollback after an injected second-principal failure, bounded
release and recovery, cursor/CAS behavior, migration reapply, exact grants, and
direct-table-write denial.

## Disposable Database Authority

PostgreSQL evidence ran only through the accepted hardened local harness. It
rejects ambient Docker, Compose, database, and PostgreSQL authority; validates
the pinned Docker Desktop executable and current-user local Unix socket; uses a
private empty Docker config and minimal child environment; binds only
`127.0.0.1` on an ephemeral port in `61000..61999`; never prints its generated
credentials; and proves exact owned-container absence during cleanup.

The mutable local tag `postgres:17.5` was absent, so the harness did not pull or
retag it. A hardened metadata-only inspect of exact image ID
`sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302`
proved the local RepoDigest
`postgres@sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302`
and architecture `arm64`. Docker Desktop could not resolve the RepoDigest text
as a runnable local reference, so the harness uses the exact content-addressed
image ID, verifies the matching RepoDigest and `arm64` metadata first, and keeps
`--pull never` in the create argv. This is local arm64 fixture evidence, not
portable CI or other-architecture proof.

## Ownership

The checkpoint began at Academy HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, dirty count 176, staged count 0,
with PID 59647 running the pre-existing Next server on port 3003. It owns the
new lease migration, lease contract, unit test, and this report; scoped changes
to the accepted page-store source/unit/integration tests and hardened
PostgreSQL harness/tests; and narrow plan/log evidence. Every unrelated dirty
path remains outside checkpoint ownership. No file was staged.

The authoritative filesystem freeze is
`reports/reviews/academy-identity-lifecycle-pull-lease-m01-freeze-20260810.json`.
It binds the exact eleven checkpoint files and is outside its own file list.
Reviewers must verify that manifest before semantic review; manually transcribed
hashes are not reviewer authority.

## Remaining Gates

Final independent re-review passed `C0/H0/M0/L0`. Migrations `0022` and `0023`
have not been applied outside the owned disposable loopback container.
The next honest local checkpoint is pure pull-cycle composition around verified
pages, the leased store, and explicit ports. Production still requires approved
endpoint/key/audience policy, runtime credentials and bindings, scheduler and
single-worker topology, operational ownership, migration/rollback authorization,
monitoring, deployed evidence, registry enablement, and release approval.
