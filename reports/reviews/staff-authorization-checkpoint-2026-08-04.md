# Staff authorization checkpoint review

Date: 2026-08-04
Scope: local Academy staff-role policy and internal-player enforcement

## Decision and implementation

- V1 has one human staff member, the founder, while retaining four distinct roles:
  `owner`, `learner-support`, `privacy-officer`, and `content-ops`.
- Migration `0018` adds current assignments, append-only audit evidence, owner-only
  role changes, safe first-owner bootstrap, and final-owner protections.
- Browser roles have no table or function access. Server checks use a dedicated
  `has_staff_role` RPC; owner implies all roles and non-owner roles remain exact.
- The application `service_role` cannot execute role mutations. A separate non-login
  `academy_staff_admin` control-plane role is the only mutation executor.
- Active staff accounts are excluded from the inactive-account purge until their roles
  are revoked. Authorization history is held with an active role; after revocation,
  assignments and audit UUID snapshots are retained for three years.
- Every `/player` page now checks `content-ops`/`owner` after the environment gate and is
  forced dynamic to prevent build-time authorization caching.
- `learner-support` and `privacy-officer` are reserved policy labels only; this checkpoint
  does not claim an operator workflow for either role.

## Verification

- Fresh local Supabase reset applied migrations `0001` through `0018` twice.
- Targeted integration/unit tests: 49 passed, no type errors.
- Full Vitest regression suite: 481 passed across 46 files, no type errors.
- Production build passed and classified all `/player` routes as dynamic.
- Default player-boundary E2E: 8 passed for authenticated learner and anonymous denial.
- Internal-mode E2E provisioned a staff role through the isolated control role; player hub and axe
  accessibility test passed.
- ESLint/TypeScript passed with one pre-existing generated-registry warning.
- Independent Code/Security/UX re-review: C0/H0/M0/L0 in every lane after fixes.

## Remaining production gate

- No Pool A migration, production role assignment, production secret, or deployment was
  performed. Production bootstrap must resolve the founder by issuer/subject after sign-in,
  use the reviewed control-plane script, and verify assignment/audit without printing PII.
