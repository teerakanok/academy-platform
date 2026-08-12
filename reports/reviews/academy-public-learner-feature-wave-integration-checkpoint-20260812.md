# Academy Public And Learner Feature Wave Integration Checkpoint — 2026-08-12

## Status

The original different-agent review failed with code/debt `C0/H0/M2/L0`,
security `C0/H0/M2/L0`, and UX `C0/H0/M2/L1`. The next closure reviews found
two further security defects, a mixed-language root, duplicated return-path
policy, and an English-only protected Thai learner surface with mobile roadmap
overflow. The author reproduced and remediated every finding on the current
bytes. Final different-agent code/debt review passed `C0/H0/M0/L0`; security
and UX behavior also passed, with only report-count and reader-first Low
findings remaining. The exact text remediation then passed a different
text-and-authority recheck at `C0/H0/M0/L0`.

This checkpoint does not authorize deployment, database mutation, Identity
runtime enablement, retention execution, or production traffic.

## User Outcome

The Academy worktree now presents one coherent public-to-learner journey:

- visitors can inspect a localized course catalogue and English or Thai
  syllabus before account access opens;
- signed-in learners retain the protected dashboard, progress, lesson,
  attempt, simulation, and skill-map boundaries;
- client response bodies used by the changed Academy surfaces are bounded,
  duplicate-safe, media-checked, and projected into exact success shapes;
- language switching preserves learner routes; Thai overview, roadmap, reset,
  access, and error states use Thai interface copy; the selected light or dark
  theme survives reload and navigation;
- the retention worker keeps one deadline across headers and bounded response
  consumption, so a stalled or oversized body cannot report completion;
- canonical course URLs, metadata, static share images, and Cloudflare build
  artifacts remain aligned.

## Frozen Scope

The authority manifest binds 168 existing content paths, including source,
tests, fonts, content, scripts, evidence, and checkpoint reports. Git separately
records 24 deleted legacy route paths; each has a route-grouped replacement
under `src/app/(site)` or `src/app/(localized)`. Reviewers must inspect the full
working-tree diff as well as the manifest because deleted files have no bytes to
hash.

Authority manifest:
`reports/reviews/academy-public-learner-feature-wave-freeze-20260812.json`

## Original Findings And Remediation

### Code/debt and security response boundaries

The first reviews found raw or partially validated response handling in account,
dashboard, progress, and retention paths. Those paths could accept duplicate or
surplus keys, wrong-type success fields, wrong media, oversized bodies, or a
body that never closes after response headers.

The remediation adds shared bounded response readers and exact projections for
account state, sign-out, OTP, verification, dashboard data, learner progress,
and retention counts. Malformed action outcomes no longer reach learner state;
raw server error fields are not propagated by progress operations. The
retention deadline remains active until the bounded body is consumed, canceled,
or rejected.

TDD evidence:

- account boundary RED: two focused suites stopped at the missing reader;
  GREEN: the original account suite passed 3/3, then the final account/auth
  suite passed 5/5 and the auth regression group passed 15/15;
- dashboard/progress RED: 6 failures with 24 baseline passes for the new exact,
  duplicate, media, size, and wrong-type assertions; GREEN: 30/30;
- retention RED: 3 new failures with 7 baseline passes for stalled, oversized,
  and wrong-media bodies; GREEN: 10/10.

The first closure review additionally found that the verify-response projector
accepted backslash or control-character return paths that a browser can resolve
off-origin, and that reset-progress returned on HTTP 401/403 without canceling
an unread body. RED produced 3 failures with 28 baseline passes. The projector
now resolves the path against a fixed same-origin base before accepting it, and
both access-loss statuses cancel the body before returning. GREEN: 31/31.

### Locale, access states, and theme persistence

The first UX review found that the language toggle rewrote a protected
`/courses/:slug/learn` route into a public syllabus, Thai calls to action and
access/error states fell into English content, and a stored dark theme reset to
light after reload.

The remediation distinguishes terminal public locale paths from protected
learner paths, preserves query and hash state, localizes access/error outcomes,
keeps Thai catalogue actions in the Thai journey, and restores the stored theme
during hydration. The first browser rerun correctly remained RED for theme
hydration after the server-side attribute fix; the client hydration fix then
closed reload and cross-route persistence.

TDD evidence:

- locale/access RED: 5 focused failures; GREEN: 4 files / 8 tests;
- browser theme RED: 26 passed / 2 failed; GREEN: 28/28 across desktop Chromium
  and Pixel 5.

