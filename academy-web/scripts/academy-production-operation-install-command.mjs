#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  installAcademyProductionOperations,
  verifyAcademyProductionOperations,
} from "./academy-production-operation-install.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";

const INSTALL_ROOT = "/opt/academy/production-operations";
// Re-pinned at commit time to the revision the CANDIDATE bytes below came from.
const SOURCE_REVISION = "1e2b0ff7cb09a0d5205aa61ab22060fea6fed037";
const SHA = /^[a-f0-9]{64}$/;
const CONFIG = "p1-p7-config.json";
export const CANDIDATE = Object.freeze([
  ["academy-production-operation.mjs", 7543, "98508a146bf8800c9555044e500e659a276c8bd075d90fc23c72f9b105f92050", "0755"],
  ["academy-production-p1-p7-runner.mjs", 16460, "4c4f8f1026d7466005ea3ded6b138755200fff4d6810554f63fcc8f04828af28", "0755"],
  ["academy-production-p1-p7-ssh.mjs", 8670, "b42cc1c506c3fd7a2527f5ecce40cc33db7d28d64bd71b8a6a95e0b0b5356c45", "0644"],
  ["academy-production-p1-p7-host.mjs", 8980, "6930f7dcd9cf261b6fb8fed5e945f2f2523873359256ae51ca06ebf0825c4dc3", "0755"],
  ["academy-production-operation-install.mjs", 23488, "9f299c5c25a056902426f72c98f3bf3a4d5651b544159f56668234b8ecbe2290", "0755"],
  ["academy-poola-production-producer.mjs", 17775, "ec83328278d6e775df8c6cda5ef08726ce745e105b7bc2280b6f745e31280282", "0755"],
  ["academy-production-cloudflare-helper.mjs", 26757, "db5656d66f1cd01aa313625d97774023ccb8bde299785279c2f9bc687f24dd2b", "0644"],
  ["identity-production-activation-preflight.mjs", 11338, "e30ddf6a98614e642a698be8f0239a2431622f0d115a3bd70ad11b08c443feb6", "0644"],
  ["academy-production-database-adapter.mjs", 10247, "da0496c20d7b2b19ae27b4cf75acd06c5d4ebfcb8a37599cea99b5b48889ff59", "0644"],
  ["current-deployment.mjs", 7911, "362dc1a8957f95b158ad3954c71f856f79882a880f7659f9e55c63888e80d98a", "0644"],
  ["academy-release-manifest.mjs", 11272, "e63128223ff20ef86f6ca1108845848523e7b25f46293cfab39ea66e25d37413", "0644"],
  ["academy-release-pointer.mjs", 8458, "7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee", "0644"],
]);
// The managed files the predecessor install is expected to already hold. Written
// out literally and never derived from CANDIDATE: growing CANDIDATE must not
// silently redefine which installed files count as predecessors, which files are
// foreign-retained, or which are new-managed collisions. Advance this list only
// together with an executed install transition.
const LEGACY_NAMES = Object.freeze([
  "academy-production-operation.mjs",
  "academy-production-p1-p7-runner.mjs",
  "academy-production-p1-p7-ssh.mjs",
  "academy-production-p1-p7-host.mjs",
  "academy-production-operation-install.mjs",
  "academy-poola-production-producer.mjs",
  "academy-production-cloudflare-helper.mjs",
  "academy-production-database-adapter.mjs",
  "current-deployment.mjs",
]);
const fail = () => {
  throw new Error("ACADEMY_OPERATION_INSTALL_COMMAND_REJECTED");
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const modeOf = (metadata) =>
  Number(metadata.mode & 0o777n).toString(8).padStart(4, "0");
const safeNumber = (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail();
  return number;
};

async function stableManagedFile(path, expectedUid, expectedGid, mode) {
  if (resolve(path) !== path || (await realpath(path)) !== path) fail();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(expectedUid) ||
      before.gid !== BigInt(expectedGid) ||
      modeOf(before) !== mode ||
      before.size < 1n ||
      before.size > 16n * 1024n * 1024n
    )
      fail();
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    )
      fail();
    return {
      bytes: bytes.length,
      sha256: digest(bytes),
      mode,
      uid: expectedUid,
      gid: expectedGid,
      nlink: 1,
    };
  } finally {
    await handle.close();
  }
}

