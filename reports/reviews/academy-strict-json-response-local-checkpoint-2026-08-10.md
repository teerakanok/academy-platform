# Academy Strict JSON Response Boundary

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT PASS `C0/H0/M0/L0`
**Academy source:** `1524572a6c5fd61b2321cee3d8ad25d172f0d079`

## Outcome

Academy now has a shared browser/Worker-compatible response boundary that reads
JSON bodies through a byte-oriented BYOB stream, enforces a deadline and byte
ceiling before materialization, decodes strict UTF-8, and parses exactly one
JSON value while rejecting duplicate semantic keys at every nesting level.

The helper existed as an untracked dependency of concurrent Academy client
work. This checkpoint adopted and reviewed the complete helper, added a
standalone adversarial suite, and closed its public-option resource gaps. No
consumer, route, UI, or concurrent client file is part of this checkpoint.

## Trust Boundary

`readBoundedResponseText` accepts at most 1 MiB even if a caller requests more.
It snapshots and validates byte, signal, and timeout options once before body
access, allocation, or reader acquisition; `readStrictJsonResponse` adds one
depth snapshot to that immutable read plan. External signal state and methods
are captured once and must match their native intrinsics before body access.
External-signal registration/removal then uses only those module-captured native
intrinsics, with cleanup responsibility armed before registration begins. The
read loop races each BYOB read against a private deadline rejection promise and
does not register another internal signal listener. Getter, override, and
external-listener failures therefore collapse to the bounded failure result and
cancel before any pull; deadline cleanup and reader release remain independent.
It rejects malformed or overbound `Content-Length` before reading, allocates the
bounded max-plus-one output before reader acquisition, and reuses a BYOB scratch
buffer capped at 256 KiB plus one byte. A response that needs more than 128 read
calls is treated as pathologically fragmented and cancelled. These two bounds
prevent both oversized materialization and quadratic allocation churn. Byte
overflow, zero-progress reads, timeout, external abort, and read failure also
cancel the stream. The response deadline cannot be extended beyond five
seconds. UTF-8 decoding is fatal, and a BOM is not accepted as JSON whitespace.

`readStrictJsonResponse` accepts only `application/json`, limits parser nesting
to 64 even if a caller supplies a larger number, and defaults to depth 16. Its
parser accepts the JSON grammar only: trailing values/commas, leading-zero or
non-finite numbers, malformed escapes, and incomplete values fail closed.
Object keys are decoded before duplicate comparison, so `"ok"` and
`"\\u006f\\u006b"` conflict rather than collapsing through `JSON.parse`.

The parser returns `unknown`. Product clients still own exact response schemas,
status handling, and fresh safe projections before data reaches UI or durable
state. Body cancellation is best-effort and never turns a failed validation into
success.

## TDD And Verification

The dedicated test-only RED ran against the existing helper. Eighteen of twenty
tests passed; two failed because a caller could request more than 1 MiB and
because depth 65 was accepted. The helper now rejects both options before body
read or allocation. Focused GREEN passes 20/20.

The first full lint/type gate then found a test-only `Uint8Array<ArrayBufferLike>`
versus byte-controller `ArrayBuffer` mismatch. Copying fixture bytes into an
owned `ArrayBuffer` view fixed the type contract without changing helper
behavior.

The first independent RIL returned `C0/H0/M1/L1`. M-01 proved that a stateful
`maxBytes` getter could pass the ceiling check and later request a 2,000,001-byte
BYOB view, or throw after the reader was locked. L-01 identified two premature
"tracked/committed" labels in this report. Test-only RED then passed 20/22: the
option trap ran repeatedly and an option getter throw rejected the public
Promise. The helper now builds one validated immutable read plan before body
access, allocates before reader acquisition, and uses only captured values
through cleanup. Focused GREEN passes 22/22; the wording now describes a helper
under review. Different independent closure review remains required.

The second independent RIL returned `C0/H0/M1/L0`. A Proxy around a native
`AbortSignal` could still throw from `aborted` or listener methods after reader
acquisition, reject with injected detail, and leave the body locked. The next
test-only RED passed 22/25 across direct and strict APIs. The helper now captures
signal state and methods once, preflights listener setup/removal before body
access, forwards through an internal controller, and guards deadline cleanup
separately from reader release. Focused GREEN passes 25/25, including all three
hostile signal traps with zero pulls and an unlocked body.

