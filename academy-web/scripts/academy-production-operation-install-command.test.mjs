import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  executeReviewedAcademyProductionOperationInstall,
  inspectAcademyProductionOperationInstall,
} from "./academy-production-operation-install-command.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";

const IDENTITY = "identity-production-activation-preflight.mjs";
const digest = (value) =>
  createHash("sha256")
    .update(`${JSON.stringify(value)}\n`)
    .digest("hex");

async function metadata(path) {
  const value = await lstat(path, { bigint: true });
  return {
    bytes: value.size.toString(),
    mode: Number(value.mode & 0o777n),
    uid: value.uid.toString(),
    gid: value.gid.toString(),
    nlink: value.nlink.toString(),
    dev: value.dev.toString(),
    ino: value.ino.toString(),
    mtimeNs: value.mtimeNs.toString(),
    ctimeNs: value.ctimeNs.toString(),
  };
}

async function snapshot(root) {
  const result = {};
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name);
    const pathMetadata = await lstat(path);
    result[name] = {
      metadata: await metadata(path),
      sha256: pathMetadata.isFile()
        ? createHash("sha256").update(await readFile(path)).digest("hex")
        : null,
    };
  }
  return result;
}

async function legacyFixture(base, { collision = false } = {}) {
  const installRoot = join(base, "operations");
  await mkdir(installRoot, { recursive: true, mode: 0o700 });
  const manifest = await renderOperationManifest({});
  for (const entry of manifest.entries) {
    if (entry.name === IDENTITY) continue;
    const target = join(installRoot, entry.name);
    await copyFile(entry.sourcePath, target);
    await chmod(target, Number.parseInt(entry.mode, 8));
  }
  await writeFile(join(installRoot, "p1-p7-config.json"), "CONFIG_SECRET_SENTINEL\n", {
    mode: 0o600,
  });
  await chmod(join(installRoot, "p1-p7-config.json"), 0o600);
  await writeFile(join(installRoot, "foreign-retained.txt"), "retain me\n", {
    mode: 0o600,
  });
  await chmod(join(installRoot, "foreign-retained.txt"), 0o600);
  if (collision) {
    await writeFile(join(installRoot, IDENTITY), "foreign collision\n", {
      mode: 0o600,
    });
    await chmod(join(installRoot, IDENTITY), 0o600);
  }
  return installRoot;
}

const root = await mkdtemp(
  join(process.cwd(), "academy-operation-install-command."),
);
try {
  const fixture = await stat(root);
  const expectedUid = fixture.uid;
  const expectedGid = fixture.gid;

  const installRoot = await legacyFixture(join(root, "success"));
  const beforeInspection = await snapshot(installRoot);
  const inspection = await inspectAcademyProductionOperationInstall({
    installRoot,
    expectedUid,
    expectedGid,
  });
  assert.equal(inspection.sourceRevision, "1e2b0ff7cb09a0d5205aa61ab22060fea6fed037");
  assert.equal(inspection.managed.length, 9);
  assert.equal(inspection.newManagedCollisions.length, 0);
  assert.ok(
    inspection.managed.every(
      (entry) =>
        entry.bytes > 0 &&
        /^[a-f0-9]{64}$/.test(entry.sha256) &&
        entry.uid === expectedUid &&
        entry.gid === expectedGid &&
        entry.nlink === 1,
    ),
  );
  assert.equal(inspection.config.mode, "0600");
  assert.equal(Object.hasOwn(inspection.config, "sha256"), false);
  assert.equal(JSON.stringify(inspection).includes("CONFIG_SECRET_SENTINEL"), false);
  assert.deepEqual(await snapshot(installRoot), beforeInspection);

  const configBefore = await metadata(join(installRoot, "p1-p7-config.json"));
  const foreignBefore = await metadata(join(installRoot, "foreign-retained.txt"));
  const receipt = await executeReviewedAcademyProductionOperationInstall({
    inspection,
    inspectionSha256: digest(inspection),
    installRoot,
    expectedUid,
    expectedGid,
  });
  assert.equal(receipt.status, "INSTALLED_AND_VERIFIED");
  assert.equal(receipt.installStatus, "PASS");
  assert.equal(receipt.verifyStatus, "PASS");
  assert.equal((await readFile(join(installRoot, IDENTITY))).length, 11338);
  assert.deepEqual(
    await metadata(join(installRoot, "p1-p7-config.json")),
    configBefore,
  );
  assert.deepEqual(
    await metadata(join(installRoot, "foreign-retained.txt")),
    foreignBefore,
  );
  assert.equal(
    await readFile(join(installRoot, "p1-p7-config.json"), "utf8"),
    "CONFIG_SECRET_SENTINEL\n",
  );
  assert.equal(
    await readFile(join(installRoot, "foreign-retained.txt"), "utf8"),
    "retain me\n",
  );

  const predecessorRoot = await legacyFixture(join(root, "predecessor-drift"));
  const predecessorInspection =
    await inspectAcademyProductionOperationInstall({
      installRoot: predecessorRoot,
      expectedUid,
      expectedGid,
    });
  await writeFile(
    join(predecessorRoot, "current-deployment.mjs"),
    "reviewed predecessor changed\n",
  );
  await chmod(join(predecessorRoot, "current-deployment.mjs"), 0o644);
  const predecessorDrift = await snapshot(predecessorRoot);
  await assert.rejects(
    executeReviewedAcademyProductionOperationInstall({
      inspection: predecessorInspection,
      inspectionSha256: digest(predecessorInspection),
      installRoot: predecessorRoot,
      expectedUid,
      expectedGid,
    }),
    /REJECTED/,
  );
  assert.deepEqual(await snapshot(predecessorRoot), predecessorDrift);
  await assert.rejects(lstat(join(predecessorRoot, IDENTITY)), /ENOENT/);

  const configRoot = await legacyFixture(join(root, "config-drift"));
  const configInspection = await inspectAcademyProductionOperationInstall({
    installRoot: configRoot,
    expectedUid,
    expectedGid,
  });
  await chmod(join(configRoot, "p1-p7-config.json"), 0o640);
  const configDrift = await snapshot(configRoot);
  await assert.rejects(
    executeReviewedAcademyProductionOperationInstall({
      inspection: configInspection,
      inspectionSha256: digest(configInspection),
      installRoot: configRoot,
      expectedUid,
      expectedGid,
    }),
    /REJECTED/,
  );
  assert.deepEqual(await snapshot(configRoot), configDrift);
  await assert.rejects(lstat(join(configRoot, IDENTITY)), /ENOENT/);

  const collisionRoot = await legacyFixture(join(root, "collision"), {
    collision: true,
  });
  const collisionInspection = await inspectAcademyProductionOperationInstall({
    installRoot: collisionRoot,
    expectedUid,
    expectedGid,
  });
  assert.deepEqual(collisionInspection.newManagedCollisions, [IDENTITY]);
  const before = await snapshot(collisionRoot);
  await assert.rejects(
    executeReviewedAcademyProductionOperationInstall({
      inspection: collisionInspection,
      inspectionSha256: digest(collisionInspection),
      installRoot: collisionRoot,
      expectedUid,
      expectedGid,
    }),
    /REJECTED/,
  );
  assert.deepEqual(await snapshot(collisionRoot), before);
} finally {
  await rm(root, { recursive: true, force: true });
}
