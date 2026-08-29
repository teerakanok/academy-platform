import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { main, runExecutable } from './academy-production-activation-cli.mjs'
import { createAcademyProductionLivePorts } from './academy-production-live-ports.mjs'
import { ACTIVATION_RELEASE, runAcademyProductionActivation } from './identity-production-activation-controller.mjs'
import { IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES } from './identity-production-activation-preflight.mjs'

async function script(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'academy-cli-runner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'helper')
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 })
  await chmod(path, 0o700)
  return path
}

test('runner uses a least-privilege environment and returns bounded JSON', async t => {
  const executable = await script(t, "printf '{\"home\":\"%s\",\"lang\":\"%s\"}' \"$HOME\" \"$LANG\"")
  const result = await runExecutable({ executable, args: [], validUntilMs: Date.now() + 2_000 })
  assert.deepEqual(JSON.parse(result.stdout), { home: '/var/empty', lang: 'C' })
})

test('runner kills and reaps output overflow, hang, and signal exits', async t => {
  const overflow = await script(t, "dd if=/dev/zero bs=1048577 count=1 2>/dev/null | tr '\\000' x; sleep 30")
  await assert.rejects(runExecutable({ executable: overflow, args: [], validUntilMs: Date.now() + 2_000 }))

  const { readFile } = await import('node:fs/promises')
  for (const phase of ['rollback-discovery','rollback','rollback-residue']) {
    const pidPath = join(tmpdir(), `academy-hang-${phase}-${process.pid}.pid`)
    t.after(() => rm(pidPath, { force: true }))
    const hang = await script(t, `echo $$ > '${pidPath}'; trap '' TERM; while :; do sleep 1; done`)
    const execution = runExecutable({ executable: hang, args: [], validUntilMs: Date.now() + 1_500 })
    const completion = execution.then(() => null, error => error)
    let pid
    const readyDeadline = Date.now() + 1_000
    while (Date.now() < readyDeadline) {
      try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
    }
    assert.ok(Number.isSafeInteger(pid) && pid > 1)
    assert.ok(await completion instanceof Error)
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  }

  const signaled = await script(t, 'kill -TERM $$')
  await assert.rejects(runExecutable({ executable: signaled, args: [], validUntilMs: Date.now() + 2_000 }))
})

