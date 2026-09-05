# GLM-5.3 fact-check of every Academy course — 2026-09-05

One JSON per course (`findings[]` with severity / title / message / evidence). Reviewer: GLM-5.3 at max
effort, review mode, read-only over the content tree at `content/import-secplus-isc2cc` (5e587b6).
Security+ and ISC2 CC findings were applied at the source (Crucible `content/academy-course-copy`) and
re-imported (920f257). **The other eight courses are NOT fixed yet** — every CRITICAL below is a wrong
answer key or a false fact learners will act on, and must be corrected (in this repo's content dir,
which is where those eight courses are authored) before `publicAvailability` moves beyond
`syllabus-preview`.

| course | status | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|---|
| setup-and-environment | complete | 0 | 4 | 6 | 2 |
| basic-os-linux | complete | 1 | 7 | 5 | 2 |
| git-essentials | complete | 1 | 4 | 7 | 4 |
| c-low-level | complete | 2 | 5 | 8 | 1 |
| operating-systems | complete | 2 | 4 | 4 | 3 |
| computer-architecture | complete | 1 | 2 | 6 | 4 |
| computer-networking | complete | 3 | 9 | 2 | 0 |
| assembly | complete | 1 | 4 | 7 | 4 |
| comptia-security-plus | applied 2026-09-05 | 0 | 2 | 8 | 5 |
| isc2-cc | applied 2026-09-05 | 2 (course copy, fixed) | 8 | 8 | 4 |

Verify each finding against the lesson before applying (the reviewer is a reviewer, not an oracle);
apply en and th together; never change a checkpoint key unless the finding proves it wrong; re-run
`npx vitest run --project unit tests/unit/content-registry.test.ts tests/unit/course-content.test.ts
tests/unit/checkpoint-answer-bias.test.ts` afterwards.
