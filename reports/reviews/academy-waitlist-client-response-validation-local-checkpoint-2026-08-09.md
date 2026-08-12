# Academy Waitlist Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** independent final review PASS; C0/H0/M0/L0

## Outcome

The public waitlist form now enters its existing success state only after
`POST /api/leads` returns an HTTP success carrying the sole bounded raw JSON
envelope `{ "ok": true }`, allowing JSON whitespace but no other member or
representation. This matches the read-only route contract: the route emits the
exact one-key success only after `record_lead_consent` completes without a DB
error.

The success boundary requires `application/json`, respects a valid declared
content length, and acquires a byte-stream BYOB reader. Each read view is limited
to the remaining `max + 1` allowance, and accepted bytes are copied into one
fixed 129-byte buffer. The consumer therefore never requests or retains an
unbounded server chunk. A five-second default deadline and an optional caller
`AbortSignal` terminate stalled reads. Cancellation is initiated but never
awaited, and synchronous or asynchronous cancellation failure cannot delay the
fail-closed result. A stream without BYOB support is rejected.

After reading at most 128 accepted bytes, the boundary decodes UTF-8 fatally
while preserving a leading byte-order mark for rejection and matches the raw
envelope before a JSON parser can collapse duplicate keys. Explicit failure,
missing or non-boolean flags, extra keys, null, arrays, malformed/empty bodies,
duplicate keys in either order, a BOM, invalid UTF-8, a wrong media type, an
oversized or stalled body, a stream error, and non-success HTTP status cannot
produce the success state.

The form delegates request and response classification to a product-local
client. The exact request path, method, JSON content type, consent, email,
UTM fields, and referrer remain unchanged. For every non-success HTTP response,
the client now initiates safe body cancellation without reading or parsing the
body and returns only `{ status: 'rejected' }`. Server-controlled error text,
including duplicate/extra fields, sensitive values, wrong media, empty,
overlong, oversized, unreadable, or malformed content, is never returned to the
form. The form uses its existing generic rejection copy; its existing network
error copy remains distinct. No new visible copy, layout, styling, or state was
added.

## Shared Boundary

The already-reviewed exact-ok raw validator was extracted from
`unsubscribe-client.ts` into `src/lib/http/exact-ok-response.ts`. Both waitlist
and unsubscribe call the same implementation, so the BYOB bound, deadline,
media-type rule, BOM behavior, and sole-envelope rule cannot drift. The
unsubscribe request and boolean result contract did not change, and its existing
16 tests remain green after the shared hardening.

## TDD Evidence

The first focused run failed collection because `@/lib/waitlist-client` did not
exist. A behavior-preserving extraction of the form's former
`response.json()`/truthy-`ok` logic then produced the meaningful RED:
`8 failed / 12 passed` across 20 tests. It reproduced false success for string
and numeric truthy flags, an extra field, a duplicate ending in `true`, a leading
BOM, a wrong media type, and an oversized envelope; the consumer-wiring test also
proved the form still owned the inline decision.

After the shared bounded raw validator and narrow form delegation, the waitlist
suite passed `20/20`; the unchanged unsubscribe suite passed `16/16`. Positive
controls cover the exact request and exact response with surrounding JSON
whitespace.

Final review then returned `C0/H0/M2/L0`. M-01 found that the default stream
reader could materialize one arbitrarily large chunk before the 128-byte check
and had no deadline. M-02 found that the non-success branch used unbounded
`response.json()` and returned arbitrary server error text to the form. The
tests-only remediation RED was `12 failed / 36 passed` across the focused
waitlist and unsubscribe run: it reproduced default-reader allocation, stalled
deadline/abort, every non-success body read, sensitive error propagation, and
the form's `result.error` dependency. Stream-error and invalid-UTF-8 controls
already failed closed. After the bounded BYOB/deadline reader, body-discard
policy, and narrow form result mapping, the same focused run passed `48/48`
(`32/32` waitlist and `16/16` unsubscribe).

## Verification

| Gate | Result |
|---|---|
| Focused import RED | Missing helper failed collection as expected |
| Focused behavior RED | 8 failed / 12 passed; former false-success paths were reproduced |
| Final-review remediation RED | 12 failed / 36 passed; M-01 allocation/deadline and M-02 unbounded/non-generic error paths were reproduced |
| Focused GREEN | Waitlist 32/32 and unsubscribe 16/16 passed on Node 24.18.0 |
| Waitlist/security regression | 7 files / 114 tests passed |
| Full unit regression | 76 files / 614 tests passed |
| Node 24 lint and typechecks | Passed; one pre-existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated and `/api/leads` compiled |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 completed and generated `.open-next/worker.js` |
| Visual | N/A: no copy literal, layout, styling, or UI state was added. All HTTP rejections now select the already-present generic rejection sentence; no new server was started and PID 59647 remained untouched. |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | Tracked `git diff --check` passed. Scoped no-index checks for all untracked owned files returned exit 1 for content differences only, with no whitespace diagnostics; staged index remained clean. |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

