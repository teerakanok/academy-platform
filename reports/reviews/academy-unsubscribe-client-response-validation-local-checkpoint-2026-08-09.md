# Academy Unsubscribe Client Response Validation Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** preliminary independent review `FAIL C0/H0/M1/L0`; M-01
remediated locally; re-review L-01 remediated locally; closure review pending

## Outcome

The unsubscribe form now shows its existing completion state only after the
same-origin request has an HTTP success status, an `application/json` media
type, and a UTF-8 response body no larger than 128 bytes whose raw text is the
sole one-key JSON envelope `{ "ok": true }` with optional JSON whitespace. The
client reads the response stream only up to that bound before deciding success;
it does not pass the body through a JSON parser that can collapse duplicate
keys. UTF-8 decoding preserves a leading byte-order mark so the raw-envelope
matcher rejects it instead of silently normalizing it away.

HTTP 2xx responses containing duplicate keys in either order, an explicit
failure, the wrong flag type, an extra field, null, an array, malformed JSON,
no body, an oversized body, or the wrong media type use the existing
failure/retry state instead of telling the visitor that marketing email has
stopped. A whitespace-formatted exact envelope remains valid.

The request method, URL, JSON token body, anti-enumeration behavior, bearer-token
fragment handling, and all UI copy and layout remain unchanged. The API route is
read-only in this checkpoint: its existing contract still returns the same
`{ "ok": true }` response for invalid, expired, and already-used tokens after a
successful database call so the public endpoint does not become a lead oracle.

## TDD Evidence

The first test run failed at the missing helper import. A behavior-preserving
extraction of the form's original `response.ok` decision then produced the
meaningful RED: `7` malformed HTTP-success cases failed while the exact positive,
non-2xx, and network-error controls passed (`7 failed / 3 passed`). This proves
that status alone accepted every malformed success body in the focused matrix.

After adding the exact response validator and wiring the form through that
boundary, the focused suite passed `10/10`. The positive case also proves the
request remains `POST /api/leads/unsubscribe` with JSON content type and the
unchanged `{ token }` body.

The preliminary independent review returned `C0/H0/M1/L0`. M-01 found that
`response.json()` collapses duplicate wire keys before the one-key object check,
so `{ "ok": false, "ok": true }` became an accepted `{ "ok": true }` object.

The remediation RED passed `12` controls and failed `3`: duplicate-last-true,
an oversized whitespace-formatted success envelope, and an exact body served
with a non-JSON media type. Duplicate-last-false and a whitespace-valid exact
envelope already behaved as required. After replacing parsed-object validation
with the bounded raw-envelope boundary, remediation GREEN passed `15/15`.

The independent re-review found L-01: `TextDecoder` defaults to consuming a
leading UTF-8 BOM, which allowed BOM plus the otherwise exact envelope despite
the raw-text contract. The BOM test produced RED at `1 failed / 15 passed`.
Setting `ignoreBOM: true` preserves the BOM in decoded text for the exact
matcher to reject; focused GREEN then passed `16/16`.

## Verification

| Gate | Result |
|---|---|
| Focused behavior RED | 7 failed / 3 passed; all seven HTTP-2xx malformed-body cases reproduced false success |
| Initial focused GREEN | 1 file / 10 tests passed on Node 24.18.0 |
| Preliminary independent review | `FAIL C0/H0/M1/L0`; M-01 reproduced duplicate-key parser collapse |
| Remediation RED | 3 failed / 12 passed; duplicate-last-true, size bound, and content type defects reproduced |
| M-01 remediation GREEN | 1 file / 15 tests passed on Node 24.18.0 |
| Independent re-review | L-01 found default UTF-8 BOM normalization before raw matching |
| L-01 BOM RED | 1 failed / 15 passed |
| L-01 BOM GREEN | 1 file / 16 tests passed on Node 24.18.0 |
| Unsubscribe/security regression | 3 files / 51 tests passed |
| Full unit regression | 74 files / 515 tests passed |
| Node 24 lint and typechecks | Passed; one existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated and `/unsubscribe` compiled |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte `.open-next/worker.js` |
| Visual | N/A: the checkpoint changes response acceptance only; UI copy, layout, styling, and existing done/failed states are unchanged |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Dependency tree | `npm ls --all` exited 0 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Final patch hygiene and ownership | Tracked `git diff --check` passed. Scoped L-01 no-index checks for helper/test/report/plan/log returned content-diff exit 1 with no whitespace diagnostics; the form and route stayed byte-identical and the staged index stayed clean. |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

