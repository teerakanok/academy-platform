# In-depth security review — Academy (2026-09-11)

- Scope: full stack of `academy-web` (Next.js on Cloudflare Workers via OpenNext), dedicated data API (PostgREST), retention worker, deployment config.
- Reviewed tree: branch `handoff/claude-20260909-academy`, HEAD `b568a73` (== `origin/main`).
- Method: static analysis of all request surfaces, SQL migrations, and worker/deployment config; local unit test run. Read-only; no production mutations; no secret values in this report.
- Reviewer: independent security reviewer (delegated), 2026-09-10/11.

## Executive summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 3 |
| Informational | 2 |

No exploitable path was found to read answer keys, forge assessment results, obtain a certificate without server-graded evidence, bypass course entitlement, or touch learner data without an authenticated, entitled session. The single Medium finding is a fail-closed availability defect in the new (0038) public certificate-verification feature, not a data exposure. The remaining findings are hardening and evidence-quality items.

The codebase shows an unusually disciplined security posture: answer keys are behind `server-only` with structural public projections, assessment integrity invariants are enforced in SQL (not app code), the browser never holds a writable claim on progress, every table is RLS default-deny with an explicit role-grant allowlist, and the worker rejects non-canonical hosts before any handler runs.

## Findings

### SEC-01 — Public certificate verification endpoint is not publicly reachable (and has no rate-limit rule)

- Severity: **Medium**
- Files:
  - `academy-web/src/middleware.ts:23-62` (`PUBLIC_EXACT` / `isPublic` allowlist lacks `/api/certificate/verify`)
  - `academy-web/src/app/(site)/api/certificate/verify/route.ts:7-16` (docstring: "Public verification per the certificate claim: status only …")
  - `academy-web/src/lib/edge-rate-limit-policy.ts:32-82` (rules map has no entry for this route)
  - Commit `b568a73` added the route but did not modify `src/middleware.ts`.
- Description: the route implements the public verification surface of the 0038 certificate system and is designed for anonymous third parties (employers). The edge middleware treat every non-allowlisted `/api/...` path as protected: in the production branch (`src/middleware.ts:136-155`) an anonymous request receives `401 {"ok":false,"error":"ต้องเข้าสู่ระบบก่อน"}` before the route executes. The verification result itself is correctly privacy-safe (status, course slug, course version, issued date; no learner identity — `verify/route.ts:30-41`), and it is `no-store` + `noindex`.
- Attack/failure scenario: a certificate holder shares the 32-hex number; the verifier without an Academy account (behind Cloudflare Access or not) cannot validate it, so the certificate's externally verifiable value — the point of W4 — silently does not exist in production. Conversely, if someone later "fixes" reachability by widening the middleware without adding a rule, the endpoint becomes an unthrottled public DB lookup keyed by a 128-bit number (enumeration is infeasible, but per-request DB cost is not bounded).
- Recommended fix: add `/api/certificate/verify` to the middleware public allowlist (exact match), and add a `GET:/api/certificate/verify` rule to `edge-rate-limit-policy.ts` (e.g. actor 30/min, global 600/min) so the DO marker/check path covers it. Keep `noindex`/`no-store` and the `^[0-9a-f]{32}$` input check as-is.
- Effort: S (two small allowlist edits + one test each).

### SEC-02 — Server-side session revocation on sign-out is best-effort only

