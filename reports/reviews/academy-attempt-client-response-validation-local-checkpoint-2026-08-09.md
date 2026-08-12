# Academy Attempt Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** author second remediation complete; independent re-review pending

## Outcome

The lesson attempt hook now receives data only through a product-local response
boundary. The client keeps the existing exact `POST /api/attempts` request, but
it no longer casts `response.json()` or substitutes omitted task arrays with
empty arrays.

For HTTP success, the boundary requires `application/json`, reads no more than
256 KiB from the response stream, decodes UTF-8 fatally while preserving a
leading byte-order mark for rejection, and parses JSON with duplicate-key
detection at every object depth. The response wrapper, questions, simulations,
challenge, state maps, required-field maps, and public requirements must have
their exact approved keys and value shapes. The client accepts only a UUIDv4
attempt ID, the producer's uppercase RFC3339 expiry profile with a real
Gregorian calendar date and in-range time/offset components, at least one task,
and unique task IDs across MCQ and simulation tasks. It constructs a new deep
public projection; answer/grading fields and every other extra key are rejected.
For the `network-interface` challenge, every field named by either required-field
mode must also be an own key of `initial` and a member of the shared surface
input allowlist. This mirrors the existing producer invariant instead of
duplicating a second policy list in the client.

HTTP `401`/`403`, `429`, and other failures keep the existing stable
`access-lost`, `quota`, and `error` results. A quota retry is shown only from an
exact failure envelope containing a safe integer from 0 through the server's
30-minute window; malformed, extra-key, duplicate-key, or out-of-range retry
bodies remain `quota` without a displayed wait. Network and malformed-success
responses remain `error`.

Expiry enforcement remains server-owned. The accepted profile has a four-digit
year, Gregorian month/day validity including the century leap-year rule, hours
00-23, minutes/seconds 00-59, optional 1-9 digit fractional seconds, and either
`Z` or a signed numeric offset whose hour is 00-23 and minute is 00-59. The
client deliberately does not compare the value with the learner device clock,
which could be skewed. The API route and progress submission continue to own
issuance and expiry decisions.

## TDD Evidence

The first focused run failed because the new helper did not exist. A temporary
behavior-preserving extraction of the hook's former casts then produced the
meaningful RED: `34 failed / 13 passed` across 47 cases. The failures reproduced
acceptance of false/missing/extra wrappers, omitted and malformed task arrays,
non-UUID IDs, invalid expiry, extra answer/grading fields, malformed nested
maps, duplicate task IDs, duplicate wire keys, a leading BOM, a wrong media
type, invalid retry values, and the still-inline hook consumer.

After the bounded raw parser, exact recursive projector, and narrow hook wiring,
the expanded focused suite passed `50/50` on Node 24.18.0. Positive controls
cover the exact request, valid nested MCQ/simulation projection, surrounding JSON
whitespace, RFC3339 `Z`, PostgreSQL-style fractional `+05:30`, access-loss,
quota, and ordinary failure results.

Preliminary independent review returned `C0/H0/M1/L0`: `Date.parse()` normalized
calendar-invalid timestamps such as non-leap February 29, April 31, and hour
24 into different real instants before accepting them. The remediation RED
failed `4/64` while `60/64` controls passed, reproducing both non-leap February
29 cases, April 31, and hour 24. The component parser plus Gregorian
days-in-month validation then passed `64/64`. Positive controls include February
29 in leap year 2000 even though it is in the past, a fractional `+05:30`
offset, and a `-04:00` offset; this proves calendar/offset acceptance without a
client-now comparison.

The next re-review closed the RFC3339 finding and identified a separate medium
cross-field gap: nonempty required-field names could be absent from `initial` or
unsupported by the `network-interface` surface. After correcting the positive
fixture to the producer-valid shape, the cross-field RED failed `2/67` while
`65/67` controls passed. The failures reproduced a supported `ipv4` field
missing from `initial` and a present but unsupported `hostname` field. GREEN
passed `67/67`; an explicit positive control covers all four shared supported
fields split across the `dhcp` and `static` arrays.

## Verification

