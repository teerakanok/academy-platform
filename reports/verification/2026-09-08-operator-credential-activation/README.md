# Dedicated operator credentials — production acceptance

Both existing roles, `academy_staff_admin` and `academy_entitlement_operator`, have installed passwords and verified password-enforcing direct logins. Migrations 0035/0036 were already installed and were not replayed.

The exact nonsecret receipts and copied-byte hashes are listed in [manifest.json](manifest.json). Original password files and private canonical binding values are excluded.

| Observation, UTC | Evidence |
| --- | --- |
| Both password assignments rehearsed inside ROLLBACK, then a fresh connection confirmed NULL2 and unchanged role/function/data state | [rehearsal](production-rehearse-r2.json), [fresh NULL readback](production-null-readback-r2.json) |
| Password COMMIT completed; the original loopback login probe then refused to claim enforcement because loopback uses trust | [partial apply outcome](production-apply-r2.json), [configured2 readback](production-postapply-readonly-r2.json) |
| Existing container DNS/network route selected with SCRAM authentication; absent-password requests refused | [auth-method metadata](production-auth-route-metadata-r2.json), [negative probe](production-network-negative-r2.json) |
| 12:54:11 — both negative probes refused and both correct-file dedicated logins succeeded; verify-only operation | [accepted direct logins](production-verify-r3.json), [independent mode/source review](root-verify-review-r3.json) |
| 12:55:51 — configured2/NULL0, unchanged boundaries, original files retained, owned host copies and container pgpass residue absent | [fresh postverify](production-postverify-readonly-r3.json) |

The admin inspection/provisioning transport preserves the existing container-injected authentication. Dedicated-role verification uses the observed `supabase-db` TCP route and existing SCRAM rule. Database loopback trust is not evidence that a supplied password was enforced. No HBA changes or SET ROLE bypass were used.

The early r1 admin-environment refusal and the later loopback refusal are retained as historical evidence. Acceptance comes from the corrected verify-only result and fresh readback, not from a successful COMMIT alone. No password reset or repeat apply is needed.

The credential readbacks precede the separately reviewed [first-owner staff bootstrap](../2026-09-08-staff-owner-bootstrap/README.md). The entitlement operator credential does not itself grant a course entitlement.