DB-backed integration and deployed-browser tests were not run. The route,
database contract, UI appearance, and deployed state did not change, and local
Supabase was intentionally not started for this client-only checkpoint.

## Ownership Evidence

The form was already an untracked allowlist entry before this work. Its pre-edit
SHA-256 was
`bde873d6923baead3ebbe25fa47c2be8c04c54900361a0cbdeece7dcce232eea`;
the scoped post-edit SHA-256 is
`610fb2ef1e330a85c8cc6d34e4a1f00580a6bb97a1311bae8b5a144384212c12`.
The explicit pre/post no-index diff contains only one helper import and the
replacement of the inline fetch block with one helper call plus its result.

The pre-existing untracked API route remained byte-identical at SHA-256
`7d6f923b19c8c0a48b49defd59d737d647c5c57720725d585171b52600a4e25f`.
It is not part of the slice inventory. `plans/active_plan.md` and
`plans/completed_log.md` were already dirty; their pre-slice SHA-256 values were
`4cc3c530cba9547dd8975c9291248bf00b8db8dff3b0a0a4ae356334f515bb6a`
and `42a541d6c33bac9a117e6c5d1a0eab5134c7e367890f6254efd328a6522ef5b8`
respectively, and this checkpoint adds only its narrow status text.

Before M-01 remediation, the helper, focused test, report, active plan, and
completed log had SHA-256 values `4d01392de33a423c7f613fd6cb3454cdda1933321ba1ccb140db1f6579f53154`,
`5bfbcbca133e1f420aa168b26c7259beb3bab36d6b09e6e956cb96b5dfaaca7a`,
`3372c22659ebd952f93f3abe21c062f539bf1d1aab534bce89faf8bdd46c16cb`,
`2cfc6d6e46bce57e97aba8a64c6fc9216c4c9781907c399f976c312b2753ff2b`,
and `38fdd7b3de003e0e9dd495b6299cd6e4f7508dece31344049436cf67c63797bc`
respectively. Scoped no-index diffs isolate the remediation to those five
paths. The form stayed byte-identical at its post-initial-slice SHA-256; the
route also stayed byte-identical and excluded.

Before L-01 remediation, the same five paths had SHA-256 values
`55c0442f84160211424b1d07f863c6d3c466babd0e0753ff22fc9dee2834c39c`,
`9ace37c5345c29f8f069a83b0120ed8ba0b73bd6c04301b66e667d68a9dc0160`,
`47f884d8667945c0b8fdc5c50b0cfe807bf7fa16672305edecc68c2f8c9a2648`,
`f6b40236cc1b232cfb43994b35f18505a3954ab9a35172d58f5d2a22d74da1e7`,
and `ba0a309c583b5a9f8d1dcba9a5fa790c3851861f948161ce91f9524ddca1ec6f`
respectively. L-01 changes one decoder option, one focused test, and the narrow
evidence text; the form and route remain byte-identical.

## Exact Slice Inventory

- `academy-web/src/lib/unsubscribe-client.ts`
- `academy-web/tests/unit/unsubscribe-client.test.ts`
- `academy-web/src/app/(site)/unsubscribe/UnsubscribeForm.tsx` (narrow edit within a pre-existing untracked file)
- `reports/reviews/academy-unsubscribe-client-response-validation-local-checkpoint-2026-08-09.md`
- `plans/active_plan.md` (narrow checkpoint update within a pre-existing dirty file)
- `plans/completed_log.md` (narrow checkpoint update within a pre-existing dirty file)

## Remaining Risk

This is local client-contract evidence. It prevents an ambiguous or malformed
same-origin response from becoming a false completion message, but it does not
prove a deployed consent withdrawal or replace the existing DB-backed browser
flow. Production browser proof, legal approval, and the separate Identity,
retention-runtime, CSP, private-media, public-exposure, and sharp compatibility
release gates remain unchanged.

The M-01 and L-01 findings are remediated in author evidence. Final
code/security closure belongs to the independent closure reviewer.
