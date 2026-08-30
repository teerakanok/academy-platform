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
  compareAcademyReleasePaths,
  exact,
  failAcademyRelease,
  isAcademyReleasePath,
  isAcademyReleaseSegment,
  syncAcademyDirectory,
} from './academy-release-manifest.mjs'

export const ACADEMY_RELEASE_NODE_PATH = 'node/bin/node'
export const ACADEMY_RELEASE_WRANGLER_PREFIX = 'wrangler'
export const ACADEMY_RELEASE_DIRECTORY_MODE = 0o555
export const ACADEMY_RELEASE_APPLICATION_PREFIX = 'application'
export const ACADEMY_RELEASE_APPLICATION_CONFIG = 'application/wrangler.jsonc'

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
async function inventoryAcademyDirectory(sourceDirectory, fs) {
  const files = []
  const visit = async (directory, prefix) => {
    const names = await fs.readdir(directory)
    if (names.length === 0) failAcademyRelease()
    for (const name of names) {
      if (!isAcademyReleaseSegment(name)) failAcademyRelease()
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
  return files.sort((left, right) => compareAcademyReleasePaths(left.relative, right.relative))
}

function parseAcademyApplicationConfig(source) {
  let canonical = ''
  let quotedBy = null
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quotedBy !== null) {
      if (character === '\\') { canonical += source.slice(index, index + 2); index += 1; continue }
      if (character === quotedBy) quotedBy = null
      canonical += character
      continue
    }
    if (character === '"' || character === "'") { quotedBy = character; canonical += character; continue }
    if (character === '/' && source[index + 1] === '/') { while (index < source.length && source[index] !== '\n') index += 1; canonical += '\n'; continue }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end < 0) failAcademyRelease()
      index = end + 1
      continue
    }
    canonical += character
  }
  if (quotedBy !== null) failAcademyRelease()
  try { return JSON.parse(canonical) } catch { return failAcademyRelease() }
}

function referencedAcademyModules(source) {
  const modules = []
  for (const pattern of [
    /\bfrom\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
    /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) modules.push(match[2])
  }
  return modules
}

function resolveAcademyApplicationModule(applicationPath, moduleSpecifier, applicationFiles) {
  if (typeof moduleSpecifier !== 'string' || moduleSpecifier.startsWith('/')
    || moduleSpecifier.startsWith('\\') || moduleSpecifier.includes('\\') || moduleSpecifier.includes('\0')) failAcademyRelease()
  if (moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
    const segments = []
    for (const segment of `${dirname(applicationPath)}/${moduleSpecifier}`.split('/')) {
      if (segment === '' || segment === '.') continue
      if (segment === '..') { if (segments.length === 0) failAcademyRelease(); segments.pop(); continue }
      segments.push(segment)
    }
    const base = segments.join('/')
    const suffixes = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/index.cjs']
    const resolved = suffixes.map(suffix => `${base}${suffix}`).find(path => applicationFiles.has(path))
    if (resolved === undefined) failAcademyRelease()
    return resolved
  }
  const slash = moduleSpecifier.indexOf('/')
  const packageName = moduleSpecifier.startsWith('@') && slash > 0
    ? moduleSpecifier.slice(0, moduleSpecifier.indexOf('/', slash + 1))
    : slash > 0 ? moduleSpecifier.slice(0, slash) : moduleSpecifier
  return applicationFiles.has(`node_modules/${packageName}/package.json`) ? null : failAcademyRelease()
}

async function verifyAcademyApplicationTree(sourceDirectory, files, fs) {
  const names = new Set(files.map(file => file.relative))
  const configPath = 'wrangler.jsonc'
  const config = names.has(configPath) ? parseAcademyApplicationConfig(
    (await readAcademyReleaseSource(resolve(sourceDirectory, 'wrangler.jsonc'), fs)).toString('utf8')) : failAcademyRelease()
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || !isAcademyReleasePath(config.main) || config.main.includes('..')
    || typeof config.assets?.directory !== 'string' || !isAcademyReleasePath(config.assets.directory)
    || config.assets.directory.includes('..')) failAcademyRelease()
  const main = config.main
  const assets = config.assets.directory
  if (!names.has(main) || ![...names].some(path => path.startsWith(`${assets}/`))) failAcademyRelease()
  const visited = new Set([main])
  for (const path of visited) {
    const file = files.find(item => item.relative === path)
    if (!file || !/\.(?:cts|cjs|js|mjs|mts|jsx|ts|tsx)$/.test(path)) continue
    const source = (await readAcademyReleaseSource(file.absolute, fs)).toString('utf8')
    for (const moduleSpecifier of referencedAcademyModules(source)) {
      const modulePath = resolveAcademyApplicationModule(path, moduleSpecifier, names)
      if (modulePath !== null) visited.add(modulePath)
    }
  }
}

export async function renderAcademyRelease({ spec, stagingRoot, fs = filesystem, processLike = process }) {
  if (!exact(spec, ['releaseRevision','node','wrangler','application','helpers'])
    || !/^[a-f0-9]{40}$/.test(spec.releaseRevision)
    || !exact(spec.node, ['sourcePath'])
    || !exact(spec.wrangler, ['sourceDirectory','entrypoint'])
    || !exact(spec.application, ['sourceDirectory'])
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

  const applicationFiles = await inventoryAcademyDirectory(spec.application.sourceDirectory, fs)
  await verifyAcademyApplicationTree(spec.application.sourceDirectory, applicationFiles, fs)
  for (const file of applicationFiles) {
    await place(`${ACADEMY_RELEASE_APPLICATION_PREFIX}/${file.relative}`, file.absolute, 0o444)
  }

  const wranglerFiles = await inventoryAcademyDirectory(spec.wrangler.sourceDirectory, fs)
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

  entries.sort((a, b) => compareAcademyReleasePaths(a.path, b.path))
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
  directoryRecords.sort((a, b) => compareAcademyReleasePaths(a.path, b.path))

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
