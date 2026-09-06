# Identity entry admission — local release candidate

Source base7352934; retained worker patch533789ba1793ea5f9d75ef0df2bd9f0d63811c9ed67de15907203f71d6e5d175.
Worker metadata was quarantined (`E_PROVIDER_RESULT_SCHEMA`); executable patch and gate
logs were retained and independently inspected. No metadata acceptance was fabricated.

- Identity start GET/POST and callback GET now require method-aware edge rate admission
  before transaction/exchange work. Existing canonical host gate remains ahead of admission.
- Start form uses bounded2KiB URL-encoded parsing. Invalid/duplicate fields and oversized
  bodies reject before authorization state creation.
- Parent correction is test setup only: legacy disabled-runtime fixture now supplies the
  real signed edge marker helper;404/303 assertions remain unchanged.
- RED: external gate2142passed/1failed (503 before missing marker instead of runtime404).
- GREEN: `npx vitest run --project unit tests/unit/identity-runtime-completion.test.ts tests/unit/identity-security-admission.test.ts`,28passed,exit0.
- Full `npx vitest run --project unit`:141files,2143tests,exit0.
- `npm run lint`:exit1, exactly pre-existing3errors in academy-bound-worker-executor.cjs,
 16warnings; no added error. Do not report lint as passed.
- `npx tsc --noEmit`, `npx tsc -p tsconfig.worker.json`, and
 `npx tsc -p ops/academy-retention-worker/tsconfig.json`:each exit0.
- `npm run build:cf`:exit0, including existing workerd gate and production build.
- Parent checked raw log hashes against `/private/tmp/cyberskills-prod-cde63a58/academy-security-gates.json`.
- Cross-product rehearsal reads two canonical Identity core files, both byte-identical
 to5516c33; observed sibling producerHEAD94ed3c0d. No producer file changed.

Independent security review and production proof remain open. This report does not
approve deployment, close distributed/global admission risks, or claim authenticated
Academy dashboard access. Actual production remains the previously recorded release.
This branch checkpoint preserves the candidate; it is not merge or deployment approval.
