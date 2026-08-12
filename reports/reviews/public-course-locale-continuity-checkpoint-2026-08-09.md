# Public Course Locale Continuity Checkpoint — 2026-08-09

## User outcome

A visitor can inspect the public course in a consistent language state. A shared
`?lang=en|th` URL controls the course, browser language, shared chrome, account
labels, and theme-toggle accessible name after hydration. A visitor's saved UI
locale carries into a bare public course URL only when the course can serve that
locale. Links and language controls retain unrelated query parameters and the
current anchor.

## Correction recorded on 2026-08-09

The earlier wording that the query-locale course route "remains static/SSG" was
too broad. The default generated course path is static, but a `?lang=` request
is not a separately prerendered HTML variant. This checkpoint still preserves
locale continuity and its public-data boundary; it does not establish static
HTML for each query locale. The active plan and
`memory/feedback_static_evidence_and_generated_manifest_hygiene.md` now carry
the corrected rule and verification control.

## Contract and boundaries

- An explicit supported `?lang` wins the saved UI locale.
- A bare course URL canonicalizes to the saved locale only when it is in the
  course's public `availableLocales`.
- An unsupported locale normalizes to the locale actually served, including
  metadata canonical and JSON-LD URLs. This prevents a language claim that the
  course cannot fulfill.
- The shared root layout does not read cookies or use a search-parameter hook;
  this does not by itself prove that every `?lang=` response is prerendered.
- The existing public content projection and auth-before-progress boundary are
  unchanged. No lesson, answer, private-media, progress, database, or identity
  runtime behavior is opened by this checkpoint.

## Verification

- Unit tests: `443 passed` across `59` files, including the public single-locale
  canonicalization helper.
- Lint/typecheck: passed with one pre-existing unused-disable warning in the
  generated content registry.
- Production build: passed for the default generated course path. Query-locale
  staticness is deliberately not claimed; see the correction above.
- Public production-build browser suite: `12/12` passed across Desktop Chromium
  and Pixel 5. It covers signed-out/failure/no-progress, signed-in transition,
  direct Thai share URL with an existing English cookie, query-plus-anchor
  preservation, syllabus language links, and a bare URL with a saved Thai locale.
- `git diff --check`: passed.

## Independent Review In Loop

- Code/security reviewer (Sol high): final `C0 / H0 / M0 / L0`. It found and
  verified fixes for saved-locale overwrite, hash loss, stale localized errors,
  and valid single-locale public-course normalization.
- Independent security reviewer: final `C0 / H0 / M0 / L0`.
- UX/premium reviewer: `C0 / H0 / M0`; desktop and mobile Thai screenshots showed
  no overflow, clipping, or overlap. It confirmed the reader-facing partial
  language state remains plain and accurate.

## Residual Low-Risk Work

1. `SiteChrome` still labels the main navigation landmark as English when the
   chrome is Thai. Owner: Academy chrome i18n. Trigger: next accessibility
   polish checkpoint.
2. Static HTML still begins with English `html[lang]` and chrome before client
   hydration. Owner: Academy i18n routing. Trigger: before public indexing,
   Thai social campaign, or a no-JavaScript accessibility commitment.

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
