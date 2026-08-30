import assert from 'node:assert/strict'
import test from 'node:test'
import { chmod, mkdtemp, mkdir, writeFile, rm, realpath, readFile, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { publishObservationChain, recoverAcademyReleaseState, writeDurableObservation } from './academy-macos-release-recovery.mjs'

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
  await assert.rejects(writeDurableObservation(path, value))
  const linked = join(f.stage, 'linked-observation.json')
  await symlink(path, linked)
  await assert.rejects(writeDurableObservation(linked, value))
})

test('immutable observation chain converges from PRIOR or ABSENT to CANDIDATE and adopts its successor on retry', async t => {
  const f = await fixture(t, { receipt:false })
  const prior = { schema:'academy-macos-release-observation/v1', status:'OBSERVED', protectedStage:'OWNED',
    receipts:[], publication:'PRIOR', installRequired:true }
  for (const publication of ['PRIOR','ABSENT']) {
    const path = join(f.stage, `chain-${publication}.json`)
    const predecessor = { ...prior, publication, installRequired:true }
    const candidate = { ...predecessor, publication:'CANDIDATE', installRequired:false }
    assert.equal((await publishObservationChain(path, predecessor)).status, 'CREATED')
    const successor = await publishObservationChain(path, candidate)
    assert.equal(successor.status, 'SUCCESSOR_CREATED')
    assert.equal(successor.path, `${path}.candidate.v1.json`)
    const changedCandidate = { ...candidate, receipts:[{name:'terminal',status:'PASS',phase:'COMPLETE',publication:'CANDIDATE'}] }
    const adopted = await publishObservationChain(path, changedCandidate)
    assert.equal(adopted.status, 'SUCCESSOR_EXACT_EXISTING')
    assert.deepEqual(adopted.observation, candidate)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), predecessor)
  }
})

test('immutable initial CANDIDATE remains terminal across changed retry evidence', async t => {
  const f = await fixture(t, { receipt:false }), path = join(f.stage, 'terminal-candidate.json')
  const candidate = { schema:'academy-macos-release-observation/v1', status:'OBSERVED', protectedStage:'OWNED',
    receipts:[], publication:'CANDIDATE', installRequired:false }
  assert.equal((await publishObservationChain(path, candidate)).status, 'CREATED')
  const adopted = await publishObservationChain(path, { ...candidate, receipts:[{name:'changed'}] })
  assert.equal(adopted.status, 'TERMINAL_EXACT_EXISTING')
  assert.deepEqual(adopted.observation, candidate)
})

test('observation boundary performs zero cleanup and install for mismatch, symlink, and foreign state', async t => {
  const base = { schema:'academy-macos-release-observation/v1', status:'OBSERVED', protectedStage:'OWNED',
    receipts:[], publication:'PRIOR', installRequired:true }
  for (const kind of ['mismatch','symlink','foreign']) {
    const f = await fixture(t, { receipt:false }), path = join(f.stage, `${kind}.json`)
    if (kind === 'mismatch') await writeDurableObservation(path, base)
    if (kind === 'symlink') {
      const target = join(f.stage, 'target.json'); await writeFile(target, `${JSON.stringify(base)}\n`, {mode:0o600}); await symlink(target,path)
    }
    if (kind === 'foreign') await writeFile(path, '{}\n', {mode:0o600})
    let cleanupCalls = 0, installCalls = 0
    const harness = async current => {
      const published = await publishObservationChain(path, current)
      cleanupCalls += 1
      if (published.observation.installRequired) installCalls += 1
    }
    await assert.rejects(harness({ ...base, receipts:[{name:'foreign'}] }))
    assert.deepEqual({cleanupCalls,installCalls},{cleanupCalls:0,installCalls:0})
  }
})

