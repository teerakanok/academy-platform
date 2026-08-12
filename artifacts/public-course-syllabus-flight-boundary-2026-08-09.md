# Public Course Flight Boundary Evidence — 2026-08-09

## Scope

Production-build verification for `/courses/basic-os-linux?lang=th` after the
public-syllabus projection was introduced. This records only the allowlisted
field names, not a raw response capture.

## Command

```sh
curl -sS 'http://127.0.0.1:3003/courses/basic-os-linux?lang=th'
```

## Observed `CourseExperience` props in the Flight response

```text
structure: slug, defaultLocale, availableLocales, level, estimatedMinutes,
           coverMotif, nodes[id, kind, prerequisites, estimatedMinutes]
copy: title, subtitle, audience, outcomes, nodeTitles
locale, translatedNodeIds
```

The response contained none of the denied fields or values: `/media/`, lesson
media filenames, captions, video cues, `skillWeights`, `globalSkillWeights`,
`skillLabels`, or course `version`.

## Deterministic regression control

`academy-web/tests/unit/public-course-projection.test.ts` asserts the exact
top-level projection keys and the same denylist. `academy-web` production
build and the browser transition suite both passed after this capture.
