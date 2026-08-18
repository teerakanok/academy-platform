# Academy Edge Security Hardening - Local Checkpoint

**Date:** 2026-08-17
**Status:** PASS (`C0/H0/M0/L0`)
**Scope:** Academy local edge marker, headers, IP trust, and touched-route logging

## Outcome

The edge rate-limit marker is now HMAC-signed and bound to method, path, and
time. Route handlers verify the signed marker with `RATE_LIMIT_KEY_SECRET`
before bypassing local rate limits. CSP is enforced, HSTS includes subdomains
and preload, production IP extraction fails closed without Cloudflare IP, and
touched error logs use `safeErrorMessage`.

No production database, Pool A, Identity Control production route, DNS, mail,
credential, deployment, payment, roster, or release operation occurred.

## Changed Paths

- `academy-web/next.config.ts`
- `academy-web/worker.ts`
- `academy-web/src/lib/edge-rate-limit-policy.ts`
- `academy-web/src/lib/request-ip.ts`
- `academy-web/src/lib/safe-log.ts`
- Touched API route files listed in
  `reports/reviews/academy-edge-security-hardening-freeze-20260817.json`
- Focused unit tests listed in the freeze manifest
- `reports/reviews/academy-edge-security-hardening-freeze-20260817.json`

## Verification

- `rtk node ../../../scripts/checkpoint-freeze-manifest.mjs verify --root . --manifest reports/reviews/academy-edge-security-hardening-freeze-20260817.json`
  passed with `FILE_COUNT=19`.
- `rtk npm run test:unit -- tests/unit/edge-rate-limit-policy.test.ts tests/unit/security-headers.test.ts tests/unit/request-ip.test.ts tests/unit/safe-log.test.ts`
  passed `15/15`.
- `rtk npm run lint` passed with `0` errors and one pre-existing warning in
  `src/lib/content/registry.generated.ts`.
- Targeted grep found no raw unsafe logging pattern in the four routes called
  out by review.
- Scoped `git diff --check` passed.

## Independent Review

Initial read-only review: `REJECT C0/H0/M1/L0`.

In-bound finding:
- Four touched routes still logged raw `error.message` or `error.code`.

Remediation:
- `otp`, `sign-out`, `leads`, and `leads/unsubscribe` now log through
  `safeErrorMessage`.
- Manifest was regenerated and re-verified after remediation.

Closure review: `PASS C0/H0/M0/L0`.

Residual risks:
- Closure covered the touched route callsites, not a broader logging audit of
  the entire product.
- Full unit test sweep was not used as acceptance because unrelated content
  registry drift exists outside this checkpoint.

