import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { build } from 'esbuild'

import {
  createAcademyIdentityWorkerDiagnosticProductionPorts,
  computeAcademyIdentityWorkerDiagnosticSourceSha256,
  runBoundedProcess,
  runAcademyIdentityWorkerDiagnosticTransaction,
} from './academy-identity-worker-diagnostic-controller.mjs'

const PRODUCTION_SOURCE_PATHS = Object.freeze([
  'worker/identity-client-assertion-secret-diagnostic-entry.ts',
  'worker/identity-client-assertion-secret-diagnostic.ts',
  'worker/edge-rate-limiter-do.ts',
  'wrangler.identity-client-assertion-diagnostic.jsonc',
  'src/lib/edge-rate-limit-policy.ts',
  'src/lib/identity/client-assertion-provider.ts',
  'src/lib/identity/client-assertion-webcrypto-signer.ts',
  'scripts/current-deployment.mjs',
  'scripts/academy-identity-worker-diagnostic-controller.mjs',
  'package-lock.json',
])

const IDS = Object.freeze({
  baselineDeployment: '11111111-1111-4111-8111-111111111111',
  baselineVersion: '22222222-2222-4222-8222-222222222222',
  candidateVersion: '33333333-3333-4333-8333-333333333333',
  splitDeployment: '44444444-4444-4444-8444-444444444444',
  restoredDeployment: '55555555-5555-4555-8555-555555555555',
})
const SOURCE = Object.freeze({ revision: 'a'.repeat(40), sha256: 'b'.repeat(64) })
const OPERATION_ID = '66666666-6666-4666-8666-666666666666'
const HEALTH = Object.freeze({ root: 'ACCESS_302', callback: 'ACCESS_302' })
const BASELINE_VERSION = Object.freeze({
  versionId: IDS.baselineVersion,
  bindings: [
    { name: 'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK', type: 'secret_text' },
    { name: 'ANOTHER_EXISTING_SECRET', type: 'secret_text' },
    { name: 'ASSETS', type: 'assets' },
  ],
})

test('transaction admits exactly one request and restores the exact baseline', async () => {
  const fixture = transactionFixture()
  const result = await runAcademyIdentityWorkerDiagnosticTransaction(fixture.options)
  assert.equal(result.status, 'COMPLETE_BASELINE_RESTORED')
  assert.equal(result.marker, 'PASS_CODE_NOT_FOUND')
  assert.equal(result.requestCount, 1)
  assert.equal(result.candidateState, 'INACTIVE_IMMUTABLE_VERSION_RETAINED')
  assert.equal(result.restoredDeploymentId, IDS.restoredDeployment)
  assert.deepEqual(fixture.calls.map(call => call.name), [
    'verifySource', 'inspectDeployment', 'inspectVersion', 'capturePublicHealth', 'prepareAccess',
    'uploadCandidate', 'revalidateSource', 'inspectDeployment', 'deployZeroPercentCandidate',
    'inspectDeployment', 'capturePublicHealth', 'invokeCandidateOnce', 'restoreBaseline',
    'inspectDeployment', 'capturePublicHealth', 'verifyCandidateDetached', 'close',
  ])
  assert.equal(fixture.calls.filter(call => call.name === 'invokeCandidateOnce').length, 1)
  assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
  assert.ok(fixture.observedNonce?.every(byte => byte === 0))
  assert.deepEqual(fixture.state, baselineDeployment(IDS.restoredDeployment))
})

test('baseline CAS drift stops before split and still clears nonce and access state', async () => {
  const fixture = transactionFixture({ driftBeforeSplit: true })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
  assert.equal(fixture.calls.some(call => call.name === 'deployZeroPercentCandidate'), false)
  assert.equal(fixture.calls.some(call => call.name === 'invokeCandidateOnce'), false)
  assert.equal(fixture.calls.some(call => call.name === 'restoreBaseline'), false)
  assert.equal(fixture.calls.at(-1)?.name, 'close')
  assert.ok(fixture.observedNonce?.every(byte => byte === 0))
})

