# Academy lane report — 2026-09-12 (session ws-523a1d40 continuation)

Worktree: `/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40`
Branch: `codex/academy-security-recovery-523a1d40` · HEAD `bf74fbffd565694510815593f74f7a4b1a1e4b67` (dirty; nothing committed/pushed/deployed by this lane)
Freeze manifest: `reports/academy-candidate-freeze-20260912.json` · Raw acceptance log: `artifacts/academy-fresh-combined-acceptance-20260912.log`

## 1. Fresh combined acceptance — ALL GREEN (2026-09-12 15:40–15:47 +07:00, Node v24.18.0)

| Gate | Verbatim result |
|---|---|
| Full unit (`npm run test:unit`) | Test Files **174 passed (174)** · Tests **3277 passed \| 2 skipped (3279)** · 0 failed |
| Lint + typecheck (`npm run lint`) | ESLint **0 errors, 22 warnings** (all pre-existing) + `tsc` on app/worker/retention-worker configs pass · exit 0 |
| Production OpenNext build (`npm run build:cf`) | **PASS** end-to-end: `verify:workerd` → `opennextjs-cloudflare build` → `cache:sync` (39 prerender assets) → `asset-guard` (no mp4/vtt/pdf/zip in assets) → final worker startup on real workerd **PASS** (bundle 16017.6 KiB) |
| Real Workerd (`npm run verify:workerd`) | **14/14 PASS** (runtime-is-workerd, DO rate-limiter counters, mutation-quota DO binding, rate-limit sign, cryptokey introspection, sign/verify, non-extractable signer import, 4 reject cases, code-exchange RequestInit, Identity-shape result verification, R2 private media) |
| Isolated PostgreSQL — lifecycle/assurance | **59/59 PASS** (enforcement 31 + page-store 28) · owned disposable container · cleanup verified |
| Isolated PostgreSQL — pending waitlist | **5/5 behavior+privilege groups PASS** · all 43 migrations + privileged SQL applied · cleanup verified |
| Isolated PostgreSQL — F01 cross-product | **1/1 PASS** (Identity durable-outbox → real publisher HTTP/signing → Academy assertion/verification/leased projection/runtime session denial; tamper/replay/wrong-audience fail closed) · cleanup verified |
| Focused admission unit | edge-admission **16/16 PASS** |

The stale static assertion from the prior run (`tests/unit/static-asset-boundary.test.ts` expected `"run_worker_first": ["/media/*"]`) is corrected in this dirty state to `"run_worker_first": true`; the rerun confirms the full unit suite green. No fixture or source fix was needed during this rerun; no product guard (authorization fence, Access JWT guard) was weakened. Owned disposable containers used harness-enforced exact-owned names (`academy-identity-lifecycle-*`, `academy-pending-waitlist-*`, F01 owner label `com.cyberskills.test`) with verified self-cleanup instead of an `aclang-` prefix; the 14 pre-existing foreign containers (`supabase_*_academy-web`, `crux-*`) were untouched, and no owned container remains.

## 2. Admission behavior verification (test evidence)

1. **ACADEMY_ADMISSION_MODE safe missing/malformed behavior** — `src/lib/edge-admission.ts`: only exact `'open'` admits; absent, `''`, `'OPEN'`, `' open'`, `'false'`, `null`, `1`, `'maintenance'`, and throwing binding reads all fail closed. Unit: `tests/unit/edge-admission.test.ts` 16/16 (asserts 503 + `no-store` + `retry-after: 60` + CSP `base-uri 'none'`). Real workerd (`scripts/check-final-worker-startup.mjs`, part of the passing build): modes `['maintenance','','OPEN','invalid']` × methods `[GET,HEAD,POST]` × paths `['/', '/_next/static/*', '/media/*', '/api/progress']` all closed.
2. **Worker-first routing + raw-host rejection BEFORE asset handling** — `wrangler.jsonc` `assets.run_worker_first: true` (every route worker-first; SPA fallback disallowed); `worker.ts` order: `isServedHost` → `admissionResponse` → rate limit → media → OpenNext. Real workerd: raw host → 404 `no-store`; raw-host static path even with admission open → 404 (assets cannot bypass the host gate); canonical-host static asset → 200 with immutable cache preserved, exactly one ASSETS read. `scripts/admission-release-policy.mjs` rejects any release config lacking an explicit mode or with non-true `run_worker_first`, and `check-final-worker-startup.mjs` asserts the policy on every build.
3. **Maintenance response no-store + retry handling** — 503 `text/plain`, `cache-control: no-store`, `retry-after: 60`, edge security headers; verified in both unit and real workerd runs. On real workerd the admission check is proven to run **before any dependency binding** (an env Proxy throws if maintenance touches any other binding).
4. **Scheduled lifecycle unaffected by admission controls** — `worker.ts` `scheduled()` calls the lifecycle pull directly; real workerd test invokes `scheduled` with a Proxy that throws if `ACADEMY_ADMISSION_MODE` is read and asserts the handler executed ("scheduled recovery remains reachable").
5. **Invocation / cost / availability effects (config evidence only)** — `run_worker_first: true` puts every request including static assets through the Worker (invocation count now includes asset traffic); `limits.cpu_ms: 500` bounds CPU; observability logs sampled at 0.1 with `invocation_logs: false` bound log cost and keep callback URLs out of invocation logs. **No measured invocation-cost or live availability data exists**; deployed vars/routing must still be read back and validated against `assertAdmissionReleasePolicy` after any deploy (controller-owned).

