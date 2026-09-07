# SEC-ACADEMY-013 production script CSP — source verification

Date: 2026-09-08 · Scope: local repository only · Deployment: not attempted

## Implementation

- Middleware now deletes caller-provided CSP, report-only CSP, and nonce headers, then creates a cryptographically random 256-bit nonce per forwarded HTML/RSC request.
- The forwarded CSP and rendered response CSP share that nonce and include `strict-dynamic`; production has no script `unsafe-inline` or `unsafe-eval`.
- Installed Next 15.5.22 source extracts the first script nonce from the forwarded CSP and applies it to hydration scripts. `ThemeBootstrapScript` and course JSON-LD apply the same nonce explicitly.
- The localized public course page is `force-dynamic`; static/ISR rendering cannot consume a per-request nonce. Its existing locale/static-params test remains intact.
- The Worker applies security headers as a fallback. A response already carrying nonce+`strict-dynamic` without unsafe script sources retains that stricter CSP. Worker-bound nonce-bearing HTML gets `Cache-Control: private, no-store`.
- Middleware redirects, JSON denials, 404s, and media/worker fallbacks retain strict baseline protection. Styles remain functional with the existing style-inline allowance.
- `public/_headers` and edge fallback script policy remove `unsafe-inline`. Dev only adds framework-required `unsafe-eval`; it never adds script-inline.

## Commands and results

1. `cd academy-web && npm ci --ignore-scripts && npx vitest run --project unit tests/unit/security-headers.test.ts tests/unit/edge-response-security-headers.test.ts tests/unit/theme-bootstrap.test.ts tests/unit/middleware-production-session.test.ts`
   - PASS: 4 files, 16 tests.
2. `npm run test:unit`
   - PASS: 151 files; 2,450 passed, 2 skipped.
3. `npx tsc --noEmit && npx tsc -p tsconfig.worker.json && npx tsc -p ops/academy-retention-worker/tsconfig.json`
   - PASS.
4. `npm run lint`
   - Existing baseline only: 3 `@typescript-eslint/no-require-imports` errors in `scripts/academy-bound-worker-executor.cjs`; warnings unchanged.
5. Focused RED before implementation: nonce assertions failed because the old middleware emitted no nonce policy.
   - Temporary RED file was removed after the GREEN tests were retained in the four acceptance targets.

## Runtime and build gates

- `npm run build:cf` did not deploy. Its `verify:workerd` preflight failed locally because sandboxed `wrangler dev` received `EPERM` binding `127.0.0.1`.
- A direct OpenNext build then reached `next build` but failed because sandbox DNS could not resolve `fonts.googleapis.com` for the existing Google fonts. This is environment loss, not a CSP compile failure.
- Browser/workerd hydration and sign-in proof therefore remains explicitly PENDING. Do not treat static policy/unit evidence as deployed hydration proof.

## Required operator proof before deployment

1. Run `npm run build:cf` where loopback binding and font fetching are permitted.
2. Start the built worker locally without live accounts; load public and authenticated HTML.
3. Capture DOM confirmation that theme toggling pre-paint, Next hydration/navigation, course JSON-LD, and sign-in navigation work.
4. Capture two HTML responses having unique nonces, matching inline script nonce attributes, no request-controlled nonce, and `private, no-store`.
5. Capture Worker media/error fallback and page CSP headers to confirm nonce preservation and baseline fallback behavior.

## Residual tradeoff

The security/non-reuse tradeoff is dynamic HTML: public localized course HTML is rendered per request instead of shared static HTML. This is required for Next nonce propagation and is reinforced with private/no-store at the Worker boundary.
