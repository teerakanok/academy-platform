# Academy security-scan remediation — 2026-08-16

Scope: adjudication + minimal remediation of the 12 Mimosa L3 pre-commit findings on
`academy-web/` (branch `main`, HEAD `cd83b20`). Every finding was adjudicated by
reading the full code path and following the taint to its sink; verdicts below cite
that evidence. Production flags are untouched: `enabled` / `releaseApproval` /
`runtimeWired` all remain `false` — this session changed no feature flag and no
production runtime behavior.

Legend: TP = true positive, FP = false positive. All paths relative to `academy-web/`
unless noted.

| # | Finding | Scanner class | Verdict | Evidence | Fix (commit-pending) |
|---|---|---|---|---|---|
| 1 | `scripts/make-dummy-assets.py:46` | path traversal (high) | FP | `open(svg_path)` where `svg_path = os.path.join(OUT_DIR, "sample-diagram.svg")`; `OUT_DIR` is the string literal `"public/media"`. The script reads no argv, no env, no stdin — every path component is a constant in the script, so no untrusted input reaches the write. | none needed |
| 2 | `scripts/make-dummy-assets.py:89` | path traversal (high) | FP | `make_pdf` writes only `os.path.join(PRIVATE_DIR, "sample-handout.pdf")` with `PRIVATE_DIR` another literal (`"private-media/content-formats-demo/formats-references"`). Same as #1: zero input surface. (Script not re-run as demonstration because its outputs are git-tracked; regenerating would dirty the tree with byte-identical-intent content.) | none needed |
| 3 | `playwright.config.ts:63` | hardcoded credential (high) | FP (hardening applied) | `MEDIA_SIGNING_SECRET: 'playwright-only-media-signing-secret-32-bytes-minimum'` is a self-declared throwaway value for the ephemeral e2e `next start` server only — never a production secret, and unit tests stub their own (`tests/unit/media-route.test.ts:21`). Per remediation guidance the provenance was made explicit with env-with-default, matching the neighboring `INTERNAL_SURFACES` / `ATTEMPT_MAX_PER_WINDOW` style; default value is byte-identical so offline e2e runs are unchanged and CI needs no new env var. | `playwright.config.ts` — `process.env.PLAYWRIGHT_MEDIA_SIGNING_SECRET ?? 'playwright-only-media-signing-secret-32-bytes-minimum'` |
| 4 | `tests/unit/identity-code-exchange-json-operation.test.ts:122` | hardcoded credential (high) | FP | `'credential=TOP_SECRET'` is a deliberate leak canary, not a credential: `expectBoundedFailure` (line 56-58) asserts error surfaces do NOT contain `TOP_SECRET`, i.e. the fixture exists to prove credentials never leak into errors. Unit-test fixture only. | none needed |
| 5 | `tests/unit/identity-code-exchange-response-transport.test.ts:214` | hardcoded credential (high) | FP | Same canary pattern as #4 — the string feeds hostile-input cases whose assertions verify the bounded failure surface never echoes it (lines 51-58 of that file). Unit-test fixture only. | none needed |
| 6 | `tests/integration/academy-retention-api.test.ts:36` | SSRF (high) | FP | `apiUrl` is gated by `isSafeLocalTestTarget()` (lines 9-17): protocol `http:`, hostname exactly `127.0.0.1`, pathname `/`, no query/hash; the whole suite is `describe.skipIf(!hasDedicatedApi)` where `hasDedicatedApi` requires that guard, so the raw `fetch` can only target verified loopback, and the path suffixes are hardcoded literals (`/rpc/...`). | none needed |
| 7 | `tests/integration/academy-runtime-api.test.ts:35` | SSRF (high) | TP (unpinned configurable fetch target; no request-derived taint) | Unlike #6, this suite's raw `fetch(`${apiUrl}${path}`)` ran on any `ACADEMY_DATA_API_URL` value: the env is operator-trusted (not classic SSRF input), but the raw fetch bypassed the origin rule the production client enforces (`src/lib/db/server.ts:11-28`: HTTPS or http-loopback `127.0.0.1`, bare origin, no credentials), so a misconfigured env could make the test send an HMAC-signed bearer to a host the app itself refuses. Pinned to that exact production rule. | `src/lib/db/server.ts` — export `isSafeAcademyDataApiUrl()` (boolean wrapper over the existing private validator; no behavior change to existing paths) · `tests/integration/academy-runtime-api.test.ts` — `hasDedicatedApi` now also requires `isSafeAcademyDataApiUrl(apiUrl)` · focused unit test `tests/unit/academy-runtime-db.test.ts` "dedicated API URL safety predicate" (written first, red → green) |
| 8 | `src/lib/content/source.ts:40` | path traversal (high) | FP | `f` comes from `readdirSync(fullLengthDir).filter(f.endsWith('.json'))` — bare directory-entry names from the OS listing of the fixed dir (POSIX entry names cannot contain `/`); the base is `CONTENT_DIR` = operator env `ACADEMY_CONTENT_DIR` or `join(cwd, 'fixtures/cas005')`. No HTTP/request input in the chain: the only URL-param consumers (`player/module/[slug]`, `player/exam/[id]` pages) use params solely as `.find()` comparison keys, never in path construction. All parsed JSON is zod-validated fail-closed by the loader. | none needed |
| 9 | `src/lib/content/source.ts:48` | path traversal (high) | FP | `manifestPath = join(CONTENT_DIR, 'manifest.json')` — fully constant/operator-env, no variable component at all; `assertManifestContract` receives already-parsed JSON validated by `manifestContractSchema`, and its `file` argument is the literal used only in error text. | none needed |
| 10 | `src/lib/content/source.ts:33` | mongo-sort-injection (medium) | FP | No mongo/mongodb anywhere in `academy-web` (zero grep hits in `src/`, `tests/`, `package.json`). The `.sort()` calls are in-memory `Array.prototype.sort` on (a) directory-listing names and (b) zod-validated integer `part` numbers — no database sink exists to inject into. | none needed |
| 11 | `src/lib/content/source.ts:33` | cross-file taint (medium) | FP | `slug` originates from `readdirSync` of the fixed `module-banks` dir and flows into `loadModuleBank` only as a label (`ModuleBank.slug`, error messages). Consumers use it for equality matching (`.find(m => m.slug === slug)`). No injection sink: no eval, no HTML sink (React escapes), no SQL string interpolation (supabase-js parameterizes). | none needed |
| 12 | `src/components/WaitlistForm.tsx:26` | cross-file taint (medium) | FP (taint exists, validated at the trust boundary) | The flow URL params/`document.referrer` → JSON POST `/api/leads` is fully validated server-side in `src/app/(site)/api/leads/route.ts:17-24`: email `trim().toLowerCase().pipe(z.email()).max(320)`, each utm field `trim().max(200)`, referrer `trim().max(500)`, plus mutation-origin check, rate limit, and 10 KB bounded body; values then travel only as parameterized `rpc()` arguments — never string-interpolated. | none needed |

