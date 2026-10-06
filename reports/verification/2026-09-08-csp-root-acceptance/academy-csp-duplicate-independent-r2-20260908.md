# Independent re-review — Academy CSP duplicate-policy correction r2

**Verdict: PASS (affected frozen source correction only).** Browser/workerd
acceptance remains pending and is not included in this verdict.

## Custody

I read `academy-csp-review-scope-r2.json`, the two changed source/test files,
unchanged CSP fallback paths, and supplied RED/GREEN logs. I recomputed all 14
scope hashes before and after review; every value matches r2, including changed
`next.config.ts` `be4bd853…f3aad` and
`security-headers.test.ts` `e67c6164…0b8ea`. No source was changed.

## Result

- `next.config.ts:14-37` omits `Content-Security-Policy` when not in
  development. This removes the confirmed second Next-config policy while
  preserving all non-CSP baseline headers.
- Development alone retains a policy with `script-src 'self' 'unsafe-eval'`.
  Production has no global configured CSP and cannot reintroduce the blocking
  `script-src 'self'` alongside middleware's nonce policy.
- `public/_headers` retains the strict static-asset fallback; `worker.ts` and
  `edge-security-headers.ts` remain unchanged, so Worker/error paths still
  apply the static no-inline fallback and preserve a strict nonce page policy.
- The corrected test asserts the production global headers contain no CSP,
  validates the fallback directives, and separately exercises development.
  The supplied RED log shows that assertion fails before the correction;
  focused GREEN is 12/12 and root full unit is 2,450 passed / 2 skipped.

This is the smallest correction for the r9 duplicate-CSP cause. It does not
prove browser rendering: root's pending workerd/browser run must demonstrate
exactly one effective document CSP, matching nonce attributes, hydration and
navigation success, and static/error fallback headers before any deployment
decision.
