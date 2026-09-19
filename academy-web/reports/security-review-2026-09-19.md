# Deep Security Review — CyberSkills Academy (academy-web)

- **Date**: 2026-09-19
- **Reviewed checkout**: branch `main`, HEAD `77404de` (working tree clean; live production Worker built from `68083b8` — same tree for all security-relevant files: `git diff 68083b8..77404de` touches only `reports/` documents). Migration `0040_free_course_self_enrolment.sql` applied to production 2026-09-17 per `reports/state/2026-09-17-production-state.md` (academy-platform).
- **Live context**: public since 2026-09-17 — SEO on, free sign-in on, free self-enrolment on for 8 seeded courses, `INTERNAL_SURFACES=on`.
- **Method**: READ-ONLY static review. Changed-surface focus `git diff 8d5f5f2..HEAD` (the free-enrolment lane `63a9eb0`/`9cf7c38`/`5e3f053`/`21d164d`, `INTERNAL_SURFACES` ops commit `c051b94`, brand/favicon, docs) re-reviewed line-by-line; identity/media/edge/session surfaces re-verified independently at HEAD. Two local read-only scans executed: `gitleaks dir . --redact` (results below) and git metadata queries. No tests, no builds, no live requests to production (no authority for live operations this session); every "verification" below is either a code trace or a command for the owner to run.
- **Files written by this review**: exactly this one file.

## Executive summary

| Severity (new findings this round) | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| Informational | 2 |

The free self-enrolment lane — the main new production risk surface — is built correctly. "Free" is decided by a database table no runtime role can write (`academy.course_offer`, 0040), re-checked inside a `security definer` RPC that also re-checks activation and refuses to override owner revocations; the API layer adds origin/Fetch-Metadata validation, a 1 KB strict body, fail-closed visibility, and a per-account Durable Object quota (30/h account, 10/h per course). Non-free courses cannot be self-enrolled through the API or the DB. Lesson content, answer keys, media, and certificates remain entitlement-gated on every path I traced; no new exposure was found there. Session handling, callback validation, and redirect handling remain sound.

The honest weak spots this round are two Lows around the edges of that work: (1) the *read* half of the new enrol endpoint (and every other session-gated GET) has no rate limit at any layer — a forged syntactically-valid cookie still costs one DB RPC per request, unthrottled, and free accounts now exist at zero marginal cost to an attacker; (2) the newly-introduced `INTERNAL_SURFACES` switch is documented as governing `/admin` + `/player` but the code only matches `/player`, so `/admin` has no environment kill switch and its page shell is still learner-visible (the page-shell half is prior finding AC-SEC-06, re-confirmed). All four Mediums from 2026-09-16 remain open and unreconciled with the live deployment (retire/unpublish enforcement, public cert-verify without a rate rule, shared `service_role` on core learner tables, `next@15.5.22`).

## Dedup — excluded known items

### Prior in-depth review 2026-09-16 (`../reports/security/2026-09-16-full-security-review.md`, 23 findings)

Commit `24afc2b` landed that report itself; no remediation commits followed. Status at HEAD, with what I verified today:

| ID | Sev | Status today | Evidence |
| --- | --- | --- | --- |
| AC-SEC-01 retire/unpublish only filters catalog | Medium | **Re-confirmed open** | `src/lib/course/visibility.ts` still sole-consumed by `courses/page.tsx`; `sitemap.ts:12-22` still enumerates `listPublicCourseSlugs()` unfiltered; `authorizeCourseResource` (`src/lib/account/course-access.ts:50-71`) still never reads `course_settings`. **New instances this window**: `/courses/<slug>/start` page (`start/page.tsx:29-33`) renders for any free-offered course without a visibility check (enrolment itself is blocked fail-closed by the API, so this is shell/title disclosure behind auth only); `access-required/page.tsx:50-54` *does* now consult visibility for the start-free button, and the enrol endpoint enforces it fail-closed — partial progress, core gap unchanged. `resolveCourseAvailability` is no longer dead code (now called at `access-required/page.tsx:52`). |
| AC-SEC-02 public `/api/certificate/verify` no rate rule | Medium | **Re-confirmed open** | `src/lib/edge-rate-limit-policy.ts:33-83` rules map still has no `GET:/api/certificate/verify`; `api/certificate/verify/route.ts` unchanged (one PostgREST read per hit, public). |
| AC-SEC-03 shared `service_role` retains `grant all` on core learner tables | Medium | **Open** (structural, unchanged) | `supabase/migrations/0001_academy_schema.sql:45-46`, `0002_accounts_and_progress.sql:77-78`, `0005_attempt.sql:133-135` still present; no revoking migration exists through 0040 (directory listing verified). |
| AC-SEC-04 `next@15.5.22` (critical advisory) + `sharp@0.35.2` | Medium | **Re-confirmed open** | `package-lock.json` resolves `next 15.5.22`; `package.json:67` pins `"sharp": "0.35.2"`. |
| AC-SEC-05 dead edge-marker code in otp/verify | Low | **Re-confirmed open** | `api/auth/otp/route.ts:18-27` identical double-check pattern still present. |
| AC-SEC-06 `/admin/courses` page shell renders for any learner | Low | **Re-confirmed open** | `src/app/(site)/admin/courses/page.tsx:1` still `'use client'`, no server gate; related new switch-scope gap reported as AW-SEC-02 below. |
| AC-SEC-07 0039 `delete` grant on `course_settings` to runtime | Low | **Open** | 0040 grants nothing on `course_settings`; 0039:30 grant unrepealed. |
| AC-SEC-08 identity lifecycle secrets missing from registry/`.env.example` | Low | **Re-confirmed open** | `docs/maintenance/academy-secret-registry.md` (academy-platform) still status `2026-09-03`, no `IDENTITY_LIFECYCLE*`/`IDENTITY_RUNTIME*` rows; `.env.example` has none. |
| AC-SEC-09 sign-out revocation best-effort | Low | **Re-confirmed open** | `api/auth/sign-out/route.ts:41-47` catch → `not-confirmed` then `ok:true`, unchanged. |
| AC-SEC-10 invocation logs sample full URLs | Low | **Re-confirmed open** | `wrangler.jsonc:27-35` still `invocation_logs: true`, `head_sampling_rate: 0.1`. |
| AC-SEC-11 `/private/tmp` conformance test paths | Low | Open (files untouched by diff) | `tests/unit/identity-client-assertion-*.test.ts` not in `git diff 8d5f5f2..HEAD`. |
| AC-SEC-12 lead consent shape-only | Low | Open (files untouched by diff) | `api/leads/route.ts` unchanged in window. |
| AC-SEC-13 integration tests `skipIf` | Low | Open (files untouched by diff) | — |
| AC-SEC-14 operator scripts string-SQL | Low | Open (files untouched by diff) | — |
| AC-SEC-15 small capstone banks | Info | Open (content dependency) | `assessment-policy.ts` unchanged. |
| AC-SEC-16 CSP `unsafe-inline` styles | Info | Open | `edge-security-headers.ts` unchanged. |
| AC-SEC-17 stale middleware renewal comment | Info | **Re-confirmed open** | `middleware.ts:119-120` comment still present above the syntactic prefilter. |
| AC-SEC-18 diagnostic worker regex JWT check | Info | Open (untouched) | — |
| AC-SEC-19 FNV-1a challenge fingerprint | Info | Open (untouched) | — |
| AC-SEC-20 PDPA rights manual | Info | Open (untouched) | — |
| AC-SEC-21 expired identity authority record | Info | Open (untouched; still expired as of 2026-09-19) | `config/identity-production-authority-2951f5d.json` unchanged in window. |
| AC-SEC-22 stale wrangler preview comment | Info | **Re-confirmed open** | `wrangler.jsonc:37-39` comment still contradicts `"NEXT_PUBLIC_SEARCH_INDEXING": "on"`. |
| AC-SEC-23 gitleaks disposition | Info | **Re-confirmed, refreshed** | New full run today: **140 findings, all benign-by-tracking** — 21 hits in git-tracked files are all test fixtures (`scripts/*.test.mjs`, `tests/unit/*` fake JWTs / placeholder keys); the other 119 sit in gitignored paths (`.next/` 15, `.open-next/`+`.mimosa/`+`supabase/.temp/` 95, `.env*`/`.dev.vars*` 9). No tracked credential. |