- Severity: **Low**
- Files: `academy-web/src/app/(site)/api/auth/sign-out/route.ts:38-50`; `academy-web/src/lib/identity/postgres-session-store.ts:21-22` (default TTL 24 h, max 30 d).
- Description: sign-out revokes the durable session only when the Postgres RPC succeeds; on store failure it still returns `ok:true` with `revocation:'not-confirmed'` and clears cookies. The UI surfaces a notice (`AccountMenu.tsx:79`), so this is a deliberate current-device contract, but a session id that left the browser (XSS elsewhere, log/header capture, shared device) remains server-valid for up to the 24 h TTL even after the victim signs out.
- Attack scenario: attacker obtains the opaque `__Host-academy_session` value; victim notices, signs out; attacker's copy keeps working until expiry because no re-authentication bound the theft to the device.
- Recommended fix: retry revocation asynchronously (queue via Durable Object or the existing lifecycle path) when the RPC fails, and/or shorten the durable TTL with a sliding read-refresh; a "sign out everywhere" action would need a per-principal revocation RPC (already present in the DB layer as `revoke_identity_sessions_for_principal`, migration 0032).
- Effort: M.

### SEC-03 — Worker invocation logs may persist sensitive URL query strings

- Severity: **Low**
- Files: `academy-web/wrangler.jsonc:27-35` (`observability.logs.invocation_logs: true`, `head_sampling_rate: 0.1`); `academy-web/src/app/(site)/auth/callback/route.ts:29-107` (callback consumes `?code=...&state=...`); `verify/route.ts:11` (`?number=`).
- Description: invocation logs can capture full request URLs. The auth callback deliberately carries only single-use code + state (documented at `auth/callback/route.ts:16-27`), so exposure is bounded, but one-time codes, state refs, and certificate numbers would sit in sampled logs with Cloudflare-side retention.
- Attack scenario: low — a captured `code` is already consumed and bound to a browser-binding cookie; a certificate number leaks only course slug/date. Risk is log-reader scope creep rather than direct compromise.
- Recommended fix: confirm the worker observability config does not include request query strings (or set `invocation_logs: false` once operational need passes); alternatively move the callback contract to POST body if Identity Control ever allows it.
- Effort: S.

### SEC-04 — Client-assertion conformance tests fail outside one machine, weakening boundary evidence

- Severity: **Low** (test infrastructure, not runtime)
- Files: `academy-web/tests/unit/identity-client-assertion-registration-rehearsal.test.ts:305-315` and `tests/unit/identity-client-assertion-conformance.test.ts` (import Identity Control sources from hard-coded `/private/tmp/identity-security-correction-cde63a58/...`).
- Description: local run result: **2560 passed / 11 failed / 2 skipped**; all 11 failures are these two files resolving a producer-repo path that exists only on a past build machine (`/private/tmp/identity-security-correction-cde63a58`, plus a second stale path `/private/tmp/academy-release-build-3f08bc0a` inside the vite error). Every other security-relevant suite (mutation-security, media delivery, adversarial sandbox, static asset boundary, middleware prefilter, host isolation, certificate issue) passes.
- Attack scenario: none directly; but a red build on fresh machines trains contributors to ignore failures in exactly the suite that proves the client-assertion boundary against the producer contract.
- Recommended fix: make the producer path configurable (env var pointing at the Identity Control checkout) and skip-with-mark when absent, instead of importing a absolute temp path.
- Effort: S.

### SEC-05 — CSP permits `'unsafe-inline'` for styles

- Severity: **Informational**
- File: `academy-web/src/lib/edge-security-headers.ts:9`.
- Description: `style-src 'self' 'unsafe-inline'` (needed for Tailwind/inline style attributes) while `script-src` is nonce + `strict-dynamic` with no `unsafe-eval` (`middleware.ts:70-89`, and the edge wrapper at `edge-security-headers.ts:26-46` preserves the nonce policy only when it is genuinely strict). Style injection exfiltration via `style` attributes is the residual channel; with React escaping and no HTML injection sink found (only two `dangerouslySetInnerHTML` uses: escaped JSON-LD at `src/app/(localized)/courses/[slug]/[locale]/page.tsx:87` and a static theme script at `ThemeBootstrapScript.tsx:8-11`), practical risk is minimal.
- Recommended fix: none required now; consider nonce-based styles if the framework ever supports it cheaply.
- Effort: n/a.

### SEC-06 — Stale middleware comment claims per-request session renewal that no longer exists