test('reviewed source and baseline pins fail before Access acquisition or upload', async () => {
  const wrongSource = transactionFixture({ expectedSource: { ...SOURCE, sha256: '0'.repeat(64) } })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(wrongSource.options), fixedFailure)
  assert.deepEqual(wrongSource.calls.map(call => call.name), ['verifySource', 'close'])

  const wrongBaseline = transactionFixture({
    expectedBaseline: {
      deploymentId: '77777777-7777-4777-8777-777777777777',
      versionId: IDS.baselineVersion,
    },
  })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(wrongBaseline.options), fixedFailure)
  assert.deepEqual(wrongBaseline.calls.map(call => call.name), [
    'verifySource', 'inspectDeployment', 'inspectDeployment', 'close',
  ])
  assert.equal(wrongBaseline.calls.some(call => call.name === 'prepareAccess'), false)
  assert.equal(wrongBaseline.calls.some(call => call.name === 'uploadCandidate'), false)
})

test('ambiguous request failure is never retried and restores baseline once', async () => {
  const fixture = transactionFixture({ failStage: 'invokeCandidateOnce' })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
  assert.equal(fixture.calls.filter(call => call.name === 'invokeCandidateOnce').length, 1)
  assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
  assert.deepEqual(fixture.state, baselineDeployment(IDS.restoredDeployment))
  assert.ok(fixture.observedNonce?.every(byte => byte === 0))
})

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  for (const [stage, occurrence = 1] of [
    ['deployZeroPercentCandidate'],
    ['inspectDeployment', 3],
    ['capturePublicHealth', 2],
    ['invokeCandidateOnce'],
  ]) {
    test(`${signal} at post-split ${stage} stops progression and serializes one restore`, async () => {
      const fixture = transactionFixture({ emitAt: { signal, stage, occurrence } })
      await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
      assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
      assert.equal(fixture.calls.some(call => call.name === 'verifyCandidateDetached'), true)
      assert.deepEqual(fixture.state, baselineDeployment(IDS.restoredDeployment))
      assert.equal(fixture.signalSource.listenerCount(signal), 0)
      assert.ok(fixture.observedNonce?.every(byte => byte === 0))
    })
  }
}

test('an upload response loss reconciles the owned inactive candidate without split or retry', async () => {
  const fixture = transactionFixture({ failAfterStage: 'uploadCandidate', reconcileCandidate: true })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
  assert.equal(fixture.calls.filter(call => call.name === 'uploadCandidate').length, 1)
  assert.equal(fixture.calls.filter(call => call.name === 'reconcileOwnedCandidate').length, 1)
  assert.equal(fixture.calls.some(call => call.name === 'deployZeroPercentCandidate'), false)
  assert.equal(fixture.calls.some(call => call.name === 'invokeCandidateOnce'), false)
  assert.equal(fixture.calls.some(call => call.name === 'verifyCandidateDetached'), true)
  assert.ok(fixture.observedNonce?.every(byte => byte === 0))
})

test('split verification failure restores exact baseline without invoking the diagnostic', async () => {
  const fixture = transactionFixture({ driftAfterSplit: true })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
  assert.equal(fixture.calls.some(call => call.name === 'invokeCandidateOnce'), false)
  assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
  assert.deepEqual(fixture.state, baselineDeployment(IDS.restoredDeployment))
})

test('restore uncertainty overrides a diagnostic result and cannot report success', async () => {
  const fixture = transactionFixture({ failRestore: true })
  await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
  assert.equal(fixture.calls.filter(call => call.name === 'invokeCandidateOnce').length, 1)
  assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
})

