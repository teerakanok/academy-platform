# Public Course Syllabus Checkpoint — 2026-08-09

## User outcome

Before accounts open, a visitor can decide whether the public `Basic OS & Linux`
course route fits their goal. The route shows outcomes, its ordered learning
steps, prerequisites, duration, required checkpoints, language availability,
and a launch-update path. It does not present an internal fixture as a course,
or imply that a visitor can begin tracked learning today.

## Boundaries

- `publicAvailability` is explicit and default-deny. `basic-os-linux` is a
  `syllabus-preview`; `content-formats-demo` remains internal.
- Catalog, home, direct public course route, static params, sitemap, and OG
  image params use the public selector.
- `toPublicCourse()` is an allowlist projection across the Server-to-Client
  boundary. Lesson content, answers, private-media paths, cues, skill weights,
  skill labels, version, and global skill metadata are excluded.
- The signed-out and auth-failure states retain the static syllabus and make no
  progress request. A confirmed signed-in state loads the existing overview and
  then progress.

## Verification

- Unit tests: `441 passed` across `58` files.
- Lint/typecheck: passed; the generated-registry unused-disable warning existed
  before this checkpoint and remains non-blocking.
- Production build: passed; only `basic-os-linux` is generated for the public
  course and OG routes.
- Browser transition suite: `npm run test:e2e:public` passed `3/3` without DB,
  Identity, or external service calls.
- Production response check: public course `200`; internal demo course `404`.
  Flight boundary details are recorded in
  [`artifacts/public-course-syllabus-flight-boundary-2026-08-09.md`](../../artifacts/public-course-syllabus-flight-boundary-2026-08-09.md).
- Visual review: desktop English and mobile Thai production screenshots showed
  no overflow, clipping, or overlap. Thai states its one translated learning
  step before the roadmap and labels the remaining English steps.

## Independent review

Independent code, security, and UX reviews all returned `C0 / H0 / M0` after
their findings were fixed. The reader-first review passed for the public copy.

## Residual low-risk work

1. Generate a locale-aware Thai social image before enabling indexing or using
   Thai course URLs in a social campaign.
2. Restore the learner course-specific skill radar through a protected
   learner-data boundary before opening account runtime.

## Safety record

No DB, deployment, paid API, or other spend-bearing operation was performed.
