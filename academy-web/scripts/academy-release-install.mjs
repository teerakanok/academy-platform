#!/usr/bin/env node
// Immutable release installer: copies a verified release into protected
// staging under the install root, fsyncs files and directory ancestry, then
// publishes with atomic no-clobber semantics keyed by the release sha. A
// prior immutable release is never overwritten, and an exact rollback
// authority is retained. Idempotent: re-running for the same release verifies
// the installed tree and performs no writes.

import { createHash } from 'node:crypto'
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

export const ACADEMY_RELEASE_ROLLBACK_AUTHORITY_SCHEMA = 'academy-release-rollback-authority/v1'
const SHA256 = /^[a-f0-9]{64}$/
const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

let stageSequence = 0

async function readRollbackAuthority(path, fs, processLike) {
  try {
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const metadata = await handle.stat()
      if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o777) !== 0o400
        || metadata.uid !== processLike.getuid() || metadata.size > 4096) failAcademyRelease()
      return JSON.parse(await handle.readFile('utf8'))
    } finally { await handle.close() }
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function writeRollbackAuthority(path, value, fs) {
  const target = resolve(path)
  const temporary = `${target}.tmp-${process.pid}`
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync() } finally { await handle.close() }
  try { await fs.rename(temporary, target); await syncAcademyDirectory(dirname(target), fs) }
  catch (error) { await fs.rm(temporary, { force: true }); throw error }
}

async function copyEntry(sourceRoot, stage, entry, fs) {
  const source = join(sourceRoot, entry.path)
  const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o777) !== entry.mode
      || metadata.uid !== entry.uid || metadata.gid !== entry.gid || metadata.size !== entry.size) failAcademyRelease()
    bytes = await handle.readFile()
  } finally { await handle.close() }
  if (bytes.length !== entry.size
    || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) failAcademyRelease()
  const destination = join(stage, entry.path)
  await fs.mkdir(dirname(destination), { mode: 0o755, recursive: true })
  const writer = await fs.open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, entry.mode)
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
  if (children.length === 0) return 'placeholder'
  try { await verifyAcademyRelease({ root: target, fs, processLike }) } catch { return 'foreign' }
  const installed = await readAcademyReleaseJson(join(target, ACADEMY_RELEASE_MANIFEST_NAME), fs)
  if (installed.releaseSha256 !== manifest.releaseSha256) failAcademyRelease()
  return 'verified'
}

export async function installAcademyRelease({ sourceRoot, installRoot, now = new Date(), fs = filesystem, processLike = process }) {
  if (typeof sourceRoot !== 'string' || typeof installRoot !== 'string'
    || !sourceRoot.startsWith('/') || !installRoot.startsWith('/')) failAcademyRelease()
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) failAcademyRelease()
  const root = resolve(installRoot)
  const source = await verifyAcademyRelease({ root: sourceRoot, fs, processLike })
  const manifest = source.manifest
  await assertAcademyStableAncestry(root, fs, processLike)
  const rootMetadata = await fs.stat(root)
  if (!rootMetadata.isDirectory() || rootMetadata.uid !== processLike.getuid()) failAcademyRelease()
  const releases = join(root, 'releases')
  await fs.mkdir(releases, { mode: 0o755, recursive: true })
  const target = join(releases, manifest.releaseSha256)
  const authorityPath = join(root, 'rollback-authority.json')

  let state = await inspectExistingTarget(target, manifest, fs, processLike)
  if (state === 'foreign') failAcademyRelease()
  if (state === 'placeholder') {
    await fs.rmdir(target)
    await syncAcademyDirectory(releases, fs)
    state = await inspectExistingTarget(target, manifest, fs, processLike)
    if (state !== 'absent') failAcademyRelease()
  }
  if (state === 'absent') {
    const stage = join(releases, `.stage-${process.pid}-${stageSequence++}`)
    await fs.mkdir(stage, { mode: 0o700 })
    try {
      for (const entry of manifest.entries) await copyEntry(source.root, stage, entry, fs)
      const handle = await fs.open(join(stage, ACADEMY_RELEASE_MANIFEST_NAME),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444)
      try { await handle.writeFile(`${JSON.stringify(manifest)}\n`); await handle.sync() } finally { await handle.close() }
      await verifyAcademyRelease({ root: stage, fs, processLike })
      await fs.mkdir(target, { mode: 0o700 })
      try { await fs.rename(stage, target) }
      catch (error) {
        await fs.rmdir(target).catch(() => {})
        state = await inspectExistingTarget(target, manifest, fs, processLike)
        if (error.code !== 'ENOTEMPTY' || state !== 'verified') throw error
      }
      await syncAcademyDirectory(target, fs)
      await syncAcademyDirectory(releases, fs)
      await syncAcademyDirectory(root, fs)
    } catch (error) {
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  const prior = await readRollbackAuthority(authorityPath, fs, processLike)
  if (prior !== null && !exact(prior, ['schema','releaseSha256','previousReleaseSha256','installedAt'])
    || prior !== null && (prior.schema !== ACADEMY_RELEASE_ROLLBACK_AUTHORITY_SCHEMA
      || !SHA256.test(prior.releaseSha256)
      || (prior.previousReleaseSha256 !== null && !SHA256.test(prior.previousReleaseSha256))
      || !ISO_SECOND.test(prior.installedAt))) failAcademyRelease()
  let status = 'IDEMPOTENT'
  if (prior?.releaseSha256 !== manifest.releaseSha256) {
    await writeRollbackAuthority(authorityPath, { schema: ACADEMY_RELEASE_ROLLBACK_AUTHORITY_SCHEMA,
      releaseSha256: manifest.releaseSha256,
      previousReleaseSha256: prior ? prior.releaseSha256 : null,
      installedAt: now.toISOString() }, fs)
    status = 'INSTALLED'
  }
  return Object.freeze({ status, releaseSha256: manifest.releaseSha256,
    previousReleaseSha256: prior ? prior.releaseSha256 : null })
}
