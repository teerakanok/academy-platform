# Session Handoff: academy-platform

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260824T022958972Z-lifecycle-disabled-rehearsal",
  "created_at": "2026-08-24T02:29:58.972Z",
  "project": "academy-platform",
  "objective": "Advance Academy production readiness through the exact source-bound disabled lifecycle rehearsal without enabling traffic",
  "state": "ready",
  "repo": {"remote": "github.com/teerakanok/academy-platform", "branch": "main", "base_head": "2b8b945223a5a413a771e0273266fc2478384abc"},
  "delivery": "local",
  "worktree": {
    "mode": "allowlisted",
    "entries": [
      {"status": " M", "path": "reports/vault/2026-08-19-academy-self-study-systems-track.json", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/course-detail-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/course-detail-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/courses-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/courses-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/home-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/home-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/sign-in-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/baseline/sign-in-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/final/courses-discovery-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/final/courses-filtered-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/final/courses-no-results-desktop.png", "owner": "other-session"},
      {"status": "??", "path": "academy-web/artifacts/production-gap-20260822/final/courses-thai-mobile.png", "owner": "other-session"},
      {"status": "??", "path": "reports/reviews/academy-current-deployment-parser-glm-ril-incident-20260823.json", "owner": "other-session"}
    ]
  },
  "scope": {
    "allowed": [
      "Create Academy-local source-bound specification, disabled rehearsal, validator tests, and receipt for the exact lifecycle endpoint and audiences selected by Identity Control at d95efebd518c83f711767947ced6c69b14c05881.",
      "Keep consumer policy and registry disabled with null runtime lifecycle values while proving the selected values only through an inert injected rehearsal.",
      "Update Academy plans, checkpoint evidence, and canonical handoff after deterministic verification and independent review."
    ],
    "forbidden": [
      "Do not edit, stage, discard, or claim any pre-existing dirty file recorded under other-session ownership.",
      "Do not enable Academy Identity, write endpoint or audience values into live runtime configuration, send lifecycle traffic, deploy, shift Worker traffic, touch Pool A, or access credentials.",
      "Do not claim Identity acceptance, blocker closure, production admission, release approval, or authority from an Academy-local rehearsal."
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "academy-web/src/lib/identity/consumer-policy.ts",
    "reports/reviews/academy-identity-lifecycle-pull-transport-local-checkpoint-2026-08-11.md"
  ],
  "owner_decisions": [
    "Proceed through production-readiness gates while stopping only for irreversible or costly risk.",
    "Identity Control selected one exact non-fixture publisher endpoint and two audiences while requiring Academy to remain disabled and traffic-free.",
    "All pre-existing Academy dirty files belong to other sessions and remain protected."
  ],
  "completed": [
    "Reconciled the stale pointer against Academy HEAD 2b8b945223a5a413a771e0273266fc2478384abc and origin/main.",
    "Verified Identity Control d95efebd518c83f711767947ced6c69b14c05881 records canonical-domain acceptance, local key-rotation rehearsal acceptance, and the lifecycle disabled-rehearsal intake as the exact next gate.",
    "Verified the intake keeps registry values null, traffic disabled, production authority NONE, accepted receipts 1/5, and blockers closed 1/6."
  ],
  "changed_files": [
    {"path": "reports/handoffs/20260824T022958972Z-lifecycle-disabled-rehearsal.md", "reason": "Canonical stale-handoff repair bound to the current Academy HEAD and next Identity intake contract."},
    {"path": "reports/handoffs/current.json", "reason": "Active pointer for the repaired Academy continuation."}
  ],
  "remaining_work": [
    "Implement the Academy-local exact-value specification and disabled authenticated-pull rehearsal through the bounded GLM route.",
    "Prove no network or runtime authority is reachable, freeze the source-bound evidence, and obtain independent review plus Sol final review.",
    "Submit the Academy receipt to Identity Control in a later actual-root acceptance checkpoint; Identity acceptance remains outside this Academy slice."
  ],
  "risks": [
    "A rehearsal that imports runtime configuration or performs fetch could silently widen authority; the oracle must prove injected-only execution and zero network calls.",
    "Writing selected values into consumer-policy runtime fields would enable a future authority path and violate the disabled intake boundary.",
    "Protected dirty files could contaminate repository-wide evidence unless validation uses a clean detached worktree."
  ],
  "next": {
    "cwd": ".",
    "summary": "Implement and verify the Academy product-local disabled lifecycle rehearsal bound to Identity Control's exact selected endpoint and audiences",
    "first_step": "Run the deterministic model-team delegation gate for bounded code, then dispatch one sensitive-source GLM edit work order from a clean Academy worktree with the Identity intake contract supplied as external acceptance evidence.",
    "commands": [
      "node ../../../scripts/model-team-route.mjs delegation --task-class bounded_code --fork-turns none",
      "cd academy-web && npm run test:unit -- --run tests/unit/identity-lifecycle-pull-transport.test.ts",
      "cd academy-web && npm run lint",
      "git diff --check"
    ],
    "acceptance": [
      "Academy commits an exact endpoint/audience specification and authenticated-pull disabled rehearsal receipt bound to source be72bd4978b616bcd8d782dfc80106ab27780f67 and Identity contract d95efebd518c83f711767947ced6c69b14c05881.",
      "Tests prove exact selected values, zero fetch/network calls, no registry or consumer-policy enablement, no raw secret/private-key material, and no production authority.",
      "Focused and related regression tests, static checks, freeze verification, independent implementation review, and Sol final review pass with no unresolved Critical, High, or Medium finding.",
      "Every pre-existing dirty file remains byte-untouched and unstaged."
    ],
    "execution_boundary": "local-reversible"
  },
  "blocker": null,
  "verification": [
    {"command": "git rev-parse HEAD && git rev-parse origin/main", "result": "Both resolve to 2b8b945223a5a413a771e0273266fc2478384abc."},
    {"command": "git -C ../identity-control rev-parse HEAD && git -C ../identity-control rev-parse origin/main", "result": "Both resolve to d95efebd518c83f711767947ced6c69b14c05881."},
    {"command": "git status --porcelain=v1 --untracked-files=all", "result": "Observed one protected tracked vault modification, twelve protected visual artifacts, and one protected untracked incident JSON; all are recorded exactly."}
  ],
  "cleanup": {
    "processes": "No Academy server, model worker, provider CLI, deployment, or lifecycle rehearsal process is running.",
    "artifacts": "No temporary implementation artifact exists yet; all observed dirty artifacts remain protected under other-session ownership."
  }
}
-->

## Objective
Advance Academy production readiness through the exact source-bound disabled lifecycle rehearsal without enabling traffic.

## Owner Intent And Decisions
- Proceed through production-readiness gates while stopping only for irreversible or costly risk.
- Identity Control selected one exact non-fixture publisher endpoint and two audiences while requiring Academy to remain disabled and traffic-free.
- All pre-existing Academy dirty files belong to other sessions and remain protected.

Allowed scope:
- Create Academy-local source-bound specification, disabled rehearsal, validator tests, and receipt for the exact lifecycle endpoint and audiences selected by Identity Control at d95efebd518c83f711767947ced6c69b14c05881.
- Keep consumer policy and registry disabled with null runtime lifecycle values while proving the selected values only through an inert injected rehearsal.
- Update Academy plans, checkpoint evidence, and canonical handoff after deterministic verification and independent review.

## Repository State
- State: ready
- Branch: main
- Baseline: 2b8b945223a5a413a771e0273266fc2478384abc
- Delivery: local
- Baseline equals `origin/main`.

## Completed This Session
- Reconciled the stale pointer against Academy HEAD 2b8b945223a5a413a771e0273266fc2478384abc and origin/main.
- Verified Identity Control d95efebd518c83f711767947ced6c69b14c05881 records canonical-domain acceptance, local key-rotation rehearsal acceptance, and the lifecycle disabled-rehearsal intake as the exact next gate.
- Verified the intake keeps registry values null, traffic disabled, production authority NONE, accepted receipts 1/5, and blockers closed 1/6.

## Changed Files
- `reports/handoffs/20260824T022958972Z-lifecycle-disabled-rehearsal.md`: Canonical stale-handoff repair bound to the current Academy HEAD and next Identity intake contract.
- `reports/handoffs/current.json`: Active pointer for the repaired Academy continuation.

## Verification
- `git rev-parse HEAD && git rev-parse origin/main`: Both resolve to 2b8b945223a5a413a771e0273266fc2478384abc.
- `git -C ../identity-control rev-parse HEAD && git -C ../identity-control rev-parse origin/main`: Both resolve to d95efebd518c83f711767947ced6c69b14c05881.
- `git status --porcelain=v1 --untracked-files=all`: Observed one protected tracked vault modification, twelve protected visual artifacts, and one protected untracked incident JSON; all are recorded exactly.

## Dirty State
Expected worktree: exact allowlisted entries in packet metadata, all owned by other sessions.

- `M reports/vault/2026-08-19-academy-self-study-systems-track.json` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/course-detail-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/course-detail-mobile.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/courses-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/courses-mobile.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/home-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/home-mobile.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/sign-in-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/baseline/sign-in-mobile.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/final/courses-discovery-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/final/courses-filtered-mobile.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/final/courses-no-results-desktop.png` - other-session; protected.
- `?? academy-web/artifacts/production-gap-20260822/final/courses-thai-mobile.png` - other-session; protected.
- `?? reports/reviews/academy-current-deployment-parser-glm-ril-incident-20260823.json` - other-session; protected.

## Cleanup State
- Processes: No Academy server, model worker, provider CLI, deployment, or lifecycle rehearsal process is running.
- Artifacts: No temporary implementation artifact exists yet; all observed dirty artifacts remain protected under other-session ownership.

## Remaining Work And Risks
- Remaining: Implement the Academy-local exact-value specification and disabled authenticated-pull rehearsal through the bounded GLM route.
- Remaining: Prove no network or runtime authority is reachable, freeze the source-bound evidence, and obtain independent review plus Sol final review.
- Remaining: Submit the Academy receipt to Identity Control in a later actual-root acceptance checkpoint; Identity acceptance remains outside this Academy slice.
- Risk: A rehearsal that imports runtime configuration or performs fetch could silently widen authority; the oracle must prove injected-only execution and zero network calls.
- Risk: Writing selected values into consumer-policy runtime fields would enable a future authority path and violate the disabled intake boundary.
- Risk: Protected dirty files could contaminate repository-wide evidence unless validation uses a clean detached worktree.

No blocker.

## Exact Next Action
Working directory: .

Implement and verify the Academy product-local disabled lifecycle rehearsal bound to Identity Control's exact selected endpoint and audiences.

First step: Run the deterministic model-team delegation gate for bounded code, then dispatch one sensitive-source GLM edit work order from a clean Academy worktree with the Identity intake contract supplied as external acceptance evidence.

Commands:
- `node ../../../scripts/model-team-route.mjs delegation --task-class bounded_code --fork-turns none`
- `cd academy-web && npm run test:unit -- --run tests/unit/identity-lifecycle-pull-transport.test.ts`
- `cd academy-web && npm run lint`
- `git diff --check`

## Done Definition
- Academy commits an exact endpoint/audience specification and authenticated-pull disabled rehearsal receipt bound to source be72bd4978b616bcd8d782dfc80106ab27780f67 and Identity contract d95efebd518c83f711767947ced6c69b14c05881.
- Tests prove exact selected values, zero fetch/network calls, no registry or consumer-policy enablement, no raw secret/private-key material, and no production authority.
- Focused and related regression tests, static checks, freeze verification, independent implementation review, and Sol final review pass with no unresolved Critical, High, or Medium finding.
- Every pre-existing dirty file remains byte-untouched and unstaged.

## Do Not Touch
- Do not edit, stage, discard, or claim any pre-existing dirty file recorded under other-session ownership.
- Do not enable Academy Identity, write endpoint or audience values into live runtime configuration, send lifecycle traffic, deploy, shift Worker traffic, touch Pool A, or access credentials.
- Do not claim Identity acceptance, blocker closure, production admission, release approval, or authority from an Academy-local rehearsal.
- Protected path: `reports/vault/2026-08-19-academy-self-study-systems-track.json`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/course-detail-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/course-detail-mobile.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/courses-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/courses-mobile.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/home-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/home-mobile.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/sign-in-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/baseline/sign-in-mobile.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/final/courses-discovery-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/final/courses-filtered-mobile.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/final/courses-no-results-desktop.png`.
- Protected path: `academy-web/artifacts/production-gap-20260822/final/courses-thai-mobile.png`.
- Protected path: `reports/reviews/academy-current-deployment-parser-glm-ril-incident-20260823.json`.
