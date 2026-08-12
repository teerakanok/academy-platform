# Academy Practice Simulation Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** independent final re-review PASS; C0/H0/M0/L0

## Outcome

The practice simulation UI no longer treats an arbitrary truthy `ok` value or
an unchecked `response.json()` object as a learner verdict. Its same-origin
consumer now accepts the one success shape selected by the trusted course
node's kind and declared by the read-only route:

- capstone: exact `{ok:true, passed:boolean}`
- regular lesson: exact required `ok`, `passed`, `results`, `metCount`, and
  `total` keys, with only the route's optional `debrief` and `hints` keys

Regular results must match the public challenge requirements by exact ID,
label, length, uniqueness, and order. Each result is projected into a new
object. `metCount`, `total`, and `passed` must agree with those projected
results. A debrief is accepted only for a passed verdict; hints must be a
nonempty string array, appear only on a failed verdict, and appear only when the
client requested them. The returned verdict and all nested arrays/objects are
new projections rather than response-owned values.

The request path, method, JSON content type, and serialized fields remain
unchanged. The public `requirements` used for response cross-checking are not
serialized. HTTP failure and every invalid response map to the component's
existing generic failure state. Copy, layout, styling, hint timing, reset
behavior, and learner-visible states are unchanged.

`LessonView` derives the response variant from the trusted `node.kind` already
loaded with the course structure and passes it through `LessonBody` and
`SimulationBlock`. A regular node rejects the passed-only capstone envelope. A
capstone rejects the regular per-requirement envelope, so a mismatched response
cannot propagate those details into the capstone verdict or UI. This consumer
guard cannot retract response bytes already delivered to browser tooling, so
the route's producer-side passed-only contract remains the confidentiality
boundary.

## Shared Raw Boundary

This checkpoint did not add a third JSON parser. The duplicate-safe parser that
was previously private to `attempt-client.ts` was extracted into
`src/lib/http/strict-json-response.ts` and parameterized by the caller's byte
and depth bounds. The shared utility also owns the already-reviewed fixed
`max+1` BYOB reader, declared-length check, five-second default deadline,
non-blocking safe cancellation, fatal UTF-8 decode, and BOM-preserving decode.

The attempt consumer retains its 256 KiB and depth-16 policy and its schema
projectors. Its 67 tests remain green after delegation. The exact-ok helper
retains its separate 128-byte raw regular-expression envelope rule; it reuses
only the shared byte reader and media/cancellation helpers. Waitlist and
unsubscribe therefore keep their sole-envelope behavior, and their 48 tests
remain green. The practice simulation consumer uses 256 KiB and depth 16.

The practice client starts one AbortController deadline before calling `fetch`.
The fetch and strict body reader share that signal. When fetch returns, the
reader receives only the time left until the original deadline rather than a
new five-second allowance. The client timer is cleared in `finally`; the shared
reader removes its abort listener and clears its aligned fallback timer in its
own `finally`. An unresolved fetch and a body that stalls after a slow fetch both
return the same stable `{status:'failed'}` result.

This extraction makes attempt response-body reading use the same BYOB/deadline
fail-closed behavior as the reviewed exact-ok boundary. Local regressions prove
the accepted/rejected contracts under Node's byte-stream implementation, but
deployed target-browser BYOB compatibility remains a separate release proof.

## TDD Evidence

The first focused run failed collection because
`@/lib/simulation/practice-client` did not exist. A temporary
behavior-preserving helper then reproduced the real defect: `29 failed / 8
passed` across 37 tests. The failures included truthy flags, extra and partial
objects, malformed nested results, cross-field inconsistencies, foreign IDs and
labels, unrequested hints, invalid debriefs, duplicate wire keys, malformed and
trailing JSON, BOM, invalid UTF-8, wrong media, oversized and stalled bodies,
non-success body reads, and retained inline component parsing.

After the strict projector, shared raw boundary, and narrow component
delegation, the simulation suite passed 37/37. The immediate shared-boundary
regression passed attempt 67/67, waitlist 32/32, and unsubscribe 16/16 before
the component edit; the combined post-edit run passed 152/152.

