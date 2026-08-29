#!/usr/bin/env node
// Immutable release manifest v2: exact file inventory (sha256, mode, uid, gid,
// nlink recorded from the real post-write fstat, never assumed from the
// process) plus an exact directory inventory (owner/mode). Directories must be
// non-writable. Every release consumer (installer, helpers) verifies the full
// tree — including foreign entries and substituted directories — before
// trusting anything inside the release.

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const ACADEMY_RELEASE_MANIFEST_SCHEMA = 'academy-release-manifest/v2'
export const ACADEMY_RELEASE_MANIFEST_NAME = 'manifest.json'
export const ACADEMY_RELEASE_FILE_MODES = Object.freeze([0o400, 0o444, 0o500, 0o555])
export const ACADEMY_RELEASE_DIRECTORY_MODES = Object.freeze([0o500, 0o555])
export const ACADEMY_RELEASE_EXECUTABLE_MODE = 0o555

const SHA256 = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const failAcademyRelease = () => { throw new Error('Academy release verification failed') }

export const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every((key, index) => key === keys[index])

export function isAcademyReleasePath(value) {
  if (typeof value !== 'string' || !value || value.length > 256 || value.includes('\0')) return false
  const segments = value.split('/')
  return segments.length > 0 && segments.length <= 16
    && segments.every(segment => SEGMENT.test(segment) && segment !== '.' && segment !== '..')
}

export function computeAcademyReleaseSha256(manifest) {
  return createHash('sha256').update(`${JSON.stringify({
    schema: manifest.schema, releaseRevision: manifest.releaseRevision,
    executables: manifest.executables, helpers: manifest.helpers,
    directories: manifest.directories, entries: manifest.entries,
  })}\n`).digest('hex')
}

export function validateAcademyReleaseManifest(manifest) {
  if (!exact(manifest, ['schema','releaseRevision','releaseSha256','executables','helpers','directories','entries'])
    || manifest.schema !== ACADEMY_RELEASE_MANIFEST_SCHEMA
    || !REVISION.test(manifest.releaseRevision) || !SHA256.test(manifest.releaseSha256)
    || !exact(manifest.executables, ['node','wrangler'])
    || !isAcademyReleasePath(manifest.executables.node) || !isAcademyReleasePath(manifest.executables.wrangler)
    || !Array.isArray(manifest.helpers) || manifest.helpers.length < 1
    || manifest.helpers.some(helper => !isAcademyReleasePath(helper))
    || !Array.isArray(manifest.directories) || manifest.directories.length < 1
    || !Array.isArray(manifest.entries) || manifest.entries.length < 3) failAcademyRelease()
  const directoryPaths = manifest.directories.map(directory => directory.path)
  if (directoryPaths.some((path, index) => index > 0 && directoryPaths[index - 1] >= path)) failAcademyRelease()
  const { uid, gid } = manifest.entries[0]
  for (const directory of manifest.directories) {
    if (!exact(directory, ['path','mode','uid','gid'])
      || !isAcademyReleasePath(directory.path) || !ACADEMY_RELEASE_DIRECTORY_MODES.includes(directory.mode)
      || !Number.isSafeInteger(directory.uid) || directory.uid < 0 || directory.uid !== uid
      || !Number.isSafeInteger(directory.gid) || directory.gid < 0 || directory.gid !== gid) failAcademyRelease()
  }
  const paths = manifest.entries.map(entry => entry.path)
  if (paths.some((path, index) => index > 0 && paths[index - 1] >= path)) failAcademyRelease()
  const names = new Set(paths)
  const covered = new Set(directoryPaths)
  for (const entry of manifest.entries) {
    if (!exact(entry, ['path','sha256','size','mode','uid','gid','nlink'])
      || !isAcademyReleasePath(entry.path) || !SHA256.test(entry.sha256)
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 512 * 1024 * 1024
      || !ACADEMY_RELEASE_FILE_MODES.includes(entry.mode)
      || !Number.isSafeInteger(entry.uid) || entry.uid < 0 || entry.uid !== uid
      || !Number.isSafeInteger(entry.gid) || entry.gid < 0 || entry.gid !== gid
      || entry.nlink !== 1) failAcademyRelease()
    // Every intermediate directory of every file must be inventoried exactly.
    const parent = dirname(entry.path)
    if (parent !== '.' && !covered.has(parent)) failAcademyRelease()
  }
  for (const directory of directoryPaths) {
    const parent = dirname(directory)
    if (parent !== '.' && !covered.has(parent)) failAcademyRelease()
  }
  if (!names.has(manifest.executables.node) || !names.has(manifest.executables.wrangler)) failAcademyRelease()
  for (const helper of manifest.helpers) if (!names.has(helper)) failAcademyRelease()
  if (computeAcademyReleaseSha256(manifest) !== manifest.releaseSha256) failAcademyRelease()
  return { manifest, uid, gid }
}