test('CLI restart publishes a retained terminal journal before provider discovery and leaves no journal', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'academy-cli-terminal-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const D = 'a'.repeat(64)
  const revision = 'fa7bca732aefa58ab7fc2c784676a113b873466b'
  const nowDate = new Date('2026-08-29T03:10:00.000Z')
  const readiness = {schema:'identity-control-live-readiness/v1',observedAt:'2026-08-29T03:05:01.000Z',releaseSha:'4acde50e93285e86171fa4713d4d1c390258c16e',runtimeSha256:'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d',freezeSha256:'aa45a35f3e2d0bf171c6129aef2390a94ab91acf34137bb34685dce4273d5dca',keySetSha256:'d6b557027823437a5fe6378fc26bbd8dffad2d8c58a77c2bcf3583f1350e8e35',artifacts:{accountCenter:{bytes:266240,path:'ac.tar',sha256:'3227c635dbc9235d1861f133615ed2b761351df50f7c3b93c924b088524759f8'},api:{bytes:10127360,path:'api.tar',sha256:'6e1e9e5b140a977d3799c8677649236a25f76d05bad71de288f6d7eeff4f469c'}},activeKeyIds:['academy-prod-2026-08','identity-result-prod-2026-08'],overlapKeyIds:[],registry:{academyClient:{clientId:'academy-web',serviceId:'academy',enabled:true,keyId:'academy-prod-2026-08',reference:'config://client-keys/academy-web/academy-prod-2026-08'},resultSigning:{keyId:'identity-result-prod-2026-08',issuer:'https://accounts.cyberskills.co.th/v1/code/results',revision:1,state:'active'}},production:{mutationStatus:'COMPLETE',mutationCounters:{bootstrapClientsAdopted:1,bootstrapClientsCreated:0,caddyReloads:1,migrationsApplied:1,releasesActivated:1,servicesStarted:1}},evidence:{freezeSha256:'aa45a35f3e2d0bf171c6129aef2390a94ab91acf34137bb34685dce4273d5dca',runtimeSha256:'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d',keySetSha256:'d6b557027823437a5fe6378fc26bbd8dffad2d8c58a77c2bcf3583f1350e8e35',deploymentModeSha256:D,preflightGoSha256:D,deployReceiptsSha256:D,verifyReceiptsSha256:D,registrySha256:D,healthSha256:D,independentReviewSha256:D},readiness:{deploy:'GO',verify:'GO',registry:'ACTIVE',localReadyStatus:200,publicReadyStatus:403,publicReadyBlocked:true},capturedAt:'2026-08-29T03:05:00.000Z',expiresAt:'2026-08-29T03:20:00.000Z',independentReview:{verdict:'PASS',reviewer:'independent-reviewer',counts:{critical:0,high:0,medium:0,low:0}}}
  const readinessPath = join(root, 'readiness.json')
  const planPath = join(root, 'plan.json'), authorityPath = join(root, 'authority.json')
  const journalPath = join(root, 'journal.json'), receiptPath = join(root, 'receipt.json')
  await writeFile(readinessPath, `${JSON.stringify(readiness)}\n`, { mode: 0o600 })
  const readinessSha256 = createHash('sha256').update(`${JSON.stringify(readiness)}\n`).digest('hex')
  const plan = {schema:'academy-production-activation-controller-plan/v1',identityReadinessPath:readinessPath,identityRestore:{status:'MATCH',receiptSha256:D},academy:{sourceRevision:revision,releaseRevision:revision},workerName:'cyberskills-academy',callbackUri:'https://academy.cyberskills.co.th/auth/callback'}
  await writeFile(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 })
  const common = ['--authority','{AUTHORITY_ID}','--release','{RELEASE_REVISION}','--readiness','{IDENTITY_READINESS_SHA256}','--valid-until','{VALID_UNTIL}']
  const operationBindings = {inspectRecovery:['--mode','{MODE}','--journal','{JOURNAL_SHA256}'],backupRestore:['--restore','{IDENTITY_RESTORE_SHA256}'],applyMigrations:['--ordered','{ORDERED_MIGRATIONS}'],uploadCandidate:['--source','{SOURCE_REVISION}','--traffic','{TRAFFIC}'],activateTraffic:['--expected-deployment','{EXPECTED_DEPLOYMENT_ID}','--expected-version','{EXPECTED_VERSION_ID}','--candidate','{CANDIDATE_VERSION_ID}','--traffic','{TRAFFIC}'],smokeP1P7:['--deployment','{DEPLOYMENT_ID}','--version','{VERSION_ID}','--config','{CONFIG_SHA256}'],rollbackTraffic:['--expected-deployment','{EXPECTED_DEPLOYMENT_ID}','--expected-version','{EXPECTED_VERSION_ID}','--target','{TARGET_VERSION_ID}','--prior','{PRIOR_DEPLOYMENT_ID}'],checkResidue:['--deployment','{DEPLOYMENT_ID}','--version','{VERSION_ID}']}
  const operations = {}
  for (const [name, bindings] of Object.entries(operationBindings)) {
    const executable = join(root, name)
    const body = '#!/bin/sh\nexit 0\n'
    await writeFile(executable, body, { mode: 0o700 })
    operations[name] = { executable, sha256: createHash('sha256').update(body).digest('hex'), args: [...common, ...bindings] }
  }
  const authority = {schema:'academy-production-live-authority/v1',authorityId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authorizedBy:'founder',validFrom:'2026-08-29T03:00:00Z',validUntil:'2026-08-29T04:00:00Z',releaseRevision:revision,identityReadinessSha256:readinessSha256,target:{workerName:'cyberskills-academy',pool:'Pool A',database:'postgres',schema:'academy'},operations}
  await writeFile(authorityPath, `${JSON.stringify(authority)}\n`, { mode: 0o600 })
  const ids = { currentDeployment:'11111111-1111-4111-8111-111111111111', currentVersion:'22222222-2222-4222-8222-222222222222', candidate:'33333333-3333-4333-8333-333333333333', active:'44444444-4444-4444-8444-444444444444' }
  const configSha256 = createHash('sha256').update(`${JSON.stringify(IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES)}\n`).digest('hex')
  let calls = 0
  const fakeRun = async call => {
    calls += 1
    const output = call.operation === 'inspectRecovery' ? {deployments:[{id:ids.currentDeployment,created_on:'2026-08-29T03:00:00Z',versions:[{version_id:ids.currentVersion,percentage:100}]}]}
      : call.operation === 'backupRestore' ? {status:'MATCH',operation:'academy-backup-restore',identityRestoreReceiptSha256:D,receiptSha256:D}
      : call.operation === 'applyMigrations' ? {status:'PASS',operation:'academy-migrations-0021-0027',ordered:['0021','0022','0023','0024','0025','0026','0027'],receiptSha256:D}
      : call.operation === 'uploadCandidate' ? {status:'PASS',workerName:'cyberskills-academy',versionId:ids.candidate,sourceRevision:revision,trafficPercentage:0,configuredNamesSha256:configSha256,receiptSha256:D}
      : call.operation === 'activateTraffic' ? {status:'PASS',previousDeploymentId:ids.currentDeployment,previousVersionId:ids.currentVersion,deploymentId:ids.active,activeVersionId:ids.candidate,trafficPercentage:100,receiptSha256:D}
      : call.operation === 'smokeP1P7' ? {status:'PASS',deploymentId:ids.active,versionId:ids.candidate,configuredNamesSha256:configSha256,checks:['P1','P2','P3','P4','P5','P6','P7'],receiptSha256:D}
      : {status:'PASS',deploymentId:ids.active,versionId:ids.candidate,receiptSha256:D}
    return { status: 0, stdout: JSON.stringify(output) }
  }
  const ports = await createAcademyProductionLivePorts({authorityPath,run:fakeRun,expected:{releaseRevision:revision,identityReadinessSha256:readinessSha256},clock:()=>nowDate.getTime(),expectedExecutableUid:process.getuid()})
  await runAcademyProductionActivation({plan,ports,release:ACTIVATION_RELEASE,observedAt:nowDate,journalPath,receiptPath})
  const callsBeforeRestart = calls
  const terminalJournal = JSON.parse(await readFile(journalPath, 'utf8'))
  const nonterminalJournal = { ...terminalJournal, phase:'active', operation:'traffic-activation', state:'attempting', finalReceipt:null, finalReceiptSha256:null }
  await writeFile(journalPath, `${JSON.stringify(nonterminalJournal)}\n`, { mode: 0o600 })
  const expiredReadiness = { ...readiness, expiresAt:'2026-08-29T03:09:59.000Z' }
  await writeFile(readinessPath, `${JSON.stringify(expiredReadiness)}\n`, { mode: 0o600 })
  await assert.rejects(main([planPath,authorityPath,journalPath,receiptPath,ACTIVATION_RELEASE],{observedAt:nowDate,clock:()=>nowDate.getTime(),run:fakeRun,expectedExecutableUid:process.getuid()}))
  assert.equal(JSON.parse(await readFile(journalPath, 'utf8')).phase, 'active', 'nonterminal journal must remain fresh-authority gated')
  await writeFile(journalPath, `${JSON.stringify(terminalJournal)}\n`, { mode: 0o600 })
  const expiredAuthority = { ...authority, validUntil:'2026-08-29T03:09:59Z' }
  await writeFile(authorityPath, `${JSON.stringify(expiredAuthority)}\n`, { mode: 0o600 })
  await rm(operations.inspectRecovery.executable)
  const status = await main([planPath,authorityPath,journalPath,receiptPath,ACTIVATION_RELEASE],{observedAt:nowDate,clock:()=>nowDate.getTime(),run:fakeRun,expectedExecutableUid:process.getuid()})
  assert.equal(status, 'ACTIVATED')
  assert.equal(calls, callsBeforeRestart, 'terminal recovery must publish before provider discovery')
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).status, 'ACTIVATED')
  await assert.rejects(readFile(journalPath), { code: 'ENOENT' })
})
