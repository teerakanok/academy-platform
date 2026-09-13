# Academy production playtest — 2026-09-12 evening (lane report)

Lane: Academy PRODUCTION PLAYTEST, controller session ws-523a1d40.
Authority: real-testing addendum `current-owner-authority-20260912-1531-addendum.json`
(`deploy_playtest_authority_20260912_evening`); wave-2 commit/deploy/re-verify
authorized by controller GO under the same authority.

## Scope

- Surface: every public learner-visible route of `https://academy.cyberskills.co.th`.
- Claim to falsify: "the admission-hardened candidate serves the public site
  correctly and fail-closed where it must".
- Build under test: application source `73ac223` (`73ac2232b242…`), Worker
  version `73cc26e6-f084-458f-a5aa-0ae6b5623518` @100%, activated 13:35:33Z on
  Pool A migrations 0040/0041/0043/0044.
- Environment: PRODUCTION, read-only (GET navigation + link clicks only; no form
  submissions, no POSTs, no load testing; a handful of requests per cell).
- Persona lenses: (a) prospective learner/beginner, (b) student browsing EN+TH
  courses, (c) security expert probing host/admission boundaries.
- Viewport matrix: desktop 1440×900 + mobile 390×844.
- Raw probe artifacts: `probe-results.json`, `probe.mjs`, `repro-hydration.mjs`,
  `repro-csp404.mjs`, `recapture-signin.mjs` (this directory).

## Verdict

**FINAL (wave 2, post-redeploy): CONVERGED — no open accepted findings.**

Public learner surfaces (home, catalog, course pages EN/TH, sign-in render,
privacy, unsubscribe, robots/sitemap, static assets, admission redirects) are
serving correctly and fail-closed. The three wave-1 accepted findings (F1
share/OG 500, F2 robots frozen to Disallow-all, F3 favicon) were fixed in
commit `6ccc024a4d27…`, deployed as Worker version
`4386a120-9807-4c79-9888-0fdad49b9fd9` @100% (activated 2026-09-12T14:11:39Z),
and re-verified live on production (see "Wave 2" section). A full convergence
pass (6 pages × 2 viewports + all fixed cells) produced zero new accepted
findings. DEFER items D1–D4 remain recorded, not acted on.

Wave-1 state (superseded, kept for the record): share/OG routes 500ed on
production; robots.txt served the build-time Disallow-all variant; no favicon.

## Wave 2 — commit, redeploy, re-verification (2026-09-12 evening)

- **Commit** `6ccc024a4d2766290a08d0e1a6e895158d196f76` on
  `codex/academy-security-recovery-523a1d40` (7 files: robots.ts,
  course-share-image.tsx, generate-share-fonts.mjs,
  course-share-fonts.generated.ts, icon.svg, 2 test files). Pre-commit gate:
  focused vitest 6/6.
- **Build**: `npm run build:cf` exit 0 — OpenNext build, cache sync (39
  prerender assets), asset guard pass, real-workerd final startup check PASS
  (raw-host/static gate 404; maintenance rejects before bindings; open assets
  preserve cache; scheduled recovery reachable; outbound blocked; bundle
  16165.0 KiB).
- **Upload**: `wrangler versions upload --name cyberskills-academy --keep-vars
  --tag release-6ccc024a4d27` → Version ID
  `4386a120-9807-4c79-9888-0fdad49b9fd9`. Bindings read back: EDGE_RATE_LIMITER
  (DO), COURSE_MEDIA (R2), ASSETS, NEXT_PUBLIC_SEARCH_INDEXING=on,
  ACADEMY_ADMISSION_MODE=open (unchanged). No DB changes (no migrations in
  this delta).
- **0% split + override smoke** (header version-override, pre-activation):
  share/en 200 image/png 67922 B; share/th 200 56508 B; opengraph-image 200;
  robots.txt 200 text/plain allow-policy; /icon.svg 200 image/svg+xml;
  canonical `/` 200 + nonce CSP; raw host 404.
