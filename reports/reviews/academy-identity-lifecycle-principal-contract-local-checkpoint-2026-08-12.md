# Academy Identity Lifecycle Principal Contract - Local Checkpoint - 2026-08-12

**Status:** FINAL DIFFERENT INDEPENDENT RIL PASS `C0/H0/M0/L0`

**Authority:**
`reports/reviews/academy-identity-lifecycle-principal-contract-freeze-20260812.json`

## Outcome

Academy now validates Identity lifecycle principals against the exact portable
contract published by Identity Control revision
`d7f517adb408ee2f50f3b5734c10dd14cbea6530`.

One Academy-owned module holds the producer pattern and UTF-16 rule. The
lifecycle envelope verifier, projection reducer, and durable page store all use
that module. Canonical issuers accept the approved
`https://supabase.cyberskills.co.th/auth/v1` target and reject normalization
aliases, numeric hosts, IP spellings, punycode, controls, query/fragment forms,
and paths outside the producer grammar. Subjects must contain 1-512 JavaScript
UTF-16 code units, exclude NUL, and contain only paired surrogates.

## Durable Data Boundary

Migration `0026_identity_lifecycle_principal_contract.sql` is a forward
migration over the committed `0022`/`0023` lifecycle schema. It replaces the
issuer and subject-key validation helpers without rewriting migration history.
The subject validator parses canonical four-hex-code-unit keys and rejects NUL,
lone surrogates, partial groups, uppercase hex, non-hex bytes, and values beyond
512 code units.

Before completing, the migration scans existing lifecycle projections with the
new helpers. Any incompatible row raises a fixed exception and aborts the whole
migration transaction. The migration does not delete, coerce, or silently
rewrite existing principals. Both helpers remain private to the schema boundary;
PUBLIC and `academy_runtime` receive no execute authority.

This migration has run only in the owned disposable loopback PostgreSQL harness.
It has not been applied to shared Pool A or production infrastructure.

## TDD And Verification

| Gate | Result |
|---|---|
| Initial unit RED | Collection failed because `lifecycle-principal` did not exist |
| Subject-boundary RED | Existing page-store test accepted lone UTF-16 surrogates |
| Focused lifecycle units | `8 files / 170 tests` PASS on Node 24.18.0 |
| Disposable PostgreSQL | `28/28` PASS on PostgreSQL 17.5; owned cleanup verified |
| Migration preflight | Invalid legacy subject key aborts with the row unchanged; clean retry passes |
| Producer parity | Approved issuer, ASCII/BMP/astral boundaries, numeric/IP/punycode/control aliases covered |
| Scoped ESLint | PASS |
| TypeScript | `tsc --noEmit` PASS |
| Whitespace | `git diff --check` PASS |
| UI and visual | N/A: no route, component, copy, layout, or rendered state changed |

The disposable database harness uses the existing content-addressed PostgreSQL
17.5 image, a unique owned label, loopback-only port allocation, bounded
cleanup, and an empty caller database environment. It prints no credential
values and verified container absence after the test.

## Product And Release Boundary

This checkpoint prevents a verified producer event from passing Academy code
but failing at durable commit because consumer rules drifted. It does not make
the lifecycle flow customer-visible: there is still no runtime importer,
authenticated pull endpoint, public-key distribution, scheduler, retry/lag
owner, operator alerting, production database migration, deployment, or release
authorization.

Identity registry state remains disabled and Academy release approval remains
false. Production remains NO-GO.

## Independent Review

A different reviewer bound the exact 12-file semantic authority before reading
the implementation and reverified it after all gates. Code/debt,
security/data/migration, and UX/operator/reader lanes passed final
`C0/H0/M0/L0`. Fresh reviewer evidence included focused lifecycle units
`170/170`, scoped ESLint, TypeScript, whitespace, scoped secret scanning, and
manual reader review. The reviewer accepted the frozen disposable PostgreSQL
`28/28` run without starting another database or container.

The final bookkeeping authority adds `plans/completed_log.md` while preserving
the reviewed implementation, test, and migration hashes. It records the same
local/unwired boundary and does not grant production authority.
