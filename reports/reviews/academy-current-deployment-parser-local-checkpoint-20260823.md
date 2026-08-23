# Current-deployment parser closure - 2026-08-23

## Outcome

The local operations parser selects the newest Wrangler deployment independently of list order and
fails closed on malformed required data, tied latest timestamps, RFC3339 unknown local offset
`-00:00`, unsupported leap-second `:60`, duplicate JSON members before value collapse, and
escaped-equivalent duplicate keys. RFC3339 years `0001` through `0099` retain their literal year
instead of inheriting JavaScript's legacy 1900 offset.

This checkpoint does not call Cloudflare, change traffic, enable Identity/OAuth, mutate DNS or Pool
A, or access credentials. The protected vault file remains outside the source and review scope.

## Evidence

- Freeze manifest: `academy-current-deployment-parser-freeze-20260823.json`
- Canonical two-file digest:
  `0fa985461ffea0d47ed6768c785114e68103bc8526f973bbc43ab2dadfffe98f`
- TDD RED: strict timestamp/duplicate-member cases failed `7/9`; year ordering later failed `9/10`
- Focused GREEN: `10/10`
- Full unit regression: `131/131` files, `2,044/2,044` tests
- Lint and all configured TypeScript checks: zero errors; three unrelated existing warnings
- Independent closure review: `PASS C0/H0/M0`
- Sol final integration review: `PASS C0/H0/M0`

## Review history

The unchanged capacity fallback proved only the obsolete original eight-test contract and made no
source edit, so it was working but unusable for the later three-finding acceptance surface. The
controller added truthful regressions and remediation. A first independent review then found the
valid low-year ordering defect; the fresh freeze and closure review verify that remediation. The
private model-call incident `mci-000042` is closed with the regression-led control.

Production admission remains `0/1`. Identity conformance remains `16/23` (`69.6%`). A no-traffic
candidate upload, if separately completed, is version evidence only and cannot change either count.
