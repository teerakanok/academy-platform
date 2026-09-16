# Full In-Depth Security Review — CyberSkills Academy

- **Date**: 2026-09-16
- **Reviewed checkout**: branch `main`, HEAD `8d5f5f208516a5672a6eaa6e6ecb521484b5ccb3` (baseline `git status --porcelain` empty — clean)
- **Method**: static analysis of `academy-web/src/**` (app router pages, all route handlers, middleware, worker entries, identity/media/db/http libs), `academy-web/wrangler.jsonc`, `public/_headers`, `next.config.ts`, `supabase/migrations/**` + `supabase/privileged/**`, `ops/academy-retention-worker/**`, `docs/maintenance/**`, root/package configs, operator scripts; READ-ONLY (no file created/deleted/modified except this report; no tests, builds, live hosts, or DB connections); prior reviews (`2026-09-05-security-review-checklist.md`, `2026-09-07-sec-academy-010`, `2026-09-11-in-depth-review.md`) consulted for reconciliation only. Changed-surface focus: `git diff b568a73..8d5f5f2` (new admin courses API, course settings/visibility system, SSO sign-out F-1, public SEO switch, cert-verify allowlist) re-reviewed line-by-line; unchanged deep surfaces independently spot-verified at HEAD.
- **Test/gate evidence**:
  - `npm audit --omit=dev --package-lock-only` (only network call made): **1 critical + 1 high** — `next 15.5.22` (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) and `sharp <0.35.4` (GHSA-rgj7-g3m4-5g8c). Applicability analysis in AC-SEC-04. `npm audit fix` reports a non-breaking fix available.
  - `gitleaks dir . --no-banner --redact`: **132 findings, all benign-by-tracking** — every secret-shaped value sits in gitignored paths (`.env.local`, `.dev.vars`, `supabase/.temp/start-secrets/`, `.open-next/` build output, `.mimosa/` state) or unit-test `*.example.test` fixtures; the single tracked hit is a Cloudflare Access application/policy/domain **identifier pair** (not credentials) in `reports/reviews/academy-canonical-domain-deployment-receipt-20260823.json:55-60`. See AC-SEC-23.
  - No test suite or build executed (read-only mandate).

## Executive Summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 4 |
| Low | 10 |
| Informational | 9 |

No exploitable path was found to read answer keys, forge assessment results or certificates, bypass course entitlement, hijack or forge sessions, or reach learner data without an authenticated, entitled session. The core security architecture verified in the 2026-09-11 review is intact at HEAD and materially improved since 2026-09-05: lifecycle pull is wired into a 5-minute cron, request-path principal resolution is read-only and pins the canonical issuer, media grants are session-bound, cookies are `__Host-` prefixed, content URLs are scheme-allowlisted, per-account mutation quotas exist, static assets get baseline headers plus an asset guard, and the shared `service_role` entitlement/staff grants were revoked (0030).

The honest weak spot of this round is **enforcement drift in the newest feature**: the owner's new "retire/unpublish a course" control (admin API + `course_settings`) only filters the catalog listing — public overview pages, the sitemap, lessons, attempts, progress, media, and certificates never consult it, so the promised "removes it from all learner surfaces" is not true (AC-SEC-01). Second, the public certificate-verification endpoint was opened in the middleware exactly as the prior review warned — without the rate-limit rule that was supposed to accompany it (AC-SEC-02). Third, early migrations still grant the shared Pool A `service_role` full rights over core Academy learner tables, keeping cross-product blast radius open (AC-SEC-03). Dependency tooling flags `next@15.5.22` critical, but both advisories are unreachable under the current deployment and config (AC-SEC-04). Everything else is hardening, evidence-quality, and carried-over hygiene items.

## Findings

### AC-SEC-01 — Course "retire/unpublish" is enforced only on the catalog listing, not on learner or public surfaces

- **Severity**: Medium
- **Location**:
  - `academy-web/src/lib/course/visibility.ts:16-23` — `export async function getVisiblePublicCourses(...)` with `return override.visibility === 'published'` (the only visibility filter in the codebase; grep shows its sole consumer is `src/app/(site)/courses/page.tsx:21`)
  - `academy-web/src/lib/course/settings.ts:33-60` — `resolveCourseAvailability(...)` has **zero callers** (dead code)
  - `academy-web/src/lib/account/course-access.ts:50-71` — `authorizeCourseResource(...)` checks activation → entitlement → prerequisite, never `course_settings`
  - `academy-web/src/app/(localized)/courses/[slug]/[locale]/page.tsx:55-63` — public overview renders from `publicCourseForPath(slug, locale)` with no visibility check; `academy-web/src/app/sitemap.ts:14-19` enumerates `listPublicCourseSlugs()` unfiltered
  - `academy-web/src/app/(site)/api/admin/courses/[slug]/route.ts:66` — `/** Soft-delete (retire) a course — removes it from all learner surfaces. */`
  - No unit/e2e test references course visibility (grep over `tests/`, `e2e/` finds only identity key-set "visibility" tests).