function metadataRecord(name, metadata) {
  const type = metadata.isFile()
    ? "file"
    : metadata.isDirectory()
      ? "directory"
      : metadata.isSymbolicLink()
        ? "symlink"
        : "other";
  return {
    name,
    type,
    bytes: safeNumber(metadata.size),
    mode: modeOf(metadata),
    uid: safeNumber(metadata.uid),
    gid: safeNumber(metadata.gid),
    nlink: safeNumber(metadata.nlink),
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    ctimeNs: metadata.ctimeNs.toString(),
  };
}

async function candidateManifest(installRoot) {
  const rendered = await renderOperationManifest({});
  const summary = rendered.entries.map(({ name, bytes, sha256, mode }) => [
    name,
    bytes,
    sha256,
    mode,
  ]);
  if (JSON.stringify(summary) !== JSON.stringify(CANDIDATE)) fail();
  let identity = null;
  for (const entry of rendered.entries) {
    const metadata = await lstat(entry.sourcePath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      ![0o644, 0o755].includes(metadata.mode & 0o777) ||
      (await realpath(entry.sourcePath)) !== entry.sourcePath
    )
      fail();
    identity ??= { uid: metadata.uid, gid: metadata.gid };
    if (metadata.uid !== identity.uid || metadata.gid !== identity.gid) fail();
  }
  const manifest = {
    ...rendered,
    entries: rendered.entries.map((entry) => ({
      ...entry,
      installPath: join(installRoot, entry.name),
    })),
  };
  return {
    manifest,
    manifestSha256: digest(canonical(manifest)),
    sourceUid: identity.uid,
    sourceGid: identity.gid,
  };
}

async function retainedMetadata(installRoot, managedNames) {
  const names = (await readdir(installRoot)).sort();
  const records = [];
  for (const name of names) {
    if (managedNames.has(name) || name === CONFIG) continue;
    records.push(
      metadataRecord(name, await lstat(join(installRoot, name), { bigint: true })),
    );
  }
  return records;
}