| Gate | Result |
|---|---|
| Focused import RED | Missing helper failed collection as expected |
| Focused behavior RED | 34 failed / 13 passed; former unchecked acceptance was reproduced |
| Focused GREEN | 1 file / 50 tests passed on Node 24.18.0 |
| Preliminary independent review | FAIL `C0/H0/M1/L0`; M-01 identified JavaScript-normalized invalid expiry components |
| M-01 remediation RED | 1 file / 64 tests: 4 failed / 60 passed on Node 24.18.0 |
| M-01 remediation GREEN | 1 file / 64 tests passed on Node 24.18.0 |
| RFC3339 re-review | M-01 closed; a new medium cross-field finding remained |
| Cross-field remediation RED | 1 file / 67 tests: 2 failed / 65 passed on Node 24.18.0 |
| Cross-field remediation GREEN | 1 file / 67 tests passed on Node 24.18.0 |
| Attempt/security regression | 9 files / 180 tests passed |
| Full unit regression | 75 files / 582 tests passed |
| Node 24 lint and typechecks | Passed; one pre-existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated and `/api/attempts` plus lesson route compiled |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte `.open-next/worker.js` |
| Visual | N/A: no UI copy, layout, styling, or visible state changed; rejected responses use the existing failed/retry/access-loss states |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | Tracked `git diff --check` passed. Scoped no-index checks for the new helper, test, and report returned exit 1 for content differences only, with no whitespace diagnostics; staged index remained clean. |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

DB-backed integration and authenticated/deployed browser tests were not run.
Local Supabase was intentionally not started, and this client-only boundary does
not change persistence, API behavior, Identity, configuration, or deployment.

## Ownership Evidence

The hook was tracked-clean before this checkpoint at SHA-256
`3def748f056853c9542e0720cdae67532b2d528af1f92cb123d037496ec9e5e0`.
Its scoped diff contains only the helper import/result type and replacement of
the inline fetch/casts with `requestLessonAttempt(slug, nodeId)` while retaining
the existing alive guard and fallback error state.

The following excluded paths remained byte-identical through implementation and
both remediations:

- attempt API route: `1a648549da642b3fe68a74863c472e2668038e7e4051f669b2965f346d635877`
- public lesson types/projection: `40c1ed12d658725a01982ccf2c2c8aa50190b3e3d4a01d97809b296381157a35`
- `LessonView.tsx`: `2b9963b15b68a3dc00a4a7837916e25400b777e2b159de3edb16dfd56805f223`

The pre-existing dirty progress boundary was
`d1e9ec53a1b9970cf5adb4ce3a5de8a7cc04ca3c70438be353224b13a6f1f565`
at the original attempt author freeze. It changed concurrently outside this
lane during M-01 remediation to
`9db71814d870a97814159d629a051d5845127621a6ca93b9732ffcc589ea08b9`;
this lane did not edit or revert it, and it remains excluded from the review
snapshot. `LessonView.tsx` was also pre-existing dirty work and is not part of
this slice. The API route was pre-existing untracked work and is also excluded.
The cross-field contract was read from the pre-existing dirty producer boundary
`academy-web/src/lib/content/course-loader.ts` at
`531311256e66ef3cbaeb67d954bec5195212e4212bea77c1cd093c3d6e0d5472`.
The client imports the supported-field list from tracked-clean
`academy-web/src/lib/simulation/types.ts` at
`2fec65a1d23e2c090b6f38e0f93af077734406229b19bd3d802e5f46f097c41f`;
neither provenance path was edited by this slice.
The active plan and completed log were already dirty; their pre-slice SHA-256
values were `b2f7bfd8d9655956273c929696d8896bbe8799b4d3c030f9ea1fa449884d61f9`
and `af04768dac3d2bf1c2a7d9cd1b42f1871d4f80087579da8c1e6db21d8adeeef1`.

## Exact Slice Inventory

- `academy-web/src/lib/course/attempt-client.ts`
- `academy-web/tests/unit/attempt-client.test.ts`
- `academy-web/src/components/course/use-lesson-attempt.ts`
- `reports/reviews/academy-attempt-client-response-validation-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md` (narrow checkpoint update within a pre-existing dirty file)
- `plans/completed_log.md` (narrow checkpoint update within a pre-existing dirty file)

## Remaining Risk

This is local client-contract evidence. It prevents malformed or ambiguous
same-origin responses from reaching the lesson as a ready attempt, but it does
not prove issuance, quota, expiry, consumption, or progress persistence against
the production database. Deployed authenticated-browser proof remains gated on
the separate Identity/runtime authorization. Existing Identity, sharp
compatibility, private-media, CSP, legal, retention-runtime, and public-exposure
release gates are unchanged.

Final code/security closure belongs to the independent checkpoint reviewer; no
independent PASS is claimed here.