- **Description**: the new management feature (0039 + admin API, commits `0bc9495`/`7248bf2` era) promises that `retired`/`unpublished` removes a course from learner surfaces. In reality only `/courses` (catalog) filters. The public localized overview (`/courses/<slug>/<locale>` and legacy redirect `/courses/<slug>`, both middleware-public via `middleware.ts:36-43`), the sitemap, OG images, share images, lesson pages, `/learn`, attempts, progress writes, media grants, and certificate issuance/eligibility never read `course_settings`. The helper that was clearly intended for this (`resolveCourseAvailability`) is unreachable dead code.
- **Attack scenario**: a course is retired because of a content error (wrong answer key, copyright takedown, defamatory material). The owner clicks Retire, the course vanishes from the catalog — but every existing learner keeps full study/attempt/media access by URL, new entitled learners keep access, and the public overview page remains rendered, indexed (still in `sitemap.xml` with `NEXT_PUBLIC_SEARCH_INDEXING=on`), and shareable. The control that operators believe is a kill switch is a listing filter.
- **Previously reported**: no (feature landed after 2026-09-11 review).
- **Recommended fix**: thread `resolveCourseAvailability` (or a cached `loadAllCourseOverrides`) into (1) the localized public overview page + `generateStaticParams`/sitemap (retired/unpublished → 404/noindex-out of sitemap), (2) `authorizeCourseResource` or a wrapper so lesson/attempt/progress/media/certificate paths return 404/403 for retired/unpublished courses, (3) at minimum fail closed on store error. Add unit + e2e tests for retired/unpublished direct-URL access, and delete or wire the dead helper.
- **Effort**: M

### AC-SEC-02 — Public `/api/certificate/verify` has no rate-limit rule (SEC-01 residual: reachability was fixed without the rule)

- **Severity**: Medium
- **Location**:
  - `academy-web/src/middleware.ts:64` — `if (pathname === '/api/certificate/verify') return true`
  - `academy-web/src/lib/edge-rate-limit-policy.ts:32-82` — rules map contains `POST:/api/leads`, `.../unsubscribe`, `.../otp`, `.../verify`, `GET|POST:/api/auth/identity/start`, `GET:/auth/callback` — **no `GET:/api/certificate/verify`**
  - `academy-web/src/app/(site)/api/certificate/verify/route.ts:19-29` — `const db = academyDb(); const { data, error } = await db.from('course_certificates')...eq('certificate_number', number).maybeSingle()` on every request
- **Description**: the 2026-09-11 review (SEC-01) prescribed two paired edits: allowlist the endpoint in middleware **and** add a `GET:/api/certificate/verify` rule to the edge policy. Commit `7248bf2 security: allow public certificate verification endpoint` applied only the middleware half. The endpoint is now public on a platform whose founder has switched SEO on; each hit is an unthrottled, unauthenticated Durable-Object-free pass-through to a PostgREST single-row lookup. Enumeration of the 128-bit number is infeasible and the response leaks no PII, but per-request DB cost is unbounded and the outer worker adds no marker (the route itself never checks one).
- **Attack scenario**: a cheap scripted loop (single IP or rotating IPs) drives sustained DB load through Pool A's dedicated PostgREST (shared infra capacity), degrading sign-in and progress for real learners; the DO limiter cannot see the route at all.
- **Previously reported**: yes — 2026-09-11 SEC-01, rate-limit half **previously reported — still open** (reachability half fixed in `7248bf2`; see "Closed since last review").
- **Recommended fix**: add a `GET:/api/certificate/verify` rule (e.g. actor 30/min, global 600/min) to `edge-rate-limit-policy.ts:32-82` so the DO marker/check path covers it; add the matching policy test.
- **Effort**: S

### AC-SEC-03 — Shared Pool A `service_role` retains `grant all` on core Academy learner tables (users, node_progress, attempt, leads)

- **Severity**: Medium (defense-in-depth / cross-product blast radius)
- **Location**:
  - `academy-web/supabase/migrations/0001_academy_schema.sql:45-46` — `grant usage on schema academy to service_role; grant all on academy.leads to service_role;`
  - `academy-web/supabase/migrations/0002_accounts_and_progress.sql:77-78` — `grant all on academy.users to service_role; grant all on academy.node_progress to service_role;`
  - `academy-web/supabase/migrations/0005_attempt.sql:133-135` — `grant all on academy.attempt to service_role;` plus execute on `issue_attempt`/`consume_attempt`
  - Later boundary migrations revoked `service_role` on consent/appeals/privacy/staff/entitlement/activation tables (0016:28, 0017:298,491, 0030:40-53) but never on these four core tables; Academy itself no longer uses `service_role` anywhere (dedicated `academy_runtime` API path, `academy-db-core.ts:88-104`).
