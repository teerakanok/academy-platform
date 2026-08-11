# Academy Identity Control local browser flow

Status: **FINAL DIFFERENT INDEPENDENT PASS - C0/H0/M0/L0**

## Product outcome

A learner can now exercise the complete shared-account journey locally in a real browser:

1. Open Academy sign-in and continue to CYBERSKILLS Account Center.
2. Enter an email address and the fake-local six-digit code.
3. Return through the request-bound Academy callback.
4. Receive an opaque Academy session and open My learning.
5. See an honest empty enrollment with a direct path to browse the public catalog.

The dashboard distinguishes a suspended Academy activation from an active account: a
suspended local session remains an identity session but receives `403` for Academy course
access.

## Implementation boundary

- The runtime is available only when the explicit local fixture switch is on, the process
  is non-production, request/app origins are exact loopback origins, and the supported
  Academy development command binds Next to `127.0.0.1`. The Account Center and Control
  API development peers also bind explicitly to `127.0.0.1`.
- Authorization transactions and sessions use the accepted durable file stores.
- The callback sends the local code exchange through the strict bounded JSON reader and
  validates issuer, audience, nonce, service, and activation before creating a session.
- The browser receives only an opaque HttpOnly SameSite session cookie.
- The local CSP permits form navigation only to the exact configured loopback Account
  Center origin; the production CSP remains unchanged while production runtime is disabled.
- No course entitlement is synthesized. Registry enablement, production keys, email
  delivery, deployment, and release approval remain separate work.
- Sign-in remains reachable when an expired, revoked, unknown, or unreadable local session
  cookie is present. Local sign-out always expires the browser cookie even when durable
  revocation cannot be confirmed.

## Evidence

- Initial TDD RED/GREEN for the local route composition and non-loopback refusal.
- Activation RED/GREEN: suspended session changed from incorrect `200` to `403`.
- First code/security review: **FAIL C0/H0/M2/L0**. It found the default all-interface
  Next listener and the stale-cookie/sign-out recovery dead end. The UX review returned
  **FAIL C0/H0/M1/L1** for the empty-dashboard dead end and course-specific return copy.
- Recovery RED: **3 failed / 2 passed**. Green focused recovery/local-flow: **4 files / 8 tests**.
- Node 24 Identity/auth/security regression: **41 files / 534 tests**.
- Academy ESLint plus main, Worker, and retention TypeScript configs: **PASS**; one
  pre-existing generated-registry warning remains.
- Chromium end-to-end: **4/4** on desktop and Pixel 7 mobile. The flow reached the empty
  dashboard, exposed a catalog action, transferred keyboard focus between email/code
  forms, refused malformed authorization, returned the verified local email from
  `/api/auth/me`, and recorded console errors **0** and failed requests **0**.
- Visual evidence covers sign-in, Account Center email, Account Center code, and dashboard
  on both viewports in
  `academy-web/artifacts/identity-local-browser-flow-2026-08-11/`.
- Commit-isolation verification rebuilt this journey from Academy `HEAD` without the
  concurrent public-course or full route-group migration. On that exact tree, Node 24
  focused tests passed **9 files / 25 tests**, the full unit suite passed **82 files /
  904 tests**, lint plus all TypeScript configs passed, and the production Next build
  compiled and generated **29/29** static pages. The build route table contains the
  authorization start, callback, account, sign-out, progress, sign-in, and dashboard
  surfaces with no duplicate route.

## Visual review

All eight remediated images were inspected at original resolution. Product UI has no
clipped or overlapping text, the Account Center promise matches the dashboard destination,
and the empty dashboard now offers `Browse available courses` on both viewports. The small
Next development badge visible over the mobile footer is framework-only development chrome
and is not present in a production build.

## Independent closure

The different reviewer returned **PASS C0/H0/M0/L0** against the isolated freeze. Fresh
reviewer evidence passed focused **9 files / 25 tests**, full unit **82 files / 904 tests**,
ESLint, all three TypeScript configs, staged diff and secret checks, reader-first review,
and final manifest verification. The review confirmed the loopback listener contract,
stale-cookie recovery, unconditional browser cookie expiry, route integrity, and the
desktop/mobile customer next action without introducing production authority.
