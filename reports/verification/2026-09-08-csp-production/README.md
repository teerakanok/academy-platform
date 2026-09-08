# Academy CSP production activation — 2026-09-08

Application source: `4116b0ebc4e2eab1195b0e3cc644cb73c0795b9b`.
Active Worker version: `8318899f-74ef-4223-8603-5f6508a5d2d4` at100%.
Deployment: `39ca67fd-02b7-4b46-b6bf-9faba4acf2d5`.
Retained compatible predecessor: `8e4d5c04-6b6f-459b-99e3-5b2352d0f133`.

Existing upload/candidate allocation and source gates are archived in the preceding CSP candidate/root-acceptance reports. No upload or schema migration was repeated.

1. Owner Cloudflare Access login completed normally. Credential output remained suppressed.
2. From `academy-web`, the version-override candidate probe passed22 HTTP/CSP/raw-host checks and two real Chrome sign-in captures at1440x900 and390x844, viewed by root.
3. Fresh Wrangler deployment inventory confirmed the expected100/0 allocation before mutation.
4. Existing `versions deploy <candidate>@100 --name cyberskills-academy --message <source/predecessor> --yes` exited0; exact argv is in activation receipt.
5. Fresh authoritative inventory confirms candidate100%. The same probe without override passed22 checks and two production captures, also viewed by root.

The earlier probe failure before any request was a harness working-directory error; `publicCoursePagePaths()` requires `academy-web`. It is not counted as an Access or application failure.

`manifest.json` binds all archived receipt and screenshot bytes. Screenshots show the public account-entry page only. Actual Identity OTP, shared-session reuse, staff/entitlement, learner progress/re-entry and sign-out remain open. No DB or Access-policy mutation occurred in this activation.
