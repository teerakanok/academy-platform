#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, lstat, realpath } from 'node:fs/promises'
import { dirname } from 'node:path'

import { readAcademyReleasePointer, resolveAcademyCurrentRelease } from './academy-release-pointer.mjs'

const PRIOR = 'b64a361440e0369585f0e948f55d4a0325d755f626fe04596fd6d6d2a9c18103'
const CANDIDATE = '84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46'
const REVISION = 'fa7bca732aefa58ab7fc2c784676a113b873466b'
const INSTALL_ROOT = '/opt/academy'
const CURRENT_STAGE = '/private/var/root/academy-release-recovery-7dca6452'
const fail = () => { throw new Error('ACADEMY_RELEASE_RECOVERY_REJECTED') }
const observationBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
const observationSha256 = value => createHash('sha256').update(observationBytes(value)).digest('hex')

function validateObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'installRequired,protectedStage,publication,receipts,schema,status'
    || value.schema !== 'academy-macos-release-observation/v1' || value.status !== 'OBSERVED'
    || !['ABSENT','PRIOR','CANDIDATE'].includes(value.publication)
    || value.installRequired !== (value.publication !== 'CANDIDATE')
    || !['ABSENT','OWNED'].includes(value.protectedStage) || !Array.isArray(value.receipts)) fail()
  return value
}

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

