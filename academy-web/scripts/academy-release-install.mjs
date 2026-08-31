#!/usr/bin/env node
// Immutable release installer: verifies the reviewed source exactly, copies its
// ownership-independent release identity into protected staging under the
// install root, derives the installed manifest owner from actual fstat values,
// and verifies the staged tree before publication. Publication is atomic and
// no-clobber, keyed by release digest; the current pointer switches atomically
// and prior releases remain immutable for rollback. The operator-supplied
// external digest still prevents a self-consistent substituted release.

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import {
  ACADEMY_RELEASE_MANIFEST_NAME,
  assertAcademyStableAncestry,
  computeAcademyReleaseSha256,
  failAcademyRelease,
  readAcademyReleaseJson,
  syncAcademyDirectory,
  validateAcademyReleaseManifest,
  verifyAcademyRelease,
} from './academy-release-manifest.mjs'
import {
  academyReleaseDirectory,
  readAcademyReleasePointer,
  writeAcademyReleasePointer,
  forceRemoveAcademyTree,
  ACADEMY_RELEASE_POINTER_SCHEMA,
} from './academy-release-pointer.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/

let stageSequence = 0

const stageDirectoryName = (manifest, processLike) =>
  `.stage-${manifest.releaseSha256}-${processLike.pid}-${stageSequence++}`

async function copyEntry(sourceRoot, stage, entry, fs) {
  const source = join(sourceRoot, entry.path)
  const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== entry.nlink || (metadata.mode & 0o777) !== entry.mode
      || metadata.uid !== entry.uid || metadata.gid !== entry.gid || metadata.size !== entry.size) failAcademyRelease()
    bytes = await handle.readFile()
  } finally { await handle.close() }
  if (bytes.length !== entry.size
    || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) failAcademyRelease()
  const destination = join(stage, entry.path)
  const writer = await fs.open(destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, entry.mode)
  try {
    await writer.writeFile(bytes)
    await fs.chmod(destination, entry.mode)
    await writer.sync()
  } finally { await writer.close() }
}

async function rebindAcademyReleaseManifest(sourceRoot, manifest, fs) {
  const directoryRecords = []
  const entryRecords = []
  let identity
  const bindIdentity = metadata => {
    if (!Number.isSafeInteger(metadata.uid) || metadata.uid < 0
      || !Number.isSafeInteger(metadata.gid) || metadata.gid < 0) failAcademyRelease()
    identity ??= { uid: metadata.uid, gid: metadata.gid }
    if (metadata.uid !== identity.uid || metadata.gid !== identity.gid) failAcademyRelease()
  }
  bindIdentity(await fs.lstat(sourceRoot))
  for (const directory of manifest.directories) {
    const metadata = await fs.lstat(join(sourceRoot, directory.path))
    if (!metadata.isDirectory() || (metadata.mode & 0o777) !== directory.mode) failAcademyRelease()
    bindIdentity(metadata)
    directoryRecords.push({ path: directory.path, mode: directory.mode,
      uid: metadata.uid, gid: metadata.gid })
  }
  for (const entry of manifest.entries) {
    const path = join(sourceRoot, entry.path)
    const metadata = await fs.lstat(path)
    if (!metadata.isFile() || metadata.nlink !== entry.nlink
      || (metadata.mode & 0o777) !== entry.mode || metadata.size !== entry.size) failAcademyRelease()
    bindIdentity(metadata)
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    let bytes
    try { bytes = await handle.readFile() } finally { await handle.close() }
    if (bytes.length !== entry.size
      || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) failAcademyRelease()
    entryRecords.push({ path: entry.path, sha256: entry.sha256, size: entry.size,
      mode: entry.mode, uid: metadata.uid, gid: metadata.gid, nlink: entry.nlink })
  }
  const rebound = { ...manifest,
    directories: directoryRecords,
    entries: entryRecords,
  }
  if (computeAcademyReleaseSha256(rebound) !== manifest.releaseSha256) failAcademyRelease()
  validateAcademyReleaseManifest(rebound)
  return rebound
}

async function inspectExistingTarget(target, manifest, fs, processLike) {
  let metadata
  try { metadata = await fs.stat(target) } catch (error) {
    if (error.code === 'ENOENT') return 'absent'
    throw error
  }
  if (!metadata.isDirectory()) failAcademyRelease()
  const children = await fs.readdir(target)
  if (children.length === 0) return 'foreign'
  // Verify the entire crash-window tree before changing its root mode.
  const crashWindow = (metadata.mode & 0o777) === 0o700
  try { await verifyAcademyRelease({ root: target, fs, processLike,
    ...(crashWindow ? { acceptedRootModes:[0o700] } : {}) }) } catch { return 'foreign' }
  const installed = await readAcademyReleaseJson(join(target, ACADEMY_RELEASE_MANIFEST_NAME), fs)
  if (installed.releaseSha256 !== manifest.releaseSha256) failAcademyRelease()
  return crashWindow ? 'crash-window' : 'verified'
}

