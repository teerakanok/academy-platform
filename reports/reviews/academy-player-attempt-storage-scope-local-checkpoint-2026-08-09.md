# Player Attempt Storage Scope - Local Checkpoint

- **Status:** final independent re-review PASS - `C0/H0/M0/L0`
- **Date:** 2026-08-09
- **Scope:** versioned browser attempt storage only

## Outcome

The exam and practice resume boundary keeps the record schema at `v1` while new
saves use the private `academy.progress.k2` key namespace. Each key contains two
canonical, UTF-16-length-prefixed segments, so delimiters and lone surrogates
cannot collapse distinct `contentId`/`attemptId` pairs.

Load checks the exact k2 key first. When it is absent, an exact legacy-v1 key is
copied to k2 only after the full record validates and both identifiers match the
request; the legacy key remains because its delimiter-based ownership can be
ambiguous. An invalid or mismatching legacy candidate is neither removed nor
reported as reset. Corrupt k2 data is reset only when its decoded content scope
matches the request.

`latestAttempt` decodes k2 content segments, discovers legacy ownership from the
validated record rather than a raw content prefix, deduplicates equal attempt IDs
in favor of k2, and orders by `startedAt` descending followed by `attemptId`
ascending in locale-independent UTF-16 code-unit order.

This enforces the existing contract in
`plans/platform-build-oneshot-2026-07-31.md`: storage is scoped per
`contentId+attemptId`, corrupt attributable state resets with learner notice,
reload resumes, and a retake creates a separate record. The change does not make
browser storage an authority. Attempts and grading remain outside this
best-effort local UX boundary.

## TDD Evidence

The original focused RED added two direct scope mismatches and one
latest-attempt fallback case. The former loader returned both foreign records and
selected the newer foreign-content record: 3 failed and 6 passed. The first
implementation reached focused plus deep-validation GREEN at 24/24 and full unit
GREEN at 690/690.

Independent review then returned `C0/H0/M2/L0`: the raw colon-delimited key was
not injective, so reset could delete a colliding legacy record owned by another
scope, and equal timestamps inherited key-enumeration order. Remediation RED
failed 9 of 17 focused tests across collisions, migration, legacy preservation,
k2 round-trip/reset/dedupe, and reversed-enumeration ties. The k2 implementation
then passed focused 17/17, focused plus deep validation 32/32, and full unit
698/698 across 77 files on Node 24.18.0.

## Verification

| Gate | Result |
|---|---|
| Focused RED | 1 file / 9 tests: 3 failed, 6 passed |
| Original focused and deep-validation GREEN | 2 files / 24 tests passed |
| Original independent review | FAIL - `C0/H0/M2/L0` |
| Remediation RED | 1 file / 17 tests: 9 failed, 8 passed |
| Remediation focused GREEN | 1 file / 17 tests passed |
| Remediation focused and deep-validation GREEN | 2 files / 32 tests passed |
| Full unit regression | 77 files / 698 tests passed on Node 24.18.0 |
| Node 24 lint and typechecks | Passed; one pre-existing warning in generated content registry |
| Node 24 Next production build | Passed; 29 static pages generated, including player routes |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte `.open-next/worker.js` |
| Dependency audits | Offline dev-inclusive moderate and production high checks each reported `found 0 vulnerabilities` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | Gitleaks scanned all five scoped files and 162 commits; no leaks found |
| Visual | N/A: no copy, component, layout, style, or new rendered state changed |
| Existing server | PID 59647 remained the sole listener on port 3003 and was untouched |
| Independent review | Final PASS - `C0/H0/M0/L0`; delimiter, malformed-key, migration-failure, dedupe, and deterministic tie cases verified independently |

DB-backed integration, browser/E2E, and production runtime tests were not run.
This pure local-storage boundary requires no database or Identity service, and no
new server was started.

## Ownership

The repository began at HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, with 163 dirty paths and no staged
paths. The shared working tree later contained 207 expanded porcelain paths;
none was staged. Pre-slice SHA-256 values were:

- `academy-web/src/lib/player/progress.ts`:
  `4e4823e387c48a710ec8108350c1f35c09f2564abc427c28d3dfbcc84eb3cf51`
- `academy-web/tests/unit/progress.test.ts`:
  `1badd367022eb969cdc8c8909da0698b209256390e09f01371493f8aacb1c7b0`
- `plans/active_plan.md`:
  `a282629838bcc3261584f51ac19537cd82e563dc06cba5c20259d100dff4100b`
- `plans/completed_log.md`:
  `c06f1d6b15083c7aa3aa6f965086ccdec7995a23e4fa09cd21770dbf2254db9d`
- this report did not exist.

The remediation started from these exact SHA-256 values:

- `academy-web/src/lib/player/progress.ts`:
  `33496f6b9289f52a9d2af0c3c4628b8aeaa292e1d329b43d8a0bb26d01683670`
- `academy-web/tests/unit/progress.test.ts`:
  `18b1227e3c129404214700df0711a355abe371c773d933f5806b9ddd12989ab8`
- this report:
  `1aa5b44c09f13aeced3f8d941e88858b2bcbb1c3c3c79c1365c6e9eb1876aa56`
- `plans/active_plan.md`:
  `2fca894fba772a7c87e4f7b70c42f3f4efe6e44cdc2e4f2f5bd690bfcb747974`
- `plans/completed_log.md`:
  `ce8553ed9f702446ce1ec9c07dce52c61f2f499f462698e37de4799a9edb2299`

Exact checkpoint paths:

- `academy-web/src/lib/player/progress.ts`
- `academy-web/tests/unit/progress.test.ts`
- `reports/reviews/academy-player-attempt-storage-scope-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md`
- `plans/completed_log.md`

All other dirty work remains outside this checkpoint. No route, component,
content, shared parser, Identity boundary, SQL, configuration, dependency,
deployment, or production state was changed.

## Remaining Risk

Browser storage can still be cleared, denied, or modified by the local browser
environment. Legacy keys stay in place intentionally because deleting an
ambiguous delimiter key could erase another scope; therefore migration is a
safe copy, not cleanup. This checkpoint does not convert browser state into
trusted assessment evidence. Different-reviewer code/debt, security, and
learner-impact re-review passed `C0/H0/M0/L0`. Browser and production proof
remain outside this local-storage checkpoint.
