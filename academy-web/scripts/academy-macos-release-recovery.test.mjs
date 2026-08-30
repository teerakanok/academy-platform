import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { recoverAcademyReleaseState } from './academy-macos-release-recovery.mjs'

const PRIOR = 'b64a361440e0369585f0e948f55d4a0325d755f626fe04596fd6d6d2a9c18103'
const CANDIDATE = '84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46'
const REVISION = 'fa7bca732aefa58ab7fc2c784676a113b873466b'

async function fixture(t, { receipt = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'academy-recovery-')))
  const stage = join(root, 'old-stage')
  await mkdir(stage, { mode: 0o700 })
  await writeFile(join(stage, '.academy-owned'), 'academy-root-preflight/d6e517e3\n', { mode: 0o400 })
  if (receipt) await writeFile(join(stage, 'render-result.json'), `${JSON.stringify({
    status: 'RENDERED', releaseSha256: CANDIDATE, releaseRevision: REVISION,
  })}\n`, { mode: 0o600 })
  t.after(() => rm(root, { recursive: true, force: true }))
  return { stage, uid: process.getuid(), gid: process.getgid() }
}

const current = sha => async () => ({ pointer: { releaseSha256: sha, releaseRevision: REVISION } })
const present = async () => ({})

test('prior publication is inspected and reconciled before requesting idempotent install', async t => {
  const f = await fixture(t)
  let reconciles = 0
  const value = await recoverAcademyReleaseState({ oldStage: f.stage, expectedUid: f.uid, expectedGid: f.gid,
    readPointer:present, resolveCurrent: current(PRIOR), reconcile: async () => { reconciles += 1 } })
  assert.equal(reconciles, 1)
  assert.deepEqual(value, { schema:'academy-macos-release-recovery/v1', status:'RECOVERED', oldStage:'OWNED',
    receipts:[{name:'render',status:'RENDERED',releaseSha256:CANDIDATE}], publicationBefore:'PRIOR',
    publicationAfter:'PRIOR', installRequired:true })
})

test('candidate publication resumes without reinstall requirement', async t => {
  const f = await fixture(t)
  const value = await recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE), reconcile:async()=>{} })
  assert.equal(value.publicationAfter, 'CANDIDATE')
  assert.equal(value.installRequired, false)
})

test('absent pointer skips residue mutation and remains recoverable', async t => {
  const f = await fixture(t, { receipt:false })
  let reconciles = 0
  const value = await recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:async()=>null, resolveCurrent:async()=>{throw new Error('must not resolve')}, reconcile:async()=>{reconciles+=1} })
  assert.equal(reconciles, 0)
  assert.equal(value.publicationAfter, 'ABSENT')
  assert.equal(value.installRequired, true)
})

test('foreign publication and malformed protected receipt fail before reconcile', async t => {
  const f = await fixture(t)
  let reconciles = 0
  await assert.rejects(recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current('a'.repeat(64)), reconcile:async()=>{reconciles+=1} }))
  assert.equal(reconciles, 0)
  await writeFile(join(f.stage, 'render-result.json'), '{}\n', { mode:0o600 })
  await assert.rejects(recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(PRIOR), reconcile:async()=>{reconciles+=1} }))
  assert.equal(reconciles, 0)
})

test('real shell redirection loss is ATTEMPTED_UNKNOWN and pointer remains sole publication authority', async t => {
  const f = await fixture(t)
  const receipt = join(f.stage, 'install-result.json')
  const shell = spawnSync('/bin/zsh', ['-c', 'false > "$1"', 'oracle', receipt], { encoding:'utf8' })
  assert.equal(shell.status, 1)
  const value = await recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE), reconcile:async()=>{} })
  assert.deepEqual(value.receipts[1], { name:'install', status:'ATTEMPTED_UNKNOWN', bytes:0,
    sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  assert.equal(value.publicationBefore, 'CANDIDATE')
  assert.equal(value.publicationAfter, 'CANDIDATE')
  assert.equal(value.installRequired, false)
})

test('zero-byte render receipt is never classified as attempted install', async t => {
  const f = await fixture(t)
  await writeFile(join(f.stage, 'render-result.json'), '')
  let reconciles = 0
  await assert.rejects(recoverAcademyReleaseState({ oldStage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(PRIOR), reconcile:async()=>{reconciles+=1} }))
  assert.equal(reconciles, 0)
})
