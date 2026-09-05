# Legacy Academy fact-check projection validation — 2026-09-05

Status: validation complete on isolated branch `content/verification-cde63a58`; no deploy or visibility change.

## Source and scope

- Crucible source commit: `177dcc47a567dca6f25c240e342492485d8d1860`.
- Academy base: `de1fd32796e66f3e57c9af3ea8df958ea5386325` (`content/import-secplus-isc2cc`).
- Packages: `courses/academy/{assembly,basic-os-linux,c-low-level,computer-architecture,computer-networking,git-essentials,operating-systems,setup-and-environment}`.
- Projection changes 86 tracked content files; all 327 imported product files compare byte-for-byte with their Crucible package peers.
- `publicAvailability` stayed `syllabus-preview` for all eight courses before and after import.
- No certification-course package was imported; the internal-only rule for new certification imports was not exercised.

## Validation

- Registry generator: exit 0; 11 courses, 450 content files, 3 consent versions; generated registry unchanged.
- Focused content tests: 36/36 passed across content registry, course content and course roadmap.
- Checkpoint answer-bias: passed across 1,403 bilingual MCQs; A/B/C/D = 25.7/24.2/25.8/24.3%; longest-choice answers 34.6% under the 85% cap.
- Full unit suite: 137 files, 2,356/2,356 tests passed.
- TypeScript: app, Worker and retention-worker checks each exited 0.
- Full `npm run lint`: expected baseline exit 1 with the same three `no-require-imports` errors in `scripts/academy-bound-worker-executor.cjs`; 16 warnings; no imported content path reported.
- `git diff --check`: exit 0.

## Raw evidence

- Logs: `/private/tmp/cyberskills-prod-cde63a58/logs/content-corrections/academy-*.log`.
- SHA-256 manifest: `/private/tmp/cyberskills-prod-cde63a58/logs/content-corrections/academy-projection-log-manifest.sha256`.
- Manifest SHA-256: `277fbf165154854c13f40fb03784736445605c346c073855c264a15355617ce9`.
- The broad Crucible `courses:check` remains pre-existing red for unrelated missing scaffold paths; it was recorded and not repaired in this projection.

## Boundary

- This commit is a reviewable internal projection only.
- It does not merge, deploy, change entitlement, change catalogue availability, or move the active production version.