export async function assertAcademyStableAncestry(path, fs = filesystem, processLike = process) {
  let cursor = dirname(resolve(path))
  while (true) {
    if (await fs.realpath(cursor) !== cursor) failAcademyRelease()
    const metadata = await fs.stat(cursor)
    const stickyRoot = metadata.uid === 0 && Boolean(metadata.mode & 0o1000)
    if (!metadata.isDirectory() || (metadata.uid !== processLike.getuid() && metadata.uid !== 0)
      || ((metadata.mode & 0o022) && !stickyRoot)) failAcademyRelease()
    const next = dirname(cursor)
    if (next === cursor) return
    cursor = next
  }
}

export async function readAcademyReleaseJson(path, fs = filesystem) {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size < 2 || metadata.size > 1024 * 1024) failAcademyRelease()
    const source = await handle.readFile('utf8')
    const value = JSON.parse(source)
    if (source !== `${JSON.stringify(value)}\n`) failAcademyRelease()
    return value
  } finally { await handle.close() }
}

export async function syncAcademyDirectory(path, fs = filesystem) {
  const handle = await fs.open(path, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function walkAcademyReleaseTree(root, fs) {
  const files = []
  const directories = []
  const visit = async (directory, prefix) => {
    for (const name of (await fs.readdir(directory)).sort()) {
      if (!SEGMENT.test(name)) failAcademyRelease()
      const full = `${directory}/${name}`
      const relative = prefix ? `${prefix}/${name}` : name
      const metadata = await fs.lstat(full)
      if (metadata.isSymbolicLink()) failAcademyRelease()
      if (metadata.isDirectory()) {
        directories.push({ path: relative, mode: metadata.mode & 0o777, uid: metadata.uid, gid: metadata.gid })
        await visit(full, relative)
        continue
      }
      if (!metadata.isFile()) failAcademyRelease()
      files.push(relative)
    }
  }
  await visit(root, '')
  return { files, directories }
}

export async function verifyAcademyRelease({ root, fs = filesystem, processLike = process }) {
  if (typeof root !== 'string' || !root.startsWith('/') || root.includes('\0')) failAcademyRelease()
  const releaseRoot = resolve(root)
  const manifestPath = join(releaseRoot, ACADEMY_RELEASE_MANIFEST_NAME)
  await assertAcademyStableAncestry(releaseRoot, fs, processLike)
  if (await fs.realpath(releaseRoot) !== releaseRoot) failAcademyRelease()
  const releaseRootMetadata = await fs.lstat(releaseRoot)
  if (releaseRootMetadata.isSymbolicLink() || !releaseRootMetadata.isDirectory()
    || !ACADEMY_RELEASE_DIRECTORY_MODES.includes(releaseRootMetadata.mode & 0o777)) failAcademyRelease()
  const { manifest, uid, gid } = validateAcademyReleaseManifest(await readAcademyReleaseJson(manifestPath, fs))
  const selfMetadata = await fs.lstat(manifestPath)
  if (selfMetadata.isSymbolicLink() || !selfMetadata.isFile() || selfMetadata.nlink !== 1
    || (selfMetadata.mode & 0o777) !== 0o444 || selfMetadata.uid !== uid || selfMetadata.gid !== gid) failAcademyRelease()
  const { files: present, directories: presentDirectories } = await walkAcademyReleaseTree(releaseRoot, fs)
  const expectedFiles = [...manifest.entries.map(entry => entry.path), ACADEMY_RELEASE_MANIFEST_NAME].sort()
  if (JSON.stringify(present) !== JSON.stringify(expectedFiles)) failAcademyRelease()
  const expectedDirectories = manifest.directories
    .map(directory => ({ path: directory.path, mode: directory.mode, uid: directory.uid, gid: directory.gid }))
  if (JSON.stringify(presentDirectories) !== JSON.stringify(expectedDirectories)) failAcademyRelease()
  for (const entry of manifest.entries) {
    const full = join(releaseRoot, entry.path)
    if (await fs.realpath(full) !== full) failAcademyRelease()
    const linkMetadata = await fs.lstat(full)
    if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) failAcademyRelease()
    const handle = await fs.open(full, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const metadata = await handle.stat()
      if (!metadata.isFile() || metadata.nlink !== entry.nlink || (metadata.mode & 0o777) !== entry.mode
        || metadata.uid !== entry.uid || metadata.gid !== entry.gid || metadata.size !== entry.size) failAcademyRelease()
      const bytes = await handle.readFile()
      if (bytes.length !== entry.size
        || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) failAcademyRelease()
    } finally { await handle.close() }
  }
  return Object.freeze({
    root: releaseRoot, manifest, uid, gid,
    nodeExecutable: join(releaseRoot, manifest.executables.node),
    wranglerEntrypoint: join(releaseRoot, manifest.executables.wrangler),
  })
}
