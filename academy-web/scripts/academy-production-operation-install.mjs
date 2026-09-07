#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const SHA = /^[a-f0-9]{64}$/;
const CURRENT_ENTRY_NAMES = Object.freeze([
  "academy-production-operation.mjs",
  "academy-production-p1-p7-runner.mjs",
  "academy-production-p1-p7-ssh.mjs",
  "academy-production-p1-p7-host.mjs",
  "academy-production-operation-install.mjs",
  "academy-poola-production-producer.mjs",
  "academy-production-cloudflare-helper.mjs",
  "identity-production-activation-preflight.mjs",
  "academy-production-database-adapter.mjs",
  "current-deployment.mjs",
]);
const LEGACY_ENTRY_NAMES = Object.freeze(
  CURRENT_ENTRY_NAMES.filter(
    (name) => name !== "identity-production-activation-preflight.mjs",
  ),
);
const ENTRY_MODES = new Map(
  CURRENT_ENTRY_NAMES.map((name) => [
    name,
    [
      "academy-production-operation.mjs",
      "academy-production-p1-p7-runner.mjs",
      "academy-production-p1-p7-host.mjs",
      "academy-production-operation-install.mjs",
      "academy-poola-production-producer.mjs",
    ].includes(name)
      ? "0755"
      : "0644",
  ]),
);
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
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function namesAt(path) {
  return new Set(
    (await readdir(path, { withFileTypes: true })).map((entry) => entry.name),
  );
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
  return validateManifestAt(manifest, installRoot, { allowLegacy: true });
}

