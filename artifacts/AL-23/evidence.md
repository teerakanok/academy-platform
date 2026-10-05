# AL-23 evidence — typed AL-09/AL-21 release runbooks

## Implementation boundary

- Added `academy-web/ops/runbooks/AL-09.json` (9 steps) and `AL-21.json` (6 steps), both schema `gathering-ops/v1`.
- Added product-owned release helpers under `academy-web/ops/release/`:
  - exact Git-tree extraction plus per-file Git-object verification;
  - remote/local Academy backup with SHA-256, byte, mode, and archive-list receipts;
  - 0041/0042-only ROLLBACK rehearsal, validation, COMMIT, catalog checks, and idempotence;
  - pinned `npm ci`, Cloudflare build, tagged version upload, 100% activation with predecessor receipt, and gated postcheck;
  - read-only target identity probes.
- Added `academy-web/tests/unit/ops-runbooks.test.ts` with governance validation, pinned-source checks, dry-run/idempotence checks, a fake wrangler on `PATH`, receipt-secret scan, and an optional real local-PostgreSQL round trip.
- No production endpoint, Cloudflare API, SSH host, Pool A database, or live Worker was called by this worker.

## Evidence states

| Gate | State | Result |
| --- | --- | --- |
| Governance `_validate_manifest` | Source PASS | AL-09: 9 steps/2 targets; AL-21: 6 steps/1 target (`artifacts/AL-23/static-source.log`) |
| Node syntax | Source PASS | every `ops/release/*.mjs` passed `node --check` (`artifacts/AL-23/static-source.log`) |
| Scoped ESLint | Source PASS | 0 errors/warnings for new scripts and test (`artifacts/AL-23/static-source.log`) |
| App TypeScript | Source PASS | `npx tsc --noEmit` exit 0 (`artifacts/AL-23/static-source.log`) |
| Worker TypeScript | Source PASS | `npx tsc -p tsconfig.worker.json` exit 0 (`artifacts/AL-23/typescript.log`) |
| Retention TypeScript | Source PASS | `npx tsc -p ops/academy-retention-worker/tsconfig.json` exit 0 (`artifacts/AL-23/typescript.log`) |
| Targeted AL-23 unit | Source PASS | 9 passed, 1 optional local-PG test skipped, 0 failed (`artifacts/AL-23/full-unit.log`) |
| Full unit | Source PASS | 171 files, 3240 passed, 3 skipped, 0 failed (`artifacts/AL-23/full-unit.log`) |
| Full lint | Source PASS against declared baseline | exit 1 with exactly the pre-existing 3 errors and 22 warnings; no new finding (`artifacts/AL-23/full-lint.log`) |
| Fake wrangler rehearsal | Source PASS | recorded candidate `a1b2c3d4-1234-5678-9abc-def012345678` and predecessor `733e4fa3-52c4-4717-b3da-aed3aafe5023`; no provider call |
| Disposable local PostgreSQL | Native NOT_RUN | worker sandbox has no `TEST_DATABASE_URL`/Docker and this worker must not run `psql`; exact host command below |
| Live build/deploy/database | NOT_RUN | forbidden in this worker; manifests and scripts only |

## HOST-E2E

Prepare a disposable AL-07 PostgreSQL chain through migration 0040, expose it locally as `postgres@127.0.0.1:54322/postgres`, and supply its fixture-only password in `AL23_LOCAL_PG_PASSWORD` without writing it to the repository. Then run:

```bash
cd /Users/teerakanok/Dev/continuations/academy-first-launch-glm-1/academy-web && PGPASSWORD="$AL23_LOCAL_PG_PASSWORD" TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:54322/postgres' npx vitest run --project unit tests/unit/ops-runbooks.test.ts -t 'local PostgreSQL'
```

Expected: source preparation and pinned dependency installation pass; local backup/check passes; 0041 and 0042 each report `rehearsed and committed` once, then `already applied`; both catalog checks report `matches_expected`; 0 failed tests.