test('production adapter transmits nonce only over fd3 and executes exact split/request/restore', async () => {
  let deployment = baselineDeployment()
  let candidateTag = ''
  let candidateMessage = ''
  let uploaded = false
  const calls = []
  const secretPayloads = []
  const accessToken = 'eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJhY2FkZW15In0.c2lnbmF0dXJl'
  let requestCount = 0
  let accessOutput = null
  const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const runProcess = async input => {
    const args = input.args
    calls.push({ executable: input.executable, args: [...args], hasSecretInput: Buffer.isBuffer(input.secretInput) })
    if (input.executable === '/usr/bin/git') {
      if (args.includes('rev-parse')) return output(`${'a'.repeat(40)}\n`)
      if (args.includes('status')) return output('')
    }
    if (args[0] === '--version' && input.executable.endsWith('cloudflared')) {
      return output('cloudflared version 2026.6.0 (built 2026-06-08T18:16:09Z)\n')
    }
    if (args[0] === 'access') {
      accessOutput = output(`${accessToken}\n`)
      return accessOutput
    }
    const wranglerArgs = args.slice(1)
    if (wranglerArgs[0] === '--version') return output('4.120.0\n')
    if (wranglerArgs[0] === 'deployments') return output(deploymentsJson(deployment))
    if (wranglerArgs[0] === 'versions' && wranglerArgs[1] === 'list') {
      const versions = [{
        id: IDS.baselineVersion,
        metadata: { created_on: '2026-09-03T00:00:00Z' },
        annotations: {},
      }]
      if (uploaded) versions.push({
        id: IDS.candidateVersion,
        metadata: { created_on: '2026-09-03T00:01:00Z' },
        annotations: { 'workers/tag': candidateTag, 'workers/message': candidateMessage },
      })
      return output(JSON.stringify(versions))
    }
    if (wranglerArgs[0] === 'versions' && wranglerArgs[1] === 'view') {
      const versionId = wranglerArgs[2]
      return output(JSON.stringify({
        id: versionId,
        resources: { bindings: versionId === IDS.baselineVersion ? BASELINE_VERSION.bindings : [
          { name: 'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK', type: 'secret_text' },
          { name: 'ANOTHER_EXISTING_SECRET', type: 'secret_text' },
          { name: 'ACADEMY_IDENTITY_DIAGNOSTIC_NONCE', type: 'secret_text' },
          { name: 'CF_VERSION_METADATA', type: 'version_metadata' },
        ] },
      }))
    }
    if (wranglerArgs[0] === 'versions' && wranglerArgs[1] === 'upload') {
      const tagIndex = wranglerArgs.indexOf('--tag')
      const messageIndex = wranglerArgs.indexOf('--message')
      candidateTag = wranglerArgs[tagIndex + 1]
      candidateMessage = wranglerArgs[messageIndex + 1]
      secretPayloads.push(JSON.parse(input.secretInput.toString('utf8')))
      uploaded = true
      return output('uploaded\n')
    }
    if (wranglerArgs[0] === 'versions' && wranglerArgs[1] === 'deploy') {
      if (wranglerArgs.includes(`${IDS.candidateVersion}@0`)) {
        deployment = splitDeployment()
      } else {
        deployment = baselineDeployment(IDS.restoredDeployment)
      }
      return output('deployed\n')
    }
    throw new Error('unexpected command')
  }
  const fetchPort = async (url, init) => {
    if (url !== 'https://academy.cyberskills.co.th/.well-known/academy-ops/identity-client-assertion-custody-v1') {
      return accessRedirect(url)
    }
    requestCount += 1
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['cf-access-token'], accessToken)
    assert.equal(init.headers['cloudflare-workers-version-overrides'], `cyberskills-academy="${IDS.candidateVersion}"`)
    assert.match(init.headers['x-academy-diagnostic-nonce'], /^[A-Za-z0-9_-]{43}$/)
    const result = new Response('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=PASS_CODE_NOT_FOUND\n', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
    Object.defineProperty(result, 'url', { value: url })
    return result
  }
  const ports = createAcademyIdentityWorkerDiagnosticProductionPorts({
    root,
    wrangler: `${root}/node_modules/wrangler/wrangler-dist/cli.js`,
    cloudflared: '/opt/homebrew/Cellar/cloudflared/2026.6.0/bin/cloudflared',
    node: process.execPath,
    runProcess,
    fetchPort,
    delay: async () => {},
  })
  const expectedSource = await ports.verifySource({ deadline: Date.now() + 30_000 })
  calls.length = 0
  const result = await runAcademyIdentityWorkerDiagnosticTransaction({
    ports,
    expectedBaseline: { deploymentId: IDS.baselineDeployment, versionId: IDS.baselineVersion },
    expectedSource,
    nonceSource: () => Buffer.alloc(32, 7),
    operationIdSource: () => OPERATION_ID,
  })
  assert.equal(result.marker, 'PASS_CODE_NOT_FOUND')
  assert.ok(accessOutput.stdout.every(byte => byte === 0))
  assert.equal(requestCount, 1)
  assert.equal(secretPayloads.length, 1)
  assert.deepEqual(Object.keys(secretPayloads[0]), ['ACADEMY_IDENTITY_DIAGNOSTIC_NONCE'])
  assert.match(secretPayloads[0].ACADEMY_IDENTITY_DIAGNOSTIC_NONCE, /^[A-Za-z0-9_-]{43}$/)
  const flattenedArgs = JSON.stringify(calls.map(call => call.args))
  assert.equal(flattenedArgs.includes(secretPayloads[0].ACADEMY_IDENTITY_DIAGNOSTIC_NONCE), false)
  const upload = calls.find(call => call.args.includes('upload'))
  assert.equal(upload.args[upload.args.indexOf('--secrets-file') + 1], '/dev/fd/3')
  assert.equal(upload.args.includes('--strict'), true)
  assert.equal(upload.args.includes('--keep-vars'), false)
  assert.ok(calls.some(call => call.args.includes(`${IDS.baselineVersion}@100`)
    && call.args.includes(`${IDS.candidateVersion}@0`)))
  assert.ok(calls.some(call => call.args.includes(`${IDS.baselineVersion}@100`)
    && !call.args.includes(`${IDS.candidateVersion}@0`)))
  await assert.rejects(ports.invokeCandidateOnce({
    candidate: {
      versionId: IDS.candidateVersion,
      tag: candidateTag,
      messageSha256: '0'.repeat(64),
    },
    nonce: Buffer.alloc(32, 7),
    deadline: Date.now() + 1_000,
  }), fixedFailure)
  assert.equal(requestCount, 1)
})

