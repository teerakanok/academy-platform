# Session Handoff: academy-platform

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260806T143144852Z-identity-control-v1-local-prep",
  "created_at": "2026-08-06T14:31:44.852Z",
  "project": "academy-platform",
  "objective": "นำ Academy Identity Control Consumer Registry v1 ไปสู่ integration gate โดยคง production sign-in disabled และเตรียม local boundary ให้พร้อม",
  "state": "blocked",
  "repo": {
    "remote": "github.com/teerakanok/academy-platform",
    "branch": "main",
    "base_head": "56c0092bc74fa952ff6eec047a371d81c1963915"
  },
  "delivery": "local",
  "worktree": {
    "mode": "clean",
    "entries": []
  },
  "scope": {
    "allowed": [
      "แก้โค้ด/เทส/เอกสารภายใน products/cyberskills/academy-platform สำหรับ local/reversible preparation",
      "รัน unit tests, lint/typecheck, Cloudflare build และ local security checks",
      "อัปเดต Academy plans, reports และ handoff เท่านั้น"
    ],
    "forbidden": [
      "แก้หรือ publish products/cyberskills/identity-control/**",
      "เปิด real adapter, production sign-in หรือ direct Academy OTP เป็น production path",
      "สร้างหรือส่ง private key, credentials, token หรือ secret",
      "แก้ DNS, deploy Worker, mutate Pool A/production หรือ bootstrap owner",
      "ใช้ email หรือ generated UUID เป็น ownership key",
      "stage, revert หรือ cleanup unrelated dirty work ใน director repo"
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "plans/completed_log.md",
    "reports/reviews/academy-identity-control-preparation-2026-08-06.md",
    "reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md",
    "academy-web/src/lib/identity/consumer-policy.ts"
  ],
  "owner_decisions": [
    "Identity Control approved Consumer Registry v1: client_id academy-web, service_id academy, activation_policy open",
    "Canonical callback is https://academy.cyberskills.co.th/auth/callback and result audience is https://academy.cyberskills.co.th",
    "Client assertion audience is https://accounts.cyberskills.co.th/v1/code/exchange; Academy owns the future private key but must not generate one before key ceremony",
    "Initial registry state is disabled; activation creates/binds only Academy profile and never grants course entitlement",
    "No DNS, key generation, deployment, production mutation, or owner bootstrap until the separate release gates pass"
  ],
  "completed": [
    "Updated non-secret Academy candidate and policy projection to Consumer Registry v1, with canonical null/empty values preserved for unpublished public keys, lifecycle endpoints/audiences, and kill-switch owner",
    "Added local durable transaction and opaque session stores with exclusive O_EXCL locking, atomic replace, expiry, replay/revoke handling, restrictive permissions, and fail-closed corruption/lock behavior",
    "Added assertion-audience propagation and activation-without-entitlement regression coverage",
    "Kept callback parsing, real adapter, production sign-in, and owner bootstrap disabled",
    "Independent security, identity-contract, and reader-first reviews passed; no production system was touched",
    "Ecosystem: updated ecosystem/ECOSYSTEM.md and ecosystem/CHANGELOG.md; existing identity contract already covered the Academy activation/entitlement invariant, so SECURITY_REGISTRY.md required no change"
  ],
  "changed_files": [
    { "path": "academy-web/src/lib/identity/adapter.ts", "reason": "Pass the registered client-assertion audience to the server-side signer boundary" },
    { "path": "academy-web/src/lib/identity/consumer-policy.ts", "reason": "Non-secret projection of the approved Academy registry policy; not runtime config" },
    { "path": "academy-web/src/lib/identity/file-store-lock.ts", "reason": "Exclusive local lock for read-modify-write; stale/crashed lock fails closed" },
    { "path": "academy-web/src/lib/identity/session-store.ts", "reason": "Local durable opaque session preparation with host-scoped cookie helper" },
    { "path": "academy-web/src/lib/identity/transaction.ts", "reason": "Durable transaction store interface/file implementation and client binding checks" },
    { "path": "academy-web/tests/unit/identity-consumer-policy.test.ts", "reason": "Canonical policy and disabled/public-key/lifecycle null assertions" },
    { "path": "academy-web/tests/unit/identity-durable-store.test.ts", "reason": "Restart, expiry, corruption, lock cleanup, and nested-path tests" },
    { "path": "academy-web/tests/unit/identity-session-store.test.ts", "reason": "Session restart, revoke/expiry, and host-only cookie tests" },
    { "path": "academy-web/tests/unit/identity-transaction.test.ts", "reason": "Assertion audience propagation regression" },
    { "path": "plans/active_plan.md", "reason": "Current Identity Control alignment and blocked release gates" },
    { "path": "plans/completed_log.md", "reason": "Approved registry/local preparation evidence and residual risk" },
    { "path": "reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md", "reason": "Canonical candidate fields, sources, and release boundaries" },
    { "path": "reports/reviews/academy-identity-control-preparation-2026-08-06.md", "reason": "Post-approval local preparation addendum and verification" }
  ],
  "remaining_work": [
    "Identity Control must publish active/overlap public-key references, lifecycle authenticated-pull endpoint/contract, event/assertion audiences where required, and named kill-switch owner",
    "Academy must receive conformance evidence and separate production authorization before wiring the real adapter, lifecycle puller, or production session runtime",
    "Founder bootstrap must happen only after canonical sign-in and use (canonical_issuer, subject); no UUID/email substitute",
    "Other local/reversible Academy lanes may proceed only after selecting the next product priority from active_plan"
  ],
  "risks": [
    "Production sign-in and registry remain disabled; the approved policy is not a deployment authorization",
    "Local file stores intentionally fail closed after a crashed process leaves a lock; they are not production persistence",
    "No canonical principal/profile or owner has been bootstrapped",
    "Director worktree contains unrelated user/other-session dirty files; they are protected and must not be touched"
  ],
  "next": {
    "cwd": "academy-web",
    "summary": "รอ Identity Control publish client public-key references, lifecycle authenticated-pull contract และ separate production authorization; ระหว่างนั้นเลือก local/reversible Academy lane จาก active_plan",
    "first_step": "อ่าน active_plan และ candidate report แล้วตรวจหลักฐาน release ของ Identity Control ว่ามี public-key refs, lifecycle pull contract, kill-switch owner, conformance และ separate authorization ครบหรือยัง; ถ้ายังไม่ครบห้าม wire real adapter",
    "commands": [
      "rtk sed -n '1,120p' plans/active_plan.md",
      "rtk sed -n '1,180p' reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md",
      "rtk git status --short --branch",
      "rtk npm run test:unit"
    ],
    "acceptance": [
      "Missing Identity Control release inputs leave real adapter/sign-in disabled and are reported as a blocker",
      "Any local lane uses failing-first tests and does not touch DNS, keys, credentials, Pool A, deploy, or owner bootstrap",
      "Full relevant verification passes and Academy worktree remains clean before the next handoff"
    ],
    "execution_boundary": "blocked-external-or-sensitive"
  },
  "blocker": {
    "reason": "Identity Control approved policy but has not published the public-key registration/rotation evidence, lifecycle pull endpoint/contract, named kill-switch owner, conformance evidence, or separate production authorization needed to enable Academy runtime",
    "required_input": "Identity Control release inputs and explicit production authorization; otherwise choose a separately prioritized local/reversible Academy lane"
  },
  "verification": [
    { "command": "rtk npm run test:unit", "result": "53 files, 430 tests passed" },
    { "command": "rtk npm run lint", "result": "0 errors; one pre-existing unused eslint-disable warning in src/lib/content/registry.generated.ts" },
    { "command": "rtk npm run build:cf", "result": "OpenNext Cloudflare build complete; only existing compatibility/deprecation warnings" },
    { "command": "rtk gitleaks detect --source . --no-banner", "result": "no leaks found" },
    { "command": "rtk git diff --check", "result": "passed" },
    { "command": "independent security/identity/reader-first review", "result": "PASS; no C/H/M findings; local stale-lock availability residual documented" }
  ],
  "cleanup": {
    "processes": "session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes — no dev server, build process, orphan, or zombie remained; no --keep",
    "artifacts": "session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes — no untracked-recent or session-owned artifact remained; no --keep"
  }
}
-->

