#!/usr/bin/env node
// Protected atomic current pointer: the single publication contract shared by
// the installer and the live helper. A plain mode-0400 regular file (never a
// symlink) at <installRoot>/current.json naming the exact releaseSha256 and
// releaseRevision of the live release plus the retained previous release, so
// rollback is actionable by atomically switching the pointer. The helper
// resolves /releases/<sha> through the pointer and fully verifies that tree
// before any provider execution; revalidation happens again immediately before
// spawn in the runner.

import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
  ACADEMY_RELEASE_MANIFEST_NAME,
  assertAcademyStableAncestry,
  exact,
  failAcademyRelease,
  readAcademyReleaseJson,
  syncAcademyDirectory,
  verifyAcademyRelease,
} from './academy-release-manifest.mjs'

export const ACADEMY_RELEASE_POINTER_SCHEMA = 'academy-release-pointer/v1'
export const ACADEMY_RELEASE_POINTER_NAME = 'current.json'
export const ACADEMY_RELEASE_REVISION_PATTERN = /^[a-f0-9]{40}$/

const SHA256 = /^[a-f0-9]{64}$/
const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

export const academyReleasePointerPath = installRoot => join(resolve(installRoot), ACADEMY_RELEASE_POINTER_NAME)
export const academyReleaseDirectory = installRoot => join(resolve(installRoot), 'releases')

export function validateAcademyReleasePointer(pointer) {
  if (!exact(pointer, ['schema','releaseSha256','releaseRevision','previousReleaseSha256','updatedAt'])
    || pointer.schema !== ACADEMY_RELEASE_POINTER_SCHEMA
    || !SHA256.test(pointer.releaseSha256)
    || !ACADEMY_RELEASE_REVISION_PATTERN.test(pointer.releaseRevision)
    || (pointer.previousReleaseSha256 !== null && !SHA256.test(pointer.previousReleaseSha256))
    || !ISO_SECOND.test(pointer.updatedAt)) failAcademyRelease()
  if (pointer.previousReleaseSha256 === pointer.releaseSha256) failAcademyRelease()
  return pointer
}

export async function readAcademyReleasePointer({ installRoot, fs = filesystem, processLike = process }) {
  const pointerPath = academyReleasePointerPath(installRoot)
  let handle
  try { handle = await fs.open(pointerPath, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o777) !== 0o400
      || metadata.uid !== processLike.getuid() || metadata.size > 4096) failAcademyRelease()
    return validateAcademyReleasePointer(JSON.parse(await handle.readFile('utf8')))
  } finally { await handle.close() }
}

