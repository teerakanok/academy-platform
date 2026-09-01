#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const SHA = /^[a-f0-9]{64}$/;
const fail = () => {
  throw new Error("ACADEMY_OPERATION_INSTALL_REJECTED");
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function syncDir(path) {
  const h = await open(path, "r");
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}

async function writeJournal(path, value) {
  const tmp = `${path}.tmp`;
  await rm(tmp, { force: true });
  const h = await open(
    tmp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    await h.writeFile(`${JSON.stringify(value)}\n`);
    await h.sync();
  } finally {
    await h.close();
  }
  await rename(tmp, path);
  await syncDir(dirname(path));
}

async function readJournal(path) {
  try {
    const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await h.stat();
      if (!s.isFile() || s.nlink !== 1 || s.mode & 0o077 || s.size > 4096)
        fail();
      const raw = await h.readFile("utf8"),
        value = JSON.parse(raw);
      if (raw !== `${JSON.stringify(value)}\n`) fail();
      return value;
    } finally {
      await h.close();
    }
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function stableFile(path, { uid, gid, modes, expectedSha256 }) {
  if (resolve(path) !== path || (await realpath(path)) !== path) fail();
  const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await h.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(uid) ||
      before.gid !== BigInt(gid) ||
      !modes.includes(Number(before.mode & 0o777n)) ||
      before.size < 1n ||
      before.size > 16n * 1024n * 1024n
    )
      fail();
    const bytes = await h.readFile();
    const after = await h.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      digest(bytes) !== expectedSha256
    )
      fail();
    return bytes;
  } finally {
    await h.close();
  }
}

function validateManifest(manifest, installRoot) {
  if (
    manifest?.schema !== "academy-production-operation-install-manifest/v1" ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== 10
  )
    fail();
  const names = new Set();
  for (const entry of manifest.entries) {
    if (
      Object.keys(entry).join(",") !==
        "name,sourcePath,installPath,bytes,sha256,mode" ||
      names.has(entry.name) ||
      !/^[a-z0-9.-]+\.mjs$/.test(entry.name) ||
      entry.installPath !== join(installRoot, entry.name) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      !SHA.test(entry.sha256) ||
      !["0644", "0755"].includes(entry.mode)
    )
      fail();
    names.add(entry.name);
  }
  return manifest;
}
const manifestAt = (manifest, root) => ({
  ...manifest,
  entries: manifest.entries.map((entry) => ({
    ...entry,
    installPath: join(root, entry.name),
  })),
});

