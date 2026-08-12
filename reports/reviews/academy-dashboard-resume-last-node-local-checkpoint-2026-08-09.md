# Academy Dashboard Resume Last-Node Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** local author evidence complete; independent review pending

## Outcome

The dashboard resume action now prefers `record.lastNodeId` only when that node
is still `in-progress`. A completed, skipped, tested-out, locked, missing, or
otherwise non-in-progress preferred node cannot override the established ranked
fallback. Omitting the preferred ID preserves the prior `nextNode` behavior.

The dashboard consumer passes the validated progress record's `lastNodeId` into
this boundary. No progress persistence, API, SQL, configuration, Identity,
deployment, or production state changed.

The separate equal-`updatedAt` course ordering behavior was deliberately not
changed. Existing records contain no causal sequence for breaking that tie, so a
new lexical or array-order policy would invent product behavior rather than
restore a recorded resume choice.

## TDD Evidence

The focused RED run failed `2` expectations while `18` existing expectations
passed:

- `nextNode` returned the first ranked in-progress node (`b`) instead of the
  explicitly preferred in-progress node (`c`).
- The dashboard consumer had no `dashboardResumeNode` boundary proving that it
  forwards `record.lastNodeId`.

After the bounded source change, the focused suites passed `20/20`. Pure roadmap
tests cover a valid parallel in-progress preference, the no-preference fallback,
and completed, available, locked, missing, skipped, and tested-out mismatch
fallbacks. The
consumer test proves the dashboard forwards `record.lastNodeId` and selects the
recorded in-progress node.

## Verification

| Gate | Result |
|---|---|
| Focused RED | 2 failed / 18 passed; both failures reproduced the missing preference path |
| Focused GREEN | 2 files / 20 tests passed |
| Full unit regression | 73 files / 488 tests passed |
| DB-backed aggregate run | NOT RUN — 14 integration tests could not connect (`ECONNREFUSED`) because local Supabase ports 54321/54322 were intentionally not started. This checkpoint therefore has no DB-backed evidence; the pure unit selector does not require the database. |
| Node 24 lint and typechecks | Passed; one existing generated-registry warning |
| Node 24 Next production build | Passed; 29 static pages generated |
| Node 24 OpenNext/Cloudflare build | Passed; adapter 1.20.2 generated a 2,278-byte `.open-next/worker.js` |
| Visual | N/A: no layout, style, or copy changed; the affected authenticated parallel-progress state cannot be rendered locally without the unwired Identity runtime or adding a forbidden fixture/server |
| Dev-inclusive npm audit | `found 0 vulnerabilities` at `--audit-level=moderate` |
| Production npm audit | `found 0 vulnerabilities` at `--omit=dev --audit-level=high` |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | `git diff --check` passed; staged index remained clean |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

## Remaining Risk

This is local deterministic consumer evidence. An authenticated production
browser must still prove the dashboard resumes the recorded in-progress lesson
after Identity runtime and deployment gates are independently authorized. No
browser screenshot was manufactured from a state unavailable within this local
boundary, and the existing listener on port 3003 was not touched.

Equal course timestamps still have no causal tie-break contract. Closing that
separately would require an authoritative sequence or persistence contract, not
a UI-only guess. Existing Identity, sharp compatibility, private-media, CSP,
legal, case-system, retention-runtime, and public-exposure release gates remain
unchanged. Final code/security review belongs to the independent reviewer; this
report is author evidence only.
