import assert from "node:assert/strict";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executeAcademyProductionOperation } from "./academy-production-operation.mjs";
import { IDENTITY_SYNTHETIC_AUTHORITY } from "./academy-production-p1-p7-runner.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";
import {
  installAcademyProductionOperations,
  verifyAcademyProductionOperations,
} from "./academy-production-operation-install.mjs";

const manifestDigest = (manifest) =>
  createHash("sha256").update(`${JSON.stringify(manifest)}\n`).digest("hex");
const reboundManifest = (manifest, installRoot) => ({
  ...manifest,
  entries: manifest.entries.map((entry) => ({
    ...entry,
    installPath: join(installRoot, entry.name),
  })),
});
const fileIdentity = async (path) => {
  const metadata = await stat(path);
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode & 0o777,
    uid: metadata.uid,
    gid: metadata.gid,
  };
};
const pathSnapshot = async (path) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { type: "absent" };
    throw error;
  }
  const identity = {
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode & 0o777,
    uid: metadata.uid,
    gid: metadata.gid,
  };
  if (metadata.isFile())
    return {
      type: "file",
      ...identity,
      bytes: metadata.size,
      sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
    };
  if (!metadata.isDirectory()) return { type: "other", ...identity };
  const entries = {};
  for (const name of (await readdir(path)).sort())
    entries[name] = await pathSnapshot(join(path, name));
  return { type: "directory", ...identity, entries };
};

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
        operationId: "academy-p5-abcdef0123456789ab",
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
    assert.equal(out.operationId, "academy-p5-abcdef0123456789ab");
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
  const root = await mkdtemp(
    join(process.cwd(), "academy-operation-install."),
  );
  try {
    const fixtureIdentity = await stat(root);
    const installRoot = join(root, "operations");
    const sourceRoot = join(root, "owned-sources");
    await mkdir(sourceRoot, { mode: 0o700 });
    const rebound = {
      ...manifest,
      entries: [],
    };
    for (const entry of manifest.entries) {
      const sourcePath = join(sourceRoot, entry.name);
      await copyFile(entry.sourcePath, sourcePath);
      await chmod(sourcePath, Number.parseInt(entry.mode, 8));
      rebound.entries.push({
        ...entry,
        sourcePath,
        installPath: join(installRoot, entry.name),
      });
    }
    const manifestSha256 = createHash("sha256")
      .update(`${JSON.stringify(rebound)}\n`)
      .digest("hex");
    await assert.rejects(
      installAcademyProductionOperations({
        manifest: rebound,
        manifestSha256: D,
        installRoot,
        expectedUid: fixtureIdentity.uid,
        expectedGid: fixtureIdentity.gid,
        sourceUid: fixtureIdentity.uid,
        sourceGid: fixtureIdentity.gid,
      }),
      /REJECTED/,
    );
    await installAcademyProductionOperations({
      manifest: rebound,
      manifestSha256,
      installRoot,
      expectedUid: fixtureIdentity.uid,
      expectedGid: fixtureIdentity.gid,
      sourceUid: fixtureIdentity.uid,
      sourceGid: fixtureIdentity.gid,
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
        expectedUid: fixtureIdentity.uid,
        expectedGid: fixtureIdentity.gid,
        sourceUid: fixtureIdentity.uid,
        sourceGid: fixtureIdentity.gid,
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
        expectedUid: fixtureIdentity.uid,
        expectedGid: fixtureIdentity.gid,
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
          expectedUid: fixtureIdentity.uid,
          expectedGid: fixtureIdentity.gid,
          sourceUid: fixtureIdentity.uid,
          sourceGid: fixtureIdentity.gid,
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
{
  const rendered = await renderOperationManifest({});
  const fixtureRoot = await realpath(
    await mkdtemp(join(process.cwd(), "academy-operation-legacy.")),
  );
  const fixtureIdentity = await stat(fixtureRoot);
  const legacyBase = {
    ...rendered,
    entries: rendered.entries.filter(
      (entry) => entry.name !== "identity-production-activation-preflight.mjs",
    ),
  };
  const sourceRoot = join(fixtureRoot, "owned-sources");
  await mkdir(sourceRoot, { mode: 0o700 });
  const syntheticBase = { ...rendered, entries: [] };
  for (const entry of rendered.entries) {
    const sourcePath = join(sourceRoot, entry.name);
    await copyFile(entry.sourcePath, sourcePath);
    await chmod(sourcePath, Number.parseInt(entry.mode, 8));
    syntheticBase.entries.push({ ...entry, sourcePath });
  }
  const configBytes = Buffer.from('{"fixture":"synthetic"}\n');
  const recoveryBytes = Buffer.from("synthetic recovery state\n");
  const materialize = async (manifest, installRoot) => {
    await mkdir(installRoot, { mode: 0o700 });
    for (const entry of manifest.entries) {
      const target = join(installRoot, entry.name);
      await copyFile(entry.sourcePath, target);
      await chmod(target, Number.parseInt(entry.mode, 8));
    }
  };
  const installOptions = (options) => ({
    ...options,
    expectedUid: fixtureIdentity.uid,
    expectedGid: fixtureIdentity.gid,
    sourceUid: fixtureIdentity.uid,
    sourceGid: fixtureIdentity.gid,
  });

  try {
    const collisionRoot = join(fixtureRoot, "collision");
    const legacyManifest = reboundManifest(legacyBase, collisionRoot);
    const currentManifest = reboundManifest(syntheticBase, collisionRoot);
    const legacySha = manifestDigest(legacyManifest);
    const currentSha = manifestDigest(currentManifest);
    await materialize(legacyManifest, collisionRoot);
    const foreignCollision = join(
      collisionRoot,
      "identity-production-activation-preflight.mjs",
    );
    await writeFile(foreignCollision, "foreign synthetic state\n", {
      mode: 0o600,
    });
    const collisionState = await fileIdentity(foreignCollision);
    await assert.rejects(
      installAcademyProductionOperations(
        installOptions({
          manifest: currentManifest,
          manifestSha256: currentSha,
          currentManifest: legacyManifest,
          currentManifestSha256: legacySha,
          installRoot: collisionRoot,
        }),
      ),
      /REJECTED/,
    );
    assert.deepEqual(await fileIdentity(foreignCollision), collisionState);
    assert.equal(await readFile(foreignCollision, "utf8"), "foreign synthetic state\n");

    for (const phase of [
      "STAGED",
      "LIVE_MOVED",
      "AFTER_STAGE_RENAME",
      "NEW_LIVE",
    ]) {
      const installRoot = join(fixtureRoot, `recover-${phase}`);
      const legacy = reboundManifest(legacyBase, installRoot);
      const current = reboundManifest(syntheticBase, installRoot);
      const legacySha256 = manifestDigest(legacy);
      const currentSha256 = manifestDigest(current);
      const config = join(installRoot, "p1-p7-config.json");
      const recovery = join(installRoot, "foreign-recovery-state");
      await materialize(legacy, installRoot);
      await writeFile(config, configBytes, { mode: 0o600 });
      await writeFile(recovery, recoveryBytes, { mode: 0o640 });
      const expectedIdentity = {
        config: await fileIdentity(config),
        recovery: await fileIdentity(recovery),
      };
      const options = {
        manifest: current,
        manifestSha256: currentSha256,
        currentManifest: legacy,
        currentManifestSha256: legacySha256,
        installRoot,
      };
      await assert.rejects(
        installAcademyProductionOperations(
          installOptions({ ...options, stopAfterPhase: phase }),
        ),
        /CRASH/,
      );
      if (phase === "STAGED") {
        const previous = `${installRoot}.previous`;
        await mkdir(previous, { mode: 0o700 });
        await rename(
          join(installRoot, legacy.entries[0].name),
          join(previous, legacy.entries[0].name),
        );
      }
      assert.equal(
        (
          await installAcademyProductionOperations(installOptions(options))
        ).status,
        "PASS",
      );
      assert.deepEqual(await fileIdentity(config), expectedIdentity.config);
      assert.deepEqual(await fileIdentity(recovery), expectedIdentity.recovery);
      assert.equal(await readFile(config, "utf8"), configBytes.toString());
      assert.equal(
        await readFile(recovery, "utf8"),
        recoveryBytes.toString(),
      );
      assert.equal(
        await readFile(
          join(installRoot, "identity-production-activation-preflight.mjs"),
          "utf8",
        ),
        await readFile(
          join(sourceRoot, "identity-production-activation-preflight.mjs"),
          "utf8",
        ),
      );
      assert.equal(
        await stat(`${installRoot}.previous`).catch(() => null),
        null,
      );
      assert.equal(
        await stat(`${installRoot}.install-journal.json`).catch(() => null),
        null,
      );
      await verifyAcademyProductionOperations({
        manifest: current,
        manifestSha256: currentSha256,
        installRoot,
        expectedUid: fixtureIdentity.uid,
        expectedGid: fixtureIdentity.gid,
      });
    }

    for (const phase of ["LIVE_MOVED", "NEW_LIVE"]) {
      const installRoot = join(fixtureRoot, `legacy-swap-${phase}`);
      const legacy = reboundManifest(legacyBase, installRoot);
      const current = reboundManifest(syntheticBase, installRoot);
      const legacySha256 = manifestDigest(legacy);
      const currentSha256 = manifestDigest(current);
      const config = join(installRoot, "p1-p7-config.json");
      const recovery = join(installRoot, "foreign-recovery-state");
      await materialize(legacy, installRoot);
      await writeFile(config, configBytes, { mode: 0o600 });
      await writeFile(recovery, recoveryBytes, { mode: 0o640 });
      const expectedIdentity = {
        config: await fileIdentity(config),
        recovery: await fileIdentity(recovery),
      };
      const options = {
        manifest: current,
        manifestSha256: currentSha256,
        currentManifest: legacy,
        currentManifestSha256: legacySha256,
        installRoot,
      };
      await assert.rejects(
        installAcademyProductionOperations(
          installOptions({ ...options, stopAfterPhase: "STAGED" }),
        ),
        /CRASH/,
      );
      const previous = `${installRoot}.previous`;
      const stage = `${installRoot}.stage-${currentSha256.slice(0, 12)}`;
      const journalPath = `${installRoot}.install-journal.json`;
      await rename(installRoot, previous);
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      journal.phase = phase;
      if (phase === "NEW_LIVE") await rename(stage, installRoot);
      await writeFile(journalPath, `${JSON.stringify(journal)}\n`, {
        mode: 0o600,
      });

      assert.equal(
        (
          await installAcademyProductionOperations(installOptions(options))
        ).status,
        "PASS",
      );
      assert.deepEqual(await fileIdentity(config), expectedIdentity.config);
      assert.deepEqual(await fileIdentity(recovery), expectedIdentity.recovery);
      assert.equal(await readFile(config, "utf8"), configBytes.toString());
      assert.equal(await readFile(recovery, "utf8"), recoveryBytes.toString());
    }

    {
      const installRoot = join(fixtureRoot, "corrupt-rollback-source");
      const legacy = reboundManifest(legacyBase, installRoot);
      const current = reboundManifest(syntheticBase, installRoot);
      const legacySha256 = manifestDigest(legacy);
      const currentSha256 = manifestDigest(current);
      const config = join(installRoot, "p1-p7-config.json");
      await materialize(legacy, installRoot);
      await writeFile(config, configBytes, { mode: 0o600 });
      const options = {
        manifest: current,
        manifestSha256: currentSha256,
        currentManifest: legacy,
        currentManifestSha256: legacySha256,
        installRoot,
      };
      await assert.rejects(
        installAcademyProductionOperations(
          installOptions({ ...options, stopAfterPhase: "NEW_LIVE" }),
        ),
        /CRASH/,
      );
      const previous = `${installRoot}.previous`;
      const stage = `${installRoot}.stage-${currentSha256.slice(0, 12)}`;
      const journal = `${installRoot}.install-journal.json`;
      const corrupt = join(previous, legacy.entries[0].name);
      await writeFile(
        corrupt,
        Buffer.concat([await readFile(corrupt), Buffer.from("corrupt")]),
      );
      const before = await Promise.all(
        [installRoot, previous, stage, journal].map(pathSnapshot),
      );
      await assert.rejects(
        installAcademyProductionOperations(installOptions(options)),
        /REJECTED/,
      );
      assert.deepEqual(
        await Promise.all(
          [installRoot, previous, stage, journal].map(pathSnapshot),
        ),
        before,
      );
    }

    {
      const installRoot = join(fixtureRoot, "unbound-stage");
      const legacy = reboundManifest(legacyBase, installRoot);
      const current = reboundManifest(syntheticBase, installRoot);
      const legacySha256 = manifestDigest(legacy);
      const currentSha256 = manifestDigest(current);
      await materialize(legacy, installRoot);
      const options = {
        manifest: current,
        manifestSha256: currentSha256,
        currentManifest: legacy,
        currentManifestSha256: legacySha256,
        installRoot,
      };
      await assert.rejects(
        installAcademyProductionOperations(
          installOptions({ ...options, stopAfterPhase: "STAGED" }),
        ),
        /CRASH/,
      );
      const foreign = join(
        `${installRoot}.stage-${currentSha256.slice(0, 12)}`,
        "foreign-recovery-state",
      );
      await writeFile(foreign, recoveryBytes, { mode: 0o600 });
      const expectedIdentity = await fileIdentity(foreign);
      await assert.rejects(
        installAcademyProductionOperations(installOptions(options)),
        /REJECTED/,
      );
      assert.deepEqual(await fileIdentity(foreign), expectedIdentity);
      assert.equal(await readFile(foreign, "utf8"), recoveryBytes.toString());
    }

    {
      const installRoot = join(fixtureRoot, "committed-cleanup");
      const legacy = reboundManifest(legacyBase, installRoot);
      const current = reboundManifest(syntheticBase, installRoot);
      const legacySha256 = manifestDigest(legacy);
      const currentSha256 = manifestDigest(current);
      await materialize(current, installRoot);
      const config = join(installRoot, "p1-p7-config.json");
      await writeFile(config, configBytes, { mode: 0o600 });
      const previous = `${installRoot}.previous`;
      await materialize(reboundManifest(legacyBase, previous), previous);
      const retained = join(previous, "foreign-recovery-state");
      await writeFile(retained, recoveryBytes, { mode: 0o600 });
      const retainedIdentity = await fileIdentity(retained);
      const journalPath = `${installRoot}.install-journal.json`;
      await writeFile(
        journalPath,
        `${JSON.stringify({
          schema: "academy-operation-install-journal/v1",
          manifestSha256: currentSha256,
          installRoot,
          stage: `${installRoot}.stage-${currentSha256.slice(0, 12)}`,
          previous,
          hadLive: true,
          currentManifestSha256: legacySha256,
          phase: "COMMITTED",
        })}\n`,
        { mode: 0o600 },
      );
      const nextSource = join(sourceRoot, "next-operation.mjs");
      const nextBytes = Buffer.concat([
        await readFile(current.entries[0].sourcePath),
        Buffer.from("\n// next synthetic fixture\n"),
      ]);
      await writeFile(nextSource, nextBytes, { mode: 0o755 });
      await chmod(nextSource, 0o755);
      const next = {
        ...current,
        entries: current.entries.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                sourcePath: nextSource,
                bytes: nextBytes.length,
                sha256: createHash("sha256").update(nextBytes).digest("hex"),
              }
            : entry,
        ),
      };
      await assert.rejects(
        installAcademyProductionOperations(
          installOptions({
            manifest: next,
            manifestSha256: manifestDigest(next),
            currentManifest: current,
            currentManifestSha256: currentSha256,
            installRoot,
          }),
        ),
        /REJECTED/,
      );
      assert.deepEqual(await fileIdentity(retained), retainedIdentity);
      assert.equal(await readFile(retained, "utf8"), recoveryBytes.toString());
      assert.equal(await readFile(config, "utf8"), configBytes.toString());
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}
console.log(
  "academy production operation wrappers and install manifest verified",
);