test('executable worker decision boundary blocks hostile observations before cleanup and install', async t => {
  const f = await fixture(t, { receipt:false })
  const worker = await readFile(new URL('./academy-macos-root-preflight-worker.sh', import.meta.url), 'utf8')
  const decision = `IFS=$'\\t' read -r observation_selected install_required <<< "$observation_result"
[[ "$observation_selected" == "$observation" || "$observation_selected" == "$observation.candidate.v1.json" ]]
[[ -f "$observation_selected" && ! -L "$observation_selected" ]]
[[ "$install_required" == true || "$install_required" == false ]]`
  assert.match(worker, /IFS=\$'\\t' read -r observation_selected install_required/)
  assert.ok(worker.indexOf('observation_result="$') < worker.indexOf('phase=CLEANUP_STAGE'))
  assert.ok(worker.indexOf('phase=CLEANUP_STAGE') < worker.indexOf('academy-release-cli.mjs" install'))
  const observer = join(f.stage, 'observer.mjs')
  await writeFile(observer, `import {readFile} from 'node:fs/promises';
import {publishObservationChain} from ${JSON.stringify(new URL('./academy-macos-release-recovery.mjs', import.meta.url).href)};
try { const current=JSON.parse(await readFile(process.argv[2],'utf8')); const result=await publishObservationChain(process.argv[3],current); process.stdout.write(result.path+'\\t'+(result.observation.installRequired?'true':'false')+'\\n') } catch { process.exitCode=1 }
`, { mode:0o500 })
  await chmod(observer, 0o500)
  const run = (name, current, prepare) => {
    const root = join(f.stage, name), observation = join(root, 'observation.json')
    const currentPath = join(root, 'current.json'), cleanup = join(root, 'cleanup.marker'), install = join(root, 'install.marker')
    return { root, observation, currentPath, cleanup, install, current, prepare }
  }
  const base = { schema:'academy-macos-release-observation/v1', status:'OBSERVED', protectedStage:'OWNED', receipts:[] }
  const cases = [
    run('prior', { ...base, publication:'PRIOR', installRequired:true }),
    run('absent', { ...base, publication:'ABSENT', installRequired:true }),
    run('candidate', { ...base, publication:'CANDIDATE', installRequired:false }),
    run('mismatch', { ...base, publication:'PRIOR', installRequired:true }, async path => {
      await writeFile(path, `${JSON.stringify({ ...base, publication:'ABSENT', installRequired:true })}\n`, {mode:0o600})
    }),
    run('noncanonical', { ...base, publication:'PRIOR', installRequired:true }, async path => {
      await writeFile(path, `${JSON.stringify({ ...base, publication:'PRIOR', installRequired:true }, null, 2)}\n`, {mode:0o600})
    }),
    run('foreign', { ...base, publication:'PRIOR', installRequired:true }, async path => writeFile(path, '{}\n', {mode:0o600})),
    run('symlink', { ...base, publication:'PRIOR', installRequired:true }, async path => {
      const target = `${path}.target`; await writeFile(target, `${JSON.stringify({ ...base, publication:'PRIOR', installRequired:true })}\n`, {mode:0o600}); await symlink(target,path)
    }),
  ]
  for (const item of cases) {
    await mkdir(item.root, { mode:0o700 })
    await writeFile(item.currentPath, `${JSON.stringify(item.current)}\n`, {mode:0o600})
    await item.prepare?.(item.observation)
    const script = `set -euo pipefail
observation=$1
observation_result="$($2 $3 $4 "$observation")"
${decision}
: > $5
if [[ "$install_required" == true ]]; then : > $6; fi
`
    const result = spawnSync('/bin/zsh', ['-c', script, 'worker-boundary', item.observation,
      process.execPath, observer, item.currentPath, item.cleanup, item.install], { encoding:'utf8' })
    const hostile = ['mismatch','noncanonical','foreign','symlink'].includes(item.root.split('/').at(-1))
    assert.equal(result.status === 0, !hostile, `${item.root}: ${result.stderr}`)
    await (hostile ? assert.rejects(stat(item.cleanup)) : stat(item.cleanup))
    const expectsInstall = ['prior','absent'].includes(item.root.split('/').at(-1))
    await (expectsInstall ? stat(item.install) : assert.rejects(stat(item.install)))
  }
})

test('bounded terminal and completed install receipts are exact-schema verified', async t => {
  const f = await fixture(t)
  await writeFile(join(f.stage, 'install-result.json'), `${JSON.stringify({
    status:'INSTALLED', releaseSha256:CANDIDATE, releaseRevision:REVISION, previousReleaseSha256:PRIOR,
  })}\n`, { mode:0o600 })
  await writeFile(join(f.stage, 'terminal.json'), `${JSON.stringify({
    schema:'academy-macos-root-preflight-terminal/v1', status:'FAILED', phase:'VERIFY_RELEASE', publication:'UNKNOWN', reason:'UNCLASSIFIED',
  })}\n`, { mode:0o600 })
  const value = await recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) })
  assert.deepEqual(value.receipts.slice(1), [
    {name:'install',status:'INSTALLED',releaseSha256:CANDIDATE},
    {name:'terminal',status:'FAILED',phase:'VERIFY_RELEASE',publication:'UNKNOWN',reason:'UNCLASSIFIED'},
  ])
  await writeFile(join(f.stage, 'install-result.json'), `${JSON.stringify({
    status:'INSTALLED', releaseSha256:CANDIDATE, releaseRevision:REVISION, previousReleaseSha256:PRIOR, extra:true,
  })}\n`, { mode:0o600 })
  await assert.rejects(recoverAcademyReleaseState({ stage:f.stage, expectedUid:f.uid, expectedGid:f.gid,
    readPointer:present, resolveCurrent:current(CANDIDATE) }))
})
