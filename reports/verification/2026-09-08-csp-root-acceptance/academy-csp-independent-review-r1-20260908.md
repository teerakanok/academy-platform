# Independent review — Academy CSP r1

**Verdict: PASS (frozen source scope)**

Scope was the SEC-ACADEMY-013 source packet only. No deployment, Worker,
browser, account, or external operation was performed by this reviewer.

## Custody

I read the Academy/Director contracts, work order, SEC-ACADEMY-013 finding,
actual implementation, installed Next source, and dispatcher receipt. All 14
files in `academy-csp-review-scope-r1.json` matched their listed SHA-256 values
before review and again immediately before this report; the retained patch hash
is `812bcd76f3fcfacd3ba7fa3842f25019ba8f1a76b2caf7c5e1c3df03ee080b55`.
No scoped source changed.

## Review evidence

- `middleware.ts:64-88` mints 256-bit random base64 nonce, deletes supplied
  `x-nonce`, CSP, and report-only headers, and forwards its new nonce/CSP to
  rendering. It never trusts client nonce authority.
- Installed Next `15.5.22` parses the forwarded request CSP and extracts only a
  valid quoted nonce for App Router scripts (`dist/server/app-render/
  get-script-nonce-from-header.js` and `app-render.js:109-119`). The nonce
  format emitted by middleware is accepted by that parser.
- Response CSP has `script-src 'self' 'nonce-…' 'strict-dynamic'` without
  `unsafe-inline` or `unsafe-eval`; dev-only configuration retains eval solely
  in development. `ThemeBootstrapScript` and course JSON-LD bind their inline
  scripts to `headers().get('x-nonce')`.
- The previously force-static localized course page is force-dynamic. Both site
  and localized layouts use the nonce-reading theme component, and the Worker
  sets `Cache-Control: private, no-store` on nonce-bearing HTML. This prevents
  cached HTML from reusing a nonce across requests.
- `edge-security-headers.ts` preserves an existing strict nonce/
  `strict-dynamic` response CSP and otherwise applies the no-inline baseline;
  worker media/error/refusal paths retain the fallback. Existing auth, rate,
  host, and cookie controls remain in place.

Dispatcher evidence records 16/16 focused tests. I did not treat that receipt
as the approval basis or repeat the broad suite.

## Remaining required evidence (outside this source verdict)

The author report accurately leaves local OpenNext/workerd and browser proof
pending because the environment could not bind loopback and could not resolve
the existing Google font host. Before deployment, capture built-worker HTML and
sign-in/navigation/hydration behavior, matching nonce attributes for two
responses, nonce rejection, no-store headers, and Worker fallback headers.
This review does not approve deployment or claim runtime success.