## Objective
นำ Academy Identity Control Consumer Registry v1 ไปสู่ integration gate โดยคง production sign-in disabled และเตรียม local boundary ให้พร้อม

## Owner Intent And Decisions
- แก้โค้ด/เทส/เอกสารภายใน products/cyberskills/academy-platform สำหรับ local/reversible preparation
- รัน unit tests, lint/typecheck, Cloudflare build และ local security checks
- อัปเดต Academy plans, reports และ handoff เท่านั้น
- Identity Control เป็นเจ้าของ canonical identity, Account Center, OTP, activation, lifecycle และ registry
- Identity Control approved Consumer Registry v1: client_id academy-web, service_id academy, activation_policy open
- Canonical callback is https://academy.cyberskills.co.th/auth/callback and result audience is https://academy.cyberskills.co.th
- Client assertion audience is https://accounts.cyberskills.co.th/v1/code/exchange; Academy owns the future private key but must not generate one before key ceremony
- Initial registry state is disabled; activation creates/binds only Academy profile and never grants course entitlement
- No DNS, key generation, deployment, production mutation, or owner bootstrap until the separate release gates pass
- Registry v1 ที่อนุมัติแล้ว: `academy-web` / `academy` / `open`, callback และ result audience ตาม canonical source, initial state `disabled`
- Activation สร้างหรือ bind ได้เพียง Academy profile; course access ต้องมี Academy-owned entitlement, resource authorization และ prerequisite
- Academy runtime เป็นเจ้าของ private key ในอนาคต แต่ยังห้าม generate/register key จนกว่าจะมี key-ceremony change record
- ห้าม production mutation, DNS, deployment, credential handling, direct production OTP หรือ owner bootstrap