Independent RIL then returned `C0/H0/M2/L0`. M-01 found that the consumer
accepted either valid response variant without binding it to trusted
`node.kind`, including accepting per-requirement details for a capstone. M-02
found that the timeout began only after `fetch` returned and gave body parsing a
fresh budget. The tests-only remediation RED was `6 failed / 35 passed`: it
reproduced both cross-variant accepts, the capstone disclosure, an unresolved
fetch, a reset body budget, the missing fetch signal, and the missing trusted
prop chain. After remediation, the expanded focused suite passed 41/41.

## Verification

| Gate | Result |
|---|---|
| Import RED | 1 file failed collection because the helper was absent |
| Behavior RED | 29 failed / 8 passed; unchecked response paths were reproduced |
| Focused GREEN | Practice simulation 37/37 passed |
| Shared consumer regression | Practice, attempt, waitlist, and unsubscribe passed 152/152 |
| Relevant unit/security regression | 7 files / 208 tests passed on Node 24.18.0 |
| Full unit regression | 77 files / 651 tests passed on Node 24.18.0 |
| Independent RIL | FAIL `C0/H0/M2/L0`: unbound response variant and fetch-excluding/reset deadline |
| Remediation RED | 6 failed / 35 passed; both findings and the trusted-chain gap were reproduced |
| Remediation focused GREEN | Practice simulation 41/41 passed on Node 24.18.0 |
| Remediation shared consumer regression | Practice, attempt, waitlist, and unsubscribe passed 156/156 |
| Remediation relevant unit/security regression | 10 files / 278 tests passed on Node 24.18.0 |
| Remediation full unit regression | 77 files / 655 tests passed on Node 24.18.0 |
| Node 24 lint and typechecks | Passed; one pre-existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated and `/api/practice/simulation` compiled |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated `.open-next/worker.js` |
| Dependency audits | Offline dev-inclusive moderate and production high checks each reported `found 0 vulnerabilities`; no fresh network advisory fetch was permitted |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | Tracked `git diff --check` passed; scoped no-index checks returned exit 1 for content differences only, with no whitespace diagnostics |
| Reader-first report gate | Deterministic lint reported 0 errors / 0 warnings; manual author pass found clear scope and neutral framing; independent final review passed C0/H0/M0/L0 |
| Visual | N/A: no copy, layout, styling, or UI state changed; no new server or browser session was started |
| Existing local server | PID 59647 remained the sole listener on port 3003 and was untouched |

DB-backed integration, route execution, and browser/E2E tests were not run.
Local Supabase and a new server were intentionally not started. The practice
route, content/public types, persistence, SQL, Identity, configuration,
deployment, and production state were not edited.

## Ownership Evidence

Pre-slice SHA-256 values:

- tracked-clean `academy-web/src/components/course/blocks/SimulationBlock.tsx`:
  `b5ff6e55fc4961ec472b0bd7cc66b01438729a324bbadb0d6c066f02f3a82960`
- pre-existing untracked `academy-web/src/lib/course/attempt-client.ts`:
  `b10dbf9a4c540f1fc17fc03ca96c92397a80e2af64b7bf69086b47a4f440be2b`
- pre-existing untracked `academy-web/src/lib/http/exact-ok-response.ts`:
  `52ea40f7af08da0f11661696b53eb3e5b574e1dc6a1a8701a3f09682a3edc4ef`
- read-only practice route:
  `434329477d38b84125611eca42323ee0df89b7c4039308e537e5f767f60ce2d3`
- pre-existing dirty plan and completed log:
  `ecdb55561554a779841388a9d565973a062b48f13a898741f2715a56d117930b`
  and `cc23cc3dfaa95fd4f848329003542592098539910d5b860337683244b64edca8`

`strict-json-response.ts`, `practice-client.ts`, and the focused test did not
exist before this slice. The route retained its pre-slice hash. The pre-existing
untracked course-experience E2E changed from
`9485ab4af5fb9b76a71af97d72a11bb221f77441be6c39fd31d0be33f61c5101`
to `48c1eddab047362c673652e7c1283f6efeb4a203805dfbcd586d6fb66f214968`
during the shared-worktree session; this lane did not write it, excludes it
from the slice, and does not use it as evidence.

Pre-report source/test SHA-256 values after GREEN:

- `SimulationBlock.tsx`:
  `64817b9d0fe6ad922f8e9ec21d89c4d9efdea2170063450c3d9f60feed84f424`