export async function writeAcademyReleasePointer({ installRoot, pointer, fs = filesystem, processLike = process }) {
  validateAcademyReleasePointer(pointer)
  const root = resolve(installRoot)
  const target = join(root, ACADEMY_RELEASE_POINTER_NAME)
  const temporary = `${target}.tmp-${processLike.pid}`
  await assertAcademyStableAncestry(root, fs, processLike)
  const handle = await fs.open(temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
  try { await handle.writeFile(`${JSON.stringify(pointer)}\n`); await handle.sync() } finally { await handle.close() }
  try {
    await fs.rename(temporary, target)
    await syncAcademyDirectory(root, fs)
    await syncAcademyDirectory(dirname(root), fs)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

// Resolve the live release strictly through the pointer: the pointer digest
// names the exact release directory, the manifest inside must carry the same
// releaseSha256 and releaseRevision, and the whole tree is verified.
export async function resolveAcademyCurrentRelease({ installRoot, fs = filesystem, processLike = process }) {
  const pointer = await readAcademyReleasePointer({ installRoot, fs, processLike })
  if (pointer === null) failAcademyRelease()
  const release = await verifyAcademyRelease({
    root: join(academyReleaseDirectory(installRoot), pointer.releaseSha256), fs, processLike,
  })
  if (release.manifest.releaseSha256 !== pointer.releaseSha256
    || release.manifest.releaseRevision !== pointer.releaseRevision) failAcademyRelease()
  return Object.freeze({ pointer, release })
}

// Actionable rollback: verify the exact retained previous release still
// verifies, then atomically switch the pointer to it. Never touches file trees.
export async function rollbackAcademyRelease({ installRoot, expectedReleaseSha256, expectedReleaseRevision,
  now = new Date(), fs = filesystem, processLike = process }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) failAcademyRelease()
  if (expectedReleaseSha256 !== undefined && !SHA256.test(expectedReleaseSha256)) failAcademyRelease()
  if (expectedReleaseRevision !== undefined && !ACADEMY_RELEASE_REVISION_PATTERN.test(expectedReleaseRevision)) failAcademyRelease()
  const current = await resolveAcademyCurrentRelease({ installRoot, fs, processLike })
  if (expectedReleaseSha256 !== undefined && current.pointer.releaseSha256 !== expectedReleaseSha256) failAcademyRelease()
  if (expectedReleaseRevision !== undefined && current.pointer.releaseRevision !== expectedReleaseRevision) failAcademyRelease()
  const previousSha = current.pointer.previousReleaseSha256
  if (previousSha === null) failAcademyRelease()
  const previous = await verifyAcademyRelease({
    root: join(academyReleaseDirectory(installRoot), previousSha), fs, processLike,
  })
  if (previous.manifest.releaseSha256 !== previousSha) failAcademyRelease()
  await writeAcademyReleasePointer({ installRoot, fs, processLike, pointer: {
    schema: ACADEMY_RELEASE_POINTER_SCHEMA,
    releaseSha256: previousSha,
    releaseRevision: previous.manifest.releaseRevision,
    previousReleaseSha256: current.pointer.releaseSha256,
    updatedAt: now.toISOString(),
  } })
  return Object.freeze({ status: 'ROLLED_BACK',
    releaseSha256: previousSha, releaseRevision: previous.manifest.releaseRevision,
    previousReleaseSha256: current.pointer.releaseSha256 })
}

// Frozen release trees are non-writable by design; make an abandoned tree
// removable again (crash leftovers, failed staging) before recursive removal.
export async function forceRemoveAcademyTree(path, fs = filesystem) {
  const discard = async directory => {
    let entries
    try { entries = await fs.readdir(directory) } catch { return }
    for (const name of entries) {
      const full = join(directory, name)
      let metadata
      try { metadata = await fs.lstat(full) } catch { continue }
      if (metadata.isDirectory()) await fs.chmod(full, 0o700).catch(() => {})
      if (metadata.isDirectory()) await discard(full)
    }
    await fs.chmod(directory, 0o700).catch(() => {})
  }
  let metadata
  try { metadata = await fs.lstat(path) } catch { return }
  if (metadata.isDirectory()) await discard(path)
  await fs.rm(path, { recursive: true, force: true }).catch(() => {})
}

// Fail-closed residue reconcile: stale pointer temp files and stage leftovers
// are removed; an unknown entry inside releases/ that is not pointer-current,
// pointer-previous, or a verifiable release fails closed.
export async function reconcileAcademyInstallResidue({ installRoot, fs = filesystem, processLike = process }) {
  const root = resolve(installRoot)
  const pointer = await readAcademyReleasePointer({ installRoot: root, fs, processLike })
  if (pointer === null) failAcademyRelease()
  const releases = academyReleaseDirectory(root)
  const keep = new Set([pointer.releaseSha256, pointer.previousReleaseSha256])
  for (const name of await fs.readdir(releases)) {
    if (keep.has(name)) continue
    if (name.startsWith('.stage-') || name.startsWith('.pointer')) {
      await forceRemoveAcademyTree(join(releases, name), fs)
      continue
    }
    await verifyAcademyRelease({ root: join(releases, name), fs, processLike })
  }
  const pointerTemporary = join(root, `${ACADEMY_RELEASE_POINTER_NAME}.tmp-${processLike.pid}`)
  await fs.rm(pointerTemporary, { force: true }).catch(() => {})
  await syncAcademyDirectory(releases, fs)
  return Object.freeze({ status: 'CLEAN', releaseSha256: pointer.releaseSha256 })
}

export { ACADEMY_RELEASE_MANIFEST_NAME, readAcademyReleaseJson, verifyAcademyRelease }
