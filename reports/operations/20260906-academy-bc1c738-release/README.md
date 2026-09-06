# Academy production release — 2026-09-06

Source: bc1c738e7cab4f74f1db5a74efa8216996a02f94. Independent startup review and source gates are in reports/reviews/2026-09-06-final-worker-startup. Integration academy-web tree equals the reviewed source; integration build:cf exited 0.

Actual installed Wrangler 4.120.0 uploaded version 43, 90c390b5-ed8e-48e3-8ab5-3a3b8bb30cd8 (startup 27 ms), then the established 100/0 split and version-override GET smoke preceded activation. Deployment 1043558a-7697-4f70-a318-256f4a3d0af0 allocated this version 100% at 2026-09-06T18:12:45.664802Z. The attached command receipts record commands, exits, source and version IDs.

Post-activation deployments list and six GET checks without override/cookies passed at 18:13:48 UTC: raw /, /courses and /api/leads returned 404, empty, no-store; canonical / and /sign-in returned Access 302. Robots returned the unchanged Cloudflare edge text (200), byte-identical to the predecessor. Initial candidate smoke incorrectly expected robots 302; its failed receipt is retained alongside the paired baseline comparison and corrected acceptance. No robots, Access or DNS configuration was changed.

Actual isolated Chrome screenshots at 1440x900 and 390x844 show the Access sign-in page with no horizontal overflow. They prove the unauthenticated admission boundary only. Authenticated learner sign-in, entitlement, progress, session revocation and erasure remain unproven on production. No OTP was submitted or email sent.

Rollback: use the documented versions-deploy procedure to restore predecessor 6c2e3881-4836-4bee-8bd1-b6e5368b6def to 100%, then repeat allocation and host checks. Keep both versions. Academy migrations 0029–0033 were already committed with exact-body ROLLBACK-first evidence in ../20260906-academy-0029-0033; do not reapply.
