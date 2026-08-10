# Academy Identity Lifecycle Page Store — Local Checkpoint

**Date:** 2026-08-10

**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; PRODUCTION NO-GO

**Authority:** local conformance evidence only; release and runtime authority remain false

## Outcome

Academy now has an unwired durable page-store boundary for already verified
Identity lifecycle pages. A pure builder reduces page events in producer order
against the accepted Academy reducer, emits one final update per principal, and
keeps lifecycle gaps, conflicts, and configuration-revision mismatches fenced.
The store reads one complete snapshot through one RPC and commits each page
through one atomic RPC with a cursor compare-and-swap.

Migration `0022_identity_lifecycle_projection.sql` owns two Academy-local tables:

- singleton consumer checkpoint `academy-web`, with cursor and approved/observed
  configuration revision latch;
- per issuer plus lossless UTF-16 `subject_key`, applied state and revision,
  health, highest known revision, and bounded gap/conflict evidence.

The tables contain no user, email, activation, or foreign-key relationship.
`academy_runtime` can execute only the commit and snapshot RPCs for this boundary;
PUBLIC and `academy_runtime` have no direct table writes, and private validation
helpers are not executable by either role.

## Independent RIL History

The first independent review returned `C0/H1/M2/L0`:

- **H-01:** the disposable PostgreSQL harness inherited ambient Docker authority
  and could classify uncertain create/cleanup outcomes too optimistically.
- **M-01:** a raw RPC caller could replace the first durable gap observation with
  divergent evidence while advancing the cursor.
- **M-02:** SQL accepted an uppercase-host issuer and bounded subjects by
  PostgreSQL characters rather than JavaScript UTF-16 code units.

The remediation hardwires the executable harness to the validated Docker Desktop
CLI target and current-user local Unix socket, passes an explicit `unix://` host,
uses a private empty Docker config and a minimal allowlisted child environment,
and refuses all ambient `DOCKER_*`, `COMPOSE_*`, database, and PostgreSQL authority.
Pure runner helpers support dependency-injected `node:test` coverage; the hardwired
verifier export is also the integration suite's authority gate. The CLI has no
test-mode or authority-override input. Failed or timed-out container creation
remains ambiguous until bounded inspect/remove retries prove an exact not-found
response. SIGINT and SIGTERM run the same cleanup and absence proof before exiting.

The RPC now preserves the first stored gap observation across later gap pages,
while still committing a non-regressing highest-known revision and cursor. Gap to
conflict and conflict to conflict remain allowed with the exact applied principal
state; a fenced gap or conflict cannot return to ready without a separately
authorized reconciliation boundary.

SQL now counts subject limits in JavaScript UTF-16 code units and accepts a strict
ASCII canonical-HTTPS issuer subset. That subset rejects uppercase hosts and other
forms which the TypeScript `URL` canonicality check would reject, while explicitly
accepting the frozen producer issuer
`https://accounts.example.test/auth/v1`. This is source-bound validation for the
approved fixture, not a general URL-policy expansion.

The next independent review returned `C0/H1/M1/L0`:

- **H-01:** direct Vitest still accepted a UUID marker and loopback URL without
  proving that the target belonged to the harness before creating a DB client.
- **M-01:** PostgreSQL text cannot represent every JavaScript UTF-16 string,
  including lone high and low surrogates which the producer contract permits.

The current remediation makes the integration suite inspect through the same
validated CLI and local Unix socket before constructing `pg.Client`. The harness
passes bounded container ID, canonical name, unique nonce label, and image ID;
the suite independently requires an exact running container, fixed and unique
labels, `postgres:17.5`, and the URL's exact `127.0.0.1` port mapping. Missing,
uncertain, stopped, foreign-image, mismatched-label, or mismatched-port evidence
stops before connection, migration, or truncate. The executable entry point has
no caller-selectable CLI, socket, verifier, or test-mode flag.

The TypeScript-to-SQL boundary now encodes every non-NUL UTF-16 code unit as one
lowercase four-hex group. The physical table and RPC accept only `subjectKey` /
`subject_key`: 1–512 groups, maximum 2048 ASCII characters, no `0000`, and no
uppercase, partial, or non-hex forms. Snapshots decode the key back to the exact
JavaScript code-unit sequence, including lone surrogates. The store neither
serializes raw subjects into its RPC payload nor persists them; raw-RPC fields
outside the exact encoded schema are rejected. The producer-facing reducer and
domain projection contract stay unchanged.

