# Session digest candidate — not approved for deployment

Parent observed full unit 2435 passed; a new test union narrowing failed TypeScript then the corrected focused test and all three TypeScript projects passed. Lint retains exactly the owner-accepted baseline 3 errors in academy-bound-worker-executor.cjs and 16 warnings. No current-candidate Cloudflare build or independent approval yet.

Production remains bc1c738 with migrations through 0033. Migration 0034 has never run on production. Disposable PostgreSQL ROLLBACK rehearsal proved that 0034 incorrectly accepts repeated application (double hashing any existing IDs). Mixed old/new writers and legacy completed callback retries are not yet safely handled. Existing cookies must remain valid; do not silently expire sessions or restore a whole database. This checkpoint preserves useful WIP pending one cohesive compatibility correction and independent review.
