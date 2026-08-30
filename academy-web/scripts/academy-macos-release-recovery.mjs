#!/usr/bin/env node
import { constants } from 'node:fs'
import { open, lstat, realpath } from 'node:fs/promises'

import { readAcademyReleasePointer, reconcileAcademyInstallResidue, resolveAcademyCurrentRelease } from './academy-release-pointer.mjs'

const PRIOR = 'b64a361440e0369585f0e948f55d4a0325d755f626fe04596fd6d6d2a9c18103'
const CANDIDATE = '84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46'
const REVISION = 'fa7bca732aefa58ab7fc2c784676a113b873466b'
const INSTALL_ROOT = '/opt/academy'
const OLD_STAGE = '/private/var/root/academy-release-stage-d6e517e3'
const fail = () => { throw new Error('ACADEMY_RELEASE_RECOVERY_REJECTED') }

async function protectedText(path, { modes, expectedUid, expectedGid, allowEmpty = false, max = 1024 * 1024 }) {
  if (await realpath(path) !== path) fail()
  const before = await lstat(path, { bigint:true })
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat({ bigint:true })
    const same = (left, right) => ['dev','ino','size','uid','gid','mode','nlink','mtimeNs','ctimeNs']
      .every(key => left[key] === right[key])
    if (!metadata.isFile() || metadata.nlink !== 1n || metadata.uid !== BigInt(expectedUid) || metadata.gid !== BigInt(expectedGid)
      || !modes.includes(Number(metadata.mode & 0o777n)) || metadata.size < (allowEmpty ? 0n : 1n)
      || metadata.size > BigInt(max) || !same(before, metadata)) fail()
    const source = await handle.readFile('utf8')
    const after = await handle.stat({ bigint:true })
    const pathAfter = await lstat(path, { bigint:true })
    if (!same(metadata, after) || !same(after, pathAfter) || BigInt(Buffer.byteLength(source)) !== metadata.size) fail()
    return source
  } finally { await handle.close() }
}

async function oldEvidence(oldStage, expectedUid, expectedGid) {
  try {
    const metadata = await lstat(oldStage)
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== expectedUid || metadata.gid !== expectedGid
      || (metadata.mode & 0o777) !== 0o700) fail()
  } catch (error) { if (error?.code === 'ENOENT') return { stage: 'ABSENT', receipts: [] }; throw error }
  const marker = await protectedText(`${oldStage}/.academy-owned`, { modes: [0o400], expectedUid, expectedGid, max: 128 })
  if (marker !== 'academy-root-preflight/d6e517e3\n') fail()
  const receipts = []
  for (const [name, expectedStatus] of [['render-result.json','RENDERED'],['install-result.json',null],['verify-result.json','VERIFIED']]) {
    let source
    try { source = await protectedText(`${oldStage}/${name}`, {
      modes: [0o600,0o644], expectedUid, expectedGid, allowEmpty: name === 'install-result.json',
    }) }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error }
    if (source === '') {
      if (name !== 'install-result.json') fail()
      receipts.push({ name:'install', status:'ATTEMPTED_UNKNOWN', bytes:0,
        sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
      continue
    }
    let value
    try { value = JSON.parse(source) } catch { fail() }
    if (source !== `${JSON.stringify(value)}\n` || typeof value !== 'object' || Array.isArray(value)) fail()
    if (value.releaseRevision !== REVISION || ![PRIOR,CANDIDATE].includes(value.releaseSha256)) fail()
    if (expectedStatus !== null && value.status !== expectedStatus) fail()
    receipts.push({ name: name.replace('-result.json',''), status: String(value.status), releaseSha256: value.releaseSha256 })
  }
  return { stage: 'OWNED', receipts }
}

async function currentState(readPointer, resolveCurrent, installRoot) {
    const pointer = await readPointer({ installRoot })
    if (pointer === null) return 'ABSENT'
    const current = await resolveCurrent({ installRoot })
    const sha = current.pointer.releaseSha256
    if (![PRIOR,CANDIDATE].includes(sha) || current.pointer.releaseRevision !== REVISION) fail()
    return sha === CANDIDATE ? 'CANDIDATE' : 'PRIOR'
}

export async function recoverAcademyReleaseState({ oldStage = OLD_STAGE, installRoot = INSTALL_ROOT,
  expectedUid = 0, expectedGid = 0, resolveCurrent = resolveAcademyCurrentRelease,
  readPointer = readAcademyReleasePointer, reconcile = reconcileAcademyInstallResidue } = {}) {
  const evidence = await oldEvidence(oldStage, expectedUid, expectedGid)
  const before = await currentState(readPointer, resolveCurrent, installRoot)
  if (before !== 'ABSENT') await reconcile({ installRoot })
  const after = await currentState(readPointer, resolveCurrent, installRoot)
  return Object.freeze({
    schema: 'academy-macos-release-recovery/v1', status: 'RECOVERED',
    oldStage: evidence.stage, receipts: evidence.receipts,
    publicationBefore: before, publicationAfter: after,
    installRequired: after !== 'CANDIDATE',
  })
}

if (import.meta.url === `file://${process.argv[1]}`) recoverAcademyReleaseState()
  .then(value => process.stdout.write(`${JSON.stringify(value)}\n`))
  .catch(() => { process.stderr.write('ACADEMY_RELEASE_RECOVERY_REJECTED\n'); process.exitCode = 1 })