## Source Binding

The disposition and cursor model is bound to Identity Control revision
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606` and the accepted Crux durable
aggregate evidence reviewed before implementation:

- Identity lifecycle pull contract: apply and durably commit a complete verified
  page before persisting `nextCursor`; gap/conflict preserve current state.
- Identity conformance kit: configuration revision changes remain fail closed;
  cursor advances only with the aggregate page commit.
- Accepted Crux projection/page-store model: same-page order, latest observed
  configuration latch, row lock plus cursor CAS, and transaction rollback.

This checkpoint reuses those aggregate semantics while retaining Academy's
already accepted reducer behavior. It does not copy Crux-only transition policy,
lease implementation, or runtime topology.

## Atomic Invariants

`academy.commit_identity_lifecycle_page(...)` executes as one PostgreSQL
statement and therefore one transaction boundary:

1. Validate cursor, configuration, page size, exact recursive projection keys,
   canonical issuer and encoded subject key, states, revisions, gap observations,
   conflict reasons, and unique principal updates.
2. Seed or lock the singleton `academy-web` checkpoint.
3. Compare the locked cursor with `expectedCursor` and require the durable
   approved configuration revision to match the caller's approved revision.
4. Preserve existing lifecycle and configuration fences until a separate,
   explicitly authorized reconciliation boundary exists.
5. Apply final per-principal rows in page-builder order.
6. Persist configuration health and `nextCursor` last.

Any error rolls back the seed, every projection write, the configuration latch,
and the cursor. A retry with a consumed expected cursor fails CAS; concurrent
writers with the same expected cursor produce exactly one winner.

## TDD Evidence

| Gate | Result |
|---|---|
| Unit RED | Collection failed because `@/lib/identity/lifecycle-page-store` did not exist |
| PostgreSQL RED | 11 tests skipped and suite failed because migration `0022` did not exist; owned container cleanup verified |
| SQL NULL invariant RED | 3 failed / 11 passed: nullable config/gap checks and SQL-NULL projections were accepted |
| Initial independent RIL | Failed `C0/H1/M2/L0` |
| H-01 harness RED | New adversarial suite failed because the authority/cleanup helpers did not exist |
| M-01/M-02 PostgreSQL RED | 2 failed / 14 passed: divergent raw gap evidence replaced the first observation and uppercase-host issuer was accepted |
| Later independent RIL | Failed `C0/H1/M1/L0` |
| H-01/M-01 RED | Harness collection failed on the missing strict inspector; focused unit/reducer failed 3/47 because RPC still used raw subjects and could not decode canonical keys |
| Final independent RIL | PASS `C0/H0/M0/L0` |
| Direct forged Vitest | Failed before DB connection with all 23 tests skipped because the named container inspection was uncertain; no `ECONNREFUSED` |
| Focused harness | 10/10 passed on Node 24.18.0 |
| Focused unit + accepted reducer | 2 files / 47 tests passed on Node 24.18.0 |
| Disposable PostgreSQL integration | 1 file / 23 tests passed on PostgreSQL 17.5 with migration fresh apply and reapply; cleanup absence verified |
| Identity-named unit regression | 8 files / 83 tests passed on Node 24.18.0 |
| Full unit regression | 79 files / 745 tests passed on Node 24.18.0 |
| Lint and typechecks | Passed; one pre-existing warning in `registry.generated.ts` |
| Next production build | Passed; 29 static pages generated |
| OpenNext/Cloudflare build | Passed with adapter 1.20.2 |
| Production and dev audits | Both offline audits reported 0 vulnerabilities |
| Dependency tree | `npm ls --all` exited 0; platform-specific optional packages remain optional |
| Secret scan | `gitleaks detect --source . --no-banner --redact` found no leaks |
| Visual | N/A: no route, component, copy, layout, or rendered state changed |

The focused matrix covers Docker-authority override refusal, ambiguous create and
inspect outcomes, exact running-container identity/image/label/port verification,
direct forged-suite refusal before connection, bounded cleanup, signal cleanup
ordering, empty seed, two principals without an Academy user,
same-principal event order, duplicate and stale events, gap/conflict preservation,
highest-known fencing, configuration mismatch without self-approval, exact
recursive shapes, page and revision bounds, cursor/PostgreSQL bigint bounds,
single-RPC snapshot and commit, migration reapply, SQL-NULL and three-valued
constraint behavior, grants, direct-write denial, CAS retry, concurrent writers,
rollback after an injected second-principal failure, raw-RPC fence transitions,
canonical issuer parity, lone high/low surrogate and pair round trips, physical-key
non-collision, and NUL/uppercase/partial/non-hex/overbound key rejection.

The PostgreSQL evidence ran only through
`scripts/test-identity-lifecycle-page-store-postgres.mjs`. The executable harness
refuses caller Docker, Compose, database, and PostgreSQL authority, validates and
passes its exact local Unix socket explicitly, uses the already present
`postgres:17.5` image with `--pull never`, creates a uniquely named and labelled
container, binds only `127.0.0.1` in ports 61000–61999, generates credentials
without printing them, and removes the container on normal exit, failure,
SIGINT, and SIGTERM. The integration child independently re-inspects the exact
running container before constructing a DB client. Fake CLI tests exercise failure
states without contacting a daemon. The final owned-container inventory was zero.

The successful final PostgreSQL run used the already-local `postgres:17.5`
image ID/digest
`sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302`.
An immediately earlier read-only inspect briefly returned exact not-found; the
harness stopped before creation and did not pull or retag. A subsequent pinned-
authority inventory found the exact tag with no dangling images, after which the
full 23-test matrix passed and cleanup was proven.

## Ownership

The checkpoint began at Academy HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, dirty count 169, staged count 0,
with PID 59647 running the pre-existing Next server on port 3003. The page-store
source, unit and integration tests, executable harness, migration, adversarial
harness test, and this report belong to the checkpoint; plan/log receive narrow
evidence additions.
The wider worktree reached 175 dirty paths during the checkpoint; those unrelated
bytes remain outside this ownership. Staged count remains zero and PID 59647 was
not touched.

Final SHA-256 values are recorded after the post-remediation verification freeze.

- `academy-web/src/lib/identity/lifecycle-page-store.ts`:
  `5b85855aeae9a1de20723cc2e64cfdeeecff2ddc566856efed57fc4510c4700c`
- `academy-web/tests/unit/identity-lifecycle-page-store.test.ts`:
  `39b36fb660c50f72c9698faccb44d99da915d201719f75c13af4c2bae4ab7a85`
- `academy-web/tests/integration/identity-lifecycle-page-store.test.ts`:
  `d08f44cbdb28fdbd35ada00ef403493838e6a18aa426d0d753871f01f1e1e0ef`
- `academy-web/scripts/test-identity-lifecycle-page-store-postgres.mjs`:
  `1e9c848200a298957244f2ce37bf0f1116dd7ef84191d191a304fcfc12f9a9e8`
- `academy-web/scripts/test-identity-lifecycle-page-store-postgres.test.mjs`:
  `346008cd730b7ebc946ddaff800ceb217a24f1bfa9990cb06b15f25798e8db8c`
- `academy-web/supabase/migrations/0022_identity_lifecycle_projection.sql`:
  `df3e746d5c3863a626c93993730ffec0c805a9d4b63f32883745592037edd8e0`

## Remaining Gates

The store and migration are local, unwired evidence. Migration `0022` has not
been applied to shared or production infrastructure. The checkpoint adds no
puller, lease, endpoint, key distribution, audience policy, scheduler, route,
runtime configuration, PostgREST deployment, reconciliation command, account
mapping, or authorization transition. Next/OpenNext builds prove repository
compatibility, not execution of this unwired library or a deployed RPC.

Identity registry `enabled=false` and `releaseApproval=false` remain unchanged.
Production integration still requires endpoint/key/audience authorization, an
owned single-puller/lease design, an approved production migration and rollback,
dedicated PostgREST evidence, reconciliation ownership, deployment, monitoring,
and browser/runtime proof. A different independent reviewer closed H-01 and M-01
at `C0/H0/M0/L0`. This local PASS does not authorize migration, runtime wiring,
deployment, or release.