- Severity: **Informational**
- File: `academy-web/src/middleware.ts:112-114`.
- Description: the comment ("ต่ออายุ session ทุก request") describes the retired Supabase-cookie flow; the production branch performs only a syntactic cookie prefilter and no renewal. Documentation drift only — actual expiry is governed by the durable store TTL (24 h default). A future reader could wrongly assume middleware extends sessions.
- Recommended fix: reword the comment to match the opaque-session prefilter contract (already correctly stated at `middleware.ts:151-154`).
- Effort: S.

## Verified secure

### 1. Authentication

- Production identity is the Identity Control flow: browser gets only `code`+`state` (`auth/callback/route.ts:16-27`); PKCE verifier stays server-side in the Postgres transaction store (`postgres-transaction-store.ts`, migration 0025); code exchange is mTLS-style client-assertion signed ES256 with 120 s lifetime and fresh `jti` (`production-runtime.ts:234-259`, `client-assertion-provider.ts`); result verification checks issuer/audience/nonce/client with 30 s skew and 120 s max lifetime against a size- and shape-validated key set (`production-runtime.ts:261-296, 387-412`).
- Admission is fail-closed: the runtime exists only when `IDENTITY_RUNTIME_ENABLED/WIRED/RELEASE_APPROVAL` are all literally `true` plus canonical config values (`production-runtime.ts:171-196`); any malformed value collapses to `null` = no auth path.
- Session ids are 256-bit random, stored server-side as SHA-256 digests only (migration 0034; `postgres-session-store.ts:100-112`, `session-identifier.ts`); the cookie is an opaque id with `__Host-` prefix, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS (`session-cookie.ts:1-37`), and the raw-header parser rejects duplicate or malformed occurrences (`session-cookie.ts:46-77`).
- Durable validation on every privileged read: `currentUser()` resolves through `read_identity_session_digest` + `findActiveUser`, which additionally requires canonical issuer, well-formed subject, and `service_activation.status = 'active'` (`session.ts:91-118`, `users.ts:119-141`). The middleware explicitly documents itself as prefilter-only (`middleware.ts:151-154`).
- Legacy GoTrue OTP and the identity local fixture are double-gated (env flag + loopback/localhost origin + non-production NODE_ENV) so copied prod values cannot reactivate them (`legacy-direct-otp.ts:21-39`, `local-fixture.ts:32-58`).
- Sign-out clears both host and legacy cookies and attempts durable revocation (`api/auth/sign-out/route.ts:38-50`); GoTrue fixture path revokes the local refresh token with `scope:'local'` (`:57-73`).

### 2. Authorization

- Four explicit layers — account exists → service activation → course entitlement → node prerequisite — with distinct code owners (`account/access.ts:4-14`, `account/course-access.ts:17-71`). Entitlement is a DB RPC (`has_course_entitlement`), activation a table read; both fail closed to `unavailable` (503) on store errors, never to allow (`course-access.ts:31-47`).
- `authorizeCourseResource` (entitlement + DAG prerequisite via `nodeStatus`) is called on **every** content path checked: lesson page (`courses/[slug]/lessons/[nodeId]/page.tsx:33`), learn page (`learn/page.tsx:30`), attempts (`api/attempts/route.ts:76`), progress POST/GET (`api/progress/route.ts:188, 561`), practice simulation (`api/practice/simulation/route.ts:95`), explanations (`api/explanations/route.ts:52`), skill-map (`api/courses/[slug]/skill-map/route.ts:35`), certificate POST (`certificate/route.ts:104`), media grant issuance (`course-media/[assetId]/route.ts:23`), progress reset (course-level `getCourseAccess`, `api/progress/reset/route.ts:48, 100`).
- Direct-URL bypass: prerequisites are recomputed server-side from persisted progress (`roadmap.ts:40-48`); a locked node returns 403 (`deniedAccessStatus`), and node/slug must exist in the real registry before any write (`api/progress/route.ts:174-179`).
- Staff vs learner: staff roles are DB rows checked per request (`staff/authorization.ts:10-24`, migration 0018); the internal exam-player surface is 404 unless `INTERNAL_SURFACES=on` **and** the caller holds `content-ops` (`middleware.ts:96-98`, `internal-surface.ts:15-22`); operator entitlement changes run through least-privilege RPCs with mandatory audit references (migration 0030).