### Known identity-conformance scenarios (excluded, `../reports/conformance/identity-control/academy-identity-unproven-scenarios.json`)

The 7 unproven scenarios are excluded from new findings and were not re-litigated: `authorization.exact-registered-redirect`, `authorization.state-binding-mismatch`, `callback.login-csrf`, `callback.origin-fetch-metadata`, `exchange.code-replay-expiry`, `exchange.result-key-rotation`, `academy.canonical-founder-bootstrap`. (Note: the deployment has moved since that record — production sign-in and the callback path are live per `reports/state/2026-09-17-production-state.md` — but re-proving those scenarios needs live identity evidence, which this read-only review cannot and did not attempt.)

## New findings

### AW-SEC-01 — Session-gated API read paths have no rate limit at any layer; a forged cookie still costs a DB RPC per request, and free accounts now cost nothing

- **Severity**: Low
- **Location**:
  - `src/app/(site)/api/courses/[slug]/enrol/route.ts:48-68` — the new `GET` status endpoint: `currentUser()` → `read_identity_session_digest` RPC, then `getCourseAccess` (activation read + `has_course_entitlement` RPC), then a `course_settings` read. No quota call anywhere on the GET branch (the `learner-enrol` DO quota is wired only on POST, `route.ts:103-112`).
  - `src/middleware.ts:143-157` — production prefilter only checks the session cookie *syntactically* (`hasSyntacticallyValidLocalAcademySession`); durable validation happens inside the route, i.e. after the DB round trip.
  - `src/lib/edge-rate-limit-policy.ts:33-83` — the edge rules map covers exactly 7 public/identity rules; no session-gated API route has an edge rule. The enrol lane's only policy change was adding the `'learner-enrol'` type union member (`edge-rate-limit-policy.ts:13`).
