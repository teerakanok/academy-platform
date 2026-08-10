# Academy Identity Lifecycle Pull Cycle — Local Checkpoint

**Date:** 2026-08-10

**Status:** FINAL INDEPENDENT RIL PASS C0/H0/M0/L0; PRODUCTION NO-GO

**Authority:** Academy-local composition and test evidence only; runtime and
release authority remain false

## Outcome

Academy now has an unwired pure pull-cycle boundary for already verified
Identity lifecycle pages. One invocation claims the accepted database-clock
lease, reads the durable checkpoint, obtains one validated time from an injected
clock, asks an injected transport for the page at the exact durable cursor,
builds the accepted strict aggregate commit, and commits through the leased
fence. It records that primary result or failure before making one bounded lease
release attempt, so release uncertainty cannot erase a committed acknowledgement,
transport retry, or local failure.

The cycle exposes three bounded result classes:

- `lease_busy` when another logical puller owns the lease;
- `retry_required` with `sensitiveOperationsAllowed: false` when the verified
  transport fails; and
- `committed` only after the leased aggregate commit succeeds, with the committed
  cursor plus independent page-scoped gap/conflict flags and configuration
  health.

Every result after a claimed lease also reports `leaseRelease` as `confirmed`,
`not_confirmed`, or `unknown`. A `false` release response is not confirmed; a
release exception is unknown. Neither case returns an unqualified committed or
retry result.

Read, clock, page-schema/reducer, and commit failures reject after the release
attempt through `IdentityLifecyclePullCycleFailure`, which retains the original
failure as `cause` and carries the same explicit release status. A release
exception remains secondary and cannot mask that cause. Local failures do not
return success or call another commit path. The accepted atomic store remains
responsible for preserving cursor and projection state on commit failure. No
cursor is written by this module. The wrapper's public message is the fixed
allowlisted classification `Identity lifecycle pull cycle failed`; it never
copies cause text. The exact cause remains available only through the standard
non-enumerable `cause` property for explicit internal inspection.

## Source-Bound Contract