### 3. Assessment security

- Answer keys never cross to the browser: `answer-key.ts` is `server-only` (import from client code fails the build) and is the single entry to `correct`/`explanation` (`answer-key.ts:1-56`); lesson pages must pass `toPublicLesson` whose types structurally forbid answer fields (`public-lesson.ts:26-133`, enforced at type level by `tests/unit/public-lesson.test.ts`, 930 cases, and `*.test-d.ts`).
- Attempts: crypto-random sampling and per-attempt choice-key remap (`attempt.ts:116-166`); full grading snapshot (questions, key maps, answer keys, resolved simulations) stored server-side per attempt so mid-flight deploys cannot change rules (`api/attempts/route.ts:99-126`); responses contain only public forms (`:155-165`).
- Submission integrity: `consume_attempt` is one atomic UPDATE with ownership/context/expiry in the WHERE (0033 `migrations/0033_assessment_attempt_integrity.sql:261-364`); claim tokens prevent cross-request result overwrites (`commit_attempt_result`, migration 0013, re-verified above); malformed answer sets finalize the attempt as failed instead of freeing retries (`api/progress/route.ts:363-405`); prototype-pollution-style lookups are blocked by own-property checks and question-id allowlisting (`attempt.ts:212-232`).
- Dwell time, quota, daily cap, and repeat-failure backoff are enforced **in SQL**, with the app-supplied quota clamped to 3 in the DB when integrity is enforced (0033 `:126-259`); the app can only *lower* enforcement in local fixtures (`assessment-policy.ts:40-43`, `attempt-db.ts:25-34`).
- Result side channels: assessed surfaces return exactly `{ok, passed}` — no per-item signal (`api/progress/route.ts:505-507`); per-question results and simulation requirement outcomes for assessed/tested-out nodes are stripped from every browser-facing progress read (`public-progress.ts:18-54`); post-pass explanations come from the persisted attempt snapshot, not the current deploy (`api/explanations/route.ts:73-102`), and return explanations only, never keys (`:104-120`).

### 4. Certificate evidence chain (0038) — can it be gamed?

- Eligibility re-verifies, it does not trust status: every proof-bearing (capstone) node must have a `passed_attempt_id` **and** a still-existing attempt row matching user/course/node (`certificate-eligibility.ts:25-71`).
- The pointer is written only inside `commit_attempt_result` when the graded outcome is `passed:true` under the current claim token, with status/outcome consistency exceptions (migration 0013, `commit_attempt_result`); grading itself compares remapped client answers against the server-held snapshot (`api/progress/route.ts:361-412`). There is no client-declarable "completed" for assessed nodes anywhere in the write path.
- Blind brute force economics: all-correct capstone, ~1/1024 per try for 5 single-answer MCQs, against 3 attempts/30 min, 10/day, and escalating backoff (0033) — plus per-attempt crypto shuffle/remap and randomized simulation targets (`variables.ts`) making shared answers non-transferable. Not economically gameable.
- Issuance is idempotent (unique `(user_id, course_slug)` + conflict read-back, `certificate/route.ts:113-144`), the number is 128-bit random hex constrained at the table (`0038_course_certificates.sql:14-17`) and re-validated on verify (`verify/route.ts:12`); the evidence snapshot freezes counts and passed-attempt ids at issuance (`certificate-eligibility.ts:74-90`).
- The PDF is dependency-free, escapes PDF string syntax, and folds non-WinAnsi input to `?` (`certificate/pdf.ts:26-38`); download is learner-scoped, revoked certificates return 410, and the filename is built from registry slug + hex number only (`certificate/pdf/route.ts:14-49`).
- Verification response leaks no PII (`verify/route.ts:30-41`). Only defect is reachability (SEC-01).

