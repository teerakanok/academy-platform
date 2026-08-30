#!/usr/bin/env node

import { constants } from 'node:fs'
import { promises as filesystem } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { diagnoseAcademyInstall, installAcademyRelease } from './academy-release-install.mjs'
import { assertAcademyStableAncestry, exact, failAcademyRelease } from './academy-release-manifest.mjs'
import { reconcileAcademyInstallResidue, resolveAcademyCurrentRelease, rollbackAcademyRelease } from './academy-release-pointer.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const PACKAGE_SCHEMA = 'academy-release-package-input/v2'

async function protectedJson(path, fs, processLike) {
  if (typeof path !== 'string' || resolve(path) !== path) failAcademyRelease()
  const target = resolve(path)
  await assertAcademyStableAncestry(target, fs, processLike)
  if (await fs.realpath(target) !== target) failAcademyRelease()
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.uid !== processLike.getuid()
      || (metadata.mode & 0o077) || metadata.size < 2 || metadata.size > 1024 * 1024) failAcademyRelease()
    const source = await handle.readFile('utf8')
    const value = JSON.parse(source)
    if (source !== `${JSON.stringify(value)}\n`) failAcademyRelease()
    return value
  } finally { await handle.close() }
}

async function verifyReviewedSource(path, type, fs, processLike) {
  if (typeof path !== 'string' || resolve(path) !== path) failAcademyRelease()
  await assertAcademyStableAncestry(path, fs, processLike)
  if (await fs.realpath(path) !== path) failAcademyRelease()
  const metadata = await fs.lstat(path)
  if (metadata.uid !== processLike.getuid() || (metadata.mode & 0o222)
    || (type === 'file' && (!metadata.isFile() || metadata.nlink !== 1))
    || (type === 'directory' && !metadata.isDirectory())) failAcademyRelease()
  if (type === 'directory') {
    const names = await fs.readdir(path)
    if (names.length === 0) failAcademyRelease()
    for (const name of names) await verifyReviewedSource(`${path}/${name}`, (await fs.lstat(`${path}/${name}`)).isDirectory() ? 'directory' : 'file', fs, processLike)
  }
}

export async function readAcademyReleasePackageInput({ path, fs = filesystem, processLike = process }) {
  const value = await protectedJson(path, fs, processLike)
  if (!exact(value, ['schema','releaseRevision','nodeSource','wranglerDirectory','wranglerEntrypoint','applicationDirectory','helpers'])
    || value.schema !== PACKAGE_SCHEMA || !REVISION.test(value.releaseRevision)
    || typeof value.nodeSource !== 'string' || typeof value.wranglerDirectory !== 'string'
    || typeof value.wranglerEntrypoint !== 'string' || typeof value.applicationDirectory !== 'string'
    || !Array.isArray(value.helpers) || value.helpers.length < 1
    || value.helpers.some(helper => !exact(helper, ['sourcePath','path','mode'])
      || typeof helper.sourcePath !== 'string' || typeof helper.path !== 'string'
      || ![0o400,0o444,0o500,0o555].includes(helper.mode))) failAcademyRelease()
  if (new Set(value.helpers.map(helper => helper.path)).size !== value.helpers.length
    || new Set(value.helpers.map(helper => helper.sourcePath)).size !== value.helpers.length) failAcademyRelease()
  await verifyReviewedSource(value.nodeSource, 'file', fs, processLike)
  await verifyReviewedSource(value.wranglerDirectory, 'directory', fs, processLike)
  await verifyReviewedSource(value.applicationDirectory, 'directory', fs, processLike)
  for (const helper of value.helpers) await verifyReviewedSource(helper.sourcePath, 'file', fs, processLike)
  return Object.freeze({ releaseRevision: value.releaseRevision, node: { sourcePath: value.nodeSource },
    wrangler: { sourceDirectory: value.wranglerDirectory, entrypoint: value.wranglerEntrypoint },
    application: { sourceDirectory: value.applicationDirectory },
    helpers: value.helpers.map(helper => ({ ...helper })) })
}

function expected(sha256, revision) {
  if (!SHA256.test(sha256) || !REVISION.test(revision)) failAcademyRelease()
}

export async function main(args, options = {}) {
  const fs = options.fs ?? filesystem
  const processLike = options.processLike ?? process
  if ((options.requireRoot ?? true) && processLike.getuid() !== 0) failAcademyRelease()
  const command = args[0]
  const absoluteArguments = command === 'render' ? args.slice(1, 3)
    : ['install','diagnose-install','verify','reconcile','rollback'].includes(command)
      ? args.slice(1, ['install','diagnose-install'].includes(command) ? 3 : 2) : []
  if (absoluteArguments.some(path => typeof path !== 'string' || resolve(path) !== path)) failAcademyRelease()
  let result
  if (command === 'render' && args.length === 3) {
    const spec = await readAcademyReleasePackageInput({ path: args[1], fs, processLike })
    const rendered = await renderAcademyRelease({ spec, stagingRoot: args[2], fs, processLike })
    result = { status: 'RENDERED', releaseSha256: rendered.manifest.releaseSha256, releaseRevision: rendered.manifest.releaseRevision }
  } else if (['install','diagnose-install'].includes(command) && args.length === 5) {
    expected(args[3], args[4])
    result = await (command === 'install' ? installAcademyRelease : diagnoseAcademyInstall)({ sourceRoot: args[1], installRoot: args[2],
      expectedReleaseSha256: args[3], expectedReleaseRevision: args[4], fs, processLike })
  } else if (['verify','reconcile'].includes(command) && args.length === 4) {
    expected(args[2], args[3])
    if (command === 'reconcile') await reconcileAcademyInstallResidue({ installRoot: args[1], fs, processLike })
    const current = await resolveAcademyCurrentRelease({ installRoot: args[1], fs, processLike })
    if (current.pointer.releaseSha256 !== args[2] || current.pointer.releaseRevision !== args[3]) failAcademyRelease()
    result = { status: command === 'verify' ? 'VERIFIED' : 'RECONCILED', releaseSha256: args[2], releaseRevision: args[3] }
  } else if (command === 'rollback' && args.length === 4) {
    expected(args[2], args[3])
    result = await rollbackAcademyRelease({ installRoot: args[1], expectedReleaseSha256: args[2],
      expectedReleaseRevision: args[3], fs, processLike })
  } else failAcademyRelease()
  return Object.freeze(result)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(() => {
    process.stderr.write('Academy release operation failed\n')
    process.exitCode = 1
  })
}