The first closure review also reproduced a mixed-language root after selecting
Thai. Root marketing content remains English-only; locale preference is now
read only on translated routes, and selecting Thai from root moves to the
translated course catalogue while retaining tracking parameters. Direct course
and access URLs use one exact `lang` query before the saved cookie, including error states.
Unit RED: 2 failures / 2 baseline passes; browser RED: 2 failures / 2 baseline
passes after the locator harness was corrected. GREEN: locale 4/4 and focused
browser 4/4.

### Shared return paths and protected Thai learner UI

The next code/debt review found three return-path policies with different
results. The response projector used a fixed-origin URL parser, while the route
and durable transaction boundaries still accepted newline or tab forms that a
browser resolves off-origin. A test-only RED passed 25 assertions and failed the
two affected boundaries. One framework-free validator now bounds the value,
rejects control and backslash normalization, and confirms the fixed Academy
origin before every route fallback, response projection, transaction snapshot,
or transaction start. GREEN: 3 files / 27 tests.

The UX closure also found that a signed-in learner could select Thai but still
see English overview, roadmap, and reset controls. Browser RED failed on both
desktop and mobile. The learner-course copy now owns the complete overview,
roadmap, certificate-summary, recovery, and destructive-reset vocabulary for
English and Thai. A visual rerun then exposed horizontal roadmap overflow on
mobile; the desktop case passed while the mobile assertion remained RED. The
graph now maps its fixed layout into the available container, keeps bounded
mobile labels, and retains the original desktop width. Focused browser GREEN:
2/2; complete public browser GREEN: 34/34.

## Fresh Author Verification

- Node 24.18.0 focused auth regression: 5 files / 15 tests passed.
- Node 24.18.0 response/reset closure: 2 files / 31 tests passed.
- Node 24.18.0 locale closure: 4/4 tests passed.
- Node 24.18.0 return-path regression: 3 files / 27 tests passed.
- Node 24.18.0 unit suite: 107 files / 1,184 tests passed.
- ESLint and all three TypeScript configurations passed; the generated content
  registry retains one pre-existing unused-disable warning and no errors.
- Next.js 15.5.22 production build passed and generated 30 static/dynamic route
  entries, including two localized public course pages.
- OpenNext Cloudflare 1.20.2 build passed and produced
  `.open-next/worker.js`. Its compatibility-date advisory remains an external
  deployment/configuration gate.
- Static public page, share-image, image-composition, and Cloudflare cache
  verifiers passed for both supported locales.
- Public browser suite passed 34/34 across desktop Chromium and Pixel 5.
- `npm audit` found zero vulnerabilities both for production dependencies and
  for the full dependency graph.
- Git history secret scan covered 188 commits with no leaks. The exact frozen
  content scan produced two generic-key matches, both manually confirmed as a
  deterministic test token and a documentation phrase rather than credentials.
- Fresh production-rendered Thai syllabus, catalogue, learner overview, roadmap,
  and reset-dialog captures were inspected in desktop/mobile and light/dark
  states. The post-fix captures showed no clipping, overlap, horizontal overflow,
  unreadable wrapping, or theme inconsistency. A different visual critic later
  bound the frozen checkpoint, inspected all ten original captures, and passed
  the UX lane at `C0/H0/M0/L0`.
- The public browser server stopped after the run; port 61001 had no listener.
- Tracked diff whitespace check passed before the final freeze; staged paths
  remained empty.

## Review Questions

1. Does the route-group relocation preserve every public, authenticated, API,
   and middleware boundary without a dead route or broader exposure?
2. Are all changed client response paths exact, resource-bounded,
   duplicate-safe, fail-closed, and free of private course or learner data?
3. Are learner progress, attempt, simulation, skill-map, locale, theme, and
   resume transitions coherent across success, expiry, access loss, and
   malformed responses?
4. Does retention remain bounded through body consumption, cancellation, and
   timeout without a false completion or residual listener/resource leak?
5. Do desktop/mobile English/Thai public and hard states remain useful,
   accessible, visually coherent, and honest about account availability?

## Production Boundary

Production remains **NO-GO**. This checkpoint does not supply Identity endpoint
or key authority, enable the Identity registry, prove production browser
cookies, execute database migrations, authorize retention execution, resolve
every dependency or Cloudflare release gate, or grant deployment/release
approval.