The third independent RIL returned `C0/H0/M1/L0`. It proved that allocating a
view for all remaining bytes on every BYOB pull made a one-byte-fragmented body
request cumulative view capacity proportional to the square of the byte limit;
the microtask chain could also starve the scheduled timer callback until the
chain completed. A deterministic test-only RED passed 25/26 because 129 one-byte
fragments were accepted instead of being cancelled at a fixed operation bound.
The helper now allocates one capped scratch buffer, recycles the returned backing
buffer, and stops before a 129th read. Focused GREEN passes 26/26, current
importers pass 216/216, and the current full unit suite passes 85 files / 877
tests. A different independent reviewer was then assigned against a regenerated
manifest to close those three remediation histories.

The fourth independent RIL returned `C0/H0/M1/L0`. A hostile signal wrapper
could call the native add method and then throw before `listenerAttached` became
true, leaving the internal deadline listener retained even though the public
result, cancellation, and body unlock were correct. Listener-transaction RED
passed 26/27 and observed one retained listener. The first source attempt
removed the leak but accepted hostile property traps, so the existing
fail-closed matrix caught that regression at 23/27. The final implementation
snapshots public signal state/method identities once, requires the native
intrinsics, uses only the module-captured native add/remove operations, and arms
cleanup before add. Focused GREEN passes 27/27 with zero retained listeners;
current importers pass 217/217 and the full unit suite passes 85 files / 878
tests. A different independent reviewer must bind the regenerated manifest and
close all four remediation histories.

The fifth independent RIL returned `C0/H0/M1/L0`. It found that the read loop
still registered a second listener dynamically on the private deadline signal;
if EventTarget methods were wrapped before module load, native add followed by
a throw retained that internal listener. A fresh-module RED passed 27/28 and
observed two retained listeners across the direct and strict APIs. The final
design removes that internal listener entirely: timeout and external abort now
reject one private deadline promise, and each BYOB read races against that
promise. The first run after this structural change passed the listener
invariant but retained the earlier fail-result expectation at 27/28; the test
was corrected to assert the stronger no-listener behavior with a valid result,
zero cancellation, one pull, and unlocked bodies. Focused GREEN passes 28/28,
current importers pass 218/218, and the full unit suite passes 85 files / 879
tests. A different independent reviewer must bind the regenerated manifest and
close all five remediation histories.

The sixth independent closure RIL returned `C0/H0/M0/L1`: code, security, and
operational behavior passed, but the third-review history incorrectly said the
timer had not been scheduled. The timer was scheduled before the read loop; its
callback was starved by the microtask chain. This report now states that exact
cause. Source and test bytes did not change for this documentation correction.

A different independent text-only closure reviewer bound the regenerated
manifest, confirmed the source and test hashes were unchanged from the
code/security pass, reran focused 28/28, and returned final `C0/H0/M0/L0`.

| Gate | Result |
| --- | --- |
| Dedicated resource-bound RED | EXPECTED FAIL, 18 pass / 2 fail |
| Independent option-snapshot RED | EXPECTED FAIL, 20 pass / 2 fail |
| Independent signal-boundary RED | EXPECTED FAIL, 22 pass / 3 fail |
| Independent fragmentation-bound RED | EXPECTED FAIL, 25 pass / 1 fail |
| Independent listener-transaction RED | EXPECTED FAIL, 26 pass / 1 fail |
| Independent internal-listener RED | EXPECTED FAIL, 27 pass / 1 fail |
| Intermediate fail-closed regression | EXPECTED FAIL, 23 pass / 4 fail |
| Focused strict-response boundary | PASS, 28/28 |
| All current helper importers | PASS, 6 files / 218 tests |
| Full Academy unit regression | PASS, 85 files / 879 tests |
| Scoped ESLint | PASS |
| Full lint and TypeScript checks | PASS; one pre-existing generated-registry warning |
| Duplicate/BOM/UTF-8/media/deadline/abort/BYOB matrix | PASS |

Next/OpenNext build is N/A for this checkpoint because no tracked runtime module
imports the checkpoint helper under review; full project TypeScript checks compile the
current client consumers, and Web API behavior is exercised directly through
byte-stream tests. Visual and database lanes are N/A because this checkpoint
changes no UI, route, copy, schema, or database state.

## Integration Boundary

The helper under review is the bounded raw-response primitive required by the next
Identity lifecycle HTTP adapter. That adapter must still enforce HTTP method,
status, media type, endpoint, request serialization, credentials, and lifecycle
page verification. This checkpoint neither creates network authority nor
changes Identity registry/runtime configuration.

## Freeze And Review

The machine freeze manifest covers the helper, standalone test, this report,
and the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-strict-json-response-freeze-20260810.json`

The author did not self-approve the remediation. Different independent reviewers
verified the option, signal, resource, and both listener-transaction closures;
the final text-only reviewer returned `C0/H0/M0/L0` before commit.
