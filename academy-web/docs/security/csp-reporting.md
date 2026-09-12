# CSP violation reporting

The Academy enforces CSP with `base-uri 'none'`, a same-origin local
`report-uri /api/security/csp-report`, and
`Cross-Origin-Opener-Policy: same-origin` on Next.js responses, Worker-generated
responses, redirects, and static asset responses. Authentication uses top-level
or full-page navigation and does not depend on a cross-origin popup. Existing
`_blank` links are informational links with `noopener`; they do not keep an
opener relationship.

Browsers submit legacy reports as `application/csp-report` and Reporting API
reports as `application/reports+json`. The endpoint accepts only POST bodies no
larger than 8 KiB, at most 20 report items, and only the recognized CSP report
shapes. It verifies the outer Worker rate-limit marker before reading a body and
rejects an explicit cross-site `Origin` or Fetch Metadata mismatch. The outer
Worker checks both the per-IP and global Durable Object quotas before OpenNext
routes the request.

No raw report, URL, source, sample, query, user identifier, or parser error is
returned, logged, or persisted. Accepted reports emit only the fixed
`csp_report_accepted` event with a bounded count and allowlisted directive
categories, then return an empty `204` with `Cache-Control: no-store`.

Local executable coverage lives in `tests/unit/csp-reporting.test.ts`. Browser
and production residuals remain: exercise Chrome/Safari/Firefox report MIME and
Fetch Metadata behavior, confirm report delivery on the canonical host, and
observe only the fixed event in Worker logs.


