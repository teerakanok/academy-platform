# Academy staff dry-run diagnosis / proposed invocation r2

Disposition: two definite local invocation compatibility defects found; r2 prepared for root independent review before credential-bearing invocation.
No production retry, rehearsal, grant, reset or product edit was performed. The original controller and 13:19:48 dry-run receipt remain unchanged.
The original receipt has no stage, so it cannot prove which gate was the earliest failure. Both defects below deterministically refuse the intended successful path when reached.

1. The direct-target query casts inet_server_addr() to text. Actual local PostgreSQL proves inet '172.18.0.8'::text is '172.18.0.8/32'; r1 compares it to the bare address and fails. r2 uses host(inet_server_addr()), preserving exact equality with 172.18.0.8.
2. The installed-source academy.inspect_staff_role (0030_least_privilege_course_entitlement.sql:223–259) emits active=null for no assignment. Actual local installed function confirms null; the accepted CLI prints currently_active=null. r1's output allowlist rejects it. r2 permits only this additional literal, without converting null to false or modifying the function/CLI.

Protected input metadata passed: both regular, owned, mode0600, single-link, non-symlink; stable canonical binding digest matched. Credential contents were not read by this diagnosis.
Both accepted CLI hashes still match their pins; r1 SHA remains 75bc2042857a31ee52b5c16bc94143744912eed9f1ce36df2ac33090d9ef8120.
Root forward receipt and process readback agree on owned PID45002, localhost54881 → observed172.18.0.8:5432. The forward was not changed.

Proposed controller: records/academy-staff-root-controller-r2.mjs.
SHA-256: 20353a26463d4056559e9ef30090e750ddda8a9097ae86ce006ffcb6cdf51cb3.
Exact diff: records/academy-staff-controller-r2.diff; two compatibility changes plus fixed stage/error-code projection only. Original roles, source/canonical/custody/target guards and CLI operation arguments remain.
No raw error, SQL body, credential, DSN or canonical ID is added to output. Unknown errors are STAGE_REFUSED; SQLSTATE output is from a fixed allowlist.
Accepted modes retain the original explicit controls; this preparation does not authorize rehearse/apply or grant. Root should review the exact diff and authorize the next dry run separately in the existing sequence.

Actual local evidence: records/academy-staff-controller-local-compatibility-r2.json; six checks matched expected exits 0/0/1/1/0/0, stderr0 throughout.
--check and inspect passed; invalid mode and missing port report fixed MODE/MODE_REQUIRED and PORT/PORT_REQUIRED before protected reads.
records/academy-staff-invocation-compatibility-local-r1.mjs invokes the unchanged accepted main against a nonsecret read-only fixture: r1 rejects its real null-projection output, r2 accepts it, unknown/appended output still refused, four SELECT calls, no network/credentials.
Existing local PostgreSQL was reused for SELECT only: r1HostMatch=false → r2HostMatch=true; actual inspector no-assignment active=null. No local schema/data mutation or shared fixture cleanup occurred.

After root review, proposed next command: absolute Node v25.5.0 records/academy-staff-root-controller-r2.mjs dry-run 54881.
Expected initial CLI output is actor_authorized=false currently_active=null, followed by root's existing fresh-state/rehearsal/restoration review before any apply.
If another stage refuses, inspect its fixed code and fresh state; do not infer success, reset passwords or blindly repeat an uncertain operation.
