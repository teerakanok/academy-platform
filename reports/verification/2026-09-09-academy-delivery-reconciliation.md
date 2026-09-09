# Academy delivery reconciliation — 2026-09-09

This is a bounded reconciliation of the current Academy release path. It does
not re-audit the product, change release state, or authorize production work.

## Observed delivery boundary

- Reviewed quota source: `3f08bc0a47793c44eaf6c5e97dd6f7234a3bca68`.
- Candidate: `ae909002-dae1-4eaf-8698-0a8f8983cb2b`, retained at 0%.
- Serving version: `3830694b-bca9-4035-8bd0-e853ee6dd1fa`, retained at 100%.
- The candidate is uploaded and allocated, not proven to have served a request.
  A version-override status, Access redirect, or normal page body can fall back
  to allocation and therefore is not candidate attribution.

One sanitized request bearing the candidate override may be correlated with
candidate-specific Worker observability, or with a deliberately issued
non-secret candidate version marker. Without it, record the smoke as
unattributed: it cannot prove candidate acceptance. Under current authority,
the exact reviewed activation path may establish the serving version with a
provider allocation receipt, version-bound postchecks, and the retained rollback
version. Do not upload another version merely to create a marker. The existing
privileged host release helper and a user-completed Access/OTP path remain
external inputs; do not replay owner grant or migrations `0035`/`0036`.

## Original security checklist still requiring delivery work

The authoritative statuses remain in
`reports/security/2026-09-05-security-review-checklist.md`; this table groups
only the still-open delivery obligations.

| Checklist items | Exact remaining proof or implementation boundary |
| --- | --- |
| 001, 004, 005, 007, 008, 012, 014 | Deployed source needs the stated authenticated or production behavior evidence. |
| 003 | Exact producer issuer configuration plus scheduled lifecycle/revocation journey. |
| 006 | Content and certificate-bearing behavior acceptance; public-capstone release is not learner submission proof. |
| 010, 011 | Authenticated media and fresh host-cookie/session journey, including sign-out behavior. |
| 015, 018, 021, 022, 023, 024, 025 | Still `OPEN` in the original checklist; no status is advanced by this release candidate. |
| 016, 019, 020 | Staff bootstrap is already production-verified; entitlement-operator mutation and authenticated application proof remain open. Do not repeat the founder owner grant. |
| 017 | Source is verified; candidate activation and an authenticated quota journey remain open. |

Original closure records for 002, 009, and 013 remain separate and do not
close the learner journey.

## Content and acceptance evidence already available

`reports/verification/2026-09-07-final-capstone-production/README.md` proves
the final public-content release: 23/23 accepted, imported, and deployed
capstone banks from the eight Academy courses, with public EN/TH desktop/mobile
captures. Its own scope explicitly excludes entitlement, authenticated answer
submission, payment, staff, and full learner acceptance.

`reports/verification/2026-09-08-staff-owner-bootstrap/README.md` proves the
canonical owner assignment and independent readback. It records zero course
entitlements and is evidence of a completed bootstrap, not an instruction to
repeat it.

`reports/verification/2026-09-08-active-user-shape/README.md` proves the
observed owner dashboard session and explicitly leaves staff/entitlement,
learner progress, sign-out, and complete playtest open.

## Next execution sequence when Identity activation and canary are available

1. Obtain a fresh Identity recovery/activation receipt and an owner-present,
   human-completed canary sign-in. A person handles CAPTCHA and OTP; do not
   read, store, send, or retry codes.
2. Use the existing privileged release path for candidate attribution as
   described above. If the smoke is unattributed, do not claim it proves
   candidate acceptance; under current authority use the exact reviewed
   activation path, provider allocation receipt, version-bound postchecks, and
   retained rollback version instead.
3. Bind the canary by authoritative issuer and subject, never by email. In
   `academy-web/scripts/manage-course-entitlement.mjs`, perform inspect, then
   `--rehearse`, then one scoped `--apply` entitlement for
   `setup-and-environment`; retain the audited readback. The operator contract
   is `academy-web/docs/course-entitlement-operator.md`.
4. In the authorized browser canary, complete fresh callback, dashboard,
   entitled course entry, one normal lesson/progress write, reload, and a new
   browser re-entry that shows the saved progress. Record only the
   privacy-safe fields required by `skills/academy-production-playtest/SKILL.md`.
5. Use the app sign-out path, verify the current device cannot re-enter the
   protected course without a new authenticated session, then clean up only the
   canary: reset progress created by this run and revoke the scoped entitlement
   with an audited readback. Reset intentionally retains attempts, so it is not
   an account purge. Do not alter real-user records or perform broad retention.

## Guide correction delivered with this record

`docs/maintenance/academy-production-release.md` and
`docs/maintenance/maintain-and-deploy.md` now require candidate attribution
before a smoke can be called verified or activated. This corrects the
checklist-only post-review drift found in the earlier override-smoke record;
it changes no Worker source, version allocation, database, or access state.