**Review note (required follow-up):** `docs/security/maintenance-admission.md` paragraphs 1 and 3 still describe the pre-change state (claims the worker entry does not call the helper, only `/media/*` is worker-first, and `wrangler.jsonc` lacks the mode var). That contradicts the applied change in this frozen state. The doc was deliberately not edited after acceptance so the freeze stays byte-identical to the tested state; the independent reviewer should treat those paragraphs as stale and a doc correction is owed.

## 3. Freeze for independent review

- `reports/academy-candidate-freeze-20260912.json` — HEAD, authority basis, fresh acceptance results (verbatim), admission evidence map, review notes, and the full changed-file manifest (178 files: 127 modified + 46 untracked git entries expanded) with per-file SHA256 of the frozen bytes.
- Scope of review owed: the applied maintenance-admission change (worker call site, `wrangler.jsonc` routing/mode, release validator, startup gate, tests) plus the recovery-candidate boundaries already inventoried in the OWASP acceptance — this fresh run does not substitute for independent source review.

## 4. Privacy owner-fact questions (consolidated; no facts invented)

Source state: `docs/privacy/data-processing-register.md`, `docs/privacy/data-access-and-erasure.md`, `docs/privacy/request-runbook.md`, `docs/privacy/browser-learner-state.md`, and the learner-facing notice `src/lib/i18n/privacy.ts` (§5 TH/EN). The register line 33 states: *"The final processor names, processing locations, transfer grounds, and contracts remain a launch gate because production providers are not yet authorized."* Retention periods for Academy-held records ARE declared and SQL-enforced (3y waitlist/consent/case-evidence/staff-history, 2y accounts, 90d non-evidence attempts, 30d appeal window); the open facts are below.

| # | Owner fact needed | Where it appears | What breaks / risks if absent | Current placeholder text |
|---|---|---|---|---|
| Q1 | Name(s) of the web-infrastructure processor(s) (Cloudflare Workers/Assets/R2/Durable Objects/observability) processing learner data | Notice §5 (TH+EN); register line 33 | PDPA notice cannot identify processors; register launch gate stays open | TH "ผู้ให้บริการโครงสร้างเว็บที่ทำงานตามคำสั่งของเรา" / EN "web-infrastructure providers acting on our instructions" |
| Q2 | Database-infrastructure processor identity + hosting location (self-hosted Supabase Pool A; which host/region) | Notice §5; register line 33 | Same notice/gate failure; determines whether cross-border transfer applies at all | TH "โครงสร้างฐานข้อมูลที่ CYBERSKILLS ดูแล" / EN "database infrastructure operated by CYBERSKILLS" — no name, no location |
| Q3 | Identity shared-account-system processor identity + hosting country (account data flows through it) | Notice §5 | Account/auth data disclosure incomplete | TH "ระบบบัญชีกลาง" / EN "our shared account system" |
| Q4 | Marketing/transactional email sending provider name + country (before any send is enabled) | Register "Marketing senders must select recipients only from `academy.active_marketing_leads`"; notice §5 | Marketing launch gate; processor inventory incomplete | Sender/provider unnamed |
| Q5 | Processing country/location per processor | Notice §5 conditional clause; register "processing locations" | Cannot determine applicable transfer mechanism; notice stays conditional | TH "หากการให้บริการทำให้ข้อมูลถูกประมวลผลนอกประเทศไทย…" / EN "If service delivery involves processing outside Thailand…" — no countries named |
| Q6 | Cross-border transfer ground per flow (PDPA mechanism) + existence of DPA/contract per processor | Notice §5; register line 33 ("transfer grounds, and contracts") | Unlawful-transfer risk if data leaves Thailand without a valid ground; register gate open | TH "มาตรการและฐานการโอนข้อมูลที่กฎหมายกำหนด" / EN "the safeguards and transfer ground required by law" |
| Q7 | Restricted case system: location, access control, retention, owner | `request-runbook.md` ("remains an operational launch dependency") | Only unsubscribe operable in production; access/erasure/appeal case handling cannot run compliantly | "its location, access control, retention, and owner must be configured before handling requests other than unsubscribe in production" |
| Q8 | Processor-side log/data retention (Cloudflare Workers observability logs, Access logs, analytics) and deletion | `wrangler.jsonc` observability block; `docs/security-events.md` ("platform log delivery, retention … remain open"); no register row | Retention table incomplete for processor-held copies; PDPA retention-limitation exposure | None declared |
| Q9 | Database backup retention period + backup erasure/restore-rehearsal policy for Academy/Identity data | `data-access-and-erasure.md` requires a restore rehearsal but declares no backup retention | Erasure promises conflict with undeclared backup copies; notice incomplete | None declared |

