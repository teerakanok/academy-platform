#!/usr/bin/env node
// Offline release renderer: materializes a reviewable immutable release from
// pinned source files (reviewed Node executable, Wrangler entrypoint, helper
// sources) and writes the exact manifest. No credentials are read or bundled;
// Wrangler auth stays runtime-injected.

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
  ACADEMY_RELEASE_MANIFEST_NAME,
  ACADEMY_RELEASE_MANIFEST_SCHEMA,
  ACADEMY_RELEASE_MODES,
  assertAcademyStableAncestry,
  computeAcademyReleaseSha256,
  exact,
  failAcademyRelease,
  isAcademyReleasePath,
  syncAcademyDirectory,
} from './academy-release-manifest.mjs'

export const ACADEMY_RELEASE_NODE_PATH = 'node/bin/node'
export const ACADEMY_RELEASE_WRANGLER_PATH = 'wrangler/bin/wrangler'

const mode = value => ACADEMY_RELEASE_MODES.includes(value) ? value : failAcademyRelease()

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
  const handle = await fs.open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, permissions)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}

export async function renderAcademyRelease({ spec, stagingRoot, fs = filesystem, processLike = process }) {
  if (!exact(spec, ['releaseRevision','node','wrangler','helpers'])
    || !/^[a-f0-9]{40}$/.test(spec.releaseRevision)
    || !exact(spec.node, ['sourcePath','mode']) || !exact(spec.wrangler, ['sourcePath','mode'])
    || !Array.isArray(spec.helpers) || spec.helpers.length < 1
    || spec.helpers.some(helper => !exact(helper, ['sourcePath','path','mode']))) failAcademyRelease()
  if (typeof stagingRoot !== 'string' || !stagingRoot.startsWith('/')) failAcademyRelease()
  const root = resolve(stagingRoot)
  const uid = processLike.getuid()
  const gid = processLike.getgid()
  await fs.mkdir(root, { mode: 0o755, recursive: true })
  await assertAcademyStableAncestry(root, fs, processLike)
  const directories = new Set()
  const entries = []
  const place = async (relative, sourcePath, permissions) => {
    if (!isAcademyReleasePath(relative)) failAcademyRelease()
    const bytes = await readAcademyReleaseSource(sourcePath, fs)
    const destination = join(root, relative)
    const parent = dirname(destination)
    await fs.mkdir(parent, { mode: 0o755, recursive: true })
    for (let cursor = parent; cursor.startsWith(root) && cursor !== root && !directories.has(cursor); cursor = dirname(cursor)) directories.add(cursor)
    await writeAcademyReleaseFile(destination, bytes, permissions, fs)
    entries.push({ path: relative, sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length, mode: permissions, uid, gid, nlink: 1 })
  }
  await place(ACADEMY_RELEASE_NODE_PATH, spec.node.sourcePath, mode(spec.node.mode))
  await place(ACADEMY_RELEASE_WRANGLER_PATH, spec.wrangler.sourcePath, mode(spec.wrangler.mode))
  const helpers = []
  for (const helper of spec.helpers) {
    if (!isAcademyReleasePath(helper.path)) failAcademyRelease()
    helpers.push(helper.path)
    await place(helper.path, helper.sourcePath, mode(helper.mode))
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : 1))
  const manifest = { schema: ACADEMY_RELEASE_MANIFEST_SCHEMA, releaseRevision: spec.releaseRevision,
    releaseSha256: '', executables: { node: ACADEMY_RELEASE_NODE_PATH, wrangler: ACADEMY_RELEASE_WRANGLER_PATH },
    helpers: [...helpers], entries }
  manifest.releaseSha256 = computeAcademyReleaseSha256(manifest)
  await writeAcademyReleaseFile(join(root, ACADEMY_RELEASE_MANIFEST_NAME),
    Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'), 0o444, fs)
  directories.add(root)
  for (const directory of [...directories].sort().reverse()) await syncAcademyDirectory(directory, fs)
  return Object.freeze({ root, manifest: Object.freeze(JSON.parse(JSON.stringify(manifest))) })
}
