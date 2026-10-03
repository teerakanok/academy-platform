# AL-22 launch exposure probe evidence (2026-10-04)

สถานะ: implement checker + mocked-fetch coverage แล้ว; live local receipt ยังไม่ได้รันเพราะ sandbox ห้าม bind port

## Changed scope

- `academy-web/scripts/verify-launch-exposure.mjs`
- `academy-web/tests/unit/verify-launch-exposure.test.ts`
- `academy-web/package.json` (add `verify:launch-exposure` only)

No production URL, credential, cookie, mutation, POST, deployment operation, or shared-resource change.

## Contract implemented

- GET-only probes, `redirect: manual`, `credentials: "omit"`, bounded `AbortSignal.timeout` (250–30,000 ms), one JSON receipt, exit 0 only when every evaluated check passes.
- `--expect gated`: all enumerated launch paths require a Cloudflare Access redirect; raw workers.dev host (when supplied) still must be 404.
- `--expect public`: launch pages require 200 without Access redirect; `/courses` must list exactly `basic-os-linux` and `git-essentials`; every hidden slug checks overview, en/th localized overview, one real lesson route, free-start route (all 404), plus absence from `/sitemap.xml`; internal routes require 404 or Access redirect; raw workers.dev host requires 404.
- Receipt exposes request URL, status, Location **host only**, expected/observed safe summary, and per-check pass/fail. It never serializes cookies or full Location query strings.
- Unit tests prove both happy paths, request safety, and a failing mutation for every generated public/gated check.

## Evidence states

- Source PASS — `node --check scripts/verify-launch-exposure.mjs`.
- Source PASS — targeted ESLint: `npm exec eslint -- scripts/verify-launch-exposure.mjs tests/unit/verify-launch-exposure.test.ts` (no findings).
- Source PASS — TypeScript app + Worker + retention: `npx tsc --noEmit && npx tsc -p tsconfig.worker.json && npx tsc -p ops/academy-retention-worker/tsconfig.json`.
- Source PASS — targeted unit: `npm run test -- --run tests/unit/verify-launch-exposure.test.ts` — 1 file / 6 tests passed.
- Native PASS — full unit on Node 24.18.0: `PATH=/Users/teerakanok/.nvm/versions/node/v24.18.0/bin:$PATH npm run test:unit` — 170 files passed; 3,228 passed, 2 existing skips, 0 failed.
- Native PASS — Next production build on Node 24.18.0 with local-only `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` (offline font fixture), `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100`, `NEXT_PUBLIC_SEARCH_INDEXING=on` — compiled and generated 65 pages. The first online-font build attempt made no production Academy request and failed on `fonts.googleapis.com`; the retry used a local Next-bundled woff2 fixture.
- Native NOT_RUN/BLOCKED — launch-shape live receipt. The prepared loopback PostgREST stub and `next start` plan made no external call, but the sandbox rejected `listen(127.0.0.1,53233)` with `EPERM`; see `loopback-bind-attempt.log`. Therefore no local JSON receipt is claimed.
- Native BLOCKED (pre-existing, unrelated) — `npm run lint` on both Node 24.18.0 and 25.5.0 stops at three existing `@typescript-eslint/no-require-imports` errors in `scripts/academy-bound-worker-executor.cjs` before its chained typechecks. The new files have targeted ESLint Source PASS above, and all three explicit TypeScript projects pass. No unrelated file was edited.

## HOST-E2E

Prerequisite: build once, start a launch-shaped local Next server (`basic-os-linux` + `git-essentials` published; the six agreed hidden slugs unpublished; no production credentials), then run the gate once against the ready local origin:

`cd academy-web && npm run verify:launch-exposure -- --base http://127.0.0.1:3100 --expect public --timeout-ms 10000 --skip-access-boundary`

Use `--skip-access-boundary` only for a local Node server. It transparently records internal Access-boundary checks as skipped; it never skips hidden-course or public-course checks. For the pre-launch production rehearsal, run without that flag (and with `--raw-host <raw-workers-host>` when authorized).

Production deploy remains out of scope for AL-22.