export async function inspectAcademyProductionOperationInstall({
  installRoot = INSTALL_ROOT,
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  if (resolve(installRoot) !== installRoot || (await realpath(installRoot)) !== installRoot)
    fail();
  const root = await stat(installRoot, { bigint: true });
  if (
    !root.isDirectory() ||
    root.uid !== BigInt(expectedUid) ||
    root.gid !== BigInt(expectedGid) ||
    root.mode & 0o022n
  )
    fail();
  const candidate = await candidateManifest(installRoot);
  const candidateByName = new Map(
    candidate.manifest.entries.map((entry) => [entry.name, entry]),
  );
  const managed = [];
  for (const name of LEGACY_NAMES) {
    const entry = candidateByName.get(name);
    managed.push({
      name,
      installPath: join(installRoot, name),
      ...(await stableManagedFile(
        join(installRoot, name),
        expectedUid,
        expectedGid,
        entry.mode,
      )),
    });
  }
  const config = metadataRecord(
    CONFIG,
    await lstat(join(installRoot, CONFIG), { bigint: true }),
  );
  if (
    config.type !== "file" ||
    config.uid !== expectedUid ||
    config.gid !== expectedGid ||
    config.mode !== "0600" ||
    config.nlink !== 1 ||
    config.bytes < 1 ||
    config.bytes > 4096
  )
    fail();
  const predecessorManifest = {
    schema: "academy-production-operation-install-manifest/v1",
    entries: managed.map(({ name, installPath, bytes, sha256, mode }) => ({
      name,
      sourcePath: installPath,
      installPath,
      bytes,
      sha256,
      mode,
    })),
  };
  const candidateNames = new Set(candidate.manifest.entries.map(({ name }) => name));
  return {
    schema: "academy-production-operation-install-inspection/v1",
    sourceRevision: SOURCE_REVISION,
    installRoot,
    root: {
      uid: expectedUid,
      gid: expectedGid,
      mode: modeOf(root),
    },
    managed,
    config,
    retained: await retainedMetadata(installRoot, new Set(LEGACY_NAMES)),
    newManagedCollisions: (await readdir(installRoot))
      .filter((name) => candidateNames.has(name) && !LEGACY_NAMES.includes(name))
      .sort(),
    predecessorManifest,
    predecessorManifestSha256: digest(canonical(predecessorManifest)),
    candidateManifestSha256: candidate.manifestSha256,
    candidate: CANDIDATE,
  };
}

export async function executeReviewedAcademyProductionOperationInstall({
  inspection,
  inspectionSha256,
  installRoot = INSTALL_ROOT,
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  if (!SHA.test(inspectionSha256 ?? "") || digest(canonical(inspection)) !== inspectionSha256)
    fail();
  const fresh = await inspectAcademyProductionOperationInstall({
    installRoot,
    expectedUid,
    expectedGid,
  });
  if (JSON.stringify(fresh) !== JSON.stringify(inspection)) fail();
  if (inspection.newManagedCollisions.length !== 0) fail();
  const candidate = await candidateManifest(installRoot);
  const installed = await installAcademyProductionOperations({
    manifest: candidate.manifest,
    manifestSha256: candidate.manifestSha256,
    installRoot,
    expectedUid,
    expectedGid,
    sourceUid: candidate.sourceUid,
    sourceGid: candidate.sourceGid,
    currentManifest: inspection.predecessorManifest,
    currentManifestSha256: inspection.predecessorManifestSha256,
  });
  const verified = await verifyAcademyProductionOperations({
    manifest: candidate.manifest,
    manifestSha256: candidate.manifestSha256,
    installRoot,
    expectedUid,
    expectedGid,
  });
  const config = metadataRecord(
    CONFIG,
    await lstat(join(installRoot, CONFIG), { bigint: true }),
  );
  const retained = await retainedMetadata(
    installRoot,
    new Set(candidate.manifest.entries.map(({ name }) => name)),
  );
  if (
    JSON.stringify(config) !== JSON.stringify(inspection.config) ||
    JSON.stringify(retained) !== JSON.stringify(inspection.retained)
  )
    fail();
  return {
    schema: "academy-production-operation-install-execution/v1",
    status: "INSTALLED_AND_VERIFIED",
    sourceRevision: SOURCE_REVISION,
    inspectionSha256,
    predecessorManifestSha256: inspection.predecessorManifestSha256,
    candidateManifestSha256: candidate.manifestSha256,
    installStatus: installed.status,
    verifyStatus: verified.status,
  };
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

async function readInspection(path, expectedUid = 0, expectedGid = 0) {
  if (resolve(path) !== path || (await realpath(path)) !== path) fail();
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
      before.size > 131_072n
    )
      fail();
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathMetadata = await lstat(path, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.dev !== pathMetadata.dev ||
      after.ino !== pathMetadata.ino
    )
      fail();
    const value = JSON.parse(bytes);
    if (!bytes.equals(canonical(value))) fail();
    return { value, sha256: digest(bytes) };
  } finally {
    await handle.close();
  }
}

async function main(args) {
  if (
    args.length === 3 &&
    args[0] === "inspect" &&
    args[1] === "--output"
  ) {
    const inspection = await inspectAcademyProductionOperationInstall();
    await writeInspection(args[2], inspection);
    process.stdout.write(
      `${JSON.stringify({ status: "INSPECTED", inspectionSha256: digest(canonical(inspection)), output: args[2] })}\n`,
    );
    return;
  }
  if (
    args.length === 5 &&
    args[0] === "execute" &&
    args[1] === "--inspection" &&
    args[3] === "--inspection-sha256"
  ) {
    const inspected = await readInspection(args[2]);
    if (inspected.sha256 !== args[4]) fail();
    const receipt = await executeReviewedAcademyProductionOperationInstall({
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
    process.stderr.write("ACADEMY_OPERATION_INSTALL_COMMAND_REJECTED\n");
    process.exitCode = 1;
  });