Future processors (video streaming vendor M5, payments) are already register "recheck" triggers and need the same facts before activation. Count: **9 owner-fact questions**; headline items: processor names/locations (Q1–Q3), transfer grounds + contracts (Q6), and the restricted case system (Q7).

## 5. Production readiness gaps (explicit; source build passing ≠ production ready)

1. **Independent review not yet done** — this freeze exists to enable it; admission change + full combined acceptance on the frozen state are unreviewed.
2. **Deployment provenance** — no deployed-artifact provenance or signed artifacts; no production SBOM reconciliation; local `npm audit` zero-vuln is local-only. Deploy is controller-owned.
3. **Deployed-config read-back** — live Cloudflare vars/routing (admission mode, `run_worker_first`, no SPA fallback) must be read back and validated against `assertAdmissionReleasePolicy`; operator overlays unverified; measured invocation cost absent.
4. **Log delivery / security-event operations** — platform log delivery, retention, durable principal correlation, cross-isolate audit, alert rules, escalation ownership, and protected external store for security events remain open (`docs/security-events.md`); CSP report delivery unverified.
5. **Runtime evidence** — production lifecycle publisher enablement, pre-seed/catch-up, lag, and recovery drills open; F01 acceptance uses direct-seeded outbox fixtures (publisher→consumer seam only, not administrative-action-to-enforcement E2E); Identity producer contract/key release pending founder.
6. **Deploy config / shared infra** — production DB roles/grants/migration order/backup/rollback on shared Pool A; Cloudflare routing/TLS/Access/rate-limit persistence; cron enablement; retention-worker deployment — all unverified; `deploy:cf` requires `test:boundary` which needs live ports.
7. **Privacy owner facts** — the 9 questions in §4 are launch gates.
8. **Residual source items** — `style-src-attr 'unsafe-inline'` removal needs dynamic-style migration; authenticated browser + accessibility acceptance of repaired learner surfaces outstanding; stale `maintenance-admission.md` paragraphs (see §2 note).
9. **Identity-side dependencies** — deployed Identity CORS/sign-out, assurance-v2 signer/key custody remain unverified external boundaries owned by the Identity lane.

## 6. Lane status

Fresh combined acceptance on the frozen dirty state: **complete and all green**. Admission behavior verified with unit + real-workerd evidence. Candidate frozen for independent review; no commit/push/deploy/live action performed. Continuation state is exact: everything above lives in the worktree reports/artifacts paths listed.

## 7. Follow-up lane after independent review (2026-09-12, verdict PASS_WITH_NOTES)

Independent review: `/Users/teerakanok/Dev/cyberskills-director/reports/security/identity-recovery-523a1d40/academy-independent-review-20260912.md`. Follow-up items executed in the same worktree (still HEAD `bf74fbf`, dirty, nothing committed/pushed/deployed). Three files changed vs the v1 freeze; freeze manifest re-issued as **v2** (`reports/academy-candidate-freeze-20260912.json`, schema `academy-candidate-freeze/20260912-v2`, all 178 hashes recomputed against the working tree: 0 mismatches / 0 missing).

### Findings disposition

