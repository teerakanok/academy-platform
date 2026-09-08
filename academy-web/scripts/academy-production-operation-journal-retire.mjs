#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inspectAcademyProductionOperationInstall } from "./academy-production-operation-install-command.mjs";

const INSTALL_ROOT = "/opt/academy/production-operations";
const LEGACY_MANIFEST_SHA256 =
  "26fd66af6c55b804f10f7c60de8f9c321550a1015ea4da7c575e99e134d66054";
const SHA = /^[a-f0-9]{64}$/;
const fail = () => {
  throw new Error("ACADEMY_OPERATION_JOURNAL_RETIRE_REJECTED");
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const modeOf = (value) =>
  Number(value.mode & 0o777n).toString(8).padStart(4, "0");

async function syncDir(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertAbsent(path) {
  try {
    await lstat(path);
    fail();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readStableCanonical(path, expectedUid, expectedGid) {
  if (resolve(path) !== path || (await realpath(dirname(path))) !== dirname(path))
    fail();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(expectedUid) ||
      before.gid !== BigInt(expectedGid) ||
      (before.mode & 0o777n) !== 0o600n ||
      before.size < 2n ||
      before.size > 4096n
    )
      fail();
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathStat = await lstat(path, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.dev !== pathStat.dev ||
      after.ino !== pathStat.ino
    )
      fail();
    const value = JSON.parse(bytes);
    if (!bytes.equals(canonical(value))) fail();
    return {
      value,
      sha256: digest(bytes),
      identity: {
        dev: before.dev.toString(),
        ino: before.ino.toString(),
        bytes: Number(before.size),
        mode: modeOf(before),
        uid: Number(before.uid),
        gid: Number(before.gid),
        nlink: Number(before.nlink),
        mtimeNs: before.mtimeNs.toString(),
        ctimeNs: before.ctimeNs.toString(),
      },
    };
  } finally {
    await handle.close();
  }
}

function validateJournal(journal, installRoot) {
  const stage = `${installRoot}.stage-${LEGACY_MANIFEST_SHA256.slice(0, 12)}`;
  const previous = `${installRoot}.previous`;
  if (
    Object.keys(journal).join(",") !==
      "schema,manifestSha256,installRoot,stage,previous,hadLive,currentManifestSha256,phase" ||
    journal.schema !== "academy-operation-install-journal/v1" ||
    journal.manifestSha256 !== LEGACY_MANIFEST_SHA256 ||
    journal.installRoot !== installRoot ||
    journal.stage !== stage ||
    journal.previous !== previous ||
    journal.hadLive !== false ||
    journal.currentManifestSha256 !== null ||
    journal.phase !== "COMMITTED"
  )
    fail();
  return { stage, previous };
}

export async function inspectAcademyProductionOperationJournalRetirement({
  journalSha256,
  installRoot = INSTALL_ROOT,
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  if (!SHA.test(journalSha256 ?? "")) fail();
  const journalPath = `${installRoot}.install-journal.json`;
  const journal = await readStableCanonical(journalPath, expectedUid, expectedGid);
  const { stage, previous } = validateJournal(journal.value, installRoot);
  const retainedPath = `${journalPath}.retained-${journal.sha256}.json`;
  await assertAbsent(stage);
  await assertAbsent(previous);
  await assertAbsent(retainedPath);
  const predecessor = await inspectAcademyProductionOperationInstall({
    installRoot,
    expectedUid,
    expectedGid,
  });
  const predecessorInspectionSha256 = digest(canonical(predecessor));
  if (
    journal.sha256 !== journalSha256 ||
    predecessor.newManagedCollisions.length !== 0
  )
    fail();
  return {
    schema: "academy-production-operation-journal-retirement-inspection/v1",
    installRoot,
    journalPath,
    retainedPath,
    journalSha256: journal.sha256,
    journalIdentity: journal.identity,
    journalManifestSha256: LEGACY_MANIFEST_SHA256,
    stage,
    previous,
    predecessorInspectionSha256,
    predecessorManifestSha256: predecessor.predecessorManifestSha256,
    candidateManifestSha256: predecessor.candidateManifestSha256,
  };
}

function validInspection(value) {
  return (
    Object.keys(value ?? {}).join(",") ===
      "schema,installRoot,journalPath,retainedPath,journalSha256,journalIdentity,journalManifestSha256,stage,previous,predecessorInspectionSha256,predecessorManifestSha256,candidateManifestSha256" &&
    value.schema ===
      "academy-production-operation-journal-retirement-inspection/v1" &&
    SHA.test(value.journalSha256 ?? "") &&
    SHA.test(value.predecessorInspectionSha256 ?? "") &&
    SHA.test(value.predecessorManifestSha256 ?? "") &&
    SHA.test(value.candidateManifestSha256 ?? "") &&
    value.journalManifestSha256 === LEGACY_MANIFEST_SHA256
  );
}

export async function executeAcademyProductionOperationJournalRetirement({
  inspection,
  inspectionSha256,
  installRoot = INSTALL_ROOT,
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  if (
    !validInspection(inspection) ||
    !SHA.test(inspectionSha256 ?? "") ||
    digest(canonical(inspection)) !== inspectionSha256 ||
    inspection.installRoot !== installRoot
  )
    fail();
  const fresh = await inspectAcademyProductionOperationJournalRetirement({
    journalSha256: inspection.journalSha256,
    installRoot,
    expectedUid,
    expectedGid,
  });
  if (JSON.stringify(fresh) !== JSON.stringify(inspection)) fail();
  await rename(inspection.journalPath, inspection.retainedPath);
  await syncDir(dirname(installRoot));
  const retained = await readStableCanonical(
    inspection.retainedPath,
    expectedUid,
    expectedGid,
  );
  validateRetainedValue(retained.value, installRoot);
  const retainedIdentity = {
    ...retained.identity,
    mtimeNs: inspection.journalIdentity.mtimeNs,
    ctimeNs: inspection.journalIdentity.ctimeNs,
  };
  if (
    retained.sha256 !== inspection.journalSha256 ||
    JSON.stringify(retainedIdentity) !== JSON.stringify(inspection.journalIdentity)
  ) {
    await rename(inspection.retainedPath, inspection.journalPath);
    await syncDir(dirname(installRoot));
    fail();
  }
  await assertAbsent(inspection.journalPath);
  return {
    schema: "academy-production-operation-journal-retirement/v1",
    status: "RETAINED",
    inspectionSha256,
    journalSha256: retained.sha256,
    journalManifestSha256: LEGACY_MANIFEST_SHA256,
    retainedPath: inspection.retainedPath,
    predecessorInspectionSha256: inspection.predecessorInspectionSha256,
  };
}

function validateRetainedValue(value, installRoot) {
  validateJournal(value, installRoot);
  return value;
}

async function writeInspection(path, value) {
  if (resolve(path) !== path || (await realpath(dirname(path))) !== dirname(path))
    fail();
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(canonical(value));
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(args) {
  if (
    args.length === 5 &&
    args[0] === "inspect" &&
    args[1] === "--journal-sha256" &&
    args[3] === "--output"
  ) {
    const inspection =
      await inspectAcademyProductionOperationJournalRetirement({
        journalSha256: args[2],
      });
    await writeInspection(args[4], inspection);
    process.stdout.write(`${JSON.stringify({
      status: "INSPECTED",
      inspectionSha256: digest(canonical(inspection)),
      output: args[4],
    })}\n`);
    return;
  }
  if (
    args.length === 5 &&
    args[0] === "execute" &&
    args[1] === "--inspection" &&
    args[3] === "--inspection-sha256"
  ) {
    const inspected = await readStableCanonical(args[2], 0, 0);
    if (inspected.sha256 !== args[4]) fail();
    const receipt = await executeAcademyProductionOperationJournalRetirement({
      inspection: inspected.value,
      inspectionSha256: args[4],
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  fail();
}

if (import.meta.url === `file://${process.argv[1]}`)
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write("ACADEMY_OPERATION_JOURNAL_RETIRE_REJECTED\n");
    process.exitCode = 1;
  });
