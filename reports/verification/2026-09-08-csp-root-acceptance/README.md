# Current source acceptance — 2026-09-08

The duplicate CSP regression is fixed and independently accepted at frozen scope r2. Production middleware is the single HTML CSP authority; development config and strict static/Worker fallback remain. Root new regression RED1failed/3pass, corrected related12/12, full2450pass/2skip; build:cf exit0; lint exactly3baseline errors17warnings (identical prior log SHA).

Actual final-bundle workerd browser gate r10 exit0: two fresh HTML responses,22scripts with matching nonces, exactly one policy and private/no-store; static asset200 and invalid-locale404 retain strict fallback. Real Chrome blocks parser-inserted untrusted script, renders course, navigates EN→TH, and persists selected dark theme after reload. Four inspected screenshots at1440x900/390x844 with actual DOM light/dark assertions are attached. Public local fixture has no production account data.

Independent r2 source review PASS, all14 frozen hashes verified. No source commit/deploy is inferred from browser success. Production candidate upload/host gates/authenticated sign-in and postdeployment browser verification remain required. Historical failed probes and superseded claims follow for audit.

# Academy CSP root verification — 2026-09-08

Source remains pending final acceptance and deployment. Independent frozen source review PASS; full unit exit0 and lint exactly3 known baseline errors17 warnings. Three TypeScript commands exit0. `npm run build:cf` exit0 including final real-workerd initialization, raw-host404, outbound interception and existing asset guard. See exact command receipts and log hashes.

Local production Next build: existing public Playwright tests2/2 passed. Root render probe r3 passed two fresh HTML responses,25 scripts each with response-matching nonces, caller nonce ignored, no-store headers; parser-inserted untrusted inline script blocked; legitimate hydration and EN→TH navigation continue with no page errors. Actual light/dark state asserted, dark selected by UI and persisted across reload. Root viewed all four browser captures at1440x900/390x844, with responsive fit and readable content. Captures are private records academy-csp-local-{desktop,mobile}-{light,dark}-r3.png.

Historical probe limitations are retained: r1 DevTools-created script executed and was not valid parser-insertion evidence; r2 parser test passed but system colorScheme did not select app dark theme, so both named theme captures were light. r3 explicitly operates the product theme control and verifies actual DOM theme, superseding that matrix claim without changing product bytes.

Causal evidence: root restored predecessor middleware/edge-header source under the unchanged current tests, observed5fail/3pass, then restored exact accepted bytes and observed8/8pass. SHA256 for all14 frozen files matched before and after. Raw logs and command receipts are retained alongside this report.

Still required: final Worker HTML nonce/cache/runtime proof (the passed Worker startup checks host refusal only); actual sign-in path, production deployment and production browser verification. Local test data and public routes do not prove authenticated learner or staff journeys. No production account, database or deployment action occurred in these browser checks.


## Actual Worker acceptance failure — 2026-09-07 21:55 UTC

Root local final-bundle Worker probe r9 returned HTTP200 and nonce-bearing HTML, but the actual browser document response contains two comma-separated enforced CSPs: the nonce/strict-dynamic policy and a complete baseline script-src self policy. Browser console explicitly blocks legitimate inline scripts, then reports Connection closed; body becomes blank. Node fetch's earlier nonce substring test was insufficient because it did not reject an additional restrictive policy. Do not treat that check as successful runtime acceptance. Reproduced without response injection in r7/r8/r9.

Existing independent source reviewer is investigating duplicate header provenance and smallest correction. Product bytes remain unchanged, source acceptance/deployment held. Runtime config preparation failures r3/r4 were resolved by using the exact already-built final bundle; r9 is a real rendered runtime failure, not an unresolved build dependency.
