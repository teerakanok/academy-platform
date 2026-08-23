# Public waitlist client validation and responsive closure - 2026-08-23

## Outcome

The public waitlist now rejects malformed or over-320-character email input before any request,
normalizes valid email, presents adjacent accessible email/consent errors with deterministic focus,
and distinguishes accepted responses from HTTP/envelope rejection and transport/body-read failure.
The public course preview no longer overflows horizontally on the agreed Pixel 7 viewport while
retaining its two-column desktop layout.

No production, database, deployment, secret, shared-infrastructure, or release flag changed.

## Bound source

- Freeze: `academy-waitlist-client-validation-freeze-20260823.json` (8 files, verified)
- `SOURCE_SHA256=f004ad8f5aae218fdf949e1eb631e32e857ab8d52dae378e320a5ccf5890c3e0`
- Product diff: 497 insertions / 86 deletions across the eight frozen files

## Verification

- Focused waitlist and unsubscribe unit tests: `51/51`
- Full unit suite: `131 files`, `2,044/2,044`
- TypeScript and scoped ESLint: clean
- Production build: `65/65` pages
- Public Chromium matrix: `59 passed`, `1` intentional desktop responsive skip, `0 failed`
- Real byte-stream body-read journey: desktop and Pixel 7 `2/2`
- Independent implementation review: `PASS C0/H0/M0/L0`
- Terra visual review: `PASS C0/H0/M0/L0`, 24/24 captures individually inspected across four
  states and two viewports; desktop geometry `1280/1280`, Pixel 7 geometry `412/412`
- Sol final integration review: `PASS C0/H0/M0/L0`

## Remaining boundary

This closes a customer-visible local/browser quality gap only. Production admission remains `0/1`
(`0%`) and Identity conformance remains `16/23` (`69.6%`). The smallest remaining production step
is still a separately authorized operation that supplies and verifies the real release artifacts;
this checkpoint neither invents those artifacts nor grants production authority.

Provider-call evidence is in
`academy-waitlist-client-validation-provider-call-log-20260823.json`. Terra's native task boundary
does not expose authoritative plaintext prompt bytes or provider start/result-persist timestamps;
the ledger records the exact controller dispatch/completion evidence and marks the unavailable
fields instead of inferring them.