test('bounded process kills an overflowing process group before its deadline', async () => {
  const startedAt = Date.now()
  await assert.rejects(runBoundedProcess({
    executable: process.execPath,
    args: ['-e', `
      const { spawn } = require('node:child_process')
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      process.stdout.write(Buffer.alloc(1024 * 1024 + 1, 65))
      setInterval(() => {}, 1000)
    `],
    cwd: new URL('..', import.meta.url).pathname.replace(/\/$/, ''),
    deadlineMs: Date.now() + 5_000,
  }), fixedFailure)
  assert.ok(Date.now() - startedAt < 4_000)
})

test('sensitive process output clears original chunks and leaves one caller-owned buffer', async () => {
  const probe = processProbe('success')
  const result = await probe.run()
  assert.equal(result.stdout.toString('utf8'), 'sensitive-captured-output')
  assert.ok(probe.chunk.every(byte => byte === 0))
  result.stdout.fill(0)
  assert.ok(result.stdout.every(byte => byte === 0))
})

for (const stream of ['stdout', 'fd3']) {
  test(`${stream} stream error after split is caught, cleared, and restores baseline once`, async () => {
    const probe = processProbe(stream)
    const fixture = transactionFixture({ invokeResult: () => probe.run() })
    await assert.rejects(runAcademyIdentityWorkerDiagnosticTransaction(fixture.options), fixedFailure)
    assert.equal(probe.killCount, 1)
    assert.ok(probe.chunk.every(byte => byte === 0))
    assert.equal(fixture.calls.filter(call => call.name === 'invokeCandidateOnce').length, 1)
    assert.equal(fixture.calls.filter(call => call.name === 'restoreBaseline').length, 1)
    assert.deepEqual(fixture.state, baselineDeployment(IDS.restoredDeployment))
    assert.equal(fixture.calls.at(-1)?.name, 'close')
  })
}

