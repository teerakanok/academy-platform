#!/usr/bin/env node
// Offline release renderer: materializes a reviewable immutable release from
// pinned sources — the reviewed Node executable, a full reviewed Wrangler
// distribution directory (entrypoint plus dependencies/runtime files, exact
// inventory), and helper sources — and writes the exact manifest. File and
// directory owner/mode records come from the real post-write fstat, never from
// process assumptions, so setgid-parent inheritance is captured faithfully.
// No credentials are read or bundled; Wrangler auth stays runtime-injected.

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import {
  ACADEMY_RELEASE_DIRECTORY_MODES,
  ACADEMY_RELEASE_EXECUTABLE_MODE,
  ACADEMY_RELEASE_FILE_MODES,
  ACADEMY_RELEASE_MANIFEST_NAME,
  ACADEMY_RELEASE_MANIFEST_SCHEMA,
  assertAcademyStableAncestry,
  computeAcademyReleaseSha256,
  exact,
  failAcademyRelease,
  isAcademyReleasePath,
  syncAcademyDirectory,
} from './academy-release-manifest.mjs'

export const ACADEMY_RELEASE_NODE_PATH = 'node/bin/node'
export const ACADEMY_RELEASE_WRANGLER_PREFIX = 'wrangler'
export const ACADEMY_RELEASE_DIRECTORY_MODE = 0o555

const fileMode = value => ACADEMY_RELEASE_FILE_MODES.includes(value) ? value : failAcademyRelease()

async function readAcademyReleaseSource(sourcePath, fs) {
  if (typeof sourcePath !== 'string' || !sourcePath.startsWith('/')) failAcademyRelease()
  const handle = await fs.open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > 512 * 1024 * 1024) failAcademyRelease()
    return await handle.readFile()
  } finally { await handle.close() }
}

async function writeAcademyReleaseFile(destination, bytes, permissions, fs) {
  const handle = await fs.open(destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, permissions)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}

// Actual post-write metadata: on a setgid parent the kernel assigns the
// parent's gid, which can differ from the process gid — record what fstat says.
async function recordedFileMetadata(destination, fs) {
  const metadata = await fs.lstat(destination)
  if (!metadata.isFile()) failAcademyRelease()
  const mode = metadata.mode & 0o777
  if (!ACADEMY_RELEASE_FILE_MODES.includes(mode)) failAcademyRelease()
  return { mode, uid: metadata.uid, gid: metadata.gid, nlink: metadata.nlink }
}

// Exact reviewed inventory of the Wrangler distribution directory: deterministic
// sorted walk, no symlinks, no special files, no empty directories.
async function inventoryAcademyWranglerDirectory(sourceDirectory, fs) {
  const files = []
  const visit = async (directory, prefix) => {
    const names = (await fs.readdir(directory)).sort()
    if (names.length === 0) failAcademyRelease()
    for (const name of names) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) failAcademyRelease()
      const full = join(directory, name)
      const metadata = await fs.lstat(full)
      if (metadata.isSymbolicLink()) failAcademyRelease()
      if (metadata.isDirectory()) { await visit(full, prefix ? `${prefix}/${name}` : name); continue }
      if (!metadata.isFile()) failAcademyRelease()
      if (metadata.size > 512 * 1024 * 1024) failAcademyRelease()
      files.push({ relative: prefix ? `${prefix}/${name}` : name, absolute: full })
    }
  }
  await visit(resolve(sourceDirectory), '')
  return files
}