## Repository State
- State: blocked on Identity Control release inputs
- Branch: `main`
- Baseline before this handoff commit: `56c0092bc74fa952ff6eec047a371d81c1963915`
- Delivery: local handoff persistence; implementation commits are already pushed, this packet remains local until explicitly delivered

## Completed This Session
- Updated non-secret Academy candidate and policy projection to Consumer Registry v1, with canonical null/empty values preserved for unpublished public keys, lifecycle endpoints/audiences, and kill-switch owner
- Added local durable transaction and opaque session stores with exclusive O_EXCL locking, atomic replace, expiry, replay/revoke handling, restrictive permissions, and fail-closed corruption/lock behavior
- Added assertion-audience propagation and activation-without-entitlement regression coverage
- Kept callback parsing, real adapter, production sign-in, and owner bootstrap disabled
- Independent security, identity-contract, and reader-first reviews passed; no production system was touched
- Ecosystem: updated ecosystem/ECOSYSTEM.md and ecosystem/CHANGELOG.md; existing identity contract already covered the Academy activation/entitlement invariant, so SECURITY_REGISTRY.md required no change
- อัปเดต candidate report และ local non-secret policy projection ให้ตรง Consumer Registry v1 ที่อนุมัติ
- เพิ่ม durable transaction/session preparation ใน local scope พร้อม exclusive lock และ fail-closed semantics
- เพิ่ม regression tests สำหรับ signer audience, policy fidelity, persistence, replay/revoke, expiry/corruption และ activation-entitlement separation
- อัปเดต Academy plans/reviews และ director ecosystem status/changelog
- Independent reviews ปิดโดยไม่พบ critical/high/medium/low finding; residual คือ local lock หลัง process crash จะ fail closed

## Changed Files
- `academy-web/src/lib/identity/adapter.ts`: Pass the registered client-assertion audience to the server-side signer boundary
- `academy-web/src/lib/identity/consumer-policy.ts`: Non-secret projection of the approved Academy registry policy; not runtime config
- `academy-web/src/lib/identity/file-store-lock.ts`: Exclusive local lock for read-modify-write; stale/crashed lock fails closed
- `academy-web/src/lib/identity/session-store.ts`: Local durable opaque session preparation with host-scoped cookie helper
- `academy-web/src/lib/identity/transaction.ts`: Durable transaction store interface/file implementation and client binding checks
- `academy-web/tests/unit/identity-consumer-policy.test.ts`: Canonical policy and disabled/public-key/lifecycle null assertions
- `academy-web/tests/unit/identity-durable-store.test.ts`: Restart, expiry, corruption, lock cleanup, and nested-path tests
- `academy-web/tests/unit/identity-session-store.test.ts`: Session restart, revoke/expiry, and host-only cookie tests
- `academy-web/tests/unit/identity-transaction.test.ts`: Assertion audience propagation regression
- `plans/active_plan.md`: Current Identity Control alignment and blocked release gates
- `plans/completed_log.md`: Approved registry/local preparation evidence and residual risk
- `reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`: Canonical candidate fields, sources, and release boundaries
- `reports/reviews/academy-identity-control-preparation-2026-08-06.md`: Post-approval local preparation addendum and verification
- Product implementation commits: `32bbc13`, `56c0092`

## Verification
- `rtk npm run test:unit`: 53 files, 430 tests passed
- `rtk npm run lint`: 0 errors; one pre-existing unused eslint-disable warning in src/lib/content/registry.generated.ts
- `rtk npm run build:cf`: OpenNext Cloudflare build complete; only existing compatibility/deprecation warnings
- `rtk gitleaks detect --source . --no-banner`: no leaks found
- `rtk git diff --check`: passed
- `independent security/identity/reader-first review`: PASS; no C/H/M findings; local stale-lock availability residual documented
- `rtk npm run test:unit`: 53 files / 430 tests passed
- `rtk npm run lint`: 0 errors; warning เดิมหนึ่งรายการใน generated registry
- `rtk npm run build:cf`: complete
- `rtk gitleaks detect --source . --no-banner`: no leaks found
- `rtk git diff --check`: passed
- `session-cleanup.mjs scan`, `sweep --apply`, `verify`: clean, 0 paths, 0 processes