const stageMarker = manifest => `${JSON.stringify({ schema:'academy-release-install-stage/v1',
  releaseSha256:manifest.releaseSha256, releaseRevision:manifest.releaseRevision })}\n`

async function verifyStageMarker(path, manifest, fs, processLike) {
  const metadata = await fs.lstat(path)
  const handle = await fs.open(path, constants.O_RDONLY|constants.O_NOFOLLOW)
  let markerBytes
  try { markerBytes = await handle.readFile('utf8') } finally { await handle.close() }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
    || metadata.uid !== processLike.getuid() || (metadata.mode & 0o777) !== 0o400
    || markerBytes !== stageMarker(manifest)) failAcademyRelease()
}

async function exactOwnedStage(stage, manifest, fs, processLike) {
  const stageMetadata = await fs.lstat(stage)
  if (!stageMetadata.isDirectory() || stageMetadata.isSymbolicLink()
    || ![0o555, 0o700].includes(stageMetadata.mode & 0o777)
    || stageMetadata.uid !== processLike.getuid()) failAcademyRelease()
  const verified = await verifyAcademyRelease({ root: stage, fs, processLike,
    acceptedRootModes: [0o555, 0o700] })
  if (verified.manifest.releaseSha256 !== manifest.releaseSha256
    || verified.manifest.releaseRevision !== manifest.releaseRevision) failAcademyRelease()
}

async function ensureReleaseDirectory(path, fs, processLike) {
  await fs.mkdir(path, { mode: 0o755, recursive: true })
  await fs.chmod(path, 0o755)
  const metadata = await fs.stat(path)
  if (!metadata.isDirectory() || metadata.uid !== processLike.getuid()
    || (metadata.mode & 0o777) !== 0o755) failAcademyRelease()
}

async function inspectStages(releases, manifest, fs, processLike, remove = false) {
  const ownedPaths=[]
  let foreign = 0
  let names
  try { names=await fs.readdir(releases) } catch (error) {
    if (error.code === 'ENOENT') return {owned:0,foreign}
    throw error
  }
  for (const name of names) {
    if (!name.startsWith('.stage-')) continue
    const stage=join(releases,name), marker=join(stage,'.academy-install-owned')
    try {
      try {
        await verifyStageMarker(marker, manifest, fs, processLike)
        ownedPaths.push(stage)
        continue
      } catch (error) {
        if (!name.startsWith(`.stage-${manifest.releaseSha256}-`)) throw error
      }
      await exactOwnedStage(stage, manifest, fs, processLike)
      ownedPaths.push(stage)
    } catch { foreign++ }
  }
  if (remove && foreign === 0) for (const stage of ownedPaths) await forceRemoveAcademyTree(stage,fs)
  return {owned:ownedPaths.length,foreign}
}

export async function diagnoseAcademyInstall({ sourceRoot, installRoot, expectedReleaseSha256,
  expectedReleaseRevision, fs = filesystem, processLike = process }) {
  const source=await verifyAcademyRelease({root:sourceRoot,fs,processLike}), manifest=source.manifest
  if (manifest.releaseSha256 !== expectedReleaseSha256 || manifest.releaseRevision !== expectedReleaseRevision) failAcademyRelease()
  const root=resolve(installRoot)
  await assertAcademyStableAncestry(root,fs,processLike)
  const releases=academyReleaseDirectory(root), target=join(releases,manifest.releaseSha256)
  const targetState=await inspectExistingTarget(target,manifest,fs,processLike)
  const residues=await inspectStages(releases,manifest,fs,processLike)
  const reason=targetState==='verified'?'EXACT_CANDIDATE':targetState==='crash-window'?'CRASH_WINDOW_0700'
    :targetState==='foreign'?'FOREIGN_TARGET':residues.foreign?'FOREIGN_STAGE'
      :residues.owned?'OWNED_STAGE_RECOVERABLE':'TARGET_ABSENT'
  return Object.freeze({schema:'academy-release-install-diagnostic/v1',status:'INSPECTED',reason})
}