test('production source and config bind the nonce before private-key access', async () => {
  const root = new URL('..', import.meta.url)
  const [worker, config, controller] = await Promise.all([
    readFile(new URL('worker/identity-client-assertion-secret-diagnostic.ts', root), 'utf8'),
    readFile(new URL('wrangler.identity-client-assertion-diagnostic.jsonc', root), 'utf8'),
    readFile(new URL('scripts/academy-identity-worker-diagnostic-controller.mjs', root), 'utf8'),
  ])
  assert.match(worker, /constantTimeOpaqueEqual\([\s\S]*ACADEMY_IDENTITY_DIAGNOSTIC_NONCE/)
  assert.match(worker, /const admitted = requestAdmission\([\s\S]+if \(!admitted\)[\s\S]+await runDiagnostic\(/)
  assert.deepEqual(JSON.parse(config).secrets.required, [
    'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK',
    'ACADEMY_IDENTITY_DIAGNOSTIC_NONCE',
  ])
  assert.match(controller, /'--secrets-file', '\/dev\/fd\/3'/)
  assert.match(controller, /delete environment\.NODE_OPTIONS[\s\S]+delete environment\.NODE_PATH/)
  assert.doesNotMatch(controller, /console\.|secretInput\.toString\(/)
})

test('source digest binds every diagnostic and Durable Object source byte', async () => {
  const root = new URL('..', import.meta.url)
  const expected = createHash('sha256')
  for (const path of [...PRODUCTION_SOURCE_PATHS].sort()) {
    expected.update(`${path}\0`)
    expected.update(await readFile(new URL(path, root)))
    expected.update('\0')
  }
  assert.equal(
    await computeAcademyIdentityWorkerDiagnosticSourceSha256(root.pathname.replace(/\/$/, '')),
    expected.digest('hex'),
  )
})

test('production bundle exports only the diagnostic handler and existing Durable Object class', async () => {
  const result = await build({
    entryPoints: ['worker/identity-client-assertion-secret-diagnostic-entry.ts'],
    bundle: true,
    write: false,
    platform: 'neutral',
    format: 'esm',
    external: ['cloudflare:workers'],
    metafile: true,
    logLevel: 'silent',
  })
  const output = Object.values(result.metafile.outputs)
  assert.equal(output.length, 1)
  assert.deepEqual(output[0].exports.sort(), ['EdgeRateLimiter', 'default'])
  const bundledInputs = Object.keys(result.metafile.inputs).sort()
  assert.deepEqual(bundledInputs, [
    'src/lib/identity/client-assertion-provider.ts',
    'src/lib/identity/client-assertion-webcrypto-signer.ts',
    'worker/edge-rate-limiter-do.ts',
    'worker/identity-client-assertion-secret-diagnostic-entry.ts',
    'worker/identity-client-assertion-secret-diagnostic.ts',
  ])
  for (const path of bundledInputs) assert.ok(PRODUCTION_SOURCE_PATHS.includes(path))
})

function transactionFixture(options = {}) {
  const calls = []
  const signalSource = new EventEmitter()
  let state = baselineDeployment()
  let observedNonce = null
  const call = async (name, input, result) => {
    calls.push({ name, input })
    if (options.failStage === name) throw new Error('private failure')
    const value = typeof result === 'function' ? result() : result
    const occurrence = calls.filter(call => call.name === name).length
    if (options.emitAt?.stage === name && options.emitAt.occurrence === occurrence) {
      signalSource.emit(options.emitAt.signal)
    }
    if (options.failAfterStage === name) throw new Error('private response loss')
    return value
  }
  const ports = {
    verifySource: input => call('verifySource', input, SOURCE),
    revalidateSource: input => call('revalidateSource', input),
    prepareAccess: input => call('prepareAccess', input),
    inspectDeployment: input => call('inspectDeployment', input, () => {
      if (options.driftBeforeSplit && calls.filter(value => value.name === 'inspectDeployment').length === 2) {
        return baselineDeployment('77777777-7777-4777-8777-777777777777')
      }
      if (options.driftAfterSplit && state.versions.length === 2
        && calls.filter(value => value.name === 'inspectDeployment').length === 3) {
        return { ...state, versions: [
          { versionId: IDS.baselineVersion, percentage: 99 },
          { versionId: IDS.candidateVersion, percentage: 1 },
        ] }
      }
      return structuredClone(state)
    }),
    inspectVersion: input => call('inspectVersion', input, structuredClone(BASELINE_VERSION)),
    capturePublicHealth: input => call('capturePublicHealth', input, { ...HEALTH }),
    uploadCandidate: input => call('uploadCandidate', input, () => {
      observedNonce = input.nonce
      return { versionId: IDS.candidateVersion, tag: 'academy-secret-diagnostic-aaaaaaaaaa-66666666', messageSha256: 'c'.repeat(64) }
    }),
    reconcileOwnedCandidate: input => call('reconcileOwnedCandidate', input,
      options.reconcileCandidate
        ? { versionId: IDS.candidateVersion, tag: 'academy-secret-diagnostic-aaaaaaaaaa-66666666', messageSha256: 'c'.repeat(64) }
        : null),
    deployZeroPercentCandidate: input => call('deployZeroPercentCandidate', input, () => {
      state = splitDeployment()
      return structuredClone(state)
    }),
    invokeCandidateOnce: input => call('invokeCandidateOnce', input,
      options.invokeResult ?? (() => 'PASS_CODE_NOT_FOUND')),
    restoreBaseline: input => call('restoreBaseline', input, () => {
      if (options.failRestore) throw new Error('restore failed')
      state = baselineDeployment(IDS.restoredDeployment)
      return structuredClone(state)
    }),
    verifyCandidateDetached: input => call('verifyCandidateDetached', input),
    close: () => call('close'),
  }
  return {
    calls,
    signalSource,
    get state() { return state },
    get observedNonce() { return observedNonce },
    options: {
      ports,
      signalSource,
      expectedBaseline: options.expectedBaseline
        ?? { deploymentId: IDS.baselineDeployment, versionId: IDS.baselineVersion },
      expectedSource: options.expectedSource ?? SOURCE,
      nonceSource: () => Buffer.alloc(32, 9),
      operationIdSource: () => OPERATION_ID,
    },
  }
}

function baselineDeployment(deploymentId = IDS.baselineDeployment) {
  return { deploymentId, versions: [{ versionId: IDS.baselineVersion, percentage: 100 }] }
}

function splitDeployment() {
  return {
    deploymentId: IDS.splitDeployment,
    versions: [
      { versionId: IDS.baselineVersion, percentage: 100 },
      { versionId: IDS.candidateVersion, percentage: 0 },
    ],
  }
}

function deploymentsJson(current) {
  return JSON.stringify([{
    id: current.deploymentId,
    created_on: current.versions.length === 1 && current.deploymentId === IDS.baselineDeployment
      ? '2026-09-03T00:00:00Z'
      : current.versions.length === 2 ? '2026-09-03T00:01:00Z' : '2026-09-03T00:02:00Z',
    versions: current.versions.map(version => ({
      version_id: version.versionId,
      percentage: version.percentage,
    })),
  }])
}

function output(value) {
  return { status: 0, signal: null, stdout: Buffer.from(value) }
}

function processProbe(outcome) {
  const child = new EventEmitter()
  const stdout = new EventEmitter()
  const fd3 = new EventEmitter()
  const chunk = Buffer.from('sensitive-captured-output')
  let killCount = 0
  child.pid = 987_654_321
  child.stdout = stdout
  child.stdio = [null, stdout, null, fd3]
  fd3.end = () => {}
  const spawnPort = () => {
    queueMicrotask(() => {
      stdout.emit('data', chunk)
      if (outcome === 'success') child.emit('close', 0, null)
      else (outcome === 'stdout' ? stdout : fd3).emit('error', new Error('private stream failure'))
    })
    return child
  }
  const terminateGroup = () => {
    killCount += 1
    queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
  }
  return {
    chunk,
    get killCount() { return killCount },
    run: () => runBoundedProcess({
      executable: process.execPath,
      args: ['-e', ''],
      cwd: new URL('..', import.meta.url).pathname.replace(/\/$/, ''),
      deadlineMs: Date.now() + 5_000,
      secretInput: outcome === 'fd3' ? Buffer.alloc(32, 1) : undefined,
      sensitiveOutput: true,
      spawnPort,
      terminateGroup,
      isGroupAlive: () => false,
    }),
  }
}

function accessRedirect(url) {
  const response = new Response(null, {
    status: 302,
    headers: { location: `https://dry-grass-c390.cloudflareaccess.com/cdn-cgi/access/login/academy.cyberskills.co.th?redirect_url=${encodeURIComponent(url)}` },
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function fixedFailure(error) {
  return error instanceof Error && error.message === 'Academy Identity Worker diagnostic transaction failed'
}
