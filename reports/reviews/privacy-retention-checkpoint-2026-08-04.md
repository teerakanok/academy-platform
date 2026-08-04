# Privacy and retention checkpoint review

Date: 2026-08-04
Scope: uncommitted local Academy privacy, retention, appeal, and unsubscribe batch

## Implemented contract

- Waitlist and marketing consent: three-year lifecycle, active-recipient view, token-based unsubscribe, token rotation, and re-consent after withdrawal or expiry.
- Attempts: 90 days after result, or expiry when unfinished; passing evidence and unresolved appeals are held. Appeal filing window is 30 days after result.
- Accounts and learning records: two years after last activity; unresolved appeals hold deletion.
- Privacy-request evidence: default-deny minimal case evidence, held while open and purged three years after completion or denial.
- Scheduled retention: all four bounded purge jobs are attempted; failures are aggregated and reject the cron invocation.

## Verification

- Fresh local Supabase reset applied migrations `0001` through `0017`.
- Vitest full suite: 458 passed, 42 files, no type errors.
- ESLint/TypeScript: 0 errors; one pre-existing generated-registry warning.
- Production Next.js build: passed; `/unsubscribe` and `/api/leads/unsubscribe` present.
- Full Playwright before review fixes: 138 passed, 10 intentional skips. Targeted privacy/unsubscribe reruns after fixes passed.
- Decision brief validator: passed.
- Changed-files-only gitleaks scan: no leaks found.
- `git diff --check`: passed.

## Independent review loop

Initial reviewers found destructive-delete races, swallowed/zero-row activity updates,
missing privacy purge permission, cron coupling, unclear reader wording, locale mismatch,
and incomplete request-evidence enforcement. These were fixed and retested.

Final targeted re-review:

- Code/debt: C0 H0 M0.
- Security/privacy: C0 H0 M0.
- UX/reader-first: C0 H0 M0.

## Residual launch gates

- Configure distributed Cloudflare rate limiting/WAF and redact unsubscribe query tokens from edge logs before public traffic.
- Configure the restricted case system owner, access controls, and operating route before handling non-unsubscribe privacy requests in production.
- Obtain Thai legal review of the notice and retention periods.
- Define a durable purchase ledger and entitlement restoration contract before enabling commerce; the current release has no payment flow.
- Add deterministic touch-vs-purge concurrency and worker response-contract tests when hardening the production operations layer.
- Requested locale is synchronized after hydration, so the existing first-frame default-language flash remains low risk.

No Pool A, R2, production database, deploy, or production secret was accessed.
