# Canonical first-owner staff bootstrap — production acceptance

The existing dedicated-role CLI granted one Academy `owner` assignment to the founder's canonical issuer+subject at 13:31:06 UTC. Independent readback confirmed exactly one intended self-actor grant audit with the current session reference and no entitlement change.

The [root independent review](academy-staff-controller-independent-review-r2.md) identifies controller SHA-256 `20353a26463d4056559e9ef30090e750ddda8a9097ae86ce006ffcb6cdf51cb3`. The [manifest](manifest.json) binds the copied nonsecret receipts. No password, private identifier values or executable credential controller is included.

| Observation, UTC | Evidence |
| --- | --- |
| Canonical issuer+subject resolves to one Academy account; binding digest recorded, no email-based grant | [binding evidence](founder-binding-readonly.json) |
| 13:29:04 — direct-role dry run passed; no existing assignment is represented by `currently_active=null` | [dry run](academy-staff-root-dry-run-r2.json) |
| 13:29:38 — first-owner mutation rehearsed, audit checked, ROLLBACK and original projections verified | [rehearsal](academy-staff-root-rehearse-r2.json) |
| 13:30:22 — fresh connection confirmed staff assignments/audits0, entitlement rows/audits0 and unchanged boundaries | [restoration readback](academy-staff-postrehearsal-readonly-r2.json) |
| 13:31:06 — root explicitly applied through `academy_staff_admin`; changed=true, owner active | [apply](academy-staff-root-apply-r2.json) |
| 13:31:46 — root canonical readback confirmed account1/owner1 | [root postverify](academy-staff-postapply-founder-r2.json) |
| 13:34:29–32 — independent READ ONLY check confirmed canonical account1, active owner1, self-granted assignment1, matching self-actor owner grant audit/reference1; total staff rows/audits1 and entitlement rows/audits0 | [independent postverify](academy-staff-independent-postverify-r1.json) |
| 13:35:36 — root closed its exact owned SSH forward; PID absent, local port closed, wrapper exit0 | [forward cleanup](academy-staff-forward-close-r1.json) |

The r1 dry-run refusal and [r2 local diagnosis](academy-staff-controller-diagnosis-r2.md) are retained as historical evidence. Local PostgreSQL and the accepted CLI demonstrated both fixes: `host(inet_server_addr())` preserves exact address comparison, and only the existing no-assignment `null` projection was added to the output allowlist. [Local evidence](academy-staff-controller-local-compatibility-r2.json) also records fixed pre-input refusal stages.

The actual operation reused `academy-web/scripts/manage-staff-role.mjs`; default mode is dry run, followed by `--rehearse` and specifically selected `--apply`. No migration replay, HBA change, password reset, course entitlement grant or sole-owner revocation occurred. This report records the completed bootstrap and is not an instruction to repeat it.
