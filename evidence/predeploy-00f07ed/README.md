# Pre-deploy source gates — academy-platform main `00f07ed1528b04b755b8da5e0703aa4c3143df36` (2026-10-03 ~22:05 +07)

Worker-owned detached checkout `/private/tmp/academy-al20-glm-2-00f07ed`, HEAD verified exactly at the target commit, clean before gates. Node `v24.18.0`, npm `11.4.2`.

## Result

**Source release is not fully closed by this worker run**: every runnable source/test/static gate below passed, but `npm run build:cf` is `BLOCKED` by the sandbox before OpenNext compilation. No production endpoint, Cloudflare API, deployment, database, or other external service was called.

- `npm ci`: **PASS**, exit `0` — 714 packages installed; lockfile and working tree stayed clean.
- `npx vitest run --project unit`: **PASS**, exit `0` — 169 test files passed; 3,222 tests passed, 2 skipped, 0 failed.
- TypeScript app: **PASS**, exit `0`.
- TypeScript worker: **PASS**, exit `0`.
- TypeScript `ops/academy-retention-worker`: **PASS**, exit `0`.
- `npm run lint`: **PASS against the declared baseline**, process exit `1` because of exactly the 3 known `no-require-imports` errors in `scripts/academy-bound-worker-executor.cjs`; 22 warnings, no other errors.
- Content registry regeneration (`npm run prebuild`): **PASS / NO DIFF** — generator exit `0`, `git diff --check` exit `0`, status exit `0`, generated-file diff exit `0`, status bytes `0`; blob and SHA-256 identical before/after (`content-registry.log`).
- `npm run build:cf`: **BLOCKED in worker sandbox**, observed exit `1`. The first workerd check could not bind `127.0.0.1` (`listen EPERM`), and wrangler also could not write its log under `~/Library/Preferences/.wrangler` (`open EPERM`). A separate post-workerd diagnostic then reached Next build but this sandbox cannot resolve `fonts.googleapis.com`; therefore OpenNext build, cache sync, asset guard, and final worker startup were not completed and are **NOT_RUN**, not failures of source.
- Host evidence needed for the build gate:
  `HOST-E2E: cd /private/tmp/academy-al20-glm-2-00f07ed/academy-web && PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" npm run build:cf`
  Expected on an unrestricted host: exit `0`, asset guard `PASS`, and final OpenNext worker startup `PASS`.

## Release diff boundary

`git diff --name-only cfa59b4 00f07ed` contains 50 paths. Classification is 50 allowed / 0 denied: course content JSON, the one content unit test, AL-17 artifacts, and one content report. No runtime, migration, schema, infrastructure, dependency, or production configuration file changed. Full lists: `release-diff.log` and `release-diff-classification.log`.

## Logs

`npm-ci.log`, `unit.log`, `tsc-app.log`, `tsc-worker.log`, `tsc-retention.log`, `tsc-summary.txt`, `lint.log`, `content-registry.log`, `build-cf.log`, `build-cf-local-post-workerd.log`, `sandbox-bind-proof.log`, and the release-diff logs are in this directory.

Evidence states are explicit: source/test/type/lint/registry gates above are directly observed PASS; build/asset/final-worker are BLOCKED or NOT_RUN in this sandbox and require the exact host command above.

> Repo copy note: the canonical logs remain in the gathering evidence directory named above; this tracked copy records the same source-gate result and host command without changing release source.
