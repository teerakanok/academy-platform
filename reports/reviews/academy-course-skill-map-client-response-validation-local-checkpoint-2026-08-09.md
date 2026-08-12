# Academy Course Skill-Map Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Status:** independent closure review PASS; C0/H0/M0/L0
**Scope:** Academy product-local learner skill-map client only

## Outcome

The learner course skill-map client now turns a successful HTTP response into
chart data only after a bounded, duplicate-safe JSON read and an exact deep
projection. It no longer uses unbounded `response.json()` or returns objects
owned by the response body.

The existing route contract remains unchanged: an authorized success is
`{ok:true,coverage:[{id,label,value,notStarted}]}`. The consumer requires the
sole wrapper and item keys, a nonempty coverage list, nonempty IDs and labels,
integer values from 0 through 100, boolean `notStarted`, and one item per ID.
The unique-ID check protects the existing chart/table identity contract, where
each row and label uses `id` as its key. Valid responses are rebuilt as new
arrays and objects before they reach the UI.

The projector also preserves the producer's one-way start-state invariant:
`notStarted=true` is valid only with `value=0`. It intentionally accepts
`notStarted=false` with `value=0`, because a started skill with a small covered
weight can round down to zero.

Malformed JSON, duplicate wire keys at any level, a BOM, invalid UTF-8, the
wrong media type, an oversized or stalled body, malformed fields, and an
unresolved request all fail to the existing `unavailable` result. HTTP 401 and
403 retain `signed-out` and `access-lost`. Denied and other non-success bodies
are canceled without being read.

## Boundary Design

The client imports the existing `readStrictJsonResponse` boundary. No third raw
JSON parser was created. That shared reader supplies duplicate-detecting
parsing, fatal UTF-8 decoding with BOM rejection, JSON media validation, BYOB
`max+1` reads, depth enforcement, and abort-aware cancellation. The client adds
only the course-specific exact projector and request orchestration:

- response size: 256 KiB maximum;
- JSON depth: 8 maximum;
- request deadline: one AbortController starts before `fetch` and covers both
  fetch and body parsing; the reader receives only the remaining time;
- response result: a deep projection or the existing stable failure union.

The route, course loader, skill projection, shared response reader, chart,
copy, layout, persistence, Identity, and deployment configuration were read
only for this checkpoint.

## TDD Evidence

Before the source edit, the new exact-request test failed because the existing
fetch had no AbortSignal (`1 failed / 31 skipped`). A full matrix RED attempt
was stopped after it did not complete: the prior client left the new unresolved
fetch case pending with no request deadline. This is recorded as timeout
evidence, not as a completed assertion count.

After the source edit, the focused suite passed 32/32. It covers:

- exact request URL/cache/signal and deep projection without `response.json()`;
- exact wrapper/item keys and valid JSON whitespace;
- empty, missing, extra, wrong-type, fractional, out-of-range, and duplicate-ID
  coverage cases;
- duplicate top-level, escaped, and nested wire keys;
- malformed/trailing JSON, null/array roots, BOM, invalid UTF-8, and wrong media;
- a bounded oversized single-chunk BYOB read and stalled-body cancellation;
- a deadline that begins before fetch and is not reset for body parsing;
- body-free 401/403/non-success classification and stable network failure.

The initial independent review returned `C0/H0/M1/L0`: a positive value marked
`notStarted=true` passed the consumer even though `courseSkillData()` can set
that flag only when covered weight is zero. Remediation RED failed exactly that
case (`1 failed / 33 passed`), while the explicit rounded-zero started control
passed. The one-way predicate then made focused GREEN pass 34/34, relevant
skill-map regression pass 42/42, and full unit regression pass 687/687 on Node
24.18.0.

## Verification

| Gate | Result |
|---|---|
| Targeted RED | 1 failed / 31 skipped: fetch request had no AbortSignal |
| Full-matrix RED | Stopped after the unresolved fetch did not settle; no completed assertion count claimed |
| Focused GREEN | 1 file / 32 tests passed |
| Relevant unit regression | 4 files / 40 tests passed on Node 24.18.0 |
| Full unit regression | 77 files / 685 tests passed on Node 24.18.0 |
| Node 24 lint and typechecks | Passed; one pre-existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated and `/api/courses/[slug]/skill-map` compiled |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated `.open-next/worker.js` |
| Dependency audits | Offline dev-inclusive moderate and production high checks each reported `found 0 vulnerabilities` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Visual | N/A: copy, layout, styling, and rendered UI states did not change |
| Existing local server | PID 59647 remained the sole listener on port 3003 and was untouched |
| Initial independent review | FAIL `C0/H0/M1/L0`: missing one-way `notStarted`/value invariant |
| Remediation RED | 1 failed / 33 passed; positive value marked not started was accepted |
| Remediation focused GREEN | 1 file / 34 tests passed on Node 24.18.0 |
| Remediation relevant regression | 4 files / 42 tests passed on Node 24.18.0 |
| Remediation full unit regression | 77 files / 687 tests passed on Node 24.18.0 |
| Remediation lint and typechecks | Passed; one pre-existing generated-registry warning |
| Remediation dependency audits | Offline moderate and production high checks each reported `found 0 vulnerabilities` |
| Remediation secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Different independent re-review | Pending; this report does not self-approve the remediation |

DB-backed integration, authenticated route execution, and browser/E2E tests
were not run. Local Supabase and a new server were intentionally not started.
Deployed-browser stream behavior remains a separate production proof.

## Ownership Evidence

The repository began at HEAD
`845e371173efb7b15b7605ecbc9496c47e2068fb`, with 161 dirty paths and no
staged paths. Pre-slice SHA-256 values:

- pre-existing untracked `academy-web/src/lib/course/skill-map-client.ts`:
  `8b50b9c4f0fb9912ec69904c012d2b51f99d84c66fc8318ae337dc1456dad0ea`
- pre-existing untracked `academy-web/tests/unit/course-skill-map-client.test.ts`:
  `cc55a4bbf2c136f8752ea3fa6781e19f52d5edde7cfb889e5edb1c8f577d682d`
- pre-existing modified `plans/active_plan.md`:
  `b74878d1cf50b13deb8f2713a51391a78987b6b0fa930f9edab5e2540f0f936b`
- pre-existing modified `plans/completed_log.md`:
  `a80b904ddcd2cf36dd24ffd352dfe35a221613b89737fb0335a7c9c85967535b`
- this report: absent before the slice.

Read-only boundary hashes at freeze preparation:

- `academy-web/src/lib/http/strict-json-response.ts`:
  `1cb130118027db67a4f00531c2e6d24d241e692b7df791e314d8d07a4ebf6e8a`
- `academy-web/src/app/(site)/api/courses/[slug]/skill-map/route.ts`:
  `230e3be84923f9bbedfeeabc6c583983c2be84bb1d323cc6d15dd840daaadd4f`
- `academy-web/src/components/course/CourseSkillMap.tsx`:
  `98b2d0e571e5e41256177eae884e98545de7164dc37eccbacd292a8660f1002b`
- original feature report:
  `9bbf0cdaaf72d84cb4591830398e1efae49ac728c39f099a5c65ef7f220bb24a`

Only the client, its focused test, this report, and narrow plan/log entries are
owned by this slice. No file was staged, committed, pushed, or deployed.

## Remaining Gates

This checkpoint is local consumer-boundary evidence. Independent closure review
passed at C0/H0/M0/L0. Authenticated route/DB behavior, deployed browser
behavior, and the existing external production gates remain outside this slice.
