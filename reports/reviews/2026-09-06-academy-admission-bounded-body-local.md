# Academy SEC-005 bounded admission — local review

## Outcome

Independent read-only review returned `PASS` for the local SEC-ACADEMY-005
correction at source commit `d80a2ea37cc86c9fe572ffdaca4fb331b94b2ead`.
Both production and local-fixture POST paths validate the exact URL-encoded media
type and call the shared 2048-byte stream-bounded reader before creating an
authorization transaction. Multipart requests are rejected, and oversized
streams are cancelled as soon as the limit is crossed. This review does not
prove a production deployment or smoke test.

## Evidence

- Frozen source packet:
  `/private/tmp/cyberskills-prod-cde63a58/records/academy-admission-review-5324f54a34fa/freeze.json`
  — SHA-256
  `5324f54a34fa756563d29edb3ea6a2f797c110cc741fce9b285f57b594a1c19e`;
  all 11 files matched the reviewed tree by SHA-256 and byte count.
- Full unit acceptance:
  `/private/tmp/cyberskills-prod-cde63a58/academy-native-r2-gate-acceptance.log`
  — SHA-256
  `7f503797279cdd89cf25fa3e526b0b3440d94d2699a9b89034fc552a6dc25840`;
  145 files and 2403 tests passed, including `bounded-body` 9/9 and
  `identity-security-admission` 4/4.
- Independent result:
  `/private/tmp/cyberskills-prod-cde63a58/records/academy-admission-review-5324f54a34fa/results/run-0a8a2cc5afc7b344280fab9de2141489/result.json`
  — `PASS`, SHA-256
  `8536409510cfcbbf1402f7561b48b2699064cf239abb318235c7e9eace35a93e`.
- The reused September 5 process-prefix exit file is stale and is excluded from
  current review evidence. The unique packet result above is authoritative.

## Remaining seam

LOW: add a regression that sends a streamed oversized URL-encoded body through
the production route seam and asserts HTTP 413 with an empty authorization
transaction RPC list. The existing direct oversized admission fixture exercises
the local-fixture branch. Production smoke and deployment remain pending.