- **Activation**: `wrangler versions deploy 4386a120…@100 --yes` at
  2026-09-12T14:11:39Z; allocation receipt lists Version 4386a120 (100%), tag
  `release-6ccc024a4d27`, predecessor `73cc26e6-…` retained (inactive).
- **Rollback identity (documented, not executed)**: current 4386a120;
  immediate rollback target 73cc26e6-f084-458f-a5aa-0ae6b5623518 (reintroduces
  the three public defects — acceptable only for catastrophic breakage);
  its predecessor 509c93a8 carries the known worker-only-rollback sign-in
  caveat (legacy grants revoked by migration 0043) per deploy-record-20260912.

### Production re-verification evidence (read-only, post-activation)

- **Share images — all 16 live URLs** (8 slugs × en/th from the live sitemap):
  200 `image/png`, 53–77 KB each — assembly, basic-os-linux, c-low-level,
  computer-architecture, computer-networking, git-essentials,
  operating-systems, setup-and-environment.
- **OG images — all 8 slugs**: 200 `image/png`.
- **Favicon**: `/icon.svg` 200 `image/svg+xml`; homepage emits
  `<link rel="icon" href="/icon.svg?…">` (verified twice via browser context
  `page.request.get` → 200).
- **robots.txt**: 200, serves the app policy — `User-agent: *` Allow `/` +
  private-path disallows (/api/, /player, /dashboard, /courses/*/lessons/),
  AI-crawler allow groups (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  PerplexityBot, Google-Extended), `Host:` + `Sitemap:` lines — matches the
  live sitemap policy (c1f614a intent). Cloudflare managed block still
  prepended (D1, zone-level, deferred). Live body archived:
  `R3-robots-live.txt`.
- **Canonical spot checks**: `/`, `/courses`, `/courses/assembly/en`,
  `/sign-in`, `/privacy` → 200 HTML; `/courses` CSP nonce present; raw host
  `/` → 404; `/sitemap.xml` → 200 application/xml.
- **Share-card visual check**: `R1-share-assembly-th.png` (1200×630) renders
  correct readable Thai glyphs (title matches course h1), no tofu/clipping.
- **Convergence visual sweep** (`convergence-pass.mjs`, both viewports):
  home, courses, assembly en/th, sign-in (identity control), privacy —
  12/12 status 200, ready conditions met, 0 console errors / 0 pageerrors
  (the D4 hydration flake did not appear in this round), favicon resolved
  200 on both runs. **New accepted findings: 0.**

## Matrix (all cells exercised on production unless marked)

| # | Cell | Persona relevance | Result | Evidence |
|---|------|-------------------|--------|----------|
| 1 | Canonical `/` | learner entry | 200 HTML; `cache-control: private, no-store`; CSP `script-src 'self' 'nonce-…' 'strict-dynamic'` + report-uri; HSTS preload; frame-ancestors none; permissions-policy locked | curl headers; `01-home--{desktop-1440,mobile-390}.png`; h1 visible both viewports; 0 console issues |
| 2 | Raw host `cyberskills-academy.songpon-te.workers.dev/` | security | 404 empty, `no-store` (host gate) | curl |
| 3 | Raw host static asset `/_next/static/css/c028724d….css` | security (worker-first routing) | 404 | curl |
| 4 | Canonical static asset same path | regression | 200 `text/css`, `public, max-age=0, must-revalidate` + etag | curl |
| 5 | `/robots.txt` | security/SEO | 200 `text/plain` — **content defect F2**: served body is the build-time `Disallow: /` variant (no Sitemap/AI-crawler rules) contradicting live sitemap | curl full body; prerender artifact `.next/server/app/robots.txt.body` identical |
| 6 | `/sitemap.xml` | SEO | 200 `application/xml`; 20 URLs (home, catalog, 9 courses × en/th, privacy) | curl |
| 7 | `/courses` catalog | learner | 200; h1 "Course previews"; 8 course links; page renders both viewports | `02-courses--*.png` |
| 8 | `/courses/assembly/en` `/th` | student EN/TH | 200; correct localized titles (`Assembly: Reading Machine Code` / `ภาษาแอสเซมบลี: อ่านภาษาเครื่อง`); syllabus testid visible; `htmlLang` switches | `03/04-*.png`; interaction I2 |
| 9 | `/courses/basic-os-linux/en` `/th` | student EN/TH | 200; localized titles render | `05/06-*.png` |
| 10 | `/courses/<slug>` (locale-less) | learner convenience | 308 → `/courses/assembly/en` (default locale) | curl + interaction I4 |
| 11 | `/sign-in` render (submission deferred — session v2 needs Identity live) | learner | 200; renders Identity Control SSO card `data-testid="identity-control-sign-in"` + "Continue to CYBERSKILLS Account" button; no email form by design (Identity mode); h1 "One CYBERSKILLS account"; 0 pageerrors | `07-sign-in--*.png` |
| 12 | `/sign-in?notice=identity-unavailable` | learner recovery copy | 200; `[role=alert]` renders "Sign-in could not be completed. Please start again." | `08-sign-in-notice--*.png` |
| 13 | `/privacy` | legal | 200; h1 "CYBERSKILLS Academy privacy notice" | `09-privacy--*.png` |
| 14 | `/unsubscribe` (no token) | learner email prefs | 200; h1 "Stop Academy marketing emails" | `10-unsubscribe--*.png` |
| 15 | Nonexistent top-level path `/no-such-page-playtest` | error state | 307 → `/sign-in?next=…` — **by design** (middleware PUBLIC allowlist, founder 2026-08-01); unknown = closed | curl |
| 16 | Nonexistent course `/courses/no-such-course` | error state | 404 app-level branded page (header/footer, working home link) inside shell | `11-app-404--*.png`; interaction I5 |
| 17 | Bad course locale `/courses/assembly/xx` | error state | 404 at middleware (three-segment guard) — **blank body** (see D3) | `12-mw-404--*.png` |
| 18 | `/dashboard` unauthenticated | admission | 307 → `/sign-in?next=%2Fdashboard` | curl + interaction I7 screenshot |
| 19 | Lesson path unauthenticated `/courses/assembly/lessons/anything` | admission | 307 → sign-in with next preserved | curl |
| 20 | `/api/progress` unauthenticated | security API shape | 401 | curl |
| 21 | `/api/auth/me` unauthenticated | security | 200 `{"signedIn":false}` (public capability shape, no leak) | curl |
| 22 | CSP nonce freshness | security | two requests → two different nonces (per-request nonce confirmed) | curl |
| 23 | `/courses/<slug>/share/<locale>` (og:image target) | share/AI/SEO channel | **500** on en and th — F1 | curl ×2 |
| 24 | `/courses/<slug>/opengraph-image` | share | **500** on 3 slugs — F1 | curl ×3 |
| 25 | `/favicon.ico` | coherence | 404, no `<link rel=icon>` emitted — F3 | curl |
| 26 | Maintenance mode | fail-closed proof | **not exercisable on prod (would disrupt service); covered by pre-deploy workerd evidence** (deploy record 2026-09-12: real-workerd startup check — maintenance rejects before bindings, raw-host 404, open assets preserve cache) | deploy-record-20260912.md |

Interactions (DOM-verified, link clicks only): I1 nav home→courses both
viewports; I2 course EN→TH language switch (`htmlLang=th`, Thai h1); I4
locale-default redirect; I5 app-404 home-link recovery; I6 sign-in form shape
(0 forms, 0 submit buttons beyond SSO continue — matches Identity mode; no
submission performed); I7 private-route redirect. Mobile menu: no toggle
button exists at 390 (nav renders always-visible) — consistent, not a defect.

## Findings

### F1 (ACCEPT — fixed locally, awaiting controller deploy) share/OG images 500 on production

- Severity: high (public endpoints 500ing; every course share to
  Facebook/X/LinkedIn/AI gets no preview image — the founder's chosen growth
  channels). Introduced by the candidate itself: 73ac223 switched both
  `/courses/[slug]/share/[locale]` and `/courses/[slug]/opengraph-image` from
  build-time prerender to `force-dynamic` request-time rendering (2026-09-07
  verification log shows them prerendered `●`; today they are `ƒ`).
- Evidence chain: production returns 500 (not the route's own 503
  availability path) → exception happens after visibility resolves; visibility
  demonstrably works on production (same `getVisiblePublicCourse` serves
  course pages 200 and sitemap 20 URLs); the deployed OpenNext bundle contains
  `readFile(join(process.cwd(),"assets","fonts","noto-sans-thai"…))` in the
  request-time render path; workerd has no filesystem for node:fs; OpenNext
  1.20.2 officially patches @vercel/og wasm for Workers (so satori/resvg/yoga
  are wired — fonts are the breaking dependency). Pre-candidate images only
  ever rendered at build time in Node, where fs exists.
- Honest limit: the exact workerd stack trace was not reproduced locally (no
  local workerd+DB harness in this lane); attribution is evidence-based as
  above. Controller re-verify after deploy = the three curls in "Handoff to
  controller" below.
- Fix (worktree `academy-web`, uncommitted for controller review):
  - `scripts/generate-share-fonts.mjs` (new) — regenerates base64 font module
    from `assets/fonts/noto-sans-thai/*.ttf` (source of truth unchanged).
  - `src/lib/course-share-fonts.generated.ts` (new, ~101 KB) — Noto Sans Thai
    Regular/Bold inlined; removes ALL node:fs from the render path (works on
    workerd and Node alike).
  - `src/lib/course-share-image.tsx` — `shareImageFonts()` now decodes the
    base64 module (`Buffer.from`, nodejs_compat-safe); no behavior change to
    the card design (identical font bytes).
  - `tests/unit/course-share-image.test.ts` (new) — renders real PNGs in-process
    for EN and TH fixtures with `node:fs/promises` mocked to throw (proves
    filesystem-independence + PNG magic bytes + size); 2/2 pass.

### F2 (ACCEPT — fixed locally, awaiting controller deploy) /robots.txt frozen to `Disallow: /` by build-time prerender

- Production robots.txt = the `searchIndexingEnabled()=false` branch (block
  everything, no Sitemap line) while the same env switch evaluates `on` at
  runtime for sitemap.xml (force-dynamic) — two discovery files answer
  oppositely; also contradicts the founder's 2026-08-01 AI-SEO allow decision.
- Root cause: robots.ts had no `dynamic` export → prerendered at build
  (deploy build env had the switch unset) and served as a static asset forever;
  `.next/server/app/robots.txt.body` in the worktree is byte-identical to the
  production body.
- Fix: `export const dynamic = 'force-dynamic'` in `src/app/robots.ts` (same
  pattern as sitemap.ts) + incident comment; guard test
  `tests/unit/robots-launch-switch.test.ts` (dynamic flag, fail-closed branch,
  open branch incl. GPTBot/ClaudeBot/Google-Extended allow + sitemap URL);
  3/3 pass. Local re-verify: build emits `/robots.txt` as `ƒ (Dynamic)`
  (prerender artifact gone); `next start` with switch unset → `Disallow: /`,
  with `NEXT_PUBLIC_SEARCH_INDEXING=on` → allow + private-path disallows +
  AI-crawler groups + Host/Sitemap lines.

### F3 (ACCEPT — fixed locally, awaiting controller deploy) no favicon / /favicon.ico 404

- No `<link rel=icon>` anywhere; every first visit auto-requests
  `/favicon.ico` → 404. Fix: `src/app/icon.svg` (new) — verbatim copy of the
  site's own header mark `public/brand/logo-academy.svg` via the Next App
  Router icon convention. Local re-verify: build emits `/icon.svg` static;
  page `<link rel="icon" href="/icon.svg?…">` wired; `/icon.svg` 200
  `image/svg+xml`.

### D1 (DEFER) Cloudflare Managed robots.txt blocks the AI crawlers the app explicitly allows

- The zone injects a "Cloudflare Managed content" block that sets
  `Disallow: /` for GPTBot, ClaudeBot, Google-Extended, CCBot, etc. Specific
  groups beat `User-agent: *`, so those bots are blocked at the zone layer
  even after F2's fix — a zone-level setting countermanding the founder's
  AI-SEO decision. Also creates two `User-agent: *` groups (ambiguity; RFC
  9309 tie-break favors the least restrictive, so generic crawlers stay
  allowed). Outside the repo — owner decision: reconcile the Cloudflare
  "block AI bots" managed setting with the allow intent, or accept.

### D2 (DEFER) React-internal CSP style report on the app-404 page

- Deterministic (2/2) `securitypolicyviolation` on `/courses/no-such-course`:
  React DOM's dehydrated-Suspense toggling applies `display:none` via CSSOM;
  Chromium reports it against `style-src` (no `unsafe-inline`). Source
  `…/_next/static/chunks/4bd1b696-….js` (React internals), learner impact none
  (page renders correctly, both viewports), but it feeds noise into
  `/api/security/csp-report`. Pre-existing platform behavior, not a 73ac223
  regression; fixing would mean weakening CSP or patching React — out of
  additive envelope.

### D3 (DEFER) middleware-level 404 is a blank page

- `/courses/assembly/xx` (bad locale, three-segment guard) and internal-surface
  404s return `NextResponse(null, {status:404})` — a completely white page,
  no guidance. Deliberate non-revealing posture (commented in middleware);
  branded-404 guidance for learners is a product decision (e.g. rewrite to a
  404 page) — deferred with evidence `12-mw-404--*.png`.

### D4 (DEFER) flaky React hydration error #418 on public pages

- Observed on mobile 390 for /courses, /sign-in?notice, /privacy in the first
  pass; a 15-load repro (3 rounds × 5 pages × 2 viewports) hit it exactly once
  (desktop /sign-in?notice) — flaky, page-independent, viewport-independent,
  self-recovering (client re-render; no visible breakage in any screenshot).
  Needs a dedicated debugging session; not attributable to the admission
  change (shell components untouched by 73ac223).

### D5 (noted posture, no action) storefront served `private, no-store`

- All public pages (home/catalog/course/privacy) carry
  `cache-control: private, no-store` — deliberate fail-closed default of this
  candidate; cost = every pageview hits the worker (tail showed 8–22 ms CPU).
  Recorded as the deployed intent, not a defect.

## Fixes summary (committed as 6ccc024a4d27… and deployed in wave 2)

- M `src/app/robots.ts` (F2) · M `src/lib/course-share-image.tsx` (F1) ·
  A `scripts/generate-share-fonts.mjs` · A `src/lib/course-share-fonts.generated.ts` ·
  A `src/app/icon.svg` (F3) · A `tests/unit/robots-launch-switch.test.ts` ·
  A `tests/unit/course-share-image.test.ts`.
- Focused tests: 6/6 pass (vitest `--project unit`); eslint clean;
  `npm run build` exit 0; `npm run build:cf` exit 0 (workerd checks PASS).
- Production cells re-captured after activation: `screenshots/R1-share-*.png`
  (3 live share cards incl. Thai), `screenshots/R2-icon.svg`,
  `R3-robots-live.txt`, and `screenshots/conv-*--{desktop-1440,mobile-390}.png`
  (12 convergence captures).

## Cells NOT exercised (explicit)

- Sign-in E2E submission / OTP / identity round-trip — deferred by scope
  (session v2 needs Identity live; render-only per matrix cell 11).
- Maintenance mode — not exercisable on prod (would disrupt service); covered
  by pre-deploy workerd evidence (deploy record 2026-09-12).
- Identity lifecycle effects (reauthentication, session revocation, retention
  worker) — owner-gated, disabled in this deploy; nothing to observe.
- Any data-mutating flow: waitlist/lead form POST, unsubscribe confirm POST,
  progress writes, certificate verify inputs beyond GET shape.
- Load/performance testing beyond the tail samples already in the deploy
  record.

## Build tested

- Wave 1 (superseded): source 73ac223 → Worker 73cc26e6 @100% (13:35:33Z).
- Wave 2 (final): source 6ccc024a4d2766290a08d0e1a6e895158d196f76 → Worker
  4386a120-9807-4c79-9888-0fdad49b9fd9 @100% (2026-09-12T14:11:39Z).
