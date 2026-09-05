# Academy — maintain and deploy

Procedure verified on 2026-09-05. The [release checkpoint](../../reports/releases/2026-09-05-production-session-host-gate.md)
records the exact serving source/version and outstanding authenticated journey.
The [operations runbook](academy-operations-runbook.md) covers component recovery;
its older incident narratives are historical, not a claim about this release.

## Routine maintenance

Keep three surfaces distinct: canonical host behind Access, the Worker application, and
its Academy-only PostgREST/data roles on shared Pool A. Do not infer application auth from
an Access redirect, or weaken Access to debug a callback. Inspect version/source and scoped
GET outputs before changing anything. Raw workers.dev404 is the expected host gate; raw200
is a regression of that gate, not a healthy alternative URL.

After every release check canonical root/sign-in and robots, plus raw /, /courses and
/api/leads. Raw responses must be404, empty and no-store; canonical remains Access302
until the owner explicitly opens public admission. A real owner-entered session must reach
/dashboard; also test entitlement denial/allowance, saved progress and sign-out. Never print
OTP, cookies, callback query or provider payload in evidence.

## Prepare the exact candidate

1. Start through lifecycle/router; read AGENTS and handoff, use one owned worktree/writer.
2. Author content only in Crucible. Import its immutable source mechanically and regenerate
   the content registry; retain existing publication/entitlement policy unless specifically changed.
3. Fixes require failing-first evidence. Run from academy-web:
   `npx vitest run --project unit`, `npm run lint`, and `npm run build:cf`.
   The accepted baseline is exactly3no-require-imports errors in academy-bound-worker-executor.cjs;
   new lint errors are not covered by that baseline. Record warning counts and skipped tests.
4. Run relevant content/roadmap/registry and checkpoint-answer-bias gates for content imports.
5. Independent reviewer inspects the actual auth/payment/security/production-data diff and
   evidence; bind approval to file hashes. Commit/push the reviewed source and record its SHA.
6. Observe current serving version, rollback version and binding names only. A version's
   credentials must remain inherited in place; do not export/copy them to the operator checkout.

## Deploy — actual split/override procedure

The Worker exports a Durable Object; a preview URL is unavailable for this configuration.
Use the proven upload→100/0split→version-header smoke→100%activation path from the handoff.
Run from academy-web with the installed repository Wrangler. Replace placeholders with the
observed immutable identifiers; examples below are templates, not commands to paste unchanged.

```sh
rtk proxy npm run build:cf
rtk proxy node node_modules/wrangler/bin/wrangler.js versions upload --name cyberskills-academy --keep-vars --tag release-<sha12> --message 's=<full-source-sha>;release-purpose'
rtk proxy node node_modules/wrangler/bin/wrangler.js versions deploy <previous-version>@100 <candidate-version>@0 --name cyberskills-academy --message 'candidate-smoke' --yes
```

Persist sanitized CLI exit/version/source receipts. Do not print unfiltered version metadata:
ordinary vars may contain confidential runtime information. Project only the required version
IDs, percentages, timestamps, names/types, booleans and hashes. Long build/deploy runs belong
in background with monitored logs, never a fire-and-forget claim.

For candidate GETs set this header exactly (substitute the candidate UUID):

```text
Cloudflare-Workers-Version-Overrides: cyberskills-academy="<candidate-version>"
```

The candidate must be in the current deployment for the override to select it;0% is sufficient.
Verify raw host denial, canonical Access behavior and static content before traffic activation.
If candidate smoke fails, restore the observed previous version to100% and classify the failure.
Do not resend an OTP automatically or treat an Access302 as a passed application-session check.

After acceptable candidate smoke:

```sh
rtk proxy node node_modules/wrangler/bin/wrangler.js versions deploy <candidate-version>@100 --name cyberskills-academy --message 'activate;s=<sha>;prev=<previous-version>' --yes
```

Repeat GETs without the override/cookies, verify exact active version/100%, then complete the
real browser journey. If an owner-present journey is pending, do not deploy unrelated content
and move its target. Retain predecessor and inactive candidate versions; no cleanup is implied.

## Rollback and data changes

Use the same versions-deploy command with the observed verified predecessor at100%; verify
its exact expected host behavior first. A historical pre-host-gate version restores raw200,
so it is not an acceptable long-term rollback target for a public launch. Recheck the route,
Access behavior and authenticated journey after any rollback.
For DB changes first read shared-infra access/state and inspect the Academy-only catalog and
backup point. Execute surgical SQL with ROLLBACK, inspect expected row counts and constraints,
then repeat with COMMIT only after the dry-run passes. Preserve dedicated roles/RLS and avoid
service_role shortcuts. Shared-host/restore changes need their own exact plan and independent
review; an app deployment does not authorize an unrelated infrastructure rewrite.

## Payment, entitlements and media

Payment provider is still undecided; do not create paid provider accounts or publish a payment
flow by assumption. Manual entitlement is a separate capability from catalogue visibility.
An imported course must not accidentally grant access or expose protected lessons/media.
Private media remains behind the existing authorized grant/binding path. Never repair delivery
by making the bucket public. See the component runbook for backup/restore gaps and proof requirements.

## Key inventory — final owner sitting pending

Do not populate this table from credential values or request Bitwarden. Existing historical
registry entries are not a verified current custody/rotation inventory. Fill names, locations
and rotation decisions only with the owner at the final sitting; never secret values.

| Key name | Stored where | Rotate when | Owner |
|---|---|---|---|
| | | | |

## Current acceptance limits

The session/host-gate source is deployed, but actual owner sign-in and entitlement/progress/
sign-out remain pending. Other open security items are tracked in the dated security checklist.
Neither a build nor raw404 proves that real learners can complete the entire course.