async function stageEvidence(stage, expectedUid, expectedGid) {
  try {
    const metadata = await lstat(stage)
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== expectedUid || metadata.gid !== expectedGid
      || (metadata.mode & 0o777) !== 0o700) fail()
  } catch (error) { if (error?.code === 'ENOENT') return { stage: 'ABSENT', receipts: [] }; throw error }
  const marker = await protectedText(`${stage}/.academy-owned`, { modes: [0o400], expectedUid, expectedGid, max: 128 })
  if (marker !== 'academy-root-preflight/7dca6452\n') fail()
  const receipts = []
  for (const [name, expectedStatus] of [['render-result.json','RENDERED'],['install-result.json',null],['verify-result.json','VERIFIED']]) {
    let source
    try { source = await protectedText(`${stage}/${name}`, {
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
    const keys = Object.keys(value).sort().join(',')
    if (name === 'install-result.json') {
      if (keys !== 'previousReleaseSha256,releaseRevision,releaseSha256,status'
        || !['INSTALLED','IDEMPOTENT'].includes(value.status)
        || !(value.previousReleaseSha256 === null || [PRIOR,CANDIDATE].includes(value.previousReleaseSha256))) fail()
    } else if (keys !== 'releaseRevision,releaseSha256,status') fail()
    if (value.releaseRevision !== REVISION || ![PRIOR,CANDIDATE].includes(value.releaseSha256)) fail()
    if (expectedStatus !== null && value.status !== expectedStatus) fail()
    receipts.push({ name: name.replace('-result.json',''), status: String(value.status), releaseSha256: value.releaseSha256 })
  }
  let terminal
  try { terminal = await protectedText(`${stage}/terminal.json`, {
    modes: [0o600], expectedUid, expectedGid, max: 1024,
  }) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  if (terminal !== undefined) {
    let value
    try { value = JSON.parse(terminal) } catch { fail() }
    if (terminal !== `${JSON.stringify(value)}\n` || typeof value !== 'object' || Array.isArray(value)) fail()
    const keys = Object.keys(value).sort().join(',')
    if (value.schema !== 'academy-macos-root-preflight-terminal/v1'
      || !['PASS','FAILED'].includes(value.status) || !['ABSENT','PRIOR','CANDIDATE','UNKNOWN'].includes(value.publication)) fail()
    if (value.status === 'PASS') {
      if (keys !== 'cloudflare,phase,publication,schema,status' || value.phase !== 'COMPLETE'
        || value.publication !== 'CANDIDATE' || value.cloudflare !== 'AUTHENTICATED') fail()
    } else if (keys !== 'phase,publication,reason,schema,status' || typeof value.phase !== 'string'
      || value.phase.length < 1 || value.phase.length > 64 || !/^[A-Z_]+$/.test(value.phase)
      || typeof value.reason !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(value.reason)) fail()
    receipts.push({ name:'terminal', status:value.status, phase:value.phase,
      publication:value.publication, ...(value.status==='FAILED'?{reason:value.reason}:{}) })
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

export async function observeAcademyReleaseState({ stage = CURRENT_STAGE, installRoot = INSTALL_ROOT,
  expectedUid = 0, expectedGid = 0, resolveCurrent = resolveAcademyCurrentRelease,
  readPointer = readAcademyReleasePointer } = {}) {
  const evidence = await stageEvidence(stage, expectedUid, expectedGid)
  const publication = await currentState(readPointer, resolveCurrent, installRoot)
  return Object.freeze({
    schema: 'academy-macos-release-observation/v1', status: 'OBSERVED',
    protectedStage: evidence.stage, receipts: evidence.receipts,
    publication, installRequired: publication !== 'CANDIDATE',
  })
}

export const recoverAcademyReleaseState = observeAcademyReleaseState

async function publishExactBytes(path, bytes) {
  let handle
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    throw error
  }
  try {
    await handle.chmod(0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    const inside = await handle.stat({ bigint:true }), named = await lstat(path, { bigint:true })
    const same = (left, right) => ['dev','ino','size','uid','gid','mode','nlink','mtimeNs','ctimeNs']
      .every(key => left[key] === right[key])
    if (!inside.isFile() || inside.nlink !== 1n || inside.uid !== BigInt(process.getuid())
      || inside.gid !== BigInt(process.getgid()) || Number(inside.mode & 0o777n) !== 0o600
      || inside.size !== BigInt(bytes.length) || !same(inside, named)) fail()
  } finally { await handle.close() }
  const directory = await open(dirname(path), constants.O_RDONLY | constants.O_NOFOLLOW)
  try { await directory.sync() } finally { await directory.close() }
  const accepted = await protectedText(path, {
    modes: [0o600], expectedUid: process.getuid(), expectedGid: process.getgid(), max: 1024 * 1024,
  })
  if (accepted !== bytes.toString('utf8')) fail()
  return 'CREATED'
}

export async function writeDurableObservation(path, value) {
  validateObservation(value)
  const bytes = observationBytes(value)
  try { return await publishExactBytes(path, bytes) } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const existing = await protectedText(path, {
      modes: [0o600], expectedUid: process.getuid(), expectedGid: process.getgid(), max: 1024 * 1024,
    })
    if (existing !== bytes.toString('utf8')) fail()
    return 'EXACT_EXISTING'
  }
}

export async function publishObservationChain(path, current) {
  validateObservation(current)
  try {
    const status = await writeDurableObservation(path, current)
    return Object.freeze({ status, path, observation:current })
  } catch {
    let predecessor, predecessorSource
    try {
      predecessorSource = await protectedText(path, {
      modes:[0o600], expectedUid:process.getuid(), expectedGid:process.getgid(), max:1024 * 1024,
      })
      predecessor = validateObservation(JSON.parse(predecessorSource))
      if (predecessorSource !== observationBytes(predecessor).toString('utf8')) fail()
    } catch { fail() }
    if (predecessor.publication === 'CANDIDATE' && current.publication === 'CANDIDATE') {
      return Object.freeze({ status:'TERMINAL_EXACT_EXISTING', path, observation:predecessor })
    }
    if (!['ABSENT','PRIOR'].includes(predecessor.publication) || current.publication !== 'CANDIDATE') fail()
    const successorPath = `${path}.candidate.v1.json`, successor = Object.freeze({
      schema:'academy-macos-release-observation-successor/v1', status:'OBSERVED',
      predecessorSha256:observationSha256(predecessor), observation:current,
    })
    const successorBytes = Buffer.from(`${JSON.stringify(successor)}\n`, 'utf8')
    try {
      await publishExactBytes(successorPath, successorBytes)
      return Object.freeze({ status:'SUCCESSOR_CREATED', path:successorPath, observation:current })
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      let existing, existingSource
      try {
        existingSource = await protectedText(successorPath, {
        modes:[0o600], expectedUid:process.getuid(), expectedGid:process.getgid(), max:1024 * 1024,
        })
        existing = JSON.parse(existingSource)
        if (existingSource !== `${JSON.stringify(existing)}\n`) fail()
      } catch { fail() }
      if (!existing || Object.keys(existing).sort().join(',') !== 'observation,predecessorSha256,schema,status'
        || existing.schema !== 'academy-macos-release-observation-successor/v1' || existing.status !== 'OBSERVED'
        || existing.predecessorSha256 !== observationSha256(predecessor)) fail()
      const accepted = validateObservation(existing.observation)
      if (accepted.publication !== 'CANDIDATE' || current.publication !== 'CANDIDATE') fail()
      return Object.freeze({ status:'SUCCESSOR_EXACT_EXISTING', path:successorPath, observation:accepted })
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) observeAcademyReleaseState()
  .then(async value => {
    if (process.argv.length !== 3) fail()
    const published = await publishObservationChain(process.argv[2], value)
    process.stdout.write(`${published.path}\t${published.observation.installRequired ? 'true' : 'false'}\n`)
  })
  .catch(() => { process.stderr.write('ACADEMY_RELEASE_RECOVERY_REJECTED\n'); process.exitCode = 1 })
