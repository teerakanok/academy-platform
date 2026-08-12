# Public Course Catalog Locale Checkpoint — 2026-08-09

## User outcome

A visitor can browse the public course previews in English or Thai, keep that
language when opening a preview, and see the same language in the shared chrome.
The catalog is a decision surface only: it shows the course route, level, lesson
and required-checkpoint counts. It does not claim that learning access is open.

## Contract and boundaries

- `/courses` is static and lists only courses with the explicit
  `syllabus-preview` public gate. Internal fixtures remain unavailable from the
  catalog and their direct public route.
- The browser receives a catalog DTO allowlist only. It contains the course
  structure used for the card and localized title/subtitle, never lesson bodies,
  answers, private media, cues, skill weights, or learner data.
- Every locale declared by a course must have a non-null `course.json` copy in
  the generated registry. The registry test traverses every course structure, so
  an advertised locale cannot create a catalog card whose locale URL returns 404.
- The catalog canonicalizes invalid or duplicate `lang` parameters to one
  supported locale and retains unrelated query parameters and anchors. The
  selected-language button is a no-op.
- The signed-out and failed-auth public paths remain syllabus-only and never
  request progress. No database, identity runtime, content-release decision, or
  learner access is added.

## Verification

- TDD: the null-copy registry regression failed before the boundary fix and
  passes afterward; the test uses the generator's `__copy: null` representation.
- Unit suite: `450 passed` across `60` files. Focused public/content boundary
  suite: `17 passed` across `6` files.
- Lint and TypeScript checks: passed with the existing unused-disable warning in
  `src/lib/content/registry.generated.ts`.
- Production build: passed. The prerender manifest confirms `/courses` remains
  static with `initialRevalidateSeconds=false`.
- Public production-build browser suite: `20/20` passed across Desktop Chromium
  and Pixel 5. It covers signed-out and failed-auth no-progress behavior, Thai
  catalog/card/course continuity, invalid and duplicate locale normalization,
  query-plus-anchor preservation, and mobile language switching.
- UX review additionally checked fresh production desktop/mobile captures,
  `scrollWidth === clientWidth` at both viewports, and axe with zero violations
  on the resulting English catalog surface.
- `git diff --check`: passed.

## Independent Review In Loop

- Code/debt reviewer, GPT-5.6 Sol high: `C0 / H0 / M0 / L0`. It found the
  original locale-to-404 seam and verified the final null-copy admission guard,
  duplicate locale handling, static rendering, and public Flight boundary.
- Security reviewer: `C0 / H0 / M0 / L0`. It verified the allowlist, server-only
  import boundary, same-origin navigation, cookie/query behavior, and
  auth-before-progress contract.
- UX/premium reviewer: `C0 / H0 / M0 / L1`. It verified Thai navigation naming,
  the first-viewport mobile language control, responsive layout, and reader-first
  wording.

## Residual Low-Risk Work

1. A future public course that is deliberately English-only will currently use
   the English fallback card for a Thai catalog reader without an availability
   note. Owner: Academy content/catalog. Trigger: before admitting the first
   public single-locale course. Verification: the Thai catalog visibly labels
   the English-only card and links to its English route.
2. A Thai course URL has Thai metadata, but its OG image is still generated from
   the default English copy. Owner: Academy sharing/i18n. Trigger: before Thai
   social sharing or indexing. Verification: Thai share metadata and rendered
   image use the same locale.

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