### 5. API security — mutation coverage inventory

All mutation handlers in the tree (no `PUT`/`PATCH`/`DELETE` handlers exist; no `OPTIONS` handlers, hence no CORS surface):

| Endpoint | `validateMutationRequest` | Additional gates |
| --- | --- | --- |
| POST `/api/attempts` | `route.ts:48` (requireJson) | auth, bounded body, authorize, quota-in-SQL |
| POST `/api/auth/identity/start` | local path `route.ts:89`; production path `runtime-browser-flow.ts:138` | edge-rate marker (`:21/:57`), admission gate |
| POST `/api/auth/otp` | `route.ts:33` (fixture-gated 503 first) | edge marker, HTTPS transport check |
| POST `/api/auth/verify` | `route.ts:32` | edge marker, HTTPS transport check |
| POST `/api/auth/sign-out` | `route.ts:19/:34/:52` (all three branches) | — |
| POST `/api/courses/[slug]/certificate` | `route.ts:90` (requireJson) | auth, authorize, eligibility |
| POST `/api/leads` | `route.ts:33` (requireJson) | edge-rate marker (public form) |
| POST `/api/leads/unsubscribe` | `route.ts:19` (requireJson) | edge-rate marker |
| POST `/api/practice/simulation` | `route.ts:59` (requireJson) | auth, authenticated-quota, authorize |
| POST `/api/progress` | `route.ts:152` (requireJson) | auth, authenticated-quota, authorize, epoch |
| POST `/api/progress/reset` | `route.ts:77` | auth, authenticated-quota, course access, idempotent RPC |

- CSRF/origin: Origin is authoritative when present; Fetch Metadata `sec-fetch-site: same-origin` is the fallback; **missing both is rejected**, not a bypass (`mutation-security.ts:36-60`). Host for comparison comes from the request destination (never `X-Forwarded-Host`), and the outer worker already rejected any non-canonical host (`edge-host-policy.ts:35-52`, `worker.ts:46`).
- Rate limiting: fixed-window Durable Object counters store no IP/payload (`worker/edge-rate-limiter-do.ts:18-37`); actor identity is an HMAC of the CF connecting IP (IPv4 and /64-grouped IPv6, `edge-rate-limit-policy.ts:145-236`), with per-target (email/token) and global ceilings for the public auth/lead routes (`:32-82`); authenticated learner mutations use account- and account+course-scoped quotas (`authenticated-mutation-quota.ts:18-113`). Path canonicalization blocks traversal/encoding evasions of the rule map (`:89-128`).
- The edge marker is an HMAC over method+path+timestamp with 120 s freshness and constant-time comparison (`edge-rate-limit-policy.ts:317-377`); Node routes refuse marker-gated public endpoints without it (fail-closed 503).

### 6. Input validation

- Every JSON body is read with a streaming byte ceiling that cancels the connection mid-flight and measures real bytes, not UTF-16 length (`http/bounded-body.ts:17-84`); per-route ceilings are small (1–10 KB).
- Zod schemas bound lengths, key counts, and nesting on progress/leads/simulation inputs (`api/progress/route.ts:96-149`, `api/practice/simulation/route.ts:29-46`); reset operation ids are UUID-shaped (`api/progress/reset/route.ts:29-32`).
- Quiz/simulation content files are schema-validated at load with cross-field rules (correct keys must exist, no duplicates, capstone ≥3 tasks, variables declared for every `{{placeholder}}`, required fields must be editable on the surface, simulation may not nest in asides) (`course-loader.ts:197-473`); content URLs are https-or-relative-only with control-character rejection (`content-url-policy.ts:1-23`).