## Dirty State
Academy product worktree is clean at the baseline recorded above; the handoff
packet and `current.json` are the only files to persist in the close commit.
Director root retains unrelated user/other-session dirty files; they are
protected and must not be staged, reverted, or cleaned by the next Academy
session.

## Cleanup State
- Processes: session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes — no dev server, build process, orphan, or zombie remained; no --keep
- Artifacts: session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes — no untracked-recent or session-owned artifact remained; no --keep
- Processes: `session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes` — no dev server, build process, orphan, or zombie remained; no `--keep`.
- Artifacts: same sweeper summary; no session-owned or untracked-recent artifact remained; no `--keep`.

## Remaining Work And Risks
- Identity Control must publish active/overlap public-key references, lifecycle authenticated-pull endpoint/contract, event/assertion audiences where required, and named kill-switch owner
- Academy must receive conformance evidence and separate production authorization before wiring the real adapter, lifecycle puller, or production session runtime
- Founder bootstrap must happen only after canonical sign-in and use (canonical_issuer, subject); no UUID/email substitute
- Other local/reversible Academy lanes may proceed only after selecting the next product priority from active_plan
- Production sign-in and registry remain disabled; the approved policy is not a deployment authorization
- Local file stores intentionally fail closed after a crashed process leaves a lock; they are not production persistence
- No canonical principal/profile or owner has been bootstrapped
- Director worktree contains unrelated user/other-session dirty files; they are protected and must not be touched
- Identity Control approved policy but has not published the public-key registration/rotation evidence, lifecycle pull endpoint/contract, named kill-switch owner, conformance evidence, or separate production authorization needed to enable Academy runtime
- Remaining: Identity Control public-key registration/rotation evidence, lifecycle authenticated-pull endpoint/contract, named kill-switch owner, conformance evidence, and separate production authorization.
- Remaining: after those gates, wire real adapter/session/lifecycle and bootstrap founder only after canonical sign-in.
- Risk: production sign-in remains disabled by design; the approved registry policy is not runtime authorization.
- Risk: local file stores fail closed after a crashed lock holder and are not production persistence.

Blocked on: Identity Control approved policy but has not published the public-key registration/rotation evidence, lifecycle pull endpoint/contract, named kill-switch owner, conformance evidence, or separate production authorization needed to enable Academy runtime

Required input: Identity Control release inputs and explicit production authorization; otherwise choose a separately prioritized local/reversible Academy lane

## Exact Next Action
Working directory: `academy-web`
Working directory: academy-web

รอ Identity Control publish client public-key references, lifecycle authenticated-pull contract และ separate production authorization; ระหว่างนั้นเลือก local/reversible Academy lane จาก active_plan

ตรวจ Identity Control release evidence against the remaining gates; if any gate is missing, keep real adapter/sign-in disabled and select only a local/reversible lane from `plans/active_plan.md`.

First step: อ่าน active_plan และ candidate report แล้วตรวจหลักฐาน release ของ Identity Control ว่ามี public-key refs, lifecycle pull contract, kill-switch owner, conformance และ separate authorization ครบหรือยัง; ถ้ายังไม่ครบห้าม wire real adapter

Commands:
- `rtk sed -n '1,120p' plans/active_plan.md`
- `rtk sed -n '1,180p' reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`
- `rtk git status --short --branch`
- `rtk npm run test:unit`

## Done Definition
- Missing Identity Control release inputs leave real adapter/sign-in disabled and are reported as a blocker
- Any local lane uses failing-first tests and does not touch DNS, keys, credentials, Pool A, deploy, or owner bootstrap
- Full relevant verification passes and Academy worktree remains clean before the next handoff
- Missing Identity Control inputs keep production disabled and are reported clearly.
- Any local lane passes failing-first tests, full relevant verification, and secret scan.
- Real integration is attempted only after key/lifecycle/conformance evidence and separate production authorization are present.
- Founder bootstrap uses `(canonical_issuer, subject)` only after canonical sign-in.

## Do Not Touch
- แก้หรือ publish products/cyberskills/identity-control/**
- เปิด real adapter, production sign-in หรือ direct Academy OTP เป็น production path
- สร้างหรือส่ง private key, credentials, token หรือ secret
- แก้ DNS, deploy Worker, mutate Pool A/production หรือ bootstrap owner
- ใช้ email หรือ generated UUID เป็น ownership key
- stage, revert หรือ cleanup unrelated dirty work ใน director repo
- `products/cyberskills/identity-control/**`
- Director root unrelated dirty files and concurrent product work
- DNS, private/public key generation or registration, credentials, Pool A, production config, deployment, or external systems
- Direct Academy OTP as a production identity path
- Owner bootstrap, email-based ownership merge/recovery/transfer, or generated UUID ownership
