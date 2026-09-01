import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executeAcademyProductionOperation } from "./academy-production-operation.mjs";
import { IDENTITY_SYNTHETIC_AUTHORITY } from "./academy-production-p1-p7-runner.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";
import {
  installAcademyProductionOperations,
  verifyAcademyProductionOperations,
} from "./academy-production-operation-install.mjs";

const tmpdir = () => "/private/tmp";

const A = "11111111-1111-4111-8111-111111111111",
  R = "a".repeat(40),
  D = "b".repeat(64),
  U = "2099-01-01T00:00:00Z",
  I = "22222222-2222-4222-8222-222222222222";
const common = [
  "--authority",
  A,
  "--release",
  R,
  "--readiness",
  D,
  "--valid-until",
  U,
];
{
  let input;
  const out = await executeAcademyProductionOperation(
    [
      ...common,
      "--operation",
      "uploadCandidate",
      "--source",
      R,
      "--traffic",
      "0",
    ],
    { cloudflare: async (args) => ((input = args), { status: "PASS" }) },
  );
  assert.equal(out.status, "PASS");
  assert.ok(input.includes("upload"));
}
{
  let input;
  await executeAcademyProductionOperation(
    [
      ...common,
      "--operation",
      "backupRestore",
      "--database-config",
      "/secure/db.json",
      "--restore",
      D,
    ],
    { database: async (value) => ((input = value), { status: "MATCH" }) },
  );
  assert.equal(input.input.operationValue.identityRestoreReceiptSha256, D);
}
{
  const root = await mkdtemp(join(tmpdir(), "academy-hook."));
  try {
    const hook = join(root, "hook");
    await writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await chmod(hook, 0o700);
    const digest = createHash("sha256")
      .update(await (await import("node:fs/promises")).readFile(hook))
      .digest("hex");
    const args = [
      ...common,
      "--operation",
      "smokeP1P7",
      "--deployment",
      I,
      "--version",
      I,
      "--config",
      D,
      "--hook",
      hook,
      "--hook-sha256",
      digest,
    ];
    await assert.rejects(
      () => executeAcademyProductionOperation(args),
      /REJECTED/,
    );
    const out = await executeAcademyProductionOperation(args, {
      runHook: async () => ({
        status: "PASS",
        deploymentId: I,
        versionId: I,
        configuredNamesSha256: D,
        authorityId: A,
        releaseRevision: R,
        identityReadinessSha256: D,
        validUntil: U,
        checks: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
        cleanup: {
          status: "ABSENT",
          academyReceiptSha256: D,
          identityReceiptSha256: D,
        },
        receiptSha256: D,
        identitySyntheticAuthority: IDENTITY_SYNTHETIC_AUTHORITY,
      }),
    });
    assert.equal(out.status, "PASS");
    const drifted = [...args];
    drifted[drifted.length - 1] = "c".repeat(64);
    await assert.rejects(
      () =>
        executeAcademyProductionOperation(drifted, {
          runHook: async () => {
            throw Error("must not call");
          },
        }),
      /REJECTED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
{
  const manifest = await renderOperationManifest({});
  assert.equal(manifest.entries.length, 10);
  assert.ok(manifest.entries.some((entry) => entry.name === "identity-production-activation-preflight.mjs"));
  assert.ok(
    manifest.entries.every(
      (x) =>
        x.installPath.startsWith("/opt/academy/production-operations/") &&
        /^[a-f0-9]{64}$/.test(x.sha256),
    ),
  );
  const root = await mkdtemp(join(tmpdir(), "academy-operation-install."));
  try {
    const installRoot = join(root, "operations");
    const rebound = {
      ...manifest,
      entries: manifest.entries.map((entry) => ({
        ...entry,
        installPath: join(installRoot, entry.name),
      })),
    };
    const manifestSha256 = createHash("sha256")
      .update(`${JSON.stringify(rebound)}\n`)
      .digest("hex");
    await assert.rejects(
      installAcademyProductionOperations({
        manifest: rebound,
        manifestSha256: D,
        installRoot,
        expectedUid: process.getuid(),
        expectedGid: 0,
        sourceUid: process.getuid(),
        sourceGid: 0,
      }),
      /REJECTED/,
    );
    await installAcademyProductionOperations({
      manifest: rebound,
      manifestSha256,
      installRoot,
      expectedUid: process.getuid(),
      expectedGid: 0,
      sourceUid: process.getuid(),
      sourceGid: 0,
    });
    const changedSource = join(root, "academy-production-operation.mjs"),
      changedBytes = Buffer.concat([
        await readFile(manifest.entries[0].sourcePath),
        Buffer.from("\n// reviewed upgrade fixture\n"),
      ]);
    await writeFile(changedSource, changedBytes, { mode: 0o755 });
    await chmod(changedSource, 0o755);
    const upgraded = {
        ...rebound,
        entries: rebound.entries.map((entry, index) =>
          index
            ? entry
            : {
                ...entry,
                sourcePath: changedSource,
                bytes: changedBytes.length,
                sha256: createHash("sha256").update(changedBytes).digest("hex"),
              },
        ),
      },
      upgradedSha = createHash("sha256")
        .update(`${JSON.stringify(upgraded)}\n`)
        .digest("hex"),
      upgradeOptions = {
        manifest: upgraded,
        manifestSha256: upgradedSha,
        currentManifest: rebound,
        currentManifestSha256: manifestSha256,
        installRoot,
        expectedUid: process.getuid(),
        expectedGid: 0,
        sourceUid: process.getuid(),
        sourceGid: 0,
      };
    await assert.rejects(
      installAcademyProductionOperations({
        ...upgradeOptions,
        stopAfterPhase: "AFTER_STAGE_RENAME",
      }),
      /CRASH/,
    );
    assert.equal(
      (await installAcademyProductionOperations(upgradeOptions)).status,
      "PASS",
    );
    const producer = join(installRoot, "academy-poola-production-producer.mjs");
    await writeFile(producer, `${await readFile(producer, "utf8")}\n`);
    await assert.rejects(
      verifyAcademyProductionOperations({
        manifest: upgraded,
        manifestSha256: upgradedSha,
        installRoot,
        expectedUid: process.getuid(),
        expectedGid: 0,
      }),
      /REJECTED/,
    );
    for (const phase of [
      "STAGED",
      "LIVE_MOVED",
      "AFTER_STAGE_RENAME",
      "NEW_LIVE",
    ]) {
      const crashRoot = join(root, `crash-${phase}`),
        crashManifest = {
          ...manifest,
          entries: manifest.entries.map((entry) => ({
            ...entry,
            installPath: join(crashRoot, entry.name),
          })),
        },
        crashSha = createHash("sha256")
          .update(`${JSON.stringify(crashManifest)}\n`)
          .digest("hex"),
        options = {
          manifest: crashManifest,
          manifestSha256: crashSha,
          installRoot: crashRoot,
          expectedUid: process.getuid(),
          expectedGid: 0,
          sourceUid: process.getuid(),
          sourceGid: 0,
        };
      await assert.rejects(
        installAcademyProductionOperations({
          ...options,
          stopAfterPhase: phase,
        }),
        /CRASH/,
      );
      assert.equal(
        (await installAcademyProductionOperations(options)).status,
        "PASS",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
console.log(
  "academy production operation wrappers and install manifest verified",
);
