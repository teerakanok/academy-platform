# Academy operator activation command verification

- `academy-operator-activation-native-red.log`: `node --test scripts/academy-production-operation-install-command.test.mjs` rejected the first wrapper because it incorrectly required source modes to equal rendered target modes. The existing installer contract accepts source mode `0644` or `0755` and installs the manifest target mode.
- `academy-operator-activation-native-green.log`: `node --test scripts/academy-production-operation-install-command.test.mjs scripts/academy-production-operation.test.mjs` after restoring the existing source-mode contract.
- `academy-operator-activation-native-lint.log`: `npx eslint scripts/academy-production-operation-install-command.mjs scripts/academy-production-operation-install-command.test.mjs`.
- `academy-operator-activation-root-focused.{log,json}`: independent focused run, two existing test files executed and passed. The command also named a nonexistent third test path, which Node ignored; the receipt records two actual tests only. `academy-production-operation.test.mjs` contains the installer coverage.
- `academy-operator-activation-root-{unit,lint,gates}`: independent repository gates: 2,441 unit tests passed with 2 skips across 150 files; lint retained the accepted baseline of 3 errors and 17 warnings.

Frozen source hashes:

- `academy-production-operation-install-command.mjs`: `29486821142d4430da8d0c33b5d6c161c2551eac55411cba4abaa0995ae2ede4`
- `academy-production-operation-install-command.test.mjs`: `1012a6a931a80f0e145ca8ee61b64d74f8ad8510726a594c725370a9801e635d`

All commands ran from `academy-web` through the required `rtk` proxy. No `/opt`, SSH, authentication, browser, or database operation was invoked.

## Privileged local invocation

The local executable observed on 2026-09-07 is `/Users/teerakanok/.nvm/versions/node/v25.5.0/bin/node` (`v25.5.0`). The repository declares Node 24, but that runtime is not installed at the previously assumed `/opt/node-v24.18.0/bin/node`; do not install or substitute another runtime as part of this operation.

When local sudo access is available, run the read-only target inspection:

```sh
sudo /Users/teerakanok/.nvm/versions/node/v25.5.0/bin/node /private/tmp/academy-operator-sql-cde63a58/academy-web/scripts/academy-production-operation-install-command.mjs inspect --output /private/tmp/academy-operation-install-inspection-1e2b0ff.json
```

The DIRECTOR must review that inspection evidence before execution: exact source revision `1e2b0ff7cb09a0d5205aa61ab22060fea6fed037`; nine predecessor files with bytes, hash, mode, uid, gid, and link count; the six earlier known hashes; provenance for the three newly observed hashes; config metadata without config content or hash; complete retained-entry metadata; no new-managed collision; and the candidate ten-file manifest digest. Existing live authorization covers the install; this evidence review does not create another permission gate.

Bind the exact `inspectionSha256` printed by the reviewed inspection in the execution command:

```sh
sudo /Users/teerakanok/.nvm/versions/node/v25.5.0/bin/node /private/tmp/academy-operator-sql-cde63a58/academy-web/scripts/academy-production-operation-install-command.mjs execute --inspection /private/tmp/academy-operation-install-inspection-1e2b0ff.json --inspection-sha256 '<REVIEWED_INSPECTION_SHA256>'
```