### 7. Secrets

- `wrangler.jsonc` contains only non-secret vars; all credentials are Worker secrets per the registry (`docs/maintenance/academy-secret-registry.md:17-31`, incl. rotation pairing rules).
- Repo scan found no hardcoded secret values; the only JWT-shaped strings are `*.example.test` fixtures in unit tests.
- `.env.example` documents every variable with explicit prod prohibitions (`.env.example` full file); the data-API URL validator requires HTTPS or loopback origin with empty path/query/credentials (`academy-db-core.ts:46-63`); runtime tokens are HS256 with `aud:'academy-data-api'`, 60 s TTL, min-32-byte secret, and are not Supabase JWTs (`runtime-token.ts:20-42`).

### 8. Database security

- RLS is enabled with **zero policies** (default deny) on every table checked: leads (0001:41), users/node_progress (0002:74-75), service_activation/course_entitlement (0004:66-67), attempt (0005:131), course_progress_epoch (0013:24), reset operations (0015:15), consent_events (0016:27), attempt_appeal/privacy_request (0017:297, 490), staff tables (0018:28-29), identity lifecycle tables (0022:142-143), transaction (0025:244), session store (0027:33), admission capacity (0029:17), and `course_certificates` (0038:25). Browsers have no direct table path; the only writers are the reviewed RPCs.
- Privilege model: `academy_runtime` is BYPASSRLS but confined to an explicit object allowlist granted in 0019/0033; the authenticator role can SET ROLE only to Academy roles and a guard raises on unexpected memberships (`privileged/academy-data-api-roles.sql:33-50`). Retention has a separate definer role with select/delete on a purge allowlist (0020:13-40); the retention worker itself has no fetch surface beyond 404 (`ops/academy-retention-worker/worker.ts:8-11`).
- The 0037 definer (`progress_write_allowed`) keeps the body unchanged, pins `search_path = pg_catalog, academy`, moves execute to `academy_runtime` only, and revokes every other role (0037:15-27) — a correct least-privilege repair of the FOR SHARE/ACL conflict, not a widening.
- `course_certificates` grants `select, insert` only to `academy_runtime` (0038:29-31): revocation stays a DBA operation, consistent with the owner-controlled revocation design.
- Attempt/progress invariants live in SQL transactions with advisory locks and epoch checks (0013, 0033), so concurrent requests cannot double-claim or resurrect reset progress.

### 9. Transport and headers

- Outer worker rejects the raw `workers.dev` route and any non-canonical/non-loopback host before any handler (404, no body) — closes the Cloudflare Access bypass found in the 2026-09-05 review (`worker.ts:44-46`, `edge-host-policy.ts`).
- Edge headers on every response: CSP (default-src self, frame-ancestors none, object-src none, connect-src self…), HSTS 1 y + includeSubDomains + preload, nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, restrictive Permissions-Policy (`edge-security-headers.ts:1-24`), with nonce-policy preservation logic for HTML (`:26-53`). Per-request CSP nonce + `strict-dynamic`, minted in middleware with caller-supplied CSP/nonce headers stripped (`middleware.ts:64-89`).
- Session and media cookies: `__Host-` prefixed, HttpOnly, Secure, SameSite=Lax; the media delivery cookie is additionally path-scoped to the single asset with a 5-minute TTL (`media/cookie.ts:7-12`, `course-media/[assetId]/route.ts:40-48`).
- Internal surfaces answer 404 before auth checks run (`middleware.ts:96-98`); three-segment course path variants are terminated at the edge (`middleware.ts:100-110`).

### 10. Privacy / PDPA

