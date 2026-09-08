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
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  executeReviewedAcademyProductionOperationInstall,
  inspectAcademyProductionOperationInstall,
} from "./academy-production-operation-install-command.mjs";
import {
  executeAcademyProductionOperationJournalRetirement,
  inspectAcademyProductionOperationJournalRetirement,
} from "./academy-production-operation-journal-retire.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";

const LEGACY_MANIFEST =
  "26fd66af6c55b804f10f7c60de8f9c321550a1015ea4da7c575e99e134d66054";
const IDENTITY = "identity-production-activation-preflight.mjs";
const canonical = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const digest = (value) =>
  createHash("sha256").update(Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");

async function snapshot(root) {
  const result = {};
  async function visit(path, relative = ".") {
    const value = await lstat(path, { bigint: true });
    result[relative] = {
      type: value.isDirectory() ? "directory" : "file",
      mode: Number(value.mode & 0o777n),
      uid: value.uid.toString(),
      gid: value.gid.toString(),
      nlink: value.nlink.toString(),
      dev: value.dev.toString(),
      ino: value.ino.toString(),
      size: value.size.toString(),
      mtimeNs: value.mtimeNs.toString(),
      ctimeNs: value.ctimeNs.toString(),
      sha256: value.isFile() ? digest(await readFile(path)) : null,
    };
    if (value.isDirectory())
      for (const name of (await readdir(path)).sort())
        await visit(join(path, name), relative === "." ? name : join(relative, name));
  }
  await visit(root);
  return result;
}

async function fixture(base) {
  const installRoot = join(base, "operations");
  await mkdir(installRoot, { mode: 0o700 });
  const rendered = await renderOperationManifest({});
  for (const entry of rendered.entries) {
    if (entry.name === IDENTITY) continue;
    await copyFile(entry.sourcePath, join(installRoot, entry.name));
    await chmod(join(installRoot, entry.name), Number.parseInt(entry.mode, 8));
  }
  await writeFile(join(installRoot, "p1-p7-config.json"), "CONFIG_SENTINEL\n", {
    mode: 0o600,
  });
  await writeFile(join(installRoot, "foreign-retained.txt"), "retain me\n", {
    mode: 0o600,
  });
  const journalPath = `${installRoot}.install-journal.json`;
  const journal = {
    schema: "academy-operation-install-journal/v1",
    manifestSha256: LEGACY_MANIFEST,
    installRoot,
    stage: `${installRoot}.stage-${LEGACY_MANIFEST.slice(0, 12)}`,
    previous: `${installRoot}.previous`,
    hadLive: false,
    currentManifestSha256: null,
    phase: "COMMITTED",
  };
  const journalBytes = canonical(journal);
  await writeFile(journalPath, journalBytes, { mode: 0o600 });
  await chmod(journalPath, 0o600);
  const owner = await stat(base);
  return {
    installRoot,
    journalPath,
    journalBytes,
    journalSha256: digest(journalBytes),
    expectedUid: owner.uid,
    expectedGid: owner.gid,
  };
}

const inspect = (value) =>
  inspectAcademyProductionOperationJournalRetirement(value);
const execute = (inspection, fixtureValue) =>
  executeAcademyProductionOperationJournalRetirement({
    inspection,
    inspectionSha256: digest(inspection),
    installRoot: fixtureValue.installRoot,
    expectedUid: fixtureValue.expectedUid,
    expectedGid: fixtureValue.expectedGid,
  });

test("stale journal identity refuses without mutation", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "academy-retire-stale-")));
  try {
    const value = await fixture(base);
    const inspection = await inspect(value);
    const replacement = `${value.journalPath}.replacement`;
    await writeFile(replacement, value.journalBytes, { mode: 0o600 });
    await chmod(replacement, 0o600);
    await rename(replacement, value.journalPath);
    const before = await snapshot(base);
    await assert.rejects(execute(inspection, value), /RETIRE_REJECTED/);
    assert.deepEqual(await snapshot(base), before);
    await assert.rejects(lstat(inspection.retainedPath), /ENOENT/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("live predecessor drift refuses without mutation", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "academy-retire-drift-")));
  try {
    const value = await fixture(base);
    const inspection = await inspect(value);
    const livePath = join(value.installRoot, "current-deployment.mjs");
    await writeFile(livePath, "reviewed predecessor changed\n");
    await chmod(livePath, 0o644);
    const before = await snapshot(base);
    await assert.rejects(execute(inspection, value), /RETIRE_REJECTED|INSTALL_COMMAND_REJECTED/);
    assert.deepEqual(await snapshot(base), before);
    await assert.rejects(lstat(inspection.retainedPath), /ENOENT/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("legacy rejection becomes a preserved retirement and successful install", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "academy-retire-success-")));
  try {
    const value = await fixture(base);
    const predecessor = await inspectAcademyProductionOperationInstall(value);
    const beforeRejectedInstall = await snapshot(base);
    await assert.rejects(
      executeReviewedAcademyProductionOperationInstall({
        inspection: predecessor,
        inspectionSha256: digest(predecessor),
        installRoot: value.installRoot,
        expectedUid: value.expectedUid,
        expectedGid: value.expectedGid,
      }),
      /INSTALL_REJECTED/,
    );
    assert.deepEqual(await snapshot(base), beforeRejectedInstall);
    const beforeInspect = await snapshot(base);
    const inspection = await inspect(value);
    assert.deepEqual(await snapshot(base), beforeInspect);
    const journalBefore = (await snapshot(base))["operations.install-journal.json"];
    const configBefore = await readFile(join(value.installRoot, "p1-p7-config.json"));
    const foreignBefore = await readFile(join(value.installRoot, "foreign-retained.txt"));

    const receipt = await execute(inspection, value);
    assert.equal(receipt.status, "RETAINED");
    await assert.rejects(lstat(value.journalPath), /ENOENT/);
    assert.deepEqual(await readFile(inspection.retainedPath), value.journalBytes);
    const retained = (await snapshot(base))[
      `operations.install-journal.json.retained-${value.journalSha256}.json`
    ];
    for (const field of ["mode", "uid", "gid", "nlink", "dev", "ino", "size", "sha256"])
      assert.equal(retained[field], journalBefore[field]);

    const installed = await executeReviewedAcademyProductionOperationInstall({
      inspection: predecessor,
      inspectionSha256: digest(predecessor),
      installRoot: value.installRoot,
      expectedUid: value.expectedUid,
      expectedGid: value.expectedGid,
    });
    assert.equal(installed.status, "INSTALLED_AND_VERIFIED");
    assert.deepEqual(await readFile(inspection.retainedPath), value.journalBytes);
    assert.deepEqual(await readFile(join(value.installRoot, "p1-p7-config.json")), configBefore);
    assert.deepEqual(await readFile(join(value.installRoot, "foreign-retained.txt")), foreignBefore);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