function validateManifestAt(
  manifest,
  installRoot,
  { allowLegacy = true } = {},
) {
  const expectedNames =
    manifest?.entries?.length === 10
      ? CURRENT_ENTRY_NAMES
      : allowLegacy && manifest?.entries?.length === 9
        ? LEGACY_ENTRY_NAMES
        : null;
  if (
    manifest?.schema !== "academy-production-operation-install-manifest/v1" ||
    !Array.isArray(manifest.entries) ||
    !expectedNames
  )
    fail();
  const names = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    if (
      Object.keys(entry).join(",") !==
        "name,sourcePath,installPath,bytes,sha256,mode" ||
      names.has(entry.name) ||
      entry.name !== expectedNames[index] ||
      entry.mode !== ENTRY_MODES.get(entry.name) ||
      entry.installPath !== join(installRoot, entry.name) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      !SHA.test(entry.sha256) ||
      !["0644", "0755"].includes(entry.mode)
    )
    {
      fail();
    }
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

function validPendingJournal(pending, installRoot, previous, manifestSha256) {
  return (
    Object.keys(pending).join(",") ===
      "schema,manifestSha256,installRoot,stage,previous,hadLive,currentManifestSha256,phase" &&
    pending.schema === "academy-operation-install-journal/v1" &&
    pending.installRoot === installRoot &&
    pending.previous === previous &&
    pending.stage ===
      `${installRoot}.stage-${pending.manifestSha256.slice(0, 12)}` &&
    pending.manifestSha256 === manifestSha256 &&
    typeof pending.hadLive === "boolean" &&
    (pending.hadLive
      ? typeof pending.currentManifestSha256 === "string"
      : pending.currentManifestSha256 === null)
  );
}

async function verifyManifestAt(options) {
  return verifyAcademyProductionOperations(options);
}

async function safeRemovePrevious(currentManifest, previous, options) {
  if (!(await exists(previous))) return;
  await removeBoundDirectory(previous, currentManifest, options);
}

async function inspectDirectory(path, { expectedUid, expectedGid }) {
  const root = await realpath(path),
    rootStat = await stat(root);
  if (
    root !== path ||
    !rootStat.isDirectory() ||
    rootStat.uid !== expectedUid ||
    rootStat.gid !== expectedGid ||
    rootStat.mode & 0o022
  )
    fail();
}

async function inspectBoundDirectory(
  path,
  manifest,
  { expectedUid, expectedGid, requireComplete = false },
) {
  await inspectDirectory(path, { expectedUid, expectedGid });
  const entries = new Map(manifest.entries.map((entry) => [entry.name, entry]));
  const names = await namesAt(path);
  for (const name of names) {
    const entry = entries.get(name);
    if (!entry) fail();
    await stableFile(join(path, name), {
      uid: expectedUid,
      gid: expectedGid,
      modes: [Number.parseInt(entry.mode, 8)],
      expectedSha256: entry.sha256,
    });
  }
  if (requireComplete && names.size !== entries.size) fail();
  return names;
}

async function removeBoundDirectory(path, manifest, options = {}) {
  const names = await inspectBoundDirectory(path, manifest, options);
  for (const name of names) await unlink(join(path, name));
  await rmdir(path);
}

async function removeBoundStage(stage, manifest, options) {
  if (!(await exists(stage))) return;
  await removeBoundDirectory(stage, manifest, options);
}

async function previousHasRetainedEntries(previous, currentManifest) {
  if (!(await exists(previous))) return false;
  const currentNames = new Set(currentManifest.entries.map((entry) => entry.name));
  for (const name of await namesAt(previous))
    if (!currentNames.has(name)) return true;
  return false;
}

async function rollbackLegacyDirectorySwap({
  manifest,
  currentManifest,
  installRoot,
  stage,
  previous,
  journalPath,
  expectedUid,
  expectedGid,
}) {
  const currentAtPrevious = manifestAt(currentManifest, previous);
  await verifyManifestAt({
    manifest: currentAtPrevious,
    manifestSha256: digest(
      Buffer.from(`${JSON.stringify(currentAtPrevious)}\n`),
    ),
    installRoot: previous,
    expectedUid,
    expectedGid,
  });
  if (await exists(stage))
    await inspectBoundDirectory(stage, manifest, {
      expectedUid,
      expectedGid,
    });
  if (await exists(installRoot))
    await inspectBoundDirectory(installRoot, manifest, {
      expectedUid,
      expectedGid,
      requireComplete: true,
    });

  await removeBoundStage(stage, manifest, { expectedUid, expectedGid });
  if (await exists(installRoot))
    await removeBoundDirectory(installRoot, manifest, {
      expectedUid,
      expectedGid,
      requireComplete: true,
    });
  await rename(previous, installRoot);
  await rm(journalPath);
}

async function rollbackTransaction({
  manifest,
  currentManifest,
  installRoot,
  stage,
  previous,
  journalPath,
  hadLive,
  expectedUid,
  expectedGid,
}) {
  const currentEntries = new Map(
      (currentManifest?.entries ?? []).map((entry) => [entry.name, entry]),
    ),
    currentNames = new Set(currentEntries.keys()),
    custody = { expectedUid, expectedGid };
  if (await exists(previous)) {
    await inspectBoundDirectory(previous, currentManifest, custody);
    if (await exists(stage))
      await inspectBoundDirectory(stage, manifest, custody);
    if (!(await exists(installRoot))) fail();
    await inspectDirectory(installRoot, custody);
    for (const entry of manifest.entries) {
      const livePath = join(installRoot, entry.name),
        previousPath = join(previous, entry.name),
        hasLive = await exists(livePath),
        hasPrevious = await exists(previousPath),
        current = currentEntries.get(entry.name);
      if (current && !hasPrevious) {
        if (!hasLive) fail();
        await stableFile(livePath, {
          uid: expectedUid,
          gid: expectedGid,
          modes: [Number.parseInt(current.mode, 8)],
          expectedSha256: current.sha256,
        });
      } else if (hasLive) {
        await stableFile(livePath, {
          uid: expectedUid,
          gid: expectedGid,
          modes: [Number.parseInt(entry.mode, 8)],
          expectedSha256: entry.sha256,
        });
      }
    }

    await removeBoundStage(stage, manifest, custody);
    for (const entry of manifest.entries) {
      const livePath = join(installRoot, entry.name),
        previousPath = join(previous, entry.name);
      const hasLive = await exists(livePath),
        hasPrevious = await exists(previousPath);
      if (hasLive && !hasPrevious && !currentNames.has(entry.name)) {
        await stableFile(livePath, {
          uid: expectedUid,
          gid: expectedGid,
          modes: [Number.parseInt(entry.mode, 8)],
          expectedSha256: entry.sha256,
        });
        await unlink(livePath);
      }
      if (hasPrevious && hasLive) {
        await stableFile(livePath, {
          uid: expectedUid,
          gid: expectedGid,
          modes: [Number.parseInt(entry.mode, 8)],
          expectedSha256: entry.sha256,
        });
        await unlink(livePath);
      }
    }
    for (const entry of manifest.entries) {
      const livePath = join(installRoot, entry.name),
        previousPath = join(previous, entry.name);
      if (!(await exists(previousPath))) continue;
      if (await exists(livePath)) fail();
      await stableFile(previousPath, {
        uid: expectedUid,
        gid: expectedGid,
        modes: [Number.parseInt(currentEntries.get(entry.name).mode, 8)],
        expectedSha256: currentEntries.get(entry.name).sha256,
      });
      await rename(previousPath, livePath);
    }
    for (const name of await namesAt(previous))
      if (currentNames.has(name)) fail();
    await rmdir(previous);
  } else if (!hadLive) {
    if (await exists(stage))
      await inspectBoundDirectory(stage, manifest, custody);
    if (await exists(installRoot))
      await inspectBoundDirectory(installRoot, manifest, custody);
    for (const entry of manifest.entries) {
      const livePath = join(installRoot, entry.name);
      if (!(await exists(livePath))) continue;
      await stableFile(livePath, {
        uid: expectedUid,
        gid: expectedGid,
        modes: [Number.parseInt(entry.mode, 8)],
        expectedSha256: entry.sha256,
      });
      await unlink(livePath);
    }
    if (await exists(installRoot)) await rmdir(installRoot);
  } else {
    await verifyManifestAt({
      manifest: currentManifest,
      manifestSha256: digest(
        Buffer.from(`${JSON.stringify(currentManifest)}\n`),
      ),
      installRoot,
      expectedUid,
      expectedGid,
    });
    if (await exists(stage))
      await inspectBoundDirectory(stage, manifest, custody);
  }
  if (hadLive)
    await verifyManifestAt({
      manifest: currentManifest,
      manifestSha256: digest(
        Buffer.from(`${JSON.stringify(currentManifest)}\n`),
      ),
      installRoot,
      expectedUid,
      expectedGid,
    });
  await removeBoundStage(stage, manifest, { expectedUid, expectedGid });
  await rm(journalPath, { force: true });
}

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
  validateManifestAt(manifest, installRoot, { allowLegacy: false });
  if (digest(Buffer.from(`${JSON.stringify(manifest)}\n`)) !== manifestSha256)
    fail();
  if (currentManifest) validateManifest(currentManifest, installRoot);
  const parentPath = dirname(installRoot),
    stage = `${installRoot}.stage-${manifestSha256.slice(0, 12)}`,
    previous = `${installRoot}.previous`,
    journalPath = `${installRoot}.install-journal.json`;
  await mkdir(parentPath, { recursive: true, mode: 0o755 });
  const pending = await readJournal(journalPath);
  if (pending) {
    const pendingIsCurrent =
      validPendingJournal(pending, installRoot, previous, manifestSha256);
    if (
      !pendingIsCurrent &&
      !(pending.phase === "COMMITTED" &&
        validPendingJournal(
          pending,
          installRoot,
          previous,
          pending.manifestSha256,
        ))
    )
      fail();
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
      await safeRemovePrevious(currentManifest, previous, {
        expectedUid,
        expectedGid,
      });
      await rm(journalPath);
      await syncDir(parentPath);
    } else {
      if (
        pending.hadLive &&
        (!currentManifest ||
          pending.currentManifestSha256 !== currentManifestSha256)
      )
        fail();
      if (["STAGED", "LIVE_MOVED", "NEW_LIVE"].includes(pending.phase)) {
        if (
          pending.hadLive &&
          (await exists(previous)) &&
          (!(await exists(installRoot)) ||
            (await previousHasRetainedEntries(previous, currentManifest)))
        ) {
          await rollbackLegacyDirectorySwap({
            manifest,
            currentManifest,
            installRoot,
            stage,
            previous,
            journalPath,
            expectedUid,
            expectedGid,
          });
        } else {
          if (pending.hadLive && !(await exists(previous))) {
            if (pending.phase !== "STAGED") fail();
            await removeBoundStage(stage, manifest, {
              expectedUid,
              expectedGid,
            });
            await rm(journalPath);
          } else {
            await rollbackTransaction({
              manifest,
              currentManifest,
              installRoot,
              stage,
              previous,
              journalPath,
              hadLive: pending.hadLive,
              expectedUid,
              expectedGid,
            });
          }
        }
        await syncDir(parentPath);
      } else if (pending.phase !== "COMMITTED") fail();
      if (pending.phase === "COMMITTED") {
        const verified = await verifyManifestAt({
          manifest,
          manifestSha256,
          installRoot,
          expectedUid,
          expectedGid,
        });
        await safeRemovePrevious(currentManifest, previous, {
          expectedUid,
          expectedGid,
        });
        await rm(journalPath);
        await syncDir(parentPath);
        return verified;
      }
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
  for (const entry of manifest.entries) {
    if (
      currentManifest?.entries.some((current) => current.name === entry.name)
    )
      continue;
    if (await exists(entry.installPath)) fail();
  }
  if (await exists(previous)) fail();
  if (await exists(stage)) fail();
  await mkdir(stage, { mode: 0o700 });
  let state = null;
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
    const stageManifest = manifestAt(manifest, stage),
      stageSha = digest(Buffer.from(`${JSON.stringify(stageManifest)}\n`));
    await verifyManifestAt({
      manifest: stageManifest,
      manifestSha256: stageSha,
      installRoot: stage,
      expectedUid,
      expectedGid,
    });
    state = {
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
    if (hadLive) await mkdir(previous, { mode: 0o700 });
    if (hadLive) {
      for (const entry of currentManifest.entries) {
        const livePath = join(installRoot, entry.name),
          previousPath = join(previous, entry.name);
        if (await exists(previousPath)) fail();
        await rename(livePath, previousPath);
      }
      await syncDir(installRoot);
      await syncDir(previous);
    }
    state.phase = "LIVE_MOVED";
    await writeJournal(journalPath, state);
    if (stopAfterPhase === state.phase)
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
    if (!(await exists(installRoot)))
      await mkdir(installRoot, { mode: 0o700 });
    for (const entry of manifest.entries) {
      const stagePath = join(stage, entry.name),
        livePath = join(installRoot, entry.name);
      if (await exists(livePath)) fail();
      await rename(stagePath, livePath);
      await syncDir(stage);
      await syncDir(installRoot);
    }
    await rmdir(stage);
    if (stopAfterPhase === "AFTER_STAGE_RENAME")
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
    state.phase = "NEW_LIVE";
    await writeJournal(journalPath, state);
    if (stopAfterPhase === state.phase)
      throw Object.assign(Error("CRASH"), { simulatedCrash: true });
  } catch (error) {
    if (error?.simulatedCrash) throw error;
    let rollbackError = null;
    try {
      if (state)
        await rollbackTransaction({
          manifest,
          currentManifest,
          installRoot,
          stage,
          previous,
          journalPath,
          hadLive,
          expectedUid,
          expectedGid,
        });
      else
        await removeBoundStage(stage, manifest, {
          expectedUid,
          expectedGid,
        });
    } catch (caught) {
      rollbackError = caught;
    }
    throw rollbackError || error;
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
  await safeRemovePrevious(currentManifest, previous, {
    expectedUid,
    expectedGid,
  });
  await rm(journalPath);
  await syncDir(parentPath);
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