| Finding | Severity | Disposition | What was done |
|---|---|---|---|
| F3 | LOW | **Closed** | Restored the deleted rejection case `request({ headers: { 'cf-access-jwt-assertion': '' } })` into the existing denial loop of `tests/unit/identity-client-assertion-secret-diagnostic.test.ts` (byte-identical to baseline `bf74fbf`; the deletion had no accompanying source change). Runtime guard verified intact — the restored case passes against the unchanged regex/length check. |
| F5 | MEDIUM (doc-only) | **Closed** | Rewrote paragraphs 1 and 3 of `academy-web/docs/security/maintenance-admission.md` to the applied state: worker entry calls `admissionResponse` after the host gate; exact-match `'open'` admission; missing/malformed/`maintenance`/throwing binding reads fail closed to 503 `no-store` + `retry-after: 60`; `wrangler.jsonc` declares `ACADEMY_ADMISSION_MODE` and `run_worker_first: true` with no SPA fallback; `scheduled` handler never reads `ACADEMY_ADMISSION_MODE`. Kept the doc's conservative framing: deployed vars/routing read-back and invocation-cost measurement remain owed; no deployment claim. Paragraphs 2 and 4–6 untouched. |
| F4 | INFO | **Closed (label-only; deliberately not wired)** | Added a header doc-comment to `src/lib/identity/lifecycle-first-login.ts` labeling it scaffolding awaiting rollout wiring; wiring into the login flow stays a product rollout decision tied to lifecycle enablement authority and was NOT done in this lane. Module still has no importer (intended). |
| F2 | LOW | **Deferred — adjudicated structural (per-surface evidence below)** | CSP `style-src-attr 'unsafe-inline'` kept. Enumerated every inline-style producer; the blocking surface is data-driven graph layout that cannot migrate within a bounded change, and a partial migration cannot remove the directive. |

### F2 enumeration (complete inventory of inline style attributes)

Browser HTML — `style=` JSX attributes, 10 occurrences in 3 `'use client'` components, 5 distinct patterns:

1. `src/components/course/RoadmapGraph.tsx:87` — container `maxWidth: layout.width, height: layout.height` from `layoutRoadmap(structure, state)` (per-course dynamic).
2. `src/components/course/RoadmapGraph.tsx:159` — per-node `left: (item.x/layout.width)*100%, top: item.y` — **data-driven coordinates, one per roadmap node; N is unbounded (course-author-defined)**.
3. `src/components/course/RoadmapGraph.tsx:166,176` — per-node `animationDelay: item.rank*60ms`.
4. `src/components/course/RoadmapGraph.tsx:133,205` — `clipPath: polygon(...)` hexagon (static values; conditional on capstone kind — class-migratable).
5. `src/components/course/CourseDashboard.tsx:96,111` — progress fill `width: finishedPercent%` (genuinely dynamic per-learner progress; CSS-custom-property/nonce'd-style migratable only from a server parent).
6. `src/components/course/RadarChart.tsx:130` — static constants `fontSize: 11, fontWeight: 600` (trivially a Tailwind class).

Not browser HTML (CSP `style-src-attr` not applicable):

- `src/lib/course-share-image.tsx` (10 occurrences) renders only via satori `ImageResponse` — importers `src/app/courses/[slug]/opengraph-image.tsx` and `src/app/(site)/courses/[slug]/share/[locale]/route.tsx` return image bytes, never HTML.

Not CSP-governed:

- `src/components/course/blocks/LabBlock.tsx:67-70`, `ImageBlock.tsx:22-25` — `document.body.style.overflow` via CSSOM property assignment (blocked by no CSP directive, unlike the `style=` attribute).

**Why deferred:** RoadmapGraph positions/animation-delay are computed at render from authored course roadmaps (the reviewer/task's "editor-driven layout" case) inside a `use client` component, where a CSP nonce cannot be minted without restructuring (Next.js does not expose the page nonce to client components). Removing the directive today would make browsers drop those style attributes and silently collapse node positioning on the learn page — a functional regression on a review-passed surface, for zero security delta while the directive must stay anyway. Migrating only the static/d bounded patterns (RadarChart text, hex clip-path, dashboard width) cannot remove the directive, so it adds churn without closing F2. Kept as an adjudicated follow-up consistent with the reviewer's disposition; `script-src` remains nonce + `strict-dynamic` with no `'unsafe-inline'`, so the residual is attribute-level CSS injection only.

### Verification (this lane, verbatim)

| Command | Verbatim result |
|---|---|
| `npx vitest run tests/unit/identity-client-assertion-secret-diagnostic.test.ts` | `Test Files  1 passed (1)` · `Tests  13 passed (13)` · `Type Errors  no errors` |
| `npm run lint` (ESLint + `tsc` app/worker/retention-worker chain) | `✖ 22 problems (0 errors, 22 warnings)` — identical warning set to the frozen baseline run — `exit 0` |

Proportionality applied: F3/F5/F4 are covered by the focused test + lint/tsc chain above (F4/F5 changes are comment/markdown-only). F2 required no code change (deferred), so no unit/verify:workerd/build run was owed; no CSP/header output file changed, hence no OpenNext build.

### Follow-up lane status

All four review findings dispositioned (3 closed, 1 deferred with evidence); freeze manifest re-issued as v2 with per-file v1→v2 hashes and finding dispositions embedded. Nothing committed, pushed, deployed; no guard weakened; foreign state untouched. Continuation state is exact: this section plus `reports/academy-candidate-freeze-20260912.json` (v2).