export async function installAcademyProductionOperations({
  manifest,
  manifestSha256,
  installRoot = "/opt/academy/production-operations",
  expectedUid = 0,
  expectedGid = 0,
  sourceUid = expectedUid,
  sourceGid = expectedGid,
  currentManifest,
  currentManifestSha256,
  stopAfterPhase,
}) {
  validateManifest(manifest, installRoot);
  if (digest(Buffer.from(`${JSON.stringify(manifest)}\n`)) !== manifestSha256)
    fail();
  const parentPath = dirname(installRoot),
    stage = `${installRoot}.stage-${manifestSha256.slice(0, 12)}`,
    previous = `${installRoot}.previous`,
    journalPath = `${installRoot}.install-journal.json`;
  await mkdir(parentPath, { recursive: true, mode: 0o755 });
  const pending = await readJournal(journalPath);
  if (pending) {
    if (
      pending.phase === "COMMITTED" &&
      pending.manifestSha256 !== manifestSha256
    ) {
      if (!currentManifest || pending.manifestSha256 !== currentManifestSha256)
        fail();
      await verifyAcademyProductionOperations({
        manifest: currentManifest,
        manifestSha256: currentManifestSha256,
        installRoot,
        expectedUid,
        expectedGid,
      });
      await rm(previous, { recursive: true, force: true });
      await rm(journalPath);
      await syncDir(parentPath);
    } else {
      if (
        pending.schema !== "academy-operation-install-journal/v1" ||
        pending.installRoot !== installRoot ||
        pending.stage !== stage ||
        pending.previous !== previous ||
        pending.manifestSha256 !== manifestSha256
      )
        fail();
      if (pending.phase === "COMMITTED")
        return verifyAcademyProductionOperations({
          manifest,
          manifestSha256,
          installRoot,
          expectedUid,
          expectedGid,
        });
      if (pending.phase === "LIVE_MOVED" && (await exists(installRoot))) {
        try {
          const verified = await verifyAcademyProductionOperations({
            manifest,
            manifestSha256,
            installRoot,
            expectedUid,
            expectedGid,
          });
          pending.phase = "NEW_LIVE";
          await writeJournal(journalPath, pending);
          pending.phase = "COMMITTED";
          await writeJournal(journalPath, pending);
          return verified;
        } catch {
          await rm(installRoot, { recursive: true });
          await syncDir(parentPath);
        }
      }
      if (
        pending.hadLive &&
        (!currentManifest ||
          pending.currentManifestSha256 !== currentManifestSha256)
      )
        fail();
      if (pending.phase === "NEW_LIVE" && (await exists(installRoot)))
        await rm(installRoot, { recursive: true });
      if (pending.hadLive && (await exists(previous))) {
        await verifyAcademyProductionOperations({
          manifest: manifestAt(currentManifest, previous),
          manifestSha256: digest(
            Buffer.from(
              `${JSON.stringify(manifestAt(currentManifest, previous))}\n`,
            ),
          ),
          installRoot: previous,
          expectedUid,
          expectedGid,
        });
        await rename(previous, installRoot);
      }
      await rm(stage, { recursive: true, force: true });
      await rm(journalPath);
      await syncDir(parentPath);
    }
  }
  const hadLive = await exists(installRoot);
  if (hadLive) {
    const root = await realpath(installRoot),
      rootStat = await stat(root);
    if (
      root !== installRoot ||
      rootStat.uid !== expectedUid ||
      rootStat.gid !== expectedGid ||
      rootStat.mode & 0o022
    )
      fail();
    if (!currentManifest || !currentManifestSha256) fail();
    await verifyAcademyProductionOperations({
      manifest: currentManifest,
      manifestSha256: currentManifestSha256,
      installRoot,
      expectedUid,
      expectedGid,
    });
  }
  if (await exists(previous)) fail();
  await mkdir(stage, { mode: 0o700 });
  try {
    for (const entry of manifest.entries) {
      const bytes = await stableFile(entry.sourcePath, {
        uid: sourceUid,
        gid: sourceGid,
        modes: [0o644, 0o755],
        expectedSha256: entry.sha256,
      });
      if (bytes.length !== entry.bytes) fail();
      const target = join(stage, entry.name);
      const h = await open(
        target,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        Number.parseInt(entry.mode, 8),
      );
      try {
        await h.writeFile(bytes);
        await h.sync();
      } finally {
        await h.close();
      }
      await chmod(target, Number.parseInt(entry.mode, 8));
    }
    await syncDir(stage);
    const state = {
      schema: "academy-operation-install-journal/v1",
      manifestSha256,
      installRoot,
      stage,
      previous,
      hadLive,
      currentManifestSha256: hadLive ? currentManifestSha256 : null,
      phase: "STAGED",
    };
    await writeJournal(journalPath, state);
    if (stopAfterPhase === state.phase)
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
    if (hadLive) await rename(installRoot, previous);
    state.phase = "LIVE_MOVED";
    await writeJournal(journalPath, state);
    if (stopAfterPhase === state.phase)
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
    await rename(stage, installRoot);
    if (stopAfterPhase === "AFTER_STAGE_RENAME")
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
    state.phase = "NEW_LIVE";
    await writeJournal(journalPath, state);
    if (stopAfterPhase === state.phase)
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
  } catch (error) {
    if (error?.simulatedCrash) throw error;
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  const verified = await verifyAcademyProductionOperations({
    manifest,
    manifestSha256,
    installRoot,
    expectedUid,
    expectedGid,
  });
  const committed = await readJournal(journalPath);
  committed.phase = "COMMITTED";
  await writeJournal(journalPath, committed);
  return verified;
}

export async function verifyAcademyProductionOperations({
  manifest,
  manifestSha256,
  installRoot = "/opt/academy/production-operations",
  expectedUid = 0,
  expectedGid = 0,
}) {
  validateManifest(manifest, installRoot);
  if (digest(Buffer.from(`${JSON.stringify(manifest)}\n`)) !== manifestSha256)
    fail();
  const root = await realpath(installRoot);
  const rootStat = await stat(root);
  if (
    root !== installRoot ||
    rootStat.uid !== expectedUid ||
    rootStat.gid !== expectedGid ||
    rootStat.mode & 0o022
  )
    fail();
  for (const entry of manifest.entries)
    await stableFile(entry.installPath, {
      uid: expectedUid,
      gid: expectedGid,
      modes: [Number.parseInt(entry.mode, 8)],
      expectedSha256: entry.sha256,
    });
  return {
    status: "PASS",
    manifestSha256,
  };
}
