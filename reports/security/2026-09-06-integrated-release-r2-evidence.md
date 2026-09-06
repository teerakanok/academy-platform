# Academy integrated release evidence

Base: 0cbd956161491c1af2f8738f2d2f0a16a0ccbdfb. Applied individual commit patches d8219c9 (content/static assets), then daba01e (assessment). The only overlapping path was the security checklist and the three-way merge was clean. All 90 staged paths match the union of those exact commit patches.

Parent verification: 2426 unit tests; 2 actual PostgreSQL assessment tests; web, Worker and retention TypeScript; Cloudflare build including 13 actual workerd checks and final static asset guard passed. Lint retains the approved three require-import errors and 16 warnings. Commands, exits and SHA-256 log digests: artifacts/academy-integrated-r2/gates.json.

Both material source changes carry independent PASS reports under reports/reviews. Production migration state, Worker upload/activation and authenticated browser acceptance remain open. SEC-ACADEMY-006 also retains the Crucible assessment-bank content dependency and two low review followups; this checkpoint does not declare that finding closed.
