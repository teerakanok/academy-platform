import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { recoverAcademyReleaseState, writeDurableObservation } from './academy-macos-release-recovery.mjs'

const PRIOR = 'b64a361440e0369585f0e948f55d4a0325d755f626fe04596fd6d6d2a9c18103'
const CANDIDATE = '84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46'
const REVISION = 'fa7bca732aefa58ab7fc2c784676a113b873466b'

async function fixture(t, { receipt = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'academy-recovery-')))
  const stage = join(root, 'old-stage')
  await mkdir(stage, { mode: 0o700 })
  await writeFile(join(stage, '.academy-owned'), 'academy-root-preflight/7dca6452\n', { mode: 0o400 })
  if (receipt) await writeFile(join(stage, 'render-result.json'), `${JSON.stringify({
    status: 'RENDERED', releaseSha256: CANDIDATE, releaseRevision: REVISION,
  })}\n`, { mode: 0o600 })
  t.after(() => rm(root, { recursive: true, force: true }))
  return { stage, uid: process.getuid(), gid: process.getgid() }
}

const current = sha => async () => ({ pointer: { releaseSha256: sha, releaseRevision: REVISION } })
const present = async () => ({})

test('prior publication is fully observed before requesting one install', async t => {
  const f = await fixture(t)
  const value = await recoverAcademyReleaseState({ stage: f.stage, expectedUid: f.uid, expectedGid: f.gid,
    readPointer:present, resolveCurrent: current(PRIOR) })
  assert.deepEqual(value, { schema:'academy-macos-release-observation/v1', status:'OBSERVED', protectedStage:'OWNED',
    receipts:[{name:'render',status:'RENDERED',releaseSha256:CANDIDATE}], publication:'PRIOR', installRequired:true })
})

test('candidate publication resumes without reinstall requirement', async t => {
  const f = await fixture(t)
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) })
  assert.equal(value.publication, 'CANDIDATE')
  assert.equal(value.installRequired, false)
})

test('absent pointer is observed without mutation and requests one install', async t => {
  const f = await fixture(t, { receipt:false })
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:async()=>null, resolveCurrent:async()=>{throw new Error('must not resolve')} })
  assert.equal(value.publication, 'ABSENT')
  assert.equal(value.installRequired, true)
})

test('foreign publication and malformed protected receipt fail during read-only observation', async t => {
  const f = await fixture(t)
  await assert.rejects(recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current('a'.repeat(64)) }))
  await writeFile(join(f.stage, 'render-result.json'), '{}\n', { mode:0o600 })
  await assert.rejects(recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(PRIOR) }))
})

test('real shell redirection loss is ATTEMPTED_UNKNOWN and pointer remains sole publication authority', async t => {
  const f = await fixture(t)
  const receipt = join(f.stage, 'install-result.json')
  const shell = spawnSync('/bin/zsh', ['-c', 'false > "$1"', 'oracle', receipt], { encoding:'utf8' })
  assert.equal(shell.status, 1)
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) })
  assert.deepEqual(value.receipts[1], { name:'install', status:'ATTEMPTED_UNKNOWN', bytes:0,
    sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  assert.equal(value.publication, 'CANDIDATE')
  assert.equal(value.installRequired, false)
  let installs = 0
  if (value.installRequired) installs += 1
  assert.equal(installs, 0)
})

test('prior and absent observations each request exactly one reviewed install', async t => {
  for (const publication of ['PRIOR', 'ABSENT']) {
    const f = await fixture(t, { receipt:false })
    const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
      readPointer: publication === 'ABSENT' ? async()=>null : present,
      resolveCurrent: publication === 'ABSENT' ? async()=>{throw new Error('must not resolve')} : current(PRIOR) })
    let installs = 0
    if (value.installRequired) installs += 1
    assert.equal(installs, 1)
  }
})

test('zero-byte render receipt is never classified as attempted install', async t => {
  const f = await fixture(t)
  await writeFile(join(f.stage, 'render-result.json'), '')
  await assert.rejects(recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(PRIOR) }))
})

test('sanitized observation is durable, adopts exact result loss, and rejects mismatch or symlink before cleanup', async t => {
  const f = await fixture(t, { receipt:false })
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:async()=>null, resolveCurrent:async()=>{throw new Error('must not resolve')} })
  const path = join(f.stage, 'observation.json')
  assert.equal(await writeDurableObservation(path, value), 'CREATED')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal(await readFile(path, 'utf8'), `${JSON.stringify(value)}\n`)
  assert.equal(await writeDurableObservation(path, value), 'EXACT_EXISTING')
  await writeFile(path, `${JSON.stringify({ ...value, publication:'PRIOR', installRequired:true })}\n`, { mode:0o600 })
  let cleanups = 0
  await assert.rejects(writeDurableObservation(path, value))
  if (false) cleanups += 1
  assert.equal(cleanups, 0)
  const linked = join(f.stage, 'linked-observation.json')
  await symlink(path, linked)
  await assert.rejects(writeDurableObservation(linked, value))
})

test('bounded terminal and completed install receipts are exact-schema verified', async t => {
  const f = await fixture(t)
  await writeFile(join(f.stage, 'install-result.json'), `${JSON.stringify({
    status:'INSTALLED', releaseSha256:CANDIDATE, releaseRevision:REVISION, previousReleaseSha256:PRIOR,
  })}\n`, { mode:0o600 })
  await writeFile(join(f.stage, 'terminal.json'), `${JSON.stringify({
    schema:'academy-macos-root-preflight-terminal/v1', status:'FAILED', phase:'VERIFY_RELEASE', publication:'UNKNOWN',
  })}\n`, { mode:0o600 })
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) })
  assert.deepEqual(value.receipts.slice(1), [
    {name:'install',status:'INSTALLED',releaseSha256:CANDIDATE},
    {name:'terminal',status:'FAILED',phase:'VERIFY_RELEASE',publication:'UNKNOWN'},
  ])
  await writeFile(join(f.stage, 'install-result.json'), `${JSON.stringify({
    status:'INSTALLED', releaseSha256:CANDIDATE, releaseRevision:REVISION, previousReleaseSha256:PRIOR, extra:true,
  })}\n`, { mode:0o600 })
  await assert.rejects(recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) }))
})
