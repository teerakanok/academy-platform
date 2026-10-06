# SEC-ACADEMY-017 independent source review R2 — terminal freeze R3

**Verdict: PASS**

Review type: read-only re-review of the same bounded, customer-critical checkpoint through the existing independent route. The reviewer did not author or edit the patch, install dependencies, repeat gates, deploy, access credentials, or call live systems. This pass closes the two R1 source findings; it is not production or deployment authority.

## R1 findings re-reviewed

1. **CLOSED — grading is now stricter while preserving the tested learner burst.** `authenticated-mutation-quota.ts:18-22` sets progress to `120/account/minute` and `60/account-course/minute`, simulation grading to `60/account/minute` and `30/account-course/minute`, and reset to `6/account/hour` and `3/account-course/hour`. Both grading scopes are half the progress budget, matching the original remediation. The actual-route test uses one authenticated user to admit 30 same-course requests and deny request 31, then a distinct user to admit 60 requests across two courses and deny account request 61 (`authenticated-mutation-quota-route.test.ts:248-261`). Controller-observed causal RED was status `200` where `429` was required; corrected test is GREEN.

2. **CLOSED — `Retry-After` covers every observed denying scope.** `authenticated-mutation-quota.ts:89-107` retains bounded parallel scope checks, filters all denials, and returns the maximum `retryAfterSeconds`. The actual-route regression skews the account and course windows, asserts `Retry-After: 60` rather than the shorter account remainder, advances to the advertised boundary, and observes admission (`authenticated-mutation-quota-route.test.ts:260-272`). Controller-observed causal RED was `30` where `60` was required; corrected test is GREEN.

## Narrow harness correction

- The first nested build invocation exposed persisted workerd state: the fixed actor/target object names returned `actor=false/false target=false` on a later run. `signer-worker.ts:79-94` now appends one `crypto.randomUUID()` per harness request to both probe names. The same real SQLite Durable Object, `limit:1`, first-allow/second-deny assertion, and actor/target isolation assertion remain intact; this removes cross-run fixture coupling without weakening the check.
- Retained `academy-learning-quota-root-workerd-r2.log` records all 14 required checks PASS, including the authenticated mutation quota binding and existing signer/media/edge checks. Compatibility matches the app.

## Retained source and gate evidence

- All three routes still derive identity only from `currentUser().account.id`, validate a catalog course/node before quota key creation, use operation/scope-separated HMAC names, and return 429/503 before entitlement, grading, or protected writes. Responses leak no identity.
- Durable Object storage remains `{count, resetAt}` and `alarm()` deletes storage. Source cardinality remains bounded by authenticated accounts, catalog courses, three operations, and two scopes.
- The real production source exports `EdgeRateLimiter`, declares its binding, and forwards the same environment to OpenNext. The existing workerd required-check list includes the authenticated quota check.
- Retained `academy-quota-correction-unit-r3.log`: actual route quota suite `8/8`; full unit `2,474 passed / 2 skipped`, exit 0, SHA-256 `39a367569b19e0f2e9ce446a04ae719eb9d3ab1111809eba51a560cf17f2aa13`.
- Retained `academy-quota-correction-lint-r3.log`: exit 1 with the exact accepted baseline `3 errors / 17 warnings`, SHA-256 `7fbda2d64a84dd3a3fe4a7294b1d5b27aed7892b773e5183f60e0e7a2c106b3d`.
- Root gate record reports app, worker, and ops TypeScript exits 0. The three JSDoc/test-fixture type corrections are outside the frozen 13-file quota review and were not treated as quota source evidence.
- Hash-backed `academy-quota-root-acceptance-r3.json` records root's direct observation of final `npm run build:cf` exit 0 after the UUID fixture correction: workerd 14/14, Next compile/pages 65/65, OpenNext bundle complete, cache 64, asset guard PASS, and final Worker initialization on real workerd with raw-host 404/outbound blocked. The receipt SHA-256 is `9ca91893b020ba302085b96c28234b98985b6bfcc166395e41d4fe68333b9a19`; it truthfully marks the final raw log unretained. The older `academy-learning-quota-root-build-r2.log` is a superseded pre-correction failure and is not attributed as final-build evidence.

## Evidence boundary

- Source and local build checkpoint: PASS. No build artifact, deployment, authenticated production quota exercise, or live learner journey was reviewed. SEC-ACADEMY-017 must remain **SOURCE VERIFIED — PRODUCTION OPEN** until separately authorized production proof.

## Frozen evidence

- Base: `31c44d07b25a8100548c16eb7314b3b881d809b2`
- Terminal freeze manifest SHA-256: `1a64acbf17c0cf3c35be8bd13a10e5c129295220d52674e77a9242997bead1fb`
- Original seed/provider patch SHA-256: `bc97c50b5a91d7f6d83fa37d7a1c7e239a9342775dd4bb7e8e4e1e6575aeab7b`
- Frozen file verification: **13/13 matched**, no mismatches.
- `academy-web/docs/edge-rate-limit.md` `0b83cff5d877c7abc2a3127d7f6be5d1adc039ea6551b2ce9ed5125e13695411`
- `academy-web/scripts/workerd-signer-check.mjs` `5f93f25beee9ac174158b4a7667ebae6c204231ccd5d70340c55d2dda993716b`
- `academy-web/src/app/(site)/api/practice/simulation/route.ts` `104f24c8d435a1c004b2b08d8a03efc7e1c3588a3fa12883a03b9f2c05cc75ea`
- `academy-web/src/app/(site)/api/progress/reset/route.ts` `f96dd01625d8d3f649d3e78c46bc411a8bb153e8ad3b3d56037318201077dd6c`
- `academy-web/src/app/(site)/api/progress/route.ts` `d5381aeddff3b6ffcc2c04f644ebbe97a4fafca629d3b343a73950bbefcbd226`
- `academy-web/src/lib/edge-rate-limit-policy.ts` `7cc0b16f1fc966e8079da0d6fcfad10eebf34c2b3044282ef87a2af0260d23c5`
- `academy-web/src/lib/authenticated-mutation-quota.ts` `62bfa533d54eb4b667dd56b53269cecc549d858d7aeb664a5942dc8112fdcbe6`
- `academy-web/tests/unit/authenticated-mutation-quota-route.test.ts` `cb45ac483d8f7913d71d20682a7c21aa7abadbc50d090b8949a59ef5f349fd6b`
- `academy-web/tests/workerd/authenticated-mutation-quota-worker.ts` `3fa79879158f7987d58560a6c8bb38d7bc55e9ba8cb85ecfe4635aef4d4c8992`
- `academy-web/tests/workerd/signer-worker.ts` `db4daacb37bab7fc483081237f763ff8c7d3efd3516231adcec794909567be03`
- `academy-web/tsconfig.json` `b5088041ca988c42f78ec329b5daa19eb104a7470bbd41429e6896ad0a44b7ae`
- `academy-web/tsconfig.worker.json` `ed012ba569172b6d29e858436aa7b50f3b7386fcf90ac7e28c586569934ec5be`
- `reports/security/2026-09-05-security-review-checklist.md` `053691e84bac0c1564d6ad7e8d02bc783d9a1c1b18bc3eea02f573f88a96e9e6`