export async function renderAcademyRelease({ spec, stagingRoot, fs = filesystem, processLike = process }) {
  if (!exact(spec, ['releaseRevision','node','wrangler','helpers'])
    || !/^[a-f0-9]{40}$/.test(spec.releaseRevision)
    || !exact(spec.node, ['sourcePath'])
    || !exact(spec.wrangler, ['sourceDirectory','entrypoint'])
    || !Array.isArray(spec.helpers) || spec.helpers.length < 1
    || spec.helpers.some(helper => !exact(helper, ['sourcePath','path','mode']))) failAcademyRelease()
  if (!isAcademyReleasePath(spec.wrangler.entrypoint) || spec.wrangler.entrypoint.includes('..')) failAcademyRelease()
  if (typeof stagingRoot !== 'string' || !stagingRoot.startsWith('/')) failAcademyRelease()
  const root = resolve(stagingRoot)
  const directories = new Set()
  const entries = []
  const ensureDirectory = async directoryPath => {
    await fs.mkdir(directoryPath, { mode: 0o700, recursive: true })
    for (let cursor = directoryPath; cursor.startsWith(root) && cursor !== root && !directories.has(cursor); cursor = dirname(cursor)) directories.add(cursor)
  }
  const place = async (relativePath, sourcePath, permissions) => {
    if (!isAcademyReleasePath(relativePath)) failAcademyRelease()
    const bytes = await readAcademyReleaseSource(sourcePath, fs)
    const destination = join(root, relativePath)
    await ensureDirectory(dirname(destination))
    await writeAcademyReleaseFile(destination, bytes, permissions, fs)
    const metadata = await recordedFileMetadata(destination, fs)
    entries.push({ path: relativePath, sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length, mode: metadata.mode, uid: metadata.uid, gid: metadata.gid, nlink: metadata.nlink })
  }

  await fs.mkdir(root, { mode: 0o700, recursive: true })
  await assertAcademyStableAncestry(root, fs, processLike)

  await place(ACADEMY_RELEASE_NODE_PATH, spec.node.sourcePath, ACADEMY_RELEASE_EXECUTABLE_MODE)

  const wranglerFiles = await inventoryAcademyWranglerDirectory(spec.wrangler.sourceDirectory, fs)
  const entrypointRelative = `${ACADEMY_RELEASE_WRANGLER_PREFIX}/${spec.wrangler.entrypoint}`
  if (!wranglerFiles.some(file => file.relative === spec.wrangler.entrypoint)) failAcademyRelease()
  for (const file of wranglerFiles) {
    const permissions = file.relative === spec.wrangler.entrypoint ? ACADEMY_RELEASE_EXECUTABLE_MODE : 0o444
    await place(`${ACADEMY_RELEASE_WRANGLER_PREFIX}/${file.relative}`, file.absolute, permissions)
  }

  const helpers = []
  for (const helper of spec.helpers) {
    if (!isAcademyReleasePath(helper.path)) failAcademyRelease()
    helpers.push(helper.path)
    await place(helper.path, helper.sourcePath, fileMode(helper.mode))
  }

  entries.sort((a, b) => (a.path < b.path ? -1 : 1))
  // Freeze staged subdirectories to their final non-writable mode and record
  // actual ownership so setgid inheritance is captured, not assumed.
  const directoryRecords = []
  for (const directory of [...directories].sort().reverse()) {
    await fs.chmod(directory, ACADEMY_RELEASE_DIRECTORY_MODE)
    const metadata = await fs.lstat(directory)
    if (!metadata.isDirectory()) failAcademyRelease()
    directoryRecords.push({ path: relative(root, directory), mode: metadata.mode & 0o777,
      uid: metadata.uid, gid: metadata.gid })
  }
  if (!directoryRecords.every(record => ACADEMY_RELEASE_DIRECTORY_MODES.includes(record.mode))) failAcademyRelease()
  directoryRecords.sort((a, b) => (a.path < b.path ? -1 : 1))

  const manifest = { schema: ACADEMY_RELEASE_MANIFEST_SCHEMA, releaseRevision: spec.releaseRevision,
    releaseSha256: '', executables: { node: ACADEMY_RELEASE_NODE_PATH, wrangler: entrypointRelative },
    helpers: [...helpers], directories: directoryRecords, entries }
  manifest.releaseSha256 = computeAcademyReleaseSha256(manifest)
  await writeAcademyReleaseFile(join(root, ACADEMY_RELEASE_MANIFEST_NAME),
    Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'), 0o444, fs)
  await fs.chmod(root, ACADEMY_RELEASE_DIRECTORY_MODE)
  await syncAcademyDirectory(root, fs)
  for (const directory of [...directories].sort().reverse()) await syncAcademyDirectory(directory, fs)
  return Object.freeze({ root, manifest: Object.freeze(JSON.parse(JSON.stringify(manifest))) })
}
