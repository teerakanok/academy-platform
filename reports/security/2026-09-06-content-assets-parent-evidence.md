# Content and public-assets boundary acceptance

Parent applied exact retained patch51d64a87761e7f34da4d70dc894086e45ee5c92de71bebb4bd956598c45f5465 to base0cbd956. Actual npm run build:cf passed including13 real workerd host checks, OpenNext final assets and asset-guard. See artifacts/asset-boundary-parent-build.log. Earlier producer build apparatus failures are historical, not a current build failure.

Independent review found safe-named symlinks could hide protected file/directory targets. Subprocess regression tests covered file, directory and cycle:3red before guard correction,5green after rejecting all symlinks. Actual final assets have0symlinks and amended asset-guard passed. Parent full unit2420 passed, lint exit1 matches approved3errors16warnings. Source TypeScript passed in original unchanged contract; new change is plainJS guard and its executed tests.

Follow-up independent PASS (frozen54files matched) in reports/reviews/20260906T1543Z-asset-boundary-independent.json. Production remains open. A separate clean CI run is not an added owner gate: the required actual parent clean OpenNext build is evidenced. Existing CSP unsafe-inline (SEC013) and additional audio/video/caption scheme policies are separate findings; no claimed broader XSS closure.