- **Description**: `service_role` on shared Pool A is the key held by every sibling product (Crux/STAR/Forge) server side and bypasses RLS (Academy's RLS is zero-policy default-deny, which does not bind bypassrls roles). Any of those products — or any leak of the shared service-role key — can read learner PII (`users` includes email), read/forge `node_progress`, and insert/consume `attempt` rows directly, bypassing every SQL-side invariant (dwell time, quota, epoch) that Academy enforces through its RPCs. The dedicated-boundary design (0019) and the 0030 cleanups clearly intended to end this exposure; the earliest four grants were left behind.
- **Attack scenario**: compromise or SSRF/code-exec in any sibling Pool A product yields read/write on Academy learner data and assessment attempts without touching an Academy surface or leaving Academy audit trails.
- **Previously reported**: no as such — the same theme was 2026-09-05 SEC-ACADEMY-020 (staff tables; fixed) and SEC-ACADEMY-016 (runtime role; fixed); the core-table `service_role` grants were not listed in either. **New finding.**
- **Recommended fix**: one follow-up migration revoking `service_role` on `academy.users`, `academy.node_progress`, `academy.attempt`, `academy.leads`, schema usage, and the legacy RPC grants (rehearsed per the migration transaction policy); confirm nothing in `src/`, `worker/`, `ops/`, `scripts/` still connects as `service_role` (grep says none).
- **Effort**: S

### AC-SEC-04 — Production tree pins `next@15.5.22` (npm audit: critical) and `sharp@0.35.2` (high); both advisories unreachable as deployed

- **Severity**: Medium (tooling-critical, context-low; one config line from reachable)
- **Location**:
  - `academy-web/package.json:36` — `"next": "^15.5.22"`; `academy-web/package-lock.json` — `node_modules/next 15.5.22`
  - `academy-web/package.json:69` — overrides `"sharp": "0.35.2"`
  - `academy-web/next.config.ts:6-46` — no `images.formats` config anywhere (AVIF never enabled)
  - `npm audit --omit=dev --package-lock-only`: `next 9.5.6-canary.0 - 15.5.23` critical (GHSA-p293-qw3h-jr36 "Unauthenticated RCE on windows-hosted servers", GHSA-2xp9-vwfh-vxw4 "Unauthenticated RCE in Image Optimization API when AVIF files are used"), `sharp <0.35.4` high (libheif GHSA-g89c-p67h-r497 / GHSA-2jg2-4ch7-h545 via GHSA-rgj7-g3m4-5g8c). Fixed in next 15.5.24 per the August 2026 Next.js security release.
- **Description**: applicability analysis. (a) GHSA-p293-qw3h-jr36 (CVE-2026-75604) is a Windows-filesystem path traversal; Academy deploys to Cloudflare Workers via OpenNext (Linux/workerd) and dev machines here are macOS — not reachable. (b) GHSA-2xp9-vwfh-vxw4 requires `image/avif` in `images.formats`; this app never configures formats (defaults exclude AVIF), so `/_next/image` never routes AVIF decoding into sharp/libheif — not reachable as configured, and sharp is not part of the Worker bundle. (c) The patched releases disable AVIF rather than fix libheif, so the sharp/libheif residual persists regardless. The residual risk is one innocent-looking config line (`images: { formats: [..., 'image/avif'] }`) turning a critical on, and audit tooling that will stay red — normalizing ignored audits — plus a trivially available fix.
- **Attack scenario**: none today; becomes an unauthenticated-RCE path only if AVIF formats are enabled or the app is ever hosted on Windows.
- **Previously reported**: no (advisories postdate 2026-09-11; prior audit was clean).
- **Recommended fix**: bump `next` to ≥15.5.24 (`npm audit fix` reports it non-breaking) and the sharp override to ≥0.35.4; run the existing workerd/build gates; add a comment in `next.config.ts` warning that enabling AVIF formats re-opens the image-optimization surface until sharp/libheif are clean.
- **Effort**: S

### AC-SEC-05 — Edge-marker enforcement in `/api/auth/otp` and `/api/auth/verify` is unreachable dead code

- **Severity**: Low
- **Location**:
  - `academy-web/src/app/(site)/api/auth/otp/route.ts:18-27` — `if (!legacyDirectOtpFixtureAllowedForRequest(request)) { return ...503 }` immediately followed by `if (!legacyDirectOtpFixtureAllowedForRequest(request) && !await hasEdgeRateLimitMarker(...)) { return ...503 }`
  - identical pattern at `academy-web/src/app/(site)/api/auth/verify/route.ts:17-25`
- **Description**: the second condition can never be true — the first `if` already returned for exactly the negation. In practice these routes are production-dead (fixture gate 503s first), so there is no live exposure; but the code (and the 2026-09-11 mutation table) reads as "marker-gated" when no marker check can ever execute. If the fixture gate is ever loosened or reordered, these OTP endpoints would run with silently inert marker enforcement while the DO rules still exist in the policy map.
- **Attack scenario**: latent only; future refactor re-enables the legacy OTP fixture path without edge admission enforcement.
- **Previously reported**: no.
- **Recommended fix**: delete the dead second `if` (or restructure to `if (!allowed && !marker)` in a single gate evaluated before the fixture 503), and fix the route docstrings.
- **Effort**: S

### AC-SEC-06 — `/admin/courses` page shell renders for any authenticated learner (API is owner-gated, the page is not)

- **Severity**: Low
- **Location**: `academy-web/src/app/(site)/admin/courses/page.tsx:1` — `'use client'` with no server-side staff gate; contrast `academy-web/src/lib/staff/authorization.ts:19-24` (`requireInternalContentStaff()` → `notFound()` used by every `/player` page).
- **Description**: middleware only requires a session cookie for this path (`src/middleware.ts:45-66` — not public); any signed-in learner can load the management UI shell (and its JS), which then gets 401/403 from `/api/admin/courses` (`requireOwner()`, `api/admin/courses/route.ts:13-19`). No data exposure, but the surface's existence and layout are disclosed to all learners, and the gate pattern is inconsistent with the internal-surface convention.
- **Attack scenario**: reconnaissance only.
- **Previously reported**: no (page landed 2026-09-11..16 window).
- **Recommended fix**: convert the page to a server component that runs a `requireOwner`-equivalent (`currentUser` + `hasStaffRole('owner')` → `notFound()`) before rendering the client island, matching `/player`.
- **Effort**: S

### AC-SEC-07 — Migration 0039 grants `DELETE` on `course_settings` to `academy_runtime` with no code path using it

- **Severity**: Low
- **Location**: `academy-web/supabase/migrations/0039_course_settings.sql:30` — `grant select, insert, update, delete on academy.course_settings to academy_runtime;` while both admin handlers only upsert (`api/admin/courses/[slug]/route.ts:56-59, 82-89`).
- **Description**: least-privilege deviation re-introducing (in miniature) the class closed by 0030/SEC-ACADEMY-016: a runtime-role secret leak plus PostgREST reach could hard-delete settings rows (including the `retired` flag that is supposed to remove a course). RLS default-deny and the `revoke ... from public, anon, authenticated, service_role` (0039:28-29) are correct.
- **Attack scenario**: requires the runtime JWT secret or worker compromise; impact is integrity of the visibility control, not learner data.
- **Previously reported**: no.
- **Recommended fix**: `revoke delete on academy.course_settings from academy_runtime` in the next migration batch (retire stays an upsert).
- **Effort**: S

### AC-SEC-08 — Identity lifecycle secrets wired into the Worker are absent from the secret registry and `.env.example`

- **Severity**: Low
- **Location**:
  - `academy-web/worker.ts:19-29` — `IDENTITY_LIFECYCLE_CLIENT_ASSERTION_PRIVATE_JWK`, `IDENTITY_LIFECYCLE_PUBLISHER_ENDPOINT`, `IDENTITY_LIFECYCLE_CLIENT_ASSERTION_AUDIENCE`, `IDENTITY_LIFECYCLE_EVENT_AUDIENCE`, verification key-set document, etc.
  - `docs/maintenance/academy-secret-registry.md:19-31` — inventory (status 2026-09-03) has no `IDENTITY_LIFECYCLE_*` row; `academy-web/.env.example` documents none of them either.
- **Description**: the lifecycle pull runtime (`worker/identity-lifecycle-runtime.ts:72-132`) validates a canonical private JWK etc. and is cron-wired (`wrangler.jsonc:13` `*/5 * * * *`), but custody/rotation documentation was never extended. The registry's own rules ("records distinguish runtime secret…; rotation pairing") are unmet for these values.
- **Attack scenario**: operational — custody loss or rotation of the lifecycle signing key without a documented record; no direct attacker path.
- **Previously reported**: no.
- **Recommended fix**: add registry rows (private JWK = secret; endpoints/audiences = config) with rotation pairing, and document the env names in `.env.example` (empty, server-only) as done for other boundaries.
- **Effort**: S

### AC-SEC-09 — Server-side session revocation on sign-out is best-effort only

- **Severity**: Low · **Previously reported**: yes — 2026-09-11 SEC-02 — **still open**
- **Location**: `academy-web/src/app/(site)/api/auth/sign-out/route.ts:41-47` — `try { if (!sessionId || !sessionStore) revocation = 'not-confirmed'; else await sessionStore.revoke(sessionId) } catch { revocation = 'not-confirmed' }` then `ok:true` is still returned.
- **Description**: unchanged contract: on store failure the durable session stays valid up to its TTL while the browser is told sign-out succeeded. F-1 (commit `0fecdba`) added the SSO end-session URL (`:53-58`) — an improvement for shared machines, but the per-session revocation gap remains.
- **Attack scenario**: stolen opaque `__Host-academy_session` keeps working after the victim signs out, until expiry.
- **Recommended fix**: as before — async retry via Durable Object queue, sliding TTL, or a per-principal revocation RPC wired to a "sign out everywhere" action.
- **Effort**: M

### AC-SEC-10 — Worker invocation logs (10% sampling) may persist full request URLs incl. `?code/state` and `?number=`

- **Severity**: Low · **Previously reported**: yes — 2026-09-11 SEC-03 and 2026-09-05 SEC-ACADEMY-026 (UNCERTAIN) — **still open**
- **Location**: `academy-web/wrangler.jsonc:27-35` — `"logs": { "enabled": true, "head_sampling_rate": 0.1, "invocation_logs": true }`; `src/app/(site)/auth/callback/route.ts:29-33` (GET with `?code&state`).
- **Description**: unchanged; bounded exposure (one-time codes, browser-binding) but counter to the runbook's log rule. Now that `NEXT_PUBLIC_SEARCH_INDEXING=on` and the verify endpoint is public, sampled `?number=` URLs also land in logs.
- **Recommended fix**: `invocation_logs: false` once operational need passes, or record the Cloudflare-side retention in the secret registry; keep the callback contract as-is.
- **Effort**: S

### AC-SEC-11 — Client-assertion conformance tests import producer sources from a hard-coded `/private/tmp` path

- **Severity**: Low (test infrastructure) · **Previously reported**: yes — 2026-09-11 SEC-04 — **still open**
- **Location**: `academy-web/tests/unit/identity-client-assertion-conformance.test.ts:31` and `tests/unit/identity-client-assertion-registration-rehearsal.test.ts:16` — `const CANONICAL_IDENTITY_CONTROL = '/private/tmp/identity-security-correction-cde63a58'`.
- **Description**: unchanged; these suites fail on every fresh machine, training contributors to ignore the suite that proves the client-assertion boundary against the producer contract.
- **Recommended fix**: env-configurable producer path + skip-with-mark when absent.
- **Effort**: S

### AC-SEC-12 — Lead consent recorded for any submitted email without ownership proof or double opt-in; withdrawn consent can be re-granted

- **Severity**: Low (email sending remains disabled) · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-015 — **still open**
- **Location**: `academy-web/src/app/(site)/api/leads/route.ts:17-25` (`consent: z.literal(true)` shape-only), `:63-79` (RPC always `granted`); `supabase/migrations/0017_privacy_retention_and_appeals.sql:103-129` (update branch clears `marketing_withdrawn_at`, re-issues token).
- **Description**: unchanged; PDPA evidence quality issue the day marketing email turns on.
- **Recommended fix**: double opt-in or treat withdrawn leads as no-op; Turnstile before public launch.
- **Effort**: M

### AC-SEC-13 — Dedicated-API boundary integration tests silently skip without env (`describe.skipIf`)

- **Severity**: Low · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-018 — **still open**
- **Location**: `academy-web/tests/integration/academy-runtime-api.test.ts:34`, `tests/integration/academy-retention-api.test.ts:42` — `describe.skipIf(!hasDedicatedApi)(...)`.
- **Description**: unchanged; `npm test` stays green while RLS/role-isolation negative tests never run.
- **Recommended fix**: fail-when-env-missing release profile; report run/skip counts in evidence packets.
- **Effort**: S

### AC-SEC-14 — Operator superuser scripts build SQL by string interpolation

- **Severity**: Low · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-019 — **still open**
- **Location**: `academy-web/scripts/academy-production-p1-p7-host.mjs:76-101` (subject/email interpolated; guarded by the strict `fixture()` checks), `scripts/academy-poola-production-producer.mjs:247` (`p['sql']` executed directly), `:243` (`scratch` interpolated, UUID-checked client-side only).
- **Description**: unchanged; safe at HEAD only because of regex/equality pre-checks on the operator path.
- **Recommended fix**: psql `-v` variables or a parameterized pg client, as `manage-staff-role.mjs` already does.
- **Effort**: S

### AC-SEC-15 — Capstone banks are 3–5 questions, so every attempt still serves the full bank (documented accepted residual)

- **Severity**: Informational · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-006 residual (DB-side ceiling/backoff/clamp landed; content expansion pending) — **still open (content dependency)**
- **Location**: `academy-web/src/lib/course/assessment-policy.ts:31-33` — `assessmentServeCount(bankSize) = max(1, min(bankSize, 5))`; comment at `api/attempts/route.ts:100-101` ("คลังปัจจุบันมี 3–5 ข้อ จึงเสิร์ฟได้ครบ").
- **Description**: SQL-enforced daily cap, consecutive-failure backoff, production quota clamp, dwell guard, and per-attempt remap are all in place and unchanged; what remains is question-text sharing between learners until Crucible banks grow past the serve ceiling (≥15 MCQs per capstone for full closure).
- **Recommended fix**: content-lane expansion (W-content) as already planned; no code change.
- **Effort**: L (content)

### AC-SEC-16 — CSP permits `'unsafe-inline'` for styles

- **Severity**: Informational · **Previously reported**: yes — 2026-09-11 SEC-05 — **still open**
- **Location**: `academy-web/src/lib/edge-security-headers.ts:9` — `"style-src 'self' 'unsafe-inline'"` (also `public/_headers` and `src/lib/content-security-policy.ts:30`).
- **Description**: unchanged; script policy is nonce + `strict-dynamic` with no `unsafe-eval` (`middleware.ts:83-91`), and the only two HTML sinks remain the escaped JSON-LD block (`(localized)/courses/[slug]/[locale]/page.tsx:84-88`, `<` escaped) and the constant theme script. Style-attribute exfiltration is the residual channel.
- **Recommended fix**: none required now; nonce-based styles if the framework ever supports it cheaply.
- **Effort**: n/a

### AC-SEC-17 — Stale middleware comment claims per-request session renewal

- **Severity**: Informational · **Previously reported**: yes — 2026-09-11 SEC-06 — **still open**
- **Location**: `academy-web/src/middleware.ts:116-117` — "ต่ออายุ session ทุก request…".
- **Description**: describes the retired Supabase-cookie flow; the production branch is a syntactic prefilter only (correctly documented at `middleware.ts:155-157`).
- **Recommended fix**: reword the comment.
- **Effort**: S

### AC-SEC-18 — Diagnostic worker validates `cf-access-jwt-assertion` by regex only (no signature verification)

- **Severity**: Informational · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-021 — **still open**
- **Location**: `academy-web/worker/identity-client-assertion-secret-diagnostic.ts:229-237` — nonce constant-time gate plus `ACCESS_ASSERTION.test(accessAssertion)`.
- **Description**: unchanged; the nonce remains the real gate, the JWT check adds no assurance, and the runbook should not describe it as Access-verified.
- **Recommended fix**: verify against team JWKS or delete the pseudo-check.
- **Effort**: S

### AC-SEC-19 — `challengeVersion` fingerprint is FNV-1a 32-bit

- **Severity**: Informational · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-022 — **still open**
- **Location**: `academy-web/src/lib/simulation/types.ts:186-204` (FNV-1a loop), consumed at `api/progress/route.ts:453`.
- **Description**: unchanged; collisions would weaken appeal/certificate evidence attribution, no attacker leverage.
- **Recommended fix**: SHA-256 of canonical JSON via WebCrypto; keep FNV for the UI label only.
- **Effort**: S

### AC-SEC-20 — PDPA rights beyond unsubscribe remain manual operator SQL (no export/self-service deletion path)

- **Severity**: Informational · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-023 — **still open**
- **Location**: `academy-web/docs/privacy/request-runbook.md:39-43` (manual mapping list).
- **Description**: unchanged; the erasure-resurrection defect it used to compound with (SEC-ACADEMY-004) is closed (read-only `findActiveUser`), but export/deletion are still operator-runbook procedures without a reviewed code path, and sessions are still absent from the runbook's subject map.
- **Recommended fix**: operator-run export + session-revoking deletion procedure before public launch at scale.
- **Effort**: M

### AC-SEC-21 — Signed identity production-authority record remains expired (fail-closed)

- **Severity**: Informational · **Previously reported**: yes — 2026-09-05 SEC-ACADEMY-024 — **still open**
- **Location**: `academy-web/config/identity-production-authority-2951f5d.json` — `expiresAt: 2026-09-05T03:00:00.000Z` (only record in `config/`).
- **Description**: unchanged; scripts gated on it correctly refuse until re-observation/re-sign. Operational blocker only, not an exposure.
- **Recommended fix**: re-observe + re-sign per the sensitive-operation policy.
- **Effort**: S

### AC-SEC-22 — Stale wrangler comment contradicts the shipped SEO switch

- **Severity**: Informational · **Previously reported**: no
- **Location**: `academy-web/wrangler.jsonc:36-41` — comment "preview: ยังไม่เปิดให้ค้นเจอ และยังไม่เปิดระบบบัญชี" sits directly above `"NEXT_PUBLIC_SEARCH_INDEXING": "on"`.
- **Description**: the var is the public-launch setting (commit `c1f614a`); the comment describes the pre-launch state. An operator reading the comment may believe indexing is off. (`robots.ts`/`sitemap.ts` correctly honor the flag; private paths stay disallowed/noindex.)
- **Recommended fix**: update the comment.
- **Effort**: S

### AC-SEC-23 — Gitleaks disposition: all 132 findings benign; local machine holds real secrets in ignored paths

- **Severity**: Informational · **Previously reported**: no (first full gitleaks run in a review of this repo)
- **Location**: hits concentrated in `academy-web/supabase/.temp/start-secrets/**` (52+private key, local supabase kong secrets), `academy-web/.env.local` (3), `academy-web/.dev.vars` (2), `academy-web/.open-next/**` (build output embedding env, 26), `.mimosa/**` (agent hook state, 8), test fixtures (`*.example.test` JWTs). All tracked-file hits are identifiers, not credentials.
- **Description**: `.gitignore` coverage is correct (`.env*`, `.dev.vars*`, `supabase/.temp/`, `.open-next/` all ignored; verified via `git check-ignore`). Two hygiene notes: (1) `reports/reviews/academy-canonical-domain-deployment-receipt-20260823.json:55-60` carries Cloudflare Access application/policy/workers-domain IDs — acceptable as non-secret identifiers per the registry, but they do trip scanners; (2) the dev machine's `.open-next/` bundle and `.env.local` hold live-looking values with no expiry — machine-compromise scope, not repo exposure.
- **Recommended fix**: optionally add a gitleaks allowlist entry for the UUID-pattern Cloudflare IDs to keep future scans signal-rich; no repo change required.
- **Effort**: S

## Closed since last review

Verified at HEAD `8d5f5f2` (from the 2026-09-05 checklist and 2026-09-11 in-depth review):

- **SEC-ACADEMY-001** (identity start/callback unthrottled): rules for `GET|POST /api/auth/identity/start` + `GET /auth/callback` (`edge-rate-limit-policy.ts:65-81`), fail-closed marker gates (`start/route.ts:21-23,56-58`; `auth/callback/route.ts:30-33`), DB outstanding-transaction cap (0025 family) — closed in code.
- **SEC-ACADEMY-002** (middleware production redirect loop): production prefilter branch at `middleware.ts:140-158` — closed (verified 2026-09-08 per checklist).
- **SEC-ACADEMY-003** (lifecycle not reaching Academy): lifecycle pull wired into `worker.ts:57-59` scheduled handler with `*/5 * * * *` cron and strict fail-closed config (`worker/identity-lifecycle-runtime.ts:72-141`); activation re-checked per request via `findActiveUser` (`users.ts:119-141`). Closed in code — production enablement still depends on Identity Control releasing publisher endpoint/audience values (runtime returns `disabled` without them), which static review cannot verify.
- **SEC-ACADEMY-004** (request-path profile writes): `findActiveUser` is find-only, pins canonical issuer, requires active `service_activation` (`users.ts:114-141`); `findOrCreateUser` retained only for exchange completion — closed.
- **SEC-ACADEMY-005** (unbounded `formData()`): bounded `readIdentityStartForm` before transaction creation — closed.
- **SEC-ACADEMY-006 code half** (capstone brute force): SQL daily ceiling, consecutive-failure backoff, production quota clamp, dwell guard (0033), serve-count ceiling (`assessment-policy.ts:31-33`) — closed in code; content residual re-reported as AC-SEC-015.
- **SEC-ACADEMY-007** (trailing-slash rule bypass): canonical admission (`edge-rate-limit-policy.ts:89-128`) rejects traversal/encoding disguises, removes production in-memory fallback — closed.
- **SEC-ACADEMY-008** (per-IP-only limits): IPv6 /64 grouping, per-target and global ceilings (`edge-rate-limit-policy.ts:149-315`; enforcement `:51-91`) — closed.
- **SEC-ACADEMY-009** (session ids plaintext at rest): SHA-256 digests on the wire and at rest, migration 0034 cutover 2026-09-06/07 with evidence — closed.
- **SEC-ACADEMY-010** (bearer media grants): grants sign a session digest; worker compares constant-time before R2 (`media/grant.ts:36-66`; `media/worker-delivery.ts:43-50`) — closed, deployed 2026-09-07.
- **SEC-ACADEMY-011** (cookie prefixes): `__Host-academy_session` + `__Host-academy_identity_binding_<state>` with exact-one parsers (`auth/session-cookie.ts:1-5`; `identity/session-store.ts:226-230`) — closed.
- **SEC-ACADEMY-012** (URL scheme injection): content URL fields now `refine(isSafeContentUrl)` / `refine(isSafeExternalContentUrl)` (`content/course-loader.ts:320,330,338`; `content/content-url-policy.ts`) — closed.
- **SEC-ACADEMY-013** (CSP `unsafe-inline` scripts): per-request nonce + `strict-dynamic` in middleware, caller CSP stripped, edge header preservation logic (`middleware.ts:74-93`; `edge-security-headers.ts:29-46`) — closed.
- **SEC-ACADEMY-014** (static assets bypass): `public/_headers` baseline set, `run_worker_first: ["/media/*"]` (`wrangler.jsonc:17`), asset guard wired into the Cloudflare build (`scripts/build-cloudflare.sh:16` runs `asset-guard`) — closed.
- **SEC-ACADEMY-016/020** (runtime + shared `service_role` over entitlement/staff surfaces): 0030 revokes staff/entitlement/activation from `service_role` and removes runtime direct writes — closed for those tables; core-table residuals re-reported as AC-SEC-03 (service_role) and AC-SEC-07 (new DELETE grant).
- **SEC-ACADEMY-017** (no per-account quota on learning mutations): `checkAuthenticatedMutationQuota` wired into `/api/progress:181-186`, `/api/progress/reset:93`, `/api/practice/simulation:88` — closed.
- **2026-09-11 SEC-01, reachability half**: `/api/certificate/verify` allowlisted (`middleware.ts:61-64`, commit `7248bf2`) — rate-limit half still open (AC-SEC-02).
- **F-1 (cross-product review)**: product sign-out now returns the Identity SSO end-session URL for the browser to invoke (`sign-out/route.ts:48-58`; client `account-response-client.ts:84-123` bounds it to a short https string) — improvement, no finding.
- **SEC-ACADEMY-027** (raw `workers.dev` bypass): host policy gate remains first in `worker.ts:46` — stays closed.

## Unverified observations

- **Runtime/deployment state**: static review cannot confirm production values of `IDENTITY_LIFECYCLE_ENABLED`, `INTERNAL_SURFACES`, `ACADEMY_SERVED_HOSTS`, Worker secret presence, or whether Cloudflare Access still fronts the canonical host now that SEO is on (`c1f614a` implies public). The code fails closed without these, so absence degrades to 503/404, not exposure.
- **Cloudflare Workers Logs field retention** (AC-SEC-10): whether `$workers.event.request.url` includes query strings, and log retention, remain externally unverifiable — carried over UNCERTAIN from 2026-09-05.
- **Migration 0039 applied to production**: repo proves the migration and code, not the DB state; if unapplied, the admin API 503s (`course_settings` read error), which is fail-closed.
- **Full `npm audit` (dev tree)**: out of the allowed network scope (only `--omit=dev` permitted); the 2026-09-05 `qs` dev-only advisories could not be re-checked.
- **`.open-next/` working-tree bundle** embeds local env values (gitleaks hits); treated as machine hygiene, not repo exposure — the directory is gitignored.
- **Identity `verificationKeys.active: null`** in `consumer-policy.ts` remains a policy mirror; the live key set is a pinned Worker secret per the plan checkpoint — not verifiable statically.

## Scope and coverage

- **academy-web app surface**: all route handlers under `src/app/(site)/api/**` (auth start/otp/verify/me/sign-out/callback, attempts, progress, progress/reset, explanations, leads, leads/unsubscribe, practice/simulation, certificate issue/verify/pdf, courses skill-map, admin courses list/patch/delete), `course-media/[assetId]`, all pages/layouts in `src/app/**` (public, localized, learner, player, admin, unsubscribe, privacy), `middleware.ts`, `robots.ts`, `sitemap.ts`.
- **Libraries**: `lib/auth/**`, `lib/identity/**` (runtime-browser-flow, production-runtime admission + client-assertion + result-verification spot checks, transaction/session stores, consumer-policy, lifecycle runtime), `lib/media/**`, `lib/db/**`, `lib/http/**` (bounded-body, mutation-security, strict-json), `lib/edge-*` (host policy, rate-limit policy/enforcement, security headers, content-security-policy), `lib/account/**`, `lib/course/**` (incl. new settings/visibility), `lib/staff/**`, `lib/content/**` (answer-key, public-lesson, course-loader URL refines, registry), `lib/player/**` (internal-only grading), `lib/seo.ts`.
- **Workers/ops**: `worker.ts`, `worker/edge-rate-limiter-do.ts`, `worker/identity-lifecycle-runtime.ts`, `worker/identity-client-assertion-secret-diagnostic.ts`, `ops/academy-retention-worker/**`, `wrangler.jsonc`, `public/_headers`, `next.config.ts`, `package.json`/lockfile, `.env.example`, `.gitignore`.
- **Database**: all 39 migrations (RLS default-deny posture, grant/revoke ledger incl. 0030 cleanups and new 0039), `supabase/privileged/academy-data-api-roles.sql` (from prior verification, unchanged in window).
- **Docs/spec**: `AGENTS.md` (root), `plans/active_plan.md` (checkpoint context), `docs/maintenance/README.md` + secret registry + runbook pointers, director identity contract references consulted via prior-review citations; spec conformance checked (provider-neutral: no vendor raw URLs in `src/` beyond the documented workers.dev rationale in `edge-host-policy.ts` comments; no provider model names; no new recurring-cost services).
- **Not covered**: executed tests/builds, live hosts, DB inspection, `node_modules`, `.mimosa` internals, content JSON semantics beyond security-relevant schema checks (prior suites cover), scripts under `academy-web/scripts/**` beyond the two operator paths re-checked.
