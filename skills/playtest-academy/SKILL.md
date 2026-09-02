---
name: playtest-academy
description: Run a repeatable zero-knowledge Academy learner walkthrough, including an explicitly authorized canary account when needed, UX observations, evidence capture, and owned cleanup. Use for Academy production or staging playtests, learner journey checks, release walkthroughs, or requests to verify that a learner can sign in, enroll, study, and complete course work.
---

# Playtest Academy

Test the deployed product as a first-time learner. This skill does not grant live,
account-creation, enrollment, database, email, or cleanup authority.

## Inputs

Before opening the product, establish:

- target environment and canonical URL;
- current authority for any live mutation;
- the journey boundary (public-only, sign-in, enrollment, lesson, assessment,
  completion, or certificate);
- who owns canary cleanup and when it must happen.

Use an existing approved canary when one is reachable. Create a new canary only
when the requested journey requires it and current authority covers creation and
cleanup. Generate its unique identifier locally, keep the raw identifier and any
login material in a protected ephemeral file outside the repository, and record
only a SHA-256 identifier digest in ordinary evidence. Never place secrets,
one-time codes, cookies, tokens, private keys, or credential-bearing URLs in chat,
screenshots, traces, reports, or the repository.

## Walkthrough

Use a clean browser context with no inherited Academy state. Start from the
canonical public entry point without reading implementation details that would
teach the expected UI. Follow only visible controls and copy as a new learner:

1. Confirm the public entry point, course discovery, language, and responsive
   layout at one desktop and one mobile viewport.
2. Follow sign-in through the real identity boundary when it is in scope.
3. Confirm the learner reaches an honest account state. Do not manufacture an
   enrollment unless the playtest authority and cleanup plan cover it.
4. For an authorized enrolled canary, enter a course, consume one representative
   lesson, exercise one interactive or assessment step, reload, and confirm
   progress is durable and belongs only to that account.
5. Exercise the visible recovery or exit path relevant to the journey, such as
   sign-out, retry, resume, or navigation back to the course.

Observe user-visible copy, dead ends, focus, keyboard use, responsive geometry,
console errors, failed requests, and unexpected cross-account data. Do not inspect
answers, internal fixtures, database rows, or source code during the walkthrough.
Use implementation inspection only afterward to diagnose an observed failure.

Stop immediately on cross-account data, answer leakage, unsafe redirect, exposed
credential, destructive behavior, or an unexpected production mutation. Preserve
sanitized evidence and report the boundary without probing wider.

### Browser evidence safety

Treat browser accessibility trees, screenshots, address bars, DevTools, and
provider dashboards as credential-bearing until proven otherwise. Authentication
redirect URLs can contain short-lived tokens and dashboards can expose account or
learner identifiers even when the visible task is read-only.

Before emitting browser state into a tool transcript or evidence record:

1. Keep the full state inside the browser-control runtime; do not print it.
2. Extract only an explicit allowlist of fields needed for the claim, such as
   method, sanitized host/path, status, outcome, CPU time, and wall time.
3. Drop URL query strings, address-bar lines, headers, cookies, identity fields,
   location/network metadata, and opaque values before output.
4. Return booleans, counts, or redacted comparisons when a raw identifier is not
   necessary. Never rely on a broad denylist as the primary control.
5. For billing or checkout screens, allowlist only the product, base amount,
   recurring or usage terms, whether an add-on is selected, and a boolean that a
   payment method is present. Never emit card brand, masked digits, billing
   contact or address, tax identifier, or payment-method labels.

If the first inspection unexpectedly reveals credential-bearing state, stop broad
output immediately, continue only with allowlist extraction, and do not persist or
repeat the exposed value.

## Cleanup And Evidence

Delete or disable only the exact session-owned canary resources. Verify cleanup
through a read path independent of the delete response. If cleanup cannot be
proven, retain the protected recovery record, name its owner, set cleanup to
`retained`, and do not claim completion.

Write one sanitized JSON record outside the repository unless the task explicitly
requires a tracked report. It must use schema `academy-zero-knowledge-playtest/v1`
and include:

- target, UTC start/end times, journey boundary, desktop/mobile viewports;
- checkpoints with `pass`, `fail`, `blocked`, or `not_run` and concise evidence;
- sanitized UX findings and technical failures;
- canary `used`, identifier SHA-256 (when used), cleanup owner, cleanup status,
  and independent cleanup verification;
- final status: `PASS`, `FAIL`, or `BLOCKED`.

Validate the record before reporting:

```bash
node skills/playtest-academy/scripts/validate-playtest-record.mjs <record.json>
```

`PASS` means every in-scope checkpoint passed, no critical safety finding remains,
and any canary cleanup was independently verified. Otherwise report the precise
failure or blocker and the retained cleanup owner.
