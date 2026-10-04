# AL-22 launch exposure probe evidence (2026-10-04, review r2)

สถานะ: checker + mocked-fetch coverage เสร็จ และแก้ครบ narrow must-fix จาก host review r2; local live receipt ยังต้องรันบน host เพราะ worker sandbox ห้าม bind port

## Changed scope

- `academy-web/scripts/verify-launch-exposure.mjs`
- `academy-web/tests/unit/verify-launch-exposure.test.ts`
- `academy-web/package.json` (add `verify:launch-exposure` only)

No production URL, credential, cookie, mutation, POST, deployment operation, or shared-resource change.

## Contract implemented

- GET-only probes, `redirect: manual`, `credentials: "omit"`, bounded `AbortSignal.timeout` (250–30,000 ms), one JSON receipt, exit 0 only when every evaluated check passes.
- `--expect gated`: all enumerated launch paths require a Cloudflare Access redirect; raw workers.dev host (when supplied) still must be 404.
- `--expect public`: `/`, localized launch course pages, `/courses`, and `/sitemap.xml` require 200 without Access redirect. An unlocalized launch course may answer 200 directly or answer 301/308 only when Location is same-origin, has no query/hash, targets `/courses/<same-slug>/{en,th}`, and that target returns 200. A foreign host, other path, or non-200 target fails.
- Every hidden slug checks overview and en/th localized overview (all must be 404), plus one real lesson route and free-start route. For this anonymous probe only, lesson/start may be 404 or redirect same-origin to pathname `/sign-in`; that redirect body must be at most 2,048 bytes and contain no HTML/article/H1/lesson-title markup. A realistic Next redirect body that echoes the safe `next` query is accepted; it is not treated as course content. Authenticated refusal of hidden lesson/start/enrol is not re-proved here — it remains covered by AL-03 tests/canary. This scope statement is emitted in public receipts and `--help`.
- Receipt exposes request URL, status, Location **host only**, expected/observed safe summary, and per-check pass/fail. It never serializes cookies or full Location query strings.
- Unit tests prove both happy paths, request safety, canonical redirect pass/fail paths, hidden anonymous-gate pass/fail paths, the realistic Next redirect echo, hidden lesson HTML rejection, an oversized-body rejection, and a failing mutation for every generated public/gated check.

## Evidence states

- Source PASS — `node --check scripts/verify-launch-exposure.mjs`.
- Source PASS — targeted ESLint: `npm exec eslint -- scripts/verify-launch-exposure.mjs tests/unit/verify-launch-exposure.test.ts` (no findings).
- Source PASS — help contract on Node 25.5.0: `npm run verify:launch-exposure -- --help --base http://localhost:3100 --expect public` exits 0 and includes the anonymous hidden-course scope note plus the localhost-base note.
- Source PASS — targeted unit: `npm run test -- --run tests/unit/verify-launch-exposure.test.ts` — 1 file / 9 tests passed, type errors 0.
- Source PASS — TypeScript app + Worker + retention: `npx tsc --noEmit && npx tsc -p tsconfig.worker.json && npx tsc -p ops/academy-retention-worker/tsconfig.json`.
- Native PASS — full unit on Node 25.5.0: `npm run test:unit` — 170 files passed; 3,231 passed, 2 existing skips, 0 failed.
- Native NOT_RUN/BLOCKED — launch-shape live receipt. The worker sandbox rejected loopback `listen` with `EPERM` in the earlier attempt (`artifacts/AL-22/loopback-bind-attempt.log`), so this submission does not claim a worker-owned local JSON receipt. The host already reproduced the two checker mismatches against its local launch-shaped server; the fixed checker is queued for the host rerun below.

## HOST-E2E

Prerequisite: build once, start a launch-shaped local Next server (`basic-os-linux` + `git-essentials` published; the six agreed hidden slugs unpublished; no production credentials), then run the gate once against the ready local origin:

`cd academy-web && npm run verify:launch-exposure -- --base http://localhost:3100 --expect public --timeout-ms 10000 --skip-access-boundary`

Local Next runs must use `--base http://localhost:<port>` rather than `127.0.0.1`: Next rewrites loopback redirects to `localhost`, and the checker compares that received origin.

Use `--skip-access-boundary` only for a local Node server. It transparently records internal Access-boundary checks as skipped; it never skips hidden-course or public-course checks. For the pre-launch production rehearsal, run without that flag (and with `--raw-host <raw-workers-host>` when authorized).

Production deploy remains out of scope for AL-22.