DB-backed integration and browser tests were not run. Local Supabase and a new
server were intentionally not started. The route, E2E suite, DB/SQL, legal copy,
Identity, configuration, and deployment were not edited.

## Ownership Evidence

Pre-slice SHA-256 values:

- tracked-clean `academy-web/src/components/WaitlistForm.tsx`:
  `9242ce0a718fff66b649156891581d886dbbdb78a4decf527758646480fb50ff`
- pre-existing untracked reviewed `academy-web/src/lib/unsubscribe-client.ts`:
  `0af58b8e93b1ac6d874c9a2307c828743ce230918a58928a125f33e5b6a2c3ec`
- unchanged unsubscribe test:
  `b4766834b6a99e6ebca123d0170c6e99d839c4f5cd7743b43db62c74f772e61d`
- read-only pre-existing untracked leads route:
  `972ade3f6ce4bebcdef71f0464724dbb056b4fdadfaca32b06a3c80b4cf8e8a5`
- read-only tracked-clean landing E2E:
  `a172b1ebee7031dedff1e45de56f8f3e4d6f29cef62ab5daa321edc2c1784d61`
- pre-existing dirty active plan and completed log:
  `f3fb1dd481ad9f9135287190b5690e40675241f4a9ad8190ec8ce4cf732cda6f`
  and `be33dded88790e8e0fcb05b967f8f8fc8722c9604dfb1a88db3586bdbe6ee219`

The unsubscribe test, leads route, and landing E2E remain byte-identical and are
excluded from this slice. The form diff contains only the helper import,
delegated call, and mapping of the helper result to existing local copy.

Final-review remediation baseline SHA-256 values:

- `academy-web/src/lib/http/exact-ok-response.ts`:
  `b01d18a4070339548a05f9e49ccf00345e3d3e9146063f7207ac52936669aaa5`
- `academy-web/src/lib/waitlist-client.ts`:
  `466afb8f3466f516c886513f1783ef4fe7d5e6e7feb0c7b53b0d7ae6e2e1f85e`
- `academy-web/tests/unit/waitlist-client.test.ts`:
  `ed10ede4a11f727bd828848aab4610bef304cff8505300944fcbe6303533a35c`
- `academy-web/src/components/WaitlistForm.tsx`:
  `abf15d1425aff7276db5c4748d061a15098efe487450d43413b2d3c5b0896ff9`
- this report:
  `aeb3cd3640aea7e93e5b8f99b634e8580ddff345af4de060324521ddb9538e53`
- `plans/active_plan.md` and `plans/completed_log.md`:
  `e50ce1df2a862a332e4c055d21c56fc9341681d615c8f482e69318520f5b82e1`
  and `7631bbe4207e3f028f0e3128804c6c85fab9047a1595de24fd0a4db9987d8dde`
- unchanged `academy-web/src/lib/unsubscribe-client.ts`:
  `36c6709b2f6735880795c76850f7b61a5a99f04a128caac519f9fe4fe5fa1ecb`

The final-review remediation changed only the shared response helper, waitlist
client, waitlist test, form mapping, this report, and the narrow plan/log
entries. `unsubscribe-client.ts`, its test, the route, and E2E remain excluded
and byte-identical.

## Exact Slice Inventory

- `academy-web/src/lib/http/exact-ok-response.ts`
- `academy-web/src/lib/unsubscribe-client.ts`
- `academy-web/src/lib/waitlist-client.ts`
- `academy-web/tests/unit/waitlist-client.test.ts`
- `academy-web/src/components/WaitlistForm.tsx`
- `reports/reviews/academy-waitlist-client-response-validation-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md` (narrow checkpoint update within a pre-existing dirty file)
- `plans/completed_log.md` (narrow checkpoint update within a pre-existing dirty file)

## Remaining Risk

This is local client-contract evidence. It prevents an ambiguous same-origin
response from falsely confirming waitlist registration, but it does not prove
production persistence, deployed browser BYOB behavior, or email delivery.
Those remain separate runtime/release gates. A browser on a platform without
BYOB stream support fails closed rather than showing success; target-browser
compatibility still needs deployed browser evidence. Independent final review
passed at C0/H0/M0/L0; that local result is not production-browser or release
evidence.