- `attempt-client.ts`:
  `054197f899b843b723fa4e374810a65baf3e6eb121c1c14cb1b72efa5de6cb0b`
- `exact-ok-response.ts`:
  `4f8c24126371413a1686ac8e4c5b563b7ec3d6346741e2dbd6218fc6155fe201`
- `strict-json-response.ts`:
  `1cb130118027db67a4f00531c2e6d24d241e692b7df791e314d8d07a4ebf6e8a`
- `practice-client.ts`:
  `d160ff65ee599649fe685b4b7444a258b13e05d3ecd3ea7029b674122451fe5b`
- `simulation-practice-client.test.ts`:
  `5cce06c606303487ed8c4b61f043df94ca48ff3ed4d70c3ca6a71d5c003528f1`

Independent-review remediation baseline SHA-256 values:

- pre-existing dirty `academy-web/src/components/course/LessonView.tsx`:
  `2b9963b15b68a3dc00a4a7837916e25400b777e2b159de3edb16dfd56805f223`
- tracked-clean `academy-web/src/components/course/LessonBody.tsx`:
  `623ff9413d87e42239f10c39d225d16c59b4993717f1e166453dcf09db8793e1`
- `academy-web/src/components/course/blocks/SimulationBlock.tsx`:
  `64817b9d0fe6ad922f8e9ec21d89c4d9efdea2170063450c3d9f60feed84f424`
- `academy-web/src/lib/simulation/practice-client.ts`:
  `d160ff65ee599649fe685b4b7444a258b13e05d3ecd3ea7029b674122451fe5b`
- `academy-web/tests/unit/simulation-practice-client.test.ts`:
  `5cce06c606303487ed8c4b61f043df94ca48ff3ed4d70c3ca6a71d5c003528f1`
- this report, active plan, and completed log:
  `77a1e80dcdaaf2f54de81c98f5b44b7c5eefce9a704f4b98b9b84a434ed17aed`,
  `d02a8294d2580c5277e1c9248abb9a805e97fcb7b6576bbb80a74b9b69127ee4`,
  and `c918c6c81183969f91454f9f0f2392fdcb1933d0c3e358aba9b0a490d9e085c9`

The shared strict parser, exact-ok helper, attempt client, route, public types,
and waitlist/unsubscribe code and tests were read-only during remediation.

Post-remediation source/test SHA-256 values:

- `LessonView.tsx`:
  `eda55e2461677a77f2f279174808cc826330e189f819dc1ab27bd37d5a68b381`
- `LessonBody.tsx`:
  `98cd6049e029ce8f2724d995f34f228b38d77c53994da7c7b001f5d721e4a991`
- `SimulationBlock.tsx`:
  `d7b31dc321f353be6b119b36a27a646362c4f9035b24a91d947635da718263c9`
- `practice-client.ts`:
  `11975f56a058c7aa27e772b93ce6999f7d0f7b4dc9c336b199740445d5cb799d`
- `simulation-practice-client.test.ts`:
  `9fd830c7eafa7609dc7c97a6d69fe2e3a6a101ee56a80a17c3c53916a5334426`

## Exact Slice Inventory

- `academy-web/src/lib/http/strict-json-response.ts`
- `academy-web/src/lib/http/exact-ok-response.ts`
- `academy-web/src/lib/course/attempt-client.ts`
- `academy-web/src/lib/simulation/practice-client.ts`
- `academy-web/tests/unit/simulation-practice-client.test.ts`
- `academy-web/src/components/course/LessonView.tsx` (one prop-chain hunk in a
  pre-existing dirty file)
- `academy-web/src/components/course/LessonBody.tsx`
- `academy-web/src/components/course/blocks/SimulationBlock.tsx`
- `reports/reviews/academy-practice-simulation-client-response-validation-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md` (narrow checkpoint entry in a pre-existing dirty file)
- `plans/completed_log.md` (narrow checkpoint entry in a pre-existing dirty file)

## Remaining Risk

This is local consumer-contract evidence only. It does not prove an
authenticated deployed request, the route's DB-backed authorization path,
target-browser BYOB support, or production behavior. A platform that does not
provide a BYOB response-body reader fails closed instead of showing a verdict.
Independent final re-review passed at C0/H0/M0/L0. That local result is not
authenticated-browser, DB-backed, production, or release evidence.
