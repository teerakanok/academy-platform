# Academy production gap matrix and course-discovery checkpoint - 2026-08-22

## Decision basis

This checkpoint continues from the local Identity client-registration rehearsal. It does
not enable Identity, read owner-held credentials, mutate a database, deploy, or authorize
production traffic. The public UI was rendered locally before choosing the slice at the
official desktop (1280 x 900) and Pixel 7 profiles for `/`, `/courses`, `/sign-in`, and
`/courses/basic-os-linux/en`.

The public catalog is coherent and readable, but discovery requires scanning all eight
large course cards. This is especially costly on mobile. Search and level filtering are
therefore the highest-value local checkpoint: they improve a real customer journey while
remaining independent of blocked Identity and production infrastructure.

## Prioritized production-gap matrix

| Priority | Area | Current evidence | Production gap | Dependency / safe next action |
|---|---|---|---|---|
| P0 | Identity integration | Local client-assertion registration rehearsal passes its focused contract; all enablement and release flags remain false | No released runtime wiring, real key custody, canonical registry enablement, deployed exchange/lifecycle proof, or owner bootstrap | Owner-held release operation. Keep `enabled`, `runtimeWired`, `releaseApproval`, `productionEvidence`, and related custody/deploy flags false until separately authorized |
| P0 | Learner critical journey | Public home, catalog, localized syllabus, signed-out safety, progress contracts, and public accessibility suites exist | Account creation, first authenticated enrollment, cross-device resume, completion, and recovery are not deploy-proven because Identity is closed | Continue public/local journey quality now; authenticate only after Identity release gates |
| P0 | Security | RLS, staff roles, local auth fail-closed paths, security-header checkpoint, rate-limit design, and privacy controls exist | Deployed CSP compatibility, durable abuse control, restricted-case ownership, redaction/alert operations, and current dependency-release proof remain gates | Local regression/adversarial review is safe; production controls need named operators and authorized deployment evidence |
| P0 | Deployment and exposure | A 2026-08-05 infrastructure checkpoint records Worker and Pool A deployment | Current source, Identity topology, hostname/indexing, environment bindings, and launch authorization are not evidenced as one releasable unit | Create a fresh immutable release candidate only after P0 dependencies close; no deployment in this checkpoint |
| P0 | Release evidence | Historical release, local checkpoints, tests, and rollback receipts are tracked | No current end-to-end release manifest binds code digest, migrations, runtime configuration, visual evidence, operator approval, and deployed smoke results | Produce a hash-bound release packet at the later authorized release gate |
| P1 | Course discovery | Accessible localized search and level filtering now pass unit, production-build browser, implementation-review, and visual gates | Live customer behavior and production deployment remain outside this local checkpoint | Preserve this source-bound checkpoint and include it in the later authorized release candidate |
| P1 | Admin critical journey | Role-based staff authorization and audited CLI control plane exist; internal player requires `content-ops` or `owner` | There is explicitly no staff UI in v1; support/privacy workflows and safe operational dashboards are absent | Define the smallest role-enforced admin journey after learner launch needs are fixed; do not invent browser access before server authorization exists |
| P1 | Accessibility | Public Axe suite covers key pages at desktop and Pixel 7; locale and keyboard contracts exist | New interactive controls need semantic labels, keyboard/focus behavior, live result feedback, and no-results recovery proof | Add deterministic component tests, public browser checks, and Axe coverage with this slice |
| P1 | Responsive visual quality | Final production-build desktop and Pixel 7 renders passed independent visual review with no Critical/High/Medium finding | Two non-blocking Low wrap observations remain; live customer-device telemetry is still unavailable | Retain the four source-bound screenshots and recheck them only when the catalog surface changes |
| P1 | Observability | Some operational checkpoints describe logs and rate limiting | No consolidated SLOs, error-budget policy, alert routes, synthetic learner checks, or current redaction proof bind the complete journey | Define privacy-safe events and operator-owned alerts before launch; no external telemetry mutation in this checkpoint |
| P1 | Rollback | 2026-08-05 records DB backup, transactional rollback rehearsal, and exact infrastructure rollback order | Evidence predates current Identity/application work and does not prove forward-compatible application rollback or current asset recovery | Refresh rollback rehearsal against the eventual release candidate under explicit operational authorization |

## Selected checkpoint acceptance

- Search matches the active-locale course title and subtitle case-insensitively.
- Level filtering supports all, beginner, intermediate, and advanced and composes with search.
- The UI exposes a visible search label, semantic level controls, a polite result count,
  a localized no-results recovery state, and a clear-filters action.
- Existing locale canonicalization and course links remain unchanged.
- Focused unit tests, public desktop/mobile browser tests, accessibility checks, build/lint,
  rendered evidence, GLM implementation review, Terra visual review, and Sol integration
  review must pass before this checkpoint is accepted.

## Evidence index

- Baseline renders: `academy-web/artifacts/production-gap-20260822/baseline/`
- Final production-build renders: `academy-web/artifacts/production-gap-20260822/final/`
- Focused unit: 9/9 passed.
- Lint and all TypeScript projects: exit 0; three unrelated pre-existing warnings remain.
- Production build: passed; 65 static pages generated.
- Focused discovery browser checks: 3/3 passed across desktop and Pixel 7.
- Full public browser/accessibility suite: 49 passed, 1 intentional desktop skip for
  the mobile-only layout assertion, 0 failed.
- Provider call ledger: `academy-course-discovery-provider-call-log-20260822.json`
- GLM author chain: accepted after two bounded remediations and all deterministic gates.
- Independent GLM strict RIL: the first call failed closed on malformed provider output;
  the unchanged retry passed, and the post-visual-remediation rereview passed with no
  findings against source digest
  `66c39687910028549ac49eec9127f240b9194f05cd38a211fe4412125e9e7656`.
  Final receipt: `academy-course-discovery-glm-ril-final-20260822.json`.
- Terra max visual review: the first completed visual pass found two Medium mobile
  defects. The remediated production-build screenshots then passed with no
  Critical/High/Medium finding and two non-blocking Low wrap observations. Final verdict:
  `academy-course-discovery-terra-visual-review-final-20260822.md`.
- The director-private append-only observer is the canonical continuation ledger for
  every later retry, with exact prompt archives, timestamp provenance, model/effort,
  retry parent, and terminal outcome. The product call log remains the checkpoint's
  initial dispatch record rather than a second mutable source of truth.

## Checkpoint status

**ACCEPTED LOCALLY.** Functional, build, responsive browser, accessibility, independent
implementation-review, independent visual-review, and Sol integration gates are GREEN.
The final visual review has two Low wrap observations and no blocking finding. No
unresolved deterministic product defect is known within this checkpoint.

## Release boundary

All production/runtime/release/key-custody/deploy flags remain false. This report is a
local product checkpoint, not production approval.
