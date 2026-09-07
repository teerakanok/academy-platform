# Candidate retained at zero traffic after real course-page failure

Source5bd58861b96a9547f2bcd89ecb73108338d5312c build:cf exit0, finalworkerd startup/rawhost404 confirmed. App/Worker/retention TypeScript exit0; first guessed retention config path was invalid, corrected to package.json ops/academy-retention-worker/tsconfig.json.

First version upload failed API10013, no candidateID. Authoritative versions list still ended at47/56c2e7bd; bounded retry exit0 returned6beb8fed-236e-47ea-bd4a-8af9834c61ef. Existing documented versionsdeploy previous56c2e7bd@100/candidate6beb8fed@0 exited0. No DB/secret mutations.

Candidate GET / and/sign-in genuineHTML200, robots200textplain, rawhost404. Course/assembly308 redirects to/courses/assembly/en. Real Chrome1440x900/390x844 at localized path returns404; root viewed desktopcapture. Separate root GET comparison: both predecessor56c2e7bd and candidate6beb8fed return404/5385bytes for/courses/assembly/en and/courses/setup-and-environment/en. This is an existing serving-runtime defect, not established content regression. No100percentactivation; candidate retained0 while serving predecessor remains100. No learnerjourney/import-complete claim.

Runtime repair owns separate fix/course-route-cde63a58 from5bd5886; worker must reproduce with final OpenNext/static-assets/workerd seam and preserve authorization and existing visibility. Production operator security e5f2ce3 is on a separate branch and not included in this candidate.