The implementation is bound to Identity Control revision
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`, specifically
`docs/integration/lifecycle-pull-consumer-contract.md`,
`packages/contracts/src/index.ts`, and the lifecycle scenarios in
`packages/testing/src/index.ts`. Those sources define strict page shape,
canonical cursor continuity, durable page-before-cursor application, and the
duplicate/stale/gap/conflict dispositions.

The cycle composes the independently accepted Academy reducer, atomic page
builder/store, and database-clock lease boundaries. It also follows the accepted
Crux pure-cycle disposition where lease contention is bounded, transport failure
requires retry with sensitive operations closed, and local validation/commit
errors reject. Academy additionally makes release acknowledgement explicit and
preserves the primary disposition when release is uncertain.

Two configuration cases remain distinct:

1. If the caller's approved revision differs from the durable Academy-approved
   revision, the cycle rejects before reading the clock or calling transport.
2. If a valid producer page reports a different observed revision, the accepted
   aggregate store advances the page atomically and latches
   `config_revision_changed`; the cycle reports that committed health without
   self-approving the observed revision.

Transport authentication, request binding, strict response parsing, compact JWS
verification, issuer/key/audience policy, and endpoint selection remain adapter
responsibilities. The injected transport type accepts only a
`VerifiedIdentityLifecyclePage` and receives a cloned verification time. This
checkpoint does not implement or authorize that adapter.

## Local Invariants

1. A busy lease performs no store read, clock read, transport call, commit, or
   release.
2. A claimed cycle reads one durable snapshot and sends its exact cursor to the
   verified transport.
3. The clock must return a valid `Date`; the cycle clones its millisecond value
   before crossing the transport boundary.
4. The page passes through `buildIdentityLifecyclePageCommit`, preserving exact
   schema, cursor, configuration-latch, and reducer rules before any write.
5. The only write is `commitPageUnderLease` with the exact claim token and worker
   returned by the lease.
6. Transport failure returns no upstream detail and performs no commit. Page
   validation and local store failures reject rather than being misclassified as
   transport retry.
7. Page gap and conflict are independent booleans, so a multi-principal page can
   report both without inventing precedence. Durable projections retain the
   authoritative global fences.
8. A claimed cycle attempts release exactly once. `true`, `false`, and throw map
   to `confirmed`, `not_confirmed`, and `unknown`; release failure cannot replace
   the primary disposition.
9. The cycle does not renew the lease or define timeout, retry delay, backoff,
   lag, scheduler, or reconciliation policy.
10. Local failure `name`, `message`, string form, stack, JSON, and enumerable
    keys cannot disclose cause text. JSON and `Object.keys` expose only the
    allowlisted `leaseRelease` status; `cause` retains identity but is
    non-enumerable.

## Independent RIL Remediation

The first independent review returned **FAIL C0/H0/M1/L0**. M-01 found that the
cycle ignored a `false` release result and allowed a release exception from
`finally` to replace the already known committed, transport-retry, or local
failure disposition. Callers therefore could not distinguish a confirmed
release from uncertain lease ownership and could lose the primary outcome.

Test-only remediation RED produced **14 failed / 6 passed** across confirmed,
false, and throwing release paths. The source now captures the primary result or
failure first, performs one bounded release attempt, and projects the three exact
release states. Committed and retry results carry that state; local failures use
a bounded wrapper with the original cause and release state. GREEN passes all
20 focused assertions. No renewal, TTL, timeout, retry delay, backoff, or lag
policy was added. A different independent reviewer verified the M-01 behavior
and reported the separate M-02 disclosure finding below.

The closure re-review returned **FAIL C0/H0/M1/L0** with M-02. Although M-01
made `cause` non-enumerable, the wrapper constructor copied `cause.message` into
its own public message. Store, parser, or commit errors could therefore expose
credential-like text, filesystem paths, or SQL detail through `.message`,
`String(error)`, and the wrapper stack.

M-02 test-only RED produced **9 failed / 20 passed** for read, parse, and commit
causes across confirmed, not-confirmed, and unknown release states. Each injected
the same credential-like/path/SQL fixture marker and checked the default error
surfaces plus cause identity. The wrapper now uses one fixed message independent
of cause and defines its class name non-enumerably. The standard cause remains
the exact original object and non-enumerable; JSON and `Object.keys` contain only
the exact release status. GREEN passes all 29 focused assertions. A different
independent reviewer verified the remediated freeze and closed the checkpoint at
`C0/H0/M0/L0`.

## TDD And Verification

| Gate | Result |
|---|---|
| Initial RED | Focused suite failed collection because `lifecycle-pull-cycle.ts` did not exist |
| First GREEN | 1 file / 9 tests passed |
| Durable-config RED | 1 failed / 9 passed because clock and transport were reachable before checking the durable approved revision |
| First focused GREEN | 1 file / 10 tests passed |
| First independent RIL | FAIL `C0/H0/M1/L0` for release acknowledgement and primary-outcome masking |
| M-01 remediation RED | 1 file / 20 tests: 14 failed / 6 passed |
| M-01 focused GREEN | 1 file / 20 tests passed |
| Closure re-review | FAIL `C0/H0/M1/L0` because the wrapper copied cause text into public disclosure surfaces |
| M-02 remediation RED | 1 file / 29 tests: 9 failed / 20 passed |
| M-02 focused GREEN | 1 file / 29 tests passed |
| Post-M-02 Identity regression | 10 files / 118 tests passed on Node 24.18.0 |
| Final independent re-review | PASS `C0/H0/M0/L0` against the remediated checkpoint freeze |
| Original full unit regression | 81 files / 761 tests passed on Node 24.18.0 before remediation |
| Producer contract regression | Identity Control revision `a6ef1f4`: 2 files / 20 tests passed |
| Post-remediation scoped lint and app typecheck | Passed on Node 24.18.0 |
| Original Next production build | Passed before remediation on Node 24.18.0; 29 static pages generated; one pre-existing generated-registry lint warning |
| Original offline dependency audits | Production and dev-inclusive audits both reported 0 vulnerabilities before remediation |
| Static policy boundary | Source contains no unfenced RPC/method, endpoint, audience, key ID, timeout, backoff, or lag policy |
| Secret scan | `gitleaks detect --source . --no-banner --redact` found no leaks |
| Visual | N/A: no route, component, copy, layout, or browser state changed |

The recorded Next build is application compile evidence from the pre-review
checkpoint; post-remediation compilation is covered by the current app
typecheck. Neither is evidence that this unwired module ran in a Worker or
against Identity Control. OpenNext runtime smoke is N/A because no runtime
import, Worker binding, or deployment surface was added.

## Ownership And Freeze

The checkpoint began at Academy HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, dirty count 181, staged count 0,
with PID 59647 serving the pre-existing application on port 3003. It owns only:

- `academy-web/src/lib/identity/lifecycle-pull-cycle.ts` (new)
- `academy-web/tests/unit/identity-lifecycle-pull-cycle.test.ts` (new)
- this report (new)
- narrow entries in `plans/active_plan.md` and `plans/completed_log.md`

Every unrelated dirty path, including the accepted reducer, page store, lease,
migrations, harness, course, localization, dashboard, media, and dependency work,
remains outside checkpoint ownership. No file is staged.

The authoritative filesystem freeze is
`reports/reviews/academy-identity-lifecycle-pull-cycle-freeze-20260810.json`.
It binds the five checkpoint files and is outside its own file list. A separate
reviewer must verify that manifest before semantic review.

## Remaining Gates

Final independent re-review passed `C0/H0/M0/L0`. Production still requires
approved endpoint, issuer/key and audience policy, an authenticated strict
transport adapter, runtime credentials
and bindings, scheduler and single-worker topology, timeout/retry/lag policy,
monitoring and operational ownership, authorized migration/application,
deployed evidence, registry enablement, and release approval. This checkpoint
creates no lifecycle traffic and changes none of those controls.
