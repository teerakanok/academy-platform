# Root acceptance — SEC-ACADEMY-010

Root independently ran focused 60/60, full unit 2,441 passed / 2 skipped, three TypeScript gates, and `npm run build:cf` (all exit 0). Build includes real workerd media R2/session checks, asset guard, and final Worker startup with raw-host HTTP 404. `npm run lint` exits 1 with only the three previously accepted baseline errors in academy-bound-worker-executor.cjs; no error was suppressed.

Root replaced only worker-delivery.ts with its exact base implementation while retaining the new tests: the no-session grant returned media HTTP 200, producing exit 1 (1 failed, 15 passed). Candidate bytes were restored exactly and the same suite passed 16/16. This is a behavioral baseline reproduction, not a fabricated failing assertion.

Independent reviewer crux_integrated_release_review returned PASS after inspecting exact issuance, session parser, signed digest, Worker and local read ordering, legacy rejection, TTL/ranges, and edge imports. It did not claim immediate DB revocation or production verification. Source hashes and raw command logs are in manifest.json and the adjacent files. Production deployment and authenticated acceptance remain pending.
