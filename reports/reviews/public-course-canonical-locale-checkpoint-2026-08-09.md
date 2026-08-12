# Public Course Canonical Locale Checkpoint — 2026-08-09

## User Outcome

A visitor can open a stable English or Thai course-preview URL at
`/courses/{slug}/{locale}`. The first static HTML response, page chrome,
metadata, canonical URL, language alternatives, JSON-LD, and social image all
describe that same locale. This remains a decision-ready syllabus preview: it
does not open an account, lesson, progress record, quiz, media asset, or
entitlement.

## Contract and Boundaries

- Canonical public routes are generated only for courses with
  `publicAvailability: syllabus-preview` and their declared supported locales.
  They use `force-static` and `dynamicParams = false`; internal courses and
  undeclared locales return `404`.
- The old `/courses/{slug}?lang=...` route is a permanent compatibility
  redirect. It selects only a public served locale, drops `lang`, and preserves
  non-language query values and fragments. It never accepts a destination URL.
- Canonical localized pages use a dedicated root layout. Its document and
  initial chrome locale are set from the static route parameter, so Thai is
  declared before JavaScript runs rather than corrected after hydration.
- Public pages resolve through `getPublicCourse` and serialize the
  `toPublicCourse` allowlist only. The signed-out path does not request
  progress.
- Learners use the separately protected `/courses/{slug}/learn` route. It
  requires a user, activation, and course-resource authorization before it can
  render the learner overview. Middleware does not classify this route as
  public.
- Static localized course pages and static locale-matched share PNGs are both
  verified in Next output and in the local OpenNext cache. The verifiers derive
  their paths from content admission data, not a hard-coded course list.

## Verification

- Production Next build passed. It generated immutable SSG pages
  `/courses/basic-os-linux/en` and `/courses/basic-os-linux/th`, with fallback
  disabled.
- `verify:public-course-pages` passed for both routes. It verifies the Next
  manifest, raw static `<html lang>`, and branded raw document title.
- `verify:public-share-images` and
  `verify:public-share-image-composition` passed for both locale-matched PNGs.
- Unit suite: `453/453` passed across `61` files.
- Public production-build E2E: `24/24` passed on desktop and mobile. Coverage
  includes Thai before JavaScript, signed-out no-progress behavior, protected
  learner transition, legacy redirect query/fragment preservation, metadata,
  and locale switching.
- `build:cf`, `verify:cf-public-course-pages`, and
  `verify:cf-public-share-images` passed, confirming the two localized pages
  and two share images have OpenNext static-cache entries.
- `git diff --check` passed.

## Independent Review In Loop

- Code/debt reviewer (Sol high): `C0 / H0 / M0 / L1`.
- Security reviewer: `C0 / H0 / M0 / L0`.
- UX/accessibility reviewer: `C0 / H0 / M0 / L0`.

## Residual Work

`CourseLocaleChromeSync` still contains compatibility normalization branches
for bare or malformed `?lang` values even though canonical localized pages now
provide a valid path locale. This is bounded maintenance debt, not a runtime
or user-facing defect. Remove it when legacy query compatibility and the
catalog-locale strategy are consolidated.

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
