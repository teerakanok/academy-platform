# Academy Production Identity And Mail Readiness

Status date: `2026-09-02`

## Outcome

The production activation for the shared Academy sign-in dependency completed
and passed rollback-bound postconditions. Academy remains an internal preview
behind Cloudflare Access. Full authenticated learner readiness is not yet
claimed because the owner-present canary walkthrough is still pending.

## Active Baseline

- Academy deployment: `20f58559-daa8-4b77-81f7-7885686c1a14`.
- Academy version: `bd4aea53-9137-4d49-a5f4-3a74be959736`, `100%` traffic,
  version `28`, tag `release-646206ed7cdd`, CPU limit `500 ms`.
- Shared Identity revision:
  `8db80f2c98d7d3adfcda9f8a738c810688615666`.
- Identity API and Account Center artifacts matched the immutable activation
  manifest before traffic was accepted.
- Auth runtime: exact pinned GoTrue `v2.186.0` image, running healthy with
  restart count `0` at activation verification.

## Executable Evidence

- Account Center root and health returned `200`.
- Raw Academy Worker returned `200`.
- Canonical Academy root, `/courses`, and `/auth/callback` returned the expected
  Cloudflare Access `302`.
- Active Identity artifacts contain the second fresh challenge path from
  Account Center through the control API to
  `gotrue_meta_security.captcha_token`.
- A controlled direct request without a CAPTCHA proof returned the exact
  pinned-image denial classification before provider invocation; synthetic user
  count remained `0 -> 0`.
- SMTP admission proved TLS and accepted the approved sender envelope without
  RCPT or DATA. Root SPF, parent DKIM, and root DMARC gates passed.
- Sanitized Auth logs after activation contained the expected controlled
  missing-CAPTCHA classification and no fatal/panic, provider-send failure, or
  rate-limit category. No owner send occurred after activation.

No secret, challenge, email address, one-time code, cookie, callback query, or
provider payload is stored in this record.

## Remaining Gate

When the owner is present, issue exactly one real code request using the
approved existing canary and fresh Turnstile challenge. Observe provider
acceptance/delivery using sanitized categories, then complete Academy callback,
dashboard/catalog, entitled `setup-and-environment`, progress persistence after
reload, responsive `412x915`, sign-out, and independent cleanup verification of
only progress created during the run.

Until that journey passes, exact status is `BLOCKED` on owner-present browser
input, not on production code, runtime, mail admission, or CAPTCHA wiring.

The current automated Chrome control plugin also has a local runtime-version
mismatch. This is a playtest-tooling constraint, not a production failure;
resume through a repaired controller surface or owner-visible manual steps
without inspecting browser storage or credentials.

## Cleanup

Four clean, consumed review-only projections were removed after activation.
The main Academy writer, Identity writer, controller, unique implementation
lane, production rollback custody, and activation evidence remain retained.
