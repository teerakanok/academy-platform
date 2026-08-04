# Private media checkpoint review

Date: 2026-08-04
Scope: local Academy lesson-media authorization and delivery boundary

## Implemented contract

- Private MP4, VTT, and PDF fixtures no longer live under `public/`.
- Lesson authorization resolves registered media to opaque HMAC grants without exposing
  storage object keys.
- `/api/media/open` re-checks the current session, activation, entitlement, and node
  prerequisite before issuing a five-minute delivery grant.
- The outer Worker serves registered private objects through `COURSE_MEDIA` with
  GET, HEAD, and single byte-range support. Expired authentic grants renew through the
  authenticated open endpoint; revoked access blocks renewal immediately.
- The local adapter is explicitly configured for E2E only and follows the Worker contract.
- Video failure UX is localized, accessible, retryable, and preserves playback position.

## Verification

- Vitest final full suite: 475 passed, 45 files, no type errors.
- Targeted media unit suite after review fixes: 17 passed, no type errors.
- ESLint/TypeScript: 0 errors; one pre-existing generated-registry warning.
- Production Next.js build and OpenNext Cloudflare build: passed.
- Wrangler dry-run: passed; private MP4/VTT/PDF/ZIP files absent from OpenNext output.
- Final full Playwright: 139 passed, 10 intentional skips, with one unrelated stateful
  capstone failure; the identical capstone test passed immediately in isolated rerun.
  Targeted signed PDF, hostile-host, Range/HEAD, video retry/position, and cue tests passed.

## Independent review loop

Initial review found Range parity, bounded revocation/renewal, object-key disclosure,
video recovery, and learner-facing error issues. Final review then found a forwarded-host
token-exfiltration risk, local Range divergence, retry position loss, and expired-PDF
recovery gap. All findings were fixed and retested.

- Code/debt: C0 H0 M0.
- Security: C0 H0 M0.
- UX/premium: C0 H0 M0.

## External activation gate

- Owner authorization is still required before creating/selecting an R2 bucket,
  uploading objects, configuring `COURSE_MEDIA`, setting the production signing secret,
  or running remote/deployment proof.
- Remote acceptance must verify legacy public URLs fail, valid/range delivery works,
  captions and PDF load, tampering/expiry fail safely, revocation blocks renewal, and
  missing objects do not fall through to public assets.

No R2 resource, production secret, remote environment, or deployment was accessed.
