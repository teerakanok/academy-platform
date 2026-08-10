# Academy Identity Lifecycle Projection Reducer Local Checkpoint

**Date:** 2026-08-09
**Producer revision:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`
**Academy base revision:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** final independent re-review PASS `C0/H0/M0/L0`; production NO-GO

## Outcome

Academy now has an unwired pure reducer for a verified account-lifecycle event
and its local projection. It accepts a first valid seed and the next contiguous
revision. For an existing principal it classifies the producer's projected
same-state/same-revision repeat as `duplicate`, a lower revision as `stale`, a
future non-contiguous revision as `gap`, and a same-revision state mismatch or
principal mismatch as `conflict`. Every non-applied result preserves a valid
current projection through a fresh clone.

The reducer validates exact own data-property keys and the published event
schema before classification. It captures each approved data descriptor value
once into a fresh null-prototype snapshot, then validates and classifies only
that snapshot. Extra, missing, symbol, accessor, malformed, or throwing inputs
fail closed, while a Proxy `get` trap is never invoked. Its output contains only `issuer`, `subject`,
`state`, and `revision`; the lifecycle states remain the Identity Control wire
states `active`, `disabled`, and `deleted`. This checkpoint does not invent an
Academy account, activation, entitlement, or database mapping.

## Source-Bound Contract

The producer repository was read-only at exact HEAD
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`. The following contract files were
clean relative to that HEAD and matched these SHA-256 values:

| Producer artifact | SHA-256 |
|---|---|
| `docs/integration/lifecycle-pull-consumer-contract.md` | `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` |
| `packages/core/src/signed-lifecycle-event.ts` | `5a165216cd6503e728194b5ce208f7dbdd87c9c5effc1a62810dcc2bd236843b` |
| `packages/core/test/signed-lifecycle-event.test.ts` | `fb157eeebc2dcb4d97b10f766d3159c19ddce72a5580192db971e85b45a79fb6` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |

The executable producer reducer at this revision stores state and revision per
issuer/subject. It seeds the first valid current revision, applies only
`current + 1`, treats the same projected state at the same revision as a
duplicate, ignores lower revisions, and returns gap or conflict without a
state change. The Academy reducer mirrors that behavior without importing or
editing the producer repository.

## TDD And Verification

The RED run failed collection because
`@/lib/identity/lifecycle-reducer` did not exist. The first implementation run
passed 19/20 assertions; the remaining failure was a test assertion comparing
a custom stale fixture with the default fixture. The assertion was corrected
to compare the input with its own pre-call clone. The original focused matrix added
a throwing-input control and passed 21/21.

| Gate | Result |
|---|---|
| Focused reducer | 1 file / 25 tests passed on Node 24.18.0 |
| Identity regression | 7 files / 61 tests passed on Node 24.18.0 |
| Full unit regression | 78 files / 723 tests passed on Node 24.18.0 |
| Lint and typechecks | Passed; one pre-existing generated-registry warning |
| Next production build | Passed; 29 static pages generated |
| OpenNext/Cloudflare build | Passed with adapter 1.20.2 |
| Dev-inclusive audit | Offline moderate gate reported `found 0 vulnerabilities` |
| Production audit | Offline high gate reported `found 0 vulnerabilities` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner` found no leaks after the five-path evidence freeze |
| Initial independent RIL | FAIL `C0/H0/M1/L0`: validation re-read Proxy properties through `get` after descriptor checks |
| M-01 RED | 4 failed / 21 passed; event/current throw and divergent `get` traps were invoked |
| M-01 focused GREEN | 25/25; all four Proxy controls observed zero `get` calls and one descriptor read per key |
| Reader-first | Mechanical remediation scan: 100 units, 0 errors, 0 warnings; different independent human review passed |
| Visual | N/A: no route, component, copy, layout, style, or rendered state changed |

The focused matrix covers exact seed and contiguous application, projected
duplicate, stale, gap, same-revision conflict, issuer/subject scope mismatch,
strict event field values, extra and missing keys, accessor and symbol keys,
invalid persisted projections, immutable input preservation, exact output keys,
inspection failures, and event/current Proxy descriptors whose `get` traps
throw or return divergent issuer, state, and revision values.

## Ownership

Academy began this slice at HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, with 207 expanded dirty paths and
an empty staged index. The source, test, and report did not exist. Immediately
before the narrow evidence edits, the pre-existing plan files had these
SHA-256 values:

- `plans/active_plan.md`:
  `3ae11d892e25c7d770564f231694c170170dd2197076bad4780c07dec773dcc5`
- `plans/completed_log.md`:
  `3ab5602df9fc53c1686b8aec891e7965d44d57f4936482d8125d2477d1e217c0`

Only the two new implementation files, this report, and narrow additions to the
two existing plan files belong to this checkpoint. All other dirty paths,
including the frozen player-progress checkpoint, remain outside its ownership.
PID 59647 and port 3003 were not touched.

## External Gates And Review

This unit-only reducer is not imported by a lifecycle puller, route, session,
cookie, account, or authorization flow. The lifecycle endpoint, client-assertion
private key and audience, publisher verification keys and event audience,
clock policy, authenticated page validation, durable page application and
cursor commit, backoff and lag owner, database transaction, kill-switch owner,
deployment, and browser proof remain external release gates. Registry
`enabled=false` and `releaseApproval=false` remain unchanged.

The initial independent RIL returned `C0/H0/M1/L0`. M-01 found that the former
validator checked exact data descriptors but then re-read the input through
ordinary property access, allowing a Proxy `get` trap to throw or substitute
bytes that were not the checked descriptor values. The remediation snapshots
each descriptor value once and never reads input properties afterward. The
four focused Proxy controls and the full regression are green.

A different independent code/debt, security, and reader-first re-review passed
`C0/H0/M0/L0`. The UX/visual lane is N/A because the checkpoint adds no
user-facing surface. The review does not authorize runtime integration.
