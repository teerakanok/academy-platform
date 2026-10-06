# SEC-ACADEMY-017 independent source review R1

**Verdict: CHANGES_REQUIRED**

Review type: read-only, independent, customer-critical source checkpoint. The reviewer did not author the patch, did not edit the 13 frozen files, install dependencies, repeat gates, deploy, access credentials, or call live systems.

## Blocking findings

1. **Quota proportions contradict the recorded remediation.** `authenticated-mutation-quota.ts:18-22` gives simulation grading `120/account/minute` and `90/account-course/minute`, while progress is `120/account/minute` and `60/account-course/minute`. The original SEC-ACADEMY-017 remediation at the frozen base (`security-review-checklist.md:299`) explicitly requires reset/grading to be stricter, but grading is equal at account scope and 50% looser at course scope. This leaves the CPU-heavy `gradeSimulation()` path less protected per course than ordinary progress writes. Lower both simulation ceilings below the progress ceilings (while preserving the observed 30-request learner burst), document the rationale, and add a route-level assertion that grading limits remain stricter.

2. **`Retry-After` can be shorter than the longest observed denying scope.** `authenticated-mutation-quota.ts:89-107` runs account and account-course checks in `Promise.all`, then chooses the first denied result (account order), rather than the longest denial. Concrete case: exhaust the account across courses A/B near the end of its window, then fill a fresh course C whose window ends later. When both scopes deny, the response advertises the shorter account wait; after that wait, C still denies. Return a value at least as large as the maximum `retryAfterSeconds` among all observed denials (or use an equivalent architecture with the same outcome), and add a skewed-window route regression proving the advertised delay reaches the next possible admission. Parallel bounded accounting may remain if chosen deliberately; consuming another bounded counter is not by itself a security failure.

## Source evidence accepted

- All three routes take the account only from `currentUser().account.id`; production `currentUser()` resolves an opaque session to the canonical active Academy account (`auth/session.ts:57-97`). Client `x-account-id` is unused.
- Each route validates a real catalog course/node before quota lookup, bounding account-course object creation to authenticated accounts and catalog courses. Operations and scopes are domain-separated in HMAC-derived opaque names (`edge-rate-limit-policy.ts:265-292`).
- Quota denial/failure returns before entitlement, progress/reset writes, answer-key lookup, and grading (`progress/route.ts:155-198`, `progress/reset/route.ts:76-123`, `practice/simulation/route.ts:58-107`). Responses expose no identity; 429 carries `Retry-After`, and 503 is fail-closed.
- Durable Object storage contains only `{count, resetAt}` and `alarm()` clears all storage (`worker/edge-rate-limiter-do.ts:14-37`). With route catalog validation, source-level cardinality is bounded by authenticated accounts, catalog courses, three operations, and two scopes.
- Production source declares `EDGE_RATE_LIMITER`, exports its class, and forwards the same `env` to OpenNext (`wrangler.jsonc:19-22`, `worker.ts:4-18,45-57`).
- The unit suite imports the actual three route handlers and recorded 6/6 passing cases for ordinary bursts, exhaustion/refill, spoof isolation, and no protected progress mutation after limiter failure. The provider outcome gate records 2,472 passed / 2 skipped overall.

## Evidence limitations and required re-review

- The workerd check is wired into the existing required-check list and uses the real SQLite Durable Object, but it manually installs `Symbol.for('__cloudflare-context__')`; it proves helper/DO compatibility, not a built OpenNext route receiving the binding. The standalone `authenticated-mutation-quota-worker.ts` is typecheck-included but has no durable package/script entry. Full `verify:workerd` and final OpenNext build evidence remain pending.
- Provider result status is advisory `needs_review`. Its focused workerd-pass statement has no retained command log in the supplied receipt; treat it as reported, not independently reproduced evidence.
- Controller-observed Node 24 unit `2472 pass / 2 skip` and lint baseline `3 errors / 17 warnings` are local gate evidence. App typecheck correction is outside this frozen review and was still running when this review was written.
- No build artifact, deployed source, production authentication, quota behavior, or live learner journey was reviewed. Production must remain OPEN.
- Re-review the two findings against a newly frozen patch; retain unchanged identity, placement, HMAC, retention, and route evidence.

## Frozen evidence

- Base: `31c44d07b25a8100548c16eb7314b3b881d809b2`
- Freeze manifest SHA-256: `d23080961689ace1374f9c6ad20e4db423d718a219a4fa2e89ddf7893f04fcee`
- Seed/provider patch SHA-256: `bc97c50b5a91d7f6d83fa37d7a1c7e239a9342775dd4bb7e8e4e1e6575aeab7b`
- Provider result SHA-256: `6c475583291c651e23025696249de201b85d0e3dd0486857ace4694e688048b4`
- Provider receipt SHA-256: `aa3507335196b63d4279731d66f7a65a313c1faae7da2eb010156100d8483f15`
- Frozen file verification: **13/13 matched**, no mismatches.
- `academy-web/docs/edge-rate-limit.md` `5f86c79e43a79dba5b6458b646546b19aeba9afadcb0920aa5871529a3926e80`
- `academy-web/scripts/workerd-signer-check.mjs` `5f93f25beee9ac174158b4a7667ebae6c204231ccd5d70340c55d2dda993716b`
- `academy-web/src/app/(site)/api/practice/simulation/route.ts` `104f24c8d435a1c004b2b08d8a03efc7e1c3588a3fa12883a03b9f2c05cc75ea`
- `academy-web/src/app/(site)/api/progress/reset/route.ts` `f96dd01625d8d3f649d3e78c46bc411a8bb153e8ad3b3d56037318201077dd6c`
- `academy-web/src/app/(site)/api/progress/route.ts` `d5381aeddff3b6ffcc2c04f644ebbe97a4fafca629d3b343a73950bbefcbd226`
- `academy-web/src/lib/edge-rate-limit-policy.ts` `7cc0b16f1fc966e8079da0d6fcfad10eebf34c2b3044282ef87a2af0260d23c5`
- `academy-web/src/lib/authenticated-mutation-quota.ts` `23ffcd258607370a79c0c4110a7b206a35c3b98cc2a8517bfcf68946612217ff`
- `academy-web/tests/unit/authenticated-mutation-quota-route.test.ts` `2632230f48cff9dcc9bf36ddc03b4e619e969cf08a9c6cdf17874ffdd1b6de73`
- `academy-web/tests/workerd/authenticated-mutation-quota-worker.ts` `3fa79879158f7987d58560a6c8bb38d7bc55e9ba8cb85ecfe4635aef4d4c8992`
- `academy-web/tests/workerd/signer-worker.ts` `3476778b6cc250ca305fb92d2812099691baec92f51b1dfdc9212725280dccc3`
- `academy-web/tsconfig.json` `b5088041ca988c42f78ec329b5daa19eb104a7470bbd41429e6896ad0a44b7ae`
- `academy-web/tsconfig.worker.json` `ed012ba569172b6d29e858436aa7b50f3b7386fcf90ac7e28c586569934ec5be`
- `reports/security/2026-09-05-security-review-checklist.md` `053691e84bac0c1564d6ad7e8d02bc783d9a1c1b18bc3eea02f573f88a96e9e6`