## Summary

- 10 false positives (documented above with the validation chain / fixture context).
- 2 items remediated: #7 (true positive — integration fetch target pinned to the
  production client's own origin rule, TDD) and #3 (false positive, provenance
  hardening applied per remediation guidance; value and offline behavior identical).
- No production flag changed: `enabled` / `releaseApproval` / `runtimeWired` remain `false`.
- No dependency bump, no new runtime config surface; the one new export
  (`isSafeAcademyDataApiUrl`) is a pure boolean wrapper over existing validation logic.

## Verification (final)

From `academy-web/` on branch `main` (changes uncommitted — orchestrator commits):

- `npx vitest run --project unit` — **118 files / 1359 tests passed, 0 failed**
  (baseline before changes: 118 / 1351; the +8 are the new focused
  `isSafeAcademyDataApiUrl` cases, confirmed red before the fix, green after).
- `npx tsc --noEmit` — exit 0 (also `tsc -p tsconfig.worker.json` and
  `tsc -p ops/academy-retention-worker/tsconfig.json` exit 0, since
  `src/lib/db/server.ts` is in worker compile scope).
- `npx eslint .` — 0 errors, exactly the 1 pre-existing warning
  (`src/lib/content/registry.generated.ts:4` unused eslint-disable directive);
  no new warnings introduced.
- `git status --porcelain` — only the four intended modified files
  (`academy-web/playwright.config.ts`, `academy-web/src/lib/db/server.ts`,
  `academy-web/tests/integration/academy-runtime-api.test.ts`,
  `academy-web/tests/unit/academy-runtime-db.test.ts`), this new report file,
  and the pre-existing entries (`plans/active_plan.md` and the freeze JSON —
  other sessions', untouched; untracked `reports/security/` and `.mimosa/`).
- Production flags untouched: `enabled` / `releaseApproval` / `runtimeWired`
  remain `false`.