- **Reasoning**: two cost tiers an attacker can drive today on the live host. (a) Unauthenticated: any request carrying a cookie whose value matches `/^[A-Za-z0-9_-]{32,160}$/` (e.g. 43 `A`s, which satisfies both the middleware pattern and the Postgres store's `/^[A-Za-z0-9_-]{43}$/`) passes the prefilter and makes the route execute `read_identity_session_digest` before returning 401 — one PostgREST RPC per request, unthrottled by the DO limiter (which never sees the route) or anything else visible in the repo. (b) Authenticated: self-service sign-in plus free enrolment means a throwaway account costs ~3 identity-start requests; with one valid session, every session-gated GET (enrol status, skill-map, `auth/me`, certificate/pdf, dashboard pages) costs 3–5 PostgREST RPCs per hit with no per-account ceiling on read paths (the per-account DO quotas exist only for mutations: `AUTHENTICATED_MUTATION_QUOTAS`, `src/lib/authenticated-mutation-quota.ts:18-24`). Both tiers land on shared Pool A PostgREST capacity. The class predates this window, but the new enrol GET is the newest instance and free accounts materially lower the barrier; the 2026-09-16 review flagged only the *public* verify endpoint (AC-SEC-02), not this class.
- **Attack scenario**: cheap scripted loop (single IP or rotating IPs) with a syntactically valid forged cookie, or a handful of free accounts, sustains DB load through the session-gated GET family while the Durable Object limiter sits idle, degrading sign-in/progress for real learners on shared infra.
- **Runnable verification** (owner-run against production; **not executed** — this review had no authority for live requests): `for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code}\n" -H 'cookie: __Host-academy_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' https://academy.cyberskills.co.th/api/courses/git-essentials/enrol; done` — expect fifty `401` and **zero `429`**; each response still consumed one `read_identity_session_digest` RPC (code trace above).
- **Recommended fix**: extend the edge policy with per-actor rules for the session-gated GET family (or at minimum `GET:/api/courses/<slug>/enrol` — note the policy keys exact paths, so this needs the segment-wildcard question answered first), and/or add a read-path per-account DO quota mirroring `checkAuthenticatedMutationQuota`. Reuse the AC-SEC-02 fix (the missing `GET:/api/certificate/verify` rule) in the same batch.
- **Effort**: S–M

### AW-SEC-02 — `INTERNAL_SURFACES` kill switch is documented as covering `/admin` + `/player` but only matches `/player`; `/admin` has no environment kill switch

- **Severity**: Low (defense-in-depth / control-integrity; compounds AC-SEC-06)
- **Location**:
  - `src/lib/internal-surface.ts:20-22` — `isInternalSurface(pathname)` returns true only for `/player` and `/player/**`.
  - `wrangler.jsonc:42-52` — the var shipped in commit `c051b94` with the comment "เปิดหมู่ route ภายใน (`/admin`, `/player`) ให้มีตัวตน" — i.e. the operator-facing contract says both route families are governed by the switch.
  - `src/app/(site)/admin/courses/page.tsx:1` — still a client component with no server-side staff gate (AC-SEC-06), and `middleware.ts:102` therefore 404s nothing under `/admin` regardless of the flag.
- **Reasoning**: the switch's stated purpose (make internal route families exist or not, fail-closed) is only half-wired. An operator who sets `INTERNAL_SURFACES=off` (e.g. during an incident involving staff-surface content, exactly the scenario the `/player` lock was built for — `internal-surface.ts:1-13`) will correctly kill `/player` and wrongly assume `/admin` died with it; in reality `/admin/courses` keeps rendering its shell to every signed-in learner, and the admin APIs keep existing (they are owner-gated per request, `api/admin/courses/route.ts:13-19`, so no data exposure — but the surface-disclosure and the false sense of a kill switch are real). The wrangler comment is the only place that claims `/admin` is covered, which is worse than not mentioning it: the repo's own justification for putting the value in-repo (`c051b94` message) is operator visibility.
- **Attack scenario**: reconnaissance/incident-response confusion only; no new data path. (The shell disclosure itself is AC-SEC-06.)
- **Runnable verification**: static — compare `src/lib/internal-surface.ts:20-22` with `wrangler.jsonc:42-52` (done above). Live owner-run check that `/admin` ignores the flag: temporarily set `INTERNAL_SURFACES` off in a preview deployment and observe `/player` → 404 while `/admin/courses` (with a learner session) still renders 200 — **not executed** (no live authority; also requires a deploy this review must not perform).
- **Recommended fix**: either add `/admin` to `isInternalSurface()` (preferred — it makes the documented contract true and gives `/admin` the same fail-closed switch), or correct the wrangler comment to say the switch governs `/player` only and fix AC-SEC-06's page gate so `/admin/courses` 404s for non-owners. Do not leave the comment and the code disagreeing.
- **Effort**: S

### AW-SEC-03 — `enrol_free_course` RPC is authoritative for "free" but never consults `course_settings` visibility; the fail-closed visibility gate exists only in the API route

- **Severity**: Informational (defense-in-depth)
- **Location**:
  - `supabase/migrations/0040_free_course_self_enrolment.sql:69-154` — the `security definer` RPC checks input shape, `course_offer`, activation, and revocation — it never reads `course_settings`.
  - `src/app/(site)/api/courses/[slug]/enrol/route.ts:94-101` — `freeOfferOpen` → `requireEffectiveCourseVisibility` (`src/lib/course/settings.ts:67-80`) is the only visibility gate, fail-closed on read error (good).
- **Reasoning**: the design principle the enrol lane itself states ("DB เป็นตัวตัดสิน") is applied to offer/activation/revocation but not to visibility: a retired or unpublished free course can still be self-enrolled if any *other* caller of the RPC ever appears (operator script, future surface, or a regression that drops the route-level check). Today the RPC is reachable only through this one route and the route check is fail-closed, so there is no live path — this is a single-point-of-enforcement note, and it is the DB-side mirror of AC-SEC-01's runtime-side gap. The definer already runs with enough privilege to read `course_settings`; adding the check server-side would make "retired" mean retired at the layer that cannot be bypassed by a missing route check.
- **Runnable verification**: static trace above (no other caller exists: `grep -rn "enrol_free_course" src/ worker/ ops/ scripts/" → only `src/lib/account/free-enrolment.ts:16`, called only from the enrol route).
- **Recommended fix**: in a follow-up migration, have `enrol_free_course` treat a `course_settings.visibility` of `unpublished`/`retired` as `42501` (read fail-closed), reusing the migration-transaction rehearsal policy. Optional given the route gate, but cheap insurance for exactly the failure mode AC-SEC-01 documents.
- **Effort**: S

### AW-SEC-04 — No CI/CD pipeline exists for the repository; production deploys are a local-machine command on the box that holds live-looking secrets

- **Severity**: Informational (process/environment discipline)
- **Location**: absence of `.github/`, `.gitlab-ci.yml`, `Jenkinsfile`, or any other CI config under `products/cyberskills/academy-platform/` (verified by sweep; sibling products *do* carry `.github/`, so this is an Academy gap, not a repo-wide convention); `package.json` `deploy:cf` = `build:cf` + `wrangler deploy --autoconfig=false --keep-vars` (local execution); secrets live only as Worker secrets plus local files that today's gitleaks run shows hold live-looking values (`.env.local` 3, `.dev.vars` 2, `.open-next/` embeds — all gitignored, machine-compromise scope).
- **Reasoning**: nothing between "code on main" and "live production" enforces `npm run lint`, `npm test`, `npm audit`, the asset guard, or a secret scan — the founder's local run is the entire gate, on the machine that holds the secrets. For a system now live with free self-enrolment, the residual risks are (a) advisory-driven dependencies (AC-SEC-04) staying red and eventually normalized, and (b) a compromised or careless dev machine being both the deploy path and the secret store. The 2026-09-16 review noted the audit-tooling normalization risk for AC-SEC-04 but not the absence of CI itself.
- **Runnable verification**: `find products/cyberskills/academy-platform -name ".github" -o -name ".gitlab-ci.yml" -o -name "Jenkinsfile" | wc -l` → 0 (executed this review); `grep -rln academy --include="*.yml" <sibling .github dirs>` → no coverage of Academy (executed).
- **Recommended fix**: a minimal CI workflow on the academy-platform repo running the existing gates (`lint`, `test:unit`, `npm audit --omit=dev --package-lock-only`, `asset-guard`) on PRs to main, before the product grows past one contributor. Not urgent, but the cost only rises.
- **Effort**: S

## Verified sound (no finding) — per focus dimension

### 1. Free self-enrolment path (migration 0040 + `/api/courses/<slug>/enrol`)

- **Offer gating cannot be bypassed for non-free courses.** Two independent layers: the API refuses when the static registry's `offer.model` is not `free` (`enrol/route.ts:91-93`; schema-typed at `course-types.ts:91-103`, zod-strict in the loader, and `tests/unit/free-course-offer.test.ts` pins registry↔DB-seed equality), and the DB RPC refuses with `42501` when `academy.course_offer` has no `model='free'` row (0040:89-94). `course_offer` is written only by reviewed owner migrations — `revoke all` from every role including `academy_runtime` and `service_role` (0040:47-49) — and its only data values are the 8 seeded free courses (0040:53-61). There is no paid course to test today, and nothing in the chain trusts the client's claim about freeness.
- **Duplicate/enrolment abuse is contained.** RPC is idempotent under a per-(user, course) advisory xact lock shared with owner grants (0040:97-99,109-124); the idempotent no-op path writes no audit row (no audit spam); an owner revocation can never be self-overridden (0040:126-129, surfaces as `403 reason=revoked` via `free-enrolment.ts:23-24`); inactive accounts are refused (`55000` → 403). Route-level DO quota `learner-enrol`: 30/h per account, 10/h per account+course (`authenticated-mutation-quota.ts:23`), fail-closed 503 when the limiter is unavailable (`:74,89,112-114`).
- **Entitlement persistence is correct.** Free enrolments persist as `course_entitlement` rows (`source='free'`, `expires_at=null`) read by the same `has_course_entitlement` predicate as every other source (revocation- and expiry-aware, 0004:47-60); one audit row per actual change with `actor_account_id = self` and reference `self-enrol:free-offer` (0040:140-146); the audit source check constraint was widened deliberately with a pre-migration shape assertion (0040:24-33,63-67).
- **The `/start` journey page performs no mutation** (`start/page.tsx` — GET only; the POST goes through the gated API; the client ignores any server-supplied URL and computes the destination itself, `FreeCourseStart.tsx:62-64`). Unauthenticated users are redirected to sign-in with a validated same-origin `next` (middleware + `safeNextPath`).

### 2. Course content exposure

- Every content path I traced requires activation + entitlement + per-node prerequisite via `authorizeCourseResource` (`course-access.ts:50-71`): lesson page (`lessons/[nodeId]/page.tsx:33`), learn overview (`learn/page.tsx:26`), skill-map API, explanations API, attempts, progress writes, practice simulation, and media grants. Nothing consults only the session.
- Answer keys cannot reach the browser through the type system: `toPublicLesson` + `Public*` types use `never`-field collision (not `Omit` alone) for `correct`/`explanation`/simulation rules (`public-lesson.ts:44-91`), the content registry is `server-only` and build-bundled, not static-served (`course-source.ts:1-30`), and the public catalog/overview projections carry syllabus metadata only.
- Private media (MP4/VTT/PDF) is R2-only behind session-bound, expiring grants (`course-media/[assetId]/route.ts:13-50`, `worker-delivery.ts:29-50`); legacy public paths hard-404 (`worker-delivery.ts:31`); the local delivery branch is path-traversal-guarded (`route.ts:75-77`); `run_worker_first: ["/media/*"]` unchanged. The only files under `public/` are brand assets and three lesson diagram SVGs (`public/media/diagrams/`) — pre-existing, deliberate, and free-course content in any case.

### 3. Identity consumer surface

- Session cookies: `__Host-academy_session` (legacy name only outside production), HttpOnly/Secure/SameSite=Lax, opaque 256-bit ids, exact-one parsers that reject duplicates and malformed values (`session-cookie.ts:46-77`); at rest only SHA-256 digests (0034), TTL 24 h default / 30 d max enforced in the RPC layer (`postgres-session-store.ts:21-22`); claims re-validate issuer/subject/email/activation shape on every read (`:198-268`). Browser cookie carries no Max-Age (dies with the browser session) — strictly tighter than the DB TTL; no mismatch risk.
- Callback: accepts exactly one `code` + one `state`, nothing else (`transaction.ts:593-605`); browser-binding cookie per state with exact-one parse and constant shape checks (`runtime-browser-flow.ts:239-254`); return paths are validated at both ends — `safeNextPath`/`isAcademyInternalReturnPath` rejects `//`, `/\`, control chars, non-path values (`internal-return-path.ts:6-27`), and the completion re-validates the stored path shape before redirecting (`runtime-completion.ts:353-363`).
- Production composition fails closed: `IDENTITY_ADAPTER` must be `identity-control` with the full release config present, else inert/503 (`registry.ts:36-46`, `production-runtime.ts:88-95`); `fake` adapter throws in production (`registry.ts:52-56`); the local fixture requires non-production NODE_ENV + explicit env + localhost origin (`local-fixture.ts:32-46`). Public identity endpoints are marker-gated with DO rules (start GET/POST, callback GET). Sign-out clears both cookie names and returns the SSO end-session URL; the durable-revocation best-effort gap is AC-SEC-09 (excluded, re-confirmed).
- v1 receipts / no `auth_time` freshness: known production posture per the state record; covered by the excluded unproven-scenarios set.

### 4. Worker/API boundaries

- Host policy is the first check in the outer Worker (`worker.ts:46`); canonical admission rejects traversal/encoded disguises (`edge-rate-limit-policy.ts:98-128`); actor identity is `cf-connecting-ip` only (`:146-148`). `INTERNAL_SURFACES` is checked before any auth logic and 404s rather than 403 (`middleware.ts:102-104`) — for `/player` (see AW-SEC-02 for `/admin`).
- Staff checks are per-request DB RPCs: `has_staff_role` treats `owner` as a superrole (0018:142-161), `/player/**` pages all call `requireInternalContentStaff()` (verified on exam/module pages), admin APIs run `requireOwner()` on every handler including DELETE. Admin mutations are origin-validated and body-capped (16 KB, strict zod enum for visibility).

### 5. Input validation

- Consistent posture across every mutation endpoint checked this round (enrol, leads, unsubscribe, attempts, progress, progress/reset, explanations, simulation, certificate issue, admin PATCH/DELETE): `validateMutationRequest` (Origin authoritative, Fetch-Metadata fallback, missing both = reject; `mutation-security.ts:36-60`) + byte-bounded body reads that cancel the stream on overflow (`bounded-body.ts`) + strict zod schemas with explicit max lengths. `consent_text_version` is pinned server-side (leads). No `formData`/`multipart` anywhere in `src/` — there is no upload surface. `unsubscribe` takes a UUID only. The unsubscribe/leads public endpoints remain marker-gated with DO rules (actor + target + global).
- File/attachment paths: only the media routes above; asset ids come from a compile-time registry, never from user input; traversal-checked before any `readFile`.

### 6. Secrets/env discipline

- `wrangler.jsonc` `vars` contain only non-secret flags (`NEXT_PUBLIC_SEARCH_INDEXING`, `INTERNAL_SURFACES`) — verified no long/secret-shaped literal values; all real secrets are Worker-secret bindings named in `AcademyWorkerEnv` (`worker.ts:16-32`). `.gitignore` coverage re-verified via `git check-ignore` (`.env*`, `.dev.vars*`, `.next/`, `.open-next/`, `supabase/.temp/`). Gitleaks: 140 findings, all benign — 21 tracked hits all in test fixtures; no tracked credential (details under AC-SEC-23 above). Registry/env-example gaps remain AC-SEC-08 (excluded, re-confirmed). CI absence is AW-SEC-04 above.

## Honest coverage

- **Verified at HEAD by direct read**: everything cited with file:line above, including the full enrol lane (migration, rollback, API, lib, UI, unit tests), middleware, worker entry, edge policy/enforcement, session/transaction/production-runtime surfaces, admin/player gates, media chain, all 21 route handlers' authorization calls, migration grant ledger (0001–0040), wrangler config, `.gitignore`, `.env.example`, secret registry, plus a fresh full gitleaks run.
- **Not re-verified in depth** (files untouched since `8d5f5f2`, status inferred from the empty diff + prior review): AC-SEC-11/13/14 test-infra and operator-script internals, AC-SEC-15 content bank sizes, AC-SEC-18/19/20 details.
- **Not verifiable statically / out of scope**: runtime secret values and CF dashboard state; whether a Cloudflare WAF/rate rule exists in front of the Worker (AW-SEC-01 assumes none in code — if one exists at the CF edge it mitigates tier (b) but not the per-request DB-RPC cost); live behavior of any endpoint (no live requests were made — no authority this session; every live check above is phrased owner-runnable); Identity Control producer-side behavior (covered by the excluded unproven-scenarios record); `node_modules`; today's journey-QA dev-infra finding ACD-J1 (migration chain breaks under `supabase db reset` locally) is dev-tooling, logged there, not re-reported here.
- **Reconciliation note for the owner**: the four open Mediums (AC-SEC-01..04) predate the production launch decision and are still unreconciled with a system that now has real learners; AW-SEC-01's fix and AC-SEC-02's fix are the same one-line-policy-plus-tests batch if you choose to do them together.
