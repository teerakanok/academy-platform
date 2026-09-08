# Academy operator install verification — 2026-09-08

The reviewed local Academy operation completed successfully. The preflight reproduced the accepted owner inspection exactly. The bounded recovery retained the terminal legacy journal as an exact backup, and the unchanged installer then installed and verified the ten-file candidate.

## Accepted receipts

- [`academy-owner-retire-and-install.json`](./academy-owner-retire-and-install.json): preflight exit 0 with `originalInspectionMatches=true`; retirement exit 0 with `RETAINED`; installation exit 0 with `INSTALLED_AND_VERIFIED`, `installStatus=PASS`, and `verifyStatus=PASS`.
- [`academy-installed-independent-verify.json`](./academy-installed-independent-verify.json): separate readback exit 0 with `PASS`, ten managed files matching candidate manifest `e09698c6f75e18b90307439cdfe0270994f57160d59e0850af36c588eeb68b90`, and unchanged configuration metadata.

The retained journal remains at the exact root-owned backup path recorded in the sanitized owner receipt. Its SHA-256 is `2da1749fd25ba47ea8590e8285f13d25c9ca1ad1e877e261eb02195c2ba3628f`; its historical manifest pin is `26fd66af6c55b804f10f7c60de8f9c321550a1015ea4da7c575e99e134d66054`.

## Provenance

- Original owner receipt: director record `records/academy-owner-retire-and-install-r1.json`, SHA-256 `6d8a4a953e41963603fd6e81caa3b93425230135b334acdb9e7a540e53a77a85`.
- Independent readback: director record `records/academy-installed-independent-verify-r1.json`, SHA-256 `e36766fa9efdb32cd0bc7b1578df241c6edae4468238415ebba414c7ceefb098`.
- Independent helper review: director record `records/academy-journal-retirement-root-review-r1.json`, verdict `PASS`, SHA-256 `353163829dbcea2dfa71ac041d79f78c03158e31fb99593792ec65e3157f96b0`.
- Accepted helper proof: director record `records/academy-operator-journal-retirement-r1.md`, SHA-256 `9fd4f14c040044c10d3fd5d905d6cd865cbfed8d5f1d02e1fe5bc86254df973d`; recovery commit `c9d3d87d7ead8a89d5e1e0aa038615f168dd24d2`; causal tests `3/3 PASS`.
- Frozen helper hashes: implementation `5a963555982735a0ed60548a2d1421158ac3a3d4448760b1a3e79d1fafec7e55`; test `958e04f3d53b0fe725697fcc39157de538dfcaf80f66eea214bd4a75408aa0e2`.

## Claim boundary

This evidence establishes only the local operator journal retirement, ten-file installation, and independent installed-file verification. It does not establish an Academy app deployment, database change, candidate activation, traffic change, or OTP journey.