- Learner-facing reads are `private, no-store` (`api/progress/route.ts:527-530`, skill-map, certificate routes); dashboard DTOs are built after entitlement filtering (`api/progress/route.ts:599-613`).
- Consent is versioned (v1–v3) with the version pinned server-side from the request, never client-declared (`api/leads/route.ts:14-23, 68-76`; CHECK constraints in 0017); withdrawal via opaque UUID bearer token passed in the URL fragment so it never hits server logs (`unsubscribe-token.ts:1-8`), and the endpoint returns identical responses for invalid/used/expired tokens to prevent lead enumeration (`api/leads/unsubscribe/route.ts:51-53`).
- Retention is codified in SQL purges with bounds (attempts 0011, leads 3-year marketing consent expiry 0017:18-36, inactive users 2 y excluding open appeals and staff 0018:42-90, privacy requests) driven by an isolated scheduler Worker with its own API secret (`retention.ts:49-67`).
- Identity diagnostics log shape-only data (key ids, match booleans, time deltas), explicitly never subject/email/nonce/signature (`production-runtime.ts:298-341`); code-exchange logging is status/timing only (`:153-168`). OTP/lead endpoints give enumeration-resistant uniform responses (`api/auth/otp/route.ts:14-16, 54-58`).

### 11. Content security / media delivery

- Lesson rendering is pure React escaping; the only two `dangerouslySetInnerHTML` sinks are an escaped JSON-LD block and a static theme script, both nonce-guarded.
- Private media (MP4/VTT/PDF) is bound to R2 with worker-first handling; requests require (a) an HMAC-signed grant cookie matching asset+course+node, (b) the current Academy session whose SHA-256 digest is embedded in the grant, and (c) expiry — all verified at the edge before any byte is read (`media/worker-delivery.ts:29-51`, `media/grant.ts:36-104`); issuance itself re-runs `authorizeCourseResource` per asset (`course-media/[assetId]/route.ts:13-49`). Legacy private paths 404 (`worker-delivery.ts:31`); unregistered `/media/*` references fail the build-time/serve-time check (`media/resolve.ts:13-25`); the static asset boundary is test-enforced (`tests/unit/static-asset-boundary.test.ts`, passing).
- Range handling validates byte ranges and rejects malformed suffix requests (`worker-delivery.ts:52-97`); local-dev file delivery is path-traversal-guarded by resolved-prefix containment (`course-media/[assetId]/route.ts:75-77`).
- No CORS headers are emitted anywhere and no OPTIONS handlers exist — same-origin only, matching an app with no third-party API consumers.

## Documented residual risks (accepted in code, re-confirmed)

- Full-bank serving while banks are 3–5 items: `assessmentServeCount` caps at 5 (`assessment-policy.ts:26-33`), so question-text sharing between learners remains possible until banks grow; the code itself flags this as the W-content dependency.
- Learn-mode completion is retry-unlimited with per-item feedback by design (teaching mode); certificate weight rests entirely on server-graded capstone evidence (`assessment-policy.ts:73-98`).
- Dwell time (15 s/task, 30 s floor) is an anti-bot speed bump, not proof of human work (0033:92-121) — accepted as such.
- `skipped` nodes unlock successors ("learner can always override") but never count toward certificate eligibility (`roadmap.ts:31-38`, `courseRecordSummary` blocking, `roadmap.ts:277-311`).

## Test evidence (local)

- `npm run test:unit` (vitest, project `unit`): **2560 passed, 11 failed, 2 skipped** across 158 files. All 11 failures are SEC-04's environment-dependent client-assertion files; every security-relevant suite passed, including: mutation-security/edge-rate-limit-policy, middleware-production-session prefilter, host-session-cookie isolation, media delivery, adversarial sandbox, static asset boundary, certificate issue route, checkpoint answer bias, content URL security.
- No integration tests were run (requires a local Supabase stack; out of scope for this read-only review).

## Precondition notes

- Static analysis cannot prove deployed runtime configuration (Worker secrets present, Cloudflare Access posture, `INTERNAL_SURFACES` state, actual `ACADEMY_SERVED_HOSTS`). Findings assume deployment matches the reviewed config; the fail-closed design means missing config degrades to 503/404, not to open access.
