#!/usr/bin/env node
// Immutable release installer: copies a verified release into protected
// staging under the install root, fsyncs every staged subdirectory and the
// full publication/pointer ancestry, then publishes with atomic no-clobber
// semantics keyed by the release sha and atomically switches the protected
// current pointer — the single publication contract the live helper reads. The
// operator must supply the externally reviewed expected release digest and
// revision; a self-consistent substituted manifest that does not match the
// external binding never passes. A prior immutable release is never
// overwritten; rollback is actionable by atomically switching the pointer.

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import {
  ACADEMY_RELEASE_MANIFEST_NAME,
  assertAcademyStableAncestry,
  failAcademyRelease,
  readAcademyReleaseJson,
  syncAcademyDirectory,
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
  try { await writer.writeFile(bytes); await writer.sync() } finally { await writer.close() }
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
      const metadata=await fs.lstat(marker)
      const handle=await fs.open(marker,constants.O_RDONLY|constants.O_NOFOLLOW)
      let markerBytes
      try { markerBytes=await handle.readFile('utf8') } finally { await handle.close() }
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
        || metadata.uid !== processLike.getuid() || (metadata.mode & 0o777) !== 0o400
        || markerBytes.toString() !== stageMarker(manifest)) { foreign++; continue }
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
  await fs.mkdir(releases, { mode: 0o755, recursive: true })
  const target = join(releases, manifest.releaseSha256)

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
    const stage = join(releases, `.stage-${processLike.pid}-${stageSequence++}`)
    await fs.mkdir(stage, { mode: 0o700 })
    const stagedDirectories = new Set()
    try {
      const marker=await fs.open(join(stage,'.academy-install-owned'),
        constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400)
      try { await marker.writeFile(stageMarker(manifest)); await marker.sync() } finally { await marker.close() }
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
      const handle = await fs.open(join(stage, ACADEMY_RELEASE_MANIFEST_NAME),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444)
      try { await handle.writeFile(`${JSON.stringify(manifest)}\n`); await handle.sync() } finally { await handle.close() }
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

  const prior = await readAcademyReleasePointer({ installRoot: root, fs, processLike })
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
