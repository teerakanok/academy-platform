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
import { fileURLToPath } from "node:url";
import {
  CANDIDATE,
  executeReviewedAcademyProductionOperationInstall,
  inspectAcademyProductionOperationInstall,
} from "./academy-production-operation-install-command.mjs";
import { CURRENT_ENTRY_NAMES } from "./academy-production-operation-install.mjs";
import { renderOperationManifest } from "./render-academy-production-operation-manifest.mjs";

const IDENTITY = "identity-production-activation-preflight.mjs";
const digest = (value) =>
  createHash("sha256")
    .update(`${JSON.stringify(value)}\n`)
    .digest("hex");

// Install-set integrity gate.
//
// /opt/academy/production-operations is a flat directory holding exactly the
// installed set, so every local import made by an installed module must resolve
// to another member of that set. A member that imports a non-member leaves the
// privileged entrypoint unloadable (ERR_MODULE_NOT_FOUND) no matter how well the
// byte/sha pins match — the pins only prove the installed files are current, not
// that the set is complete. This gate runs before any fixture work so a set
// defect fails immediately.
const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
// The `\(?` after `import` is load-bearing. A bare side-effect import —
// `import "./x.mjs"` — carries no `from`, no `(` and no `require`, so a pattern
// that demands one of those cannot see it, and a set left open by such an edge
// would be reported closed. Assertion (a'') pins every form.
const LOCAL_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.\.?\/[^"']+)["']/g;
const SAME_DIRECTORY_SPECIFIER = /^\.\/[^/]+$/;
// Installed modules can also reach a sibling by absolute installed path at
// runtime instead of through the module graph.
const INSTALLED_SIBLING =
  /\/opt\/academy\/production-operations\/([\w.-]+\.mjs)/g;

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const localSpecifiersOf = (source) =>
  new Set(
    [...stripComments(source).matchAll(LOCAL_SPECIFIER)].map(
      ([, specifier]) => specifier,
    ),
  );

// Fixpoint walk. Dependencies are read from disk, never from the seed set, so
// the walk is able to leave the set and therefore able to detect an escape.
async function localImportClosure(seedNames) {
  const reached = new Set();
  const escapes = new Set();
  const queue = [...seedNames];
  while (queue.length > 0) {
    const name = queue.pop();
    if (reached.has(name)) continue;
    reached.add(name);
    for (const specifier of localSpecifiersOf(
      await readFile(join(SCRIPTS_DIR, name), "utf8"),
    )) {
      if (!SAME_DIRECTORY_SPECIFIER.test(specifier)) {
        escapes.add(specifier);
        continue;
      }
      queue.push(specifier.slice(2));
    }
  }
  for (const name of reached)
    if (!seedNames.includes(name)) escapes.add(name);
  return { reached, escapes: [...escapes].sort() };
}

const renderedEntries = (await renderOperationManifest({})).entries;
const renderedNames = renderedEntries.map(({ name }) => name);

// (a) the set is closed under its own local imports
assert.deepEqual(
  (await localImportClosure(renderedNames)).escapes,
  [],
  "installed set is not closed under its local imports",
);

// (a') the closure check genuinely exercises the hazard: dropping either module
// added for closure — or both, which is the exact pre-fix ten-name set — must be
// reported as an escape rather than silently passing.
for (const dropped of [
  ["academy-release-manifest.mjs"],
  ["academy-release-pointer.mjs"],
  ["academy-release-manifest.mjs", "academy-release-pointer.mjs"],
]) {
  const reduced = renderedNames.filter((name) => !dropped.includes(name));
  assert.deepEqual(
    (await localImportClosure(reduced)).escapes,
    [...dropped].sort(),
    `closure check failed to flag the missing member(s): ${dropped.join(", ")}`,
  );
}

// (a'') the extractor the closure walk is built on must recognise every import
// form an installed module can use to reach a sibling. (a') only removes names
// from the seed set, so it cannot expose an edge the extractor never emitted;
// an unseen form yields a clean closure over a set that is not closed, which is
// this defect verbatim.
assert.deepEqual(
  [
    ...localSpecifiersOf(
      [
        'import { a } from "./named.mjs";',
        "import b from './default.mjs';",
        'export * from "./reexport.mjs";',
        'await import("./dynamic.mjs");',
        'require("./required.mjs");',
        'import "./side-effect.mjs";',
        "import\n  './side-effect-wrapped.mjs';",
      ].join("\n"),
    ),
  ].sort(),
  [
    "./default.mjs",
    "./dynamic.mjs",
    "./named.mjs",
    "./reexport.mjs",
    "./required.mjs",
    "./side-effect-wrapped.mjs",
    "./side-effect.mjs",
  ],
  "specifier extractor is blind to an import form an installed module can use",
);

// (a''') edges the module graph cannot show: academy-production-p1-p7-ssh.mjs
// spawns /opt/academy/production-operations/academy-production-p1-p7-host.mjs by
// absolute installed path. Such a sibling must be a member for the same reason
// an imported one must be, so scan the literal paths as well.
const siblingReferences = new Set();
for (const name of renderedNames)
  for (const [, sibling] of stripComments(
    await readFile(join(SCRIPTS_DIR, name), "utf8"),
  ).matchAll(INSTALLED_SIBLING))
    siblingReferences.add(sibling);
assert.ok(
  siblingReferences.size > 0,
  "absolute installed-path scan matched nothing — the scan itself is broken",
);
assert.deepEqual(
  [...siblingReferences].filter((name) => !renderedNames.includes(name)).sort(),
  [],
  "an installed module names a sibling by absolute path that is not in the set",
);

// (b) renderer FILES, installer CURRENT_ENTRY_NAMES and install-command
// CANDIDATE name the same files in the same order — validateManifestAt compares
// entry.name to expectedNames[index], so order is load-bearing.
assert.deepEqual(
  renderedNames,
  [...CURRENT_ENTRY_NAMES],
  "renderer FILES and installer CURRENT_ENTRY_NAMES disagree",
);
assert.deepEqual(
  CANDIDATE.map(([name]) => name),
  renderedNames,
  "install-command CANDIDATE and renderer FILES disagree",
);
assert.deepEqual(
  CANDIDATE.map((entry) => [...entry]),
  renderedEntries.map(({ name, bytes, sha256, mode }) => [
    name,
    bytes,
    sha256,
    mode,
  ]),
  "install-command CANDIDATE does not match the rendered manifest",
);

// (c) every CANDIDATE pin equals the real file on disk, recomputed here rather
// than taken from the renderer.
for (const [name, bytes, sha256] of CANDIDATE) {
  const contents = await readFile(join(SCRIPTS_DIR, name));
  assert.equal(contents.length, bytes, `CANDIDATE byte length drifted: ${name}`);
  assert.equal(
    createHash("sha256").update(contents).digest("hex"),
    sha256,
    `CANDIDATE sha256 drifted: ${name}`,
  );
}

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

// The managed files the predecessor install actually holds, written out
// literally. Deriving this fixture from the current rendered set (previously
// "everything except IDENTITY") made it stop describing a real predecessor the
// moment the installed set grew.
const PREDECESSOR_NAMES = new Set([
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

async function legacyFixture(base, { collision = false } = {}) {
  const installRoot = join(base, "operations");
  await mkdir(installRoot, { recursive: true, mode: 0o700 });
  const manifest = await renderOperationManifest({});
  for (const entry of manifest.entries) {
    if (!PREDECESSOR_NAMES.has(entry.name)) continue;
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