export async function installAcademyRelease({ sourceRoot, installRoot, expectedReleaseSha256, expectedReleaseRevision,
  now = new Date(), fs = filesystem, processLike = process }) {
  if (typeof sourceRoot !== 'string' || typeof installRoot !== 'string'
    || !sourceRoot.startsWith('/') || !installRoot.startsWith('/')) failAcademyRelease()
  if (typeof expectedReleaseSha256 !== 'string' || !SHA256.test(expectedReleaseSha256)
    || typeof expectedReleaseRevision !== 'string' || !REVISION.test(expectedReleaseRevision)) failAcademyRelease()
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) failAcademyRelease()
  const root = resolve(installRoot)
  const source = await verifyAcademyRelease({ root: sourceRoot, fs, processLike })
  const manifest = source.manifest
  // External binding: the reviewed digest/revision must match, so a
  // self-consistent substituted manifest cannot pass on its own.
  if (manifest.releaseSha256 !== expectedReleaseSha256
    || manifest.releaseRevision !== expectedReleaseRevision) failAcademyRelease()
  await assertAcademyStableAncestry(root, fs, processLike)
  const rootMetadata = await fs.stat(root)
  if (!rootMetadata.isDirectory() || rootMetadata.uid !== processLike.getuid()) failAcademyRelease()
  const releases = academyReleaseDirectory(root)
  await ensureReleaseDirectory(releases, fs, processLike)
  const target = join(releases, manifest.releaseSha256)
  const prior = await readAcademyReleasePointer({ installRoot: root, fs, processLike })
  if (prior !== null && prior.releaseSha256 !== manifest.releaseSha256) {
    const predecessor = await verifyAcademyRelease({
      root: join(releases, prior.releaseSha256), fs, processLike,
    })
    if (predecessor.manifest.releaseSha256 !== prior.releaseSha256
      || predecessor.manifest.releaseRevision !== prior.releaseRevision) failAcademyRelease()
  }

  let state = await inspectExistingTarget(target, manifest, fs, processLike)
  if (state === 'foreign') failAcademyRelease()
  if (state === 'crash-window') {
    await fs.chmod(target,0o555)
    await verifyAcademyRelease({root:target,fs,processLike})
    state='verified'
  }
  if (state === 'absent') {
    const residues=await inspectStages(releases,manifest,fs,processLike,true)
    if (residues.foreign) failAcademyRelease()
    const stage = join(releases, stageDirectoryName(manifest, processLike))
    const releasesMetadata = await fs.stat(releases)
    await fs.mkdir(stage, { mode: 0o700 })
    await fs.chown(stage, processLike.getuid(), releasesMetadata.gid)
    await fs.chmod(stage, 0o2700)
    const stagedDirectories = new Set()
    try {
      const marker=await fs.open(join(stage,'.academy-install-owned'),
        constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400)
      try { await marker.writeFile(stageMarker(manifest)); await marker.sync() } finally { await marker.close() }
      const markerPath=join(stage,'.academy-install-owned')
      await fs.chmod(markerPath,0o400)
      await verifyStageMarker(markerPath,manifest,fs,processLike)
      for (const entry of manifest.entries) {
        await fs.mkdir(dirname(join(stage, entry.path)), { mode: 0o700, recursive: true })
        for (let cursor = dirname(join(stage, entry.path)); cursor.startsWith(stage) && cursor !== stage && !stagedDirectories.has(cursor); cursor = dirname(cursor)) stagedDirectories.add(cursor)
        await copyEntry(source.root, stage, entry, fs)
      }
      // Freeze staged subdirectories to the reviewed non-writable modes.
      for (const directory of [...stagedDirectories].sort().reverse()) {
        const record = manifest.directories.find(item => item.path === relative(stage, directory))
        if (record === undefined) failAcademyRelease()
        await fs.chmod(directory, record.mode)
        await syncAcademyDirectory(directory, fs)
      }
      const stagedManifest = await rebindAcademyReleaseManifest(stage, manifest, fs)
      const handle = await fs.open(join(stage, ACADEMY_RELEASE_MANIFEST_NAME),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444)
      try {
        await handle.writeFile(`${JSON.stringify(stagedManifest)}\n`)
        await fs.chmod(join(stage, ACADEMY_RELEASE_MANIFEST_NAME), 0o444)
        await handle.sync()
      } finally { await handle.close() }
      // Freeze for verification, then unfreeze for the rename. Publish directly
      // to the previously absent digest path: a concurrent completed winner is
      // non-empty and cannot be replaced by a directory rename.
      await fs.rm(join(stage,'.academy-install-owned'))
      await fs.chmod(stage, 0o555)
      await verifyAcademyRelease({ root: stage, fs, processLike })
      await fs.chmod(stage, 0o700)
      try { await fs.rename(stage, target) }
      catch (error) {
        state = await inspectExistingTarget(target, manifest, fs, processLike)
        if (!['EEXIST','ENOTEMPTY'].includes(error.code) || state !== 'verified') throw error
        await inspectStages(releases, manifest, fs, processLike, true)
      }
      await fs.chmod(target, 0o555)
      await syncAcademyDirectory(target, fs)
      await syncAcademyDirectory(releases, fs)
      await syncAcademyDirectory(root, fs)
    } catch (error) {
      await forceRemoveAcademyTree(stage, fs)
      throw error
    }
  }

  let status = 'IDEMPOTENT'
  if (prior?.releaseSha256 !== manifest.releaseSha256) {
    await writeAcademyReleasePointer({ installRoot: root, fs, processLike, pointer: {
      schema: ACADEMY_RELEASE_POINTER_SCHEMA,
      releaseSha256: manifest.releaseSha256,
      releaseRevision: manifest.releaseRevision,
      previousReleaseSha256: prior ? prior.releaseSha256 : null,
      updatedAt: now.toISOString(),
    } })
    status = 'INSTALLED'
  }
  return Object.freeze({ status, releaseSha256: manifest.releaseSha256,
    releaseRevision: manifest.releaseRevision,
    previousReleaseSha256: prior ? prior.releaseSha256 : null })
}
