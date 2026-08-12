# Public Course Localized Share-Image Checkpoint — 2026-08-09

## User outcome

A visitor who shares the English or Thai public course receives a matching
locale-specific title, description, and 1200x630 PNG image. The image carries
the course title, subtitle, level, learning-step summary, and Academy marker;
it does not claim that account access or lessons are open.

## Contract and boundaries

- Course metadata derives `og:image` and the Twitter image from the served
  course locale: `/courses/{slug}/share/{locale}`.
- The image route generates only the cross-product of public course slugs and
  their declared supported locales. `dynamicParams = false` and the route guard
  return `404` for unknown, internal, unsupported, or fallback variants.
- Middleware allows only the four-segment share-image route family to reach its
  own static guard. An invalid locale is therefore a `404`, never a sign-in
  redirect.
- The renderer accepts the existing public-course DTO allowlist, not the full
  course registry. Lesson bodies, answer keys, media paths, cues, skill weights,
  progress, identity, and database data remain outside the image and client
  graph.
- Thai glyphs use pinned repo-local Noto Sans Thai regular and bold files with
  their Apache-2.0 license, source URL, revision, and hashes beside the fonts.
  The image renderer performs no network font fetch.
- The PNG routes are static. This statement applies to `/share/{locale}` only;
  the course page's `?lang=` HTML response is not represented as a static query
  variant.

## Verification

- Unit suite: `451/451` passed across `61` files, including public route,
  metadata, projection, and static-param coverage.
- Lint/typecheck: passed with one known generated-registry unused-disable
  warning and no errors.
- Production build: passed. Next enumerated
  `/courses/basic-os-linux/share/en` and `/courses/basic-os-linux/share/th` as
  static generated routes.
- `verify:public-share-images`: passed for every preview course/declared locale
  derived from content, checking the Next manifest and immutable image output.
- `verify:public-share-image-composition`: passed for both images. It decodes
  the final PNG pixels and requires the Academy marker, title safe region, no
  white title pixels against the top edge, and the footer level badge.
- Public production-build E2E: `22/22` passed across desktop and mobile,
  including locale-matched metadata, distinct EN/TH PNG responses, and `404`
  for an unsupported share locale.
- Cloudflare build and `verify:cf-public-share-images`: passed for every
  derived route, confirming static cache entries for both PNGs.
- `git diff --check`: passed.

## Independent Review In Loop

- Code/debt reviewer (Sol high): final `C0 / H0 / M0 / L0`. It independently
  decoded the final 1200x630 PNG bytes and confirmed the EN/TH brand, title,
  and footer bounds. An earlier stale image-preview finding was withdrawn.
- Independent security reviewer: final `C0 / H0 / M0 / L0`. It verified the
  route guard, bounded middleware family, public DTO boundary, derived static
  verification paths, and font provenance.
- UX/premium reviewer: final `C0 / H0 / M0 / L0`. It independently decoded the
  exact final PNG artifacts and confirmed no clipping in either locale.
- A fresh Sol high review also passed `C0 / H0 / M0`; it records one low-risk
  future hardening item: widen the composition assertions when adding a course,
  changing the font, or changing the layout.

## Residual Work

The image bounds verifier is deliberately a layout smoke test, not a general
semantic-overlap oracle. Academy Web must extend its bounds or add a
course-specific visual assertion before admitting another public course,
changing the share-image font, or materially changing this layout.

The course-locale URL decision is now closed by the subsequent canonical locale
checkpoint: public previews use static `/courses/{slug}/{locale}` URLs and the
legacy `?lang=` form redirects for compatibility. See
[`public-course-canonical-locale-checkpoint-2026-08-09.md`](public-course-canonical-locale-checkpoint-2026-08-09.md).

## Safety Record

No database, migration, deployment, external write, paid API, or other
spend-bearing operation was performed. Cumulative session spend: `$0`.
