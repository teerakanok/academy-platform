import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { captureAttemptProfileSnapshot, projectAttemptProfileResult } from '../src/lib/profile/attempt-evidence.ts'
import { createCoreTransport } from '../ops/profile-export/core-transport.mjs'
import { exportAttemptProfileCycle } from '../ops/profile-export/export-cycle.mjs'

const issuer = 'https://accounts.example.test/'
const captured = () => captureAttemptProfileSnapshot({ principal: { issuer, subject: 'learner-1' },
  courseSlug: 'course', nodeId: 'capstone', courseVersion: '1', assessed: true, integrityEnforced: true, environment: 'production' })
const row = () => ({ attempt_id: '00000000-0000-4000-8000-000000000001', passed: true,
  recorded_at: new Date().toISOString(), snapshot: { ...captured(), actorRole: 'learner', testActivity: false, policyRevision: 1, assistance: 'unknown' } })

test('issue context is unknown; neither production environment nor server grading invents learner/test context', () => {
  assert.equal(captured().actorRole, 'unknown')
  assert.equal(captureAttemptProfileSnapshot({ principal: { issuer, subject: 'learner-1' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: '1', assessed: true,
    integrityEnforced: true, environment: 'production' }).assistance, 'unknown')
  assert.equal(captureAttemptProfileSnapshot({ principal: { issuer, subject: 'learner-1' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: '1', assessed: true,
    integrityEnforced: false, environment: 'production' }).integrityEnforced, false)
  const source = { ...row(), snapshot: captured() }
  assert.deepEqual(projectAttemptProfileResult(source, issuer), { ok: false, reason: 'context_unproven' })
  for (const change of [{ mode: 'practice' }, { testActivity: true }, { testActivity: null }, { actorRole: 'staff' },
    { actorRole: 'ta' }, { environment: 'staging' }, { assistance: 'guided' }, { assistance: 'independent' },
    { integrityEnforced: false }, { integrityEnforced: undefined }]) {
    assert.equal(projectAttemptProfileResult({ ...row(), snapshot: { ...row().snapshot, ...change } }, issuer).ok, false)
  }
  assert.equal(projectAttemptProfileResult(row(), 'https://other.example.test/').ok, false)
  // A later account role does not rewrite the source snapshot issued earlier.
  const learnerSnapshotWithLaterStaffRole = { ...row(), accountRole: 'staff' }
  const result = projectAttemptProfileResult(learnerSnapshotWithLaterStaffRole, issuer)
  assert.equal(result.ok, true)
  assert.equal(result.event.context.assistance, 'unknown')
  assert.deepEqual(result.event.outcome, { score: 1, maxScore: 1 })
  assert.deepEqual(projectAttemptProfileResult({ ...row(), passed: false }, issuer).event.outcome, { score: 0, maxScore: 1 })
})

test('activity context controls projection without blacklisting a person who is TA elsewhere', () => {
  // These inputs test the projector contract, not a real actor-context attestation.
  const trustedLearningInput = { ...row(), otherCourseRole: 'ta' }
  const taActivity = { ...row(), snapshot: { ...row().snapshot, actorRole: 'ta', testActivity: true } }
  const testActivity = { ...row(), snapshot: { ...row().snapshot, actorRole: 'test', testActivity: true } }
  const unknownActivity = { ...row(), snapshot: { ...captured(), assistance: 'unknown',
    testActivity: false, policyRevision: 1 }, otherCourseRole: 'learner' }
  assert.equal(projectAttemptProfileResult(trustedLearningInput, issuer).ok, true)
  for (const activity of [taActivity, testActivity, unknownActivity]) {
    assert.deepEqual(projectAttemptProfileResult(activity, issuer), { ok: false, reason: 'context_unproven' })
  }
  assert.equal(projectAttemptProfileResult(trustedLearningInput, issuer).ok, true)
})

test('disabled export makes no source, credential or network calls', async () => {
  const fail = () => { throw new Error('unexpected access') }
  const result = await exportAttemptProfileCycle({ store: { readPending: fail }, transport: createCoreTransport({ fetchImpl: fail }), trustedIssuer: issuer })
  assert.equal(result.status, 'disabled')
})

test('failed delivery retains source, blocked rows do not starve later pages, and lost acknowledgement replays same result', async () => {
  let ack = 0
  let delivery = 0
  const sent = []
  const rows = [{ ...row(), snapshot: captured() }, { ...row(), attempt_id: '00000000-0000-4000-8000-000000000002' }]
  const store = { async readPending(after) { return rows.filter((r) => !after || r.attempt_id > after).slice(0, 1) },
    async prepare(ids) { return ids },
    async acknowledge() { ack++; if (ack === 1) throw new Error('ack lost') } }
  const transport = { enabled: true, async ingest(events) { delivery++; sent.push(events) } }
  await assert.rejects(exportAttemptProfileCycle({ store, transport, trustedIssuer: issuer }), /ack lost/)
  const result = await exportAttemptProfileCycle({ store, transport, trustedIssuer: issuer })
  assert.equal(delivery, 2)
  assert.deepEqual(sent[0], sent[1])
  assert.equal(result.blocked.context_unproven, 1)
  assert.equal(result.delivered, 1)
  ack = 0
  await assert.rejects(exportAttemptProfileCycle({ store, transport: { enabled: true, async ingest() { throw new Error('outage') } }, trustedIssuer: issuer }), /outage/)
  assert.equal(ack, 0)
})

test('prepare is required before HTTP; an account withdrawn since readPending is never sent or acknowledged', async () => {
  const source = { ...row(), source_key: `${row().attempt_id}:0` }
  const trace = []
  const store = {
    async readPending(after) { return after ? [] : [source] },
    async prepare(ids) { trace.push(['prepare', ids]); return [] },
    async acknowledge() { throw new Error('withdrawn source must not be acknowledged') },
  }
  const result = await exportAttemptProfileCycle({ store, trustedIssuer: issuer,
    transport: { enabled: true, async ingest() { throw new Error('withdrawn source must not be sent') } } })
  assert.deepEqual(trace, [['prepare', [source.source_key]]])
  assert.equal(result.delivered, 0)
  assert.equal(result.blocked.source_not_admitted, 1)
})

test('transport uses existing Core HTTP authentication, strict schema, replay protection and namespace authorization', { skip: !process.env.CORE_DIST_ROOT }, async () => {
  const root = process.env.CORE_DIST_ROOT
  const { ClientRegistry } = await import(`${root}/src/auth.js`)
  const { MemoryReplayGuard } = await import(`${root}/src/vendor/service-auth/signed-request.js`)
  const { buildCoreApp } = await import(`${root}/src/http.js`)
  const { MemoryCoreStore } = await import(`${root}/src/store.js`)
  const { LearningProfileService } = await import(`${root}/src/service.js`)
  const { PolicyIndex, POLICY_V1 } = await import(`${root}/src/policy.js`)
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const registry = await ClientRegistry.create([{ clientId: 'academy-api', productNamespace: 'academy',
    principalIssuers: [issuer], operations: ['events.ingest'], keys: { test: publicKey.export({ format: 'jwk' }) } }],
  { environment: 'test', replayGuard: new MemoryReplayGuard() })
  const coreStore = new MemoryCoreStore()
  const app = buildCoreApp({ registry, service: new LearningProfileService({ store: coreStore, policy: new PolicyIndex(POLICY_V1) }) })
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    const response = await app.inject({ method: options.method, url: url.pathname, payload: options.body, headers: options.headers })
    return new Response(response.body, { status: response.statusCode })
  }
  try {
    const transport = createCoreTransport({ enabled: true, origin: 'https://core.example.test', clientId: 'academy-api', keyId: 'test',
      privateKey, environment: 'test', fetchImpl })
    const event = projectAttemptProfileResult(row(), issuer).event
    await transport.ingest([event])
    await transport.ingest([event])
    assert.equal((await coreStore.resultRevisions(event.principal)).length, 1)
    await assert.rejects(transport.ingest([{ ...event, product: 'star' }]), /403/)
    await assert.rejects(transport.ingest([{ ...event, principal: { ...event.principal, issuer: 'https://other.example.test/' } }]), /403/)
    const { options } = requests[0]
    const replay = await app.inject({ method: 'POST', url: '/v1/events/ingest', payload: options.body, headers: options.headers })
    assert.equal(replay.statusCode, 401)
    const deniedTransport = createCoreTransport({ enabled: true, origin: 'https://core.example.test', clientId: 'academy-api', keyId: 'test',
      privateKey, environment: 'test', fetchImpl: async (url, opts) => fetchImpl(url, { ...opts, body: opts.body.replace('learner-1', 'forged-user') }) })
    await assert.rejects(deniedTransport.ingest([event]), /401/)
    assert.equal((await coreStore.resultRevisions(event.principal)).length, 1)
    // Simulate erasure after mark and a lost/late HTTP response: the tombstone
    // can reach Core before the already prepared active event.
    const raced = { ...row(), attempt_id: '00000000-0000-4000-8000-000000000003' }
    const active = projectAttemptProfileResult(raced, issuer).event
    const revoked = projectAttemptProfileResult({ ...raced, state: 'revoked' }, issuer).event
    assert.equal(revoked.resultId, active.resultId)
    assert.equal(revoked.revision, 1)
    assert.equal(active.revision, 0)
    await transport.ingest([revoked])
    await transport.ingest([active])
    await transport.ingest([revoked])
    const current = (await coreStore.currentResults(active.principal)).find((r) => r.event.resultId === active.resultId)
    assert.equal(current.event.revision, 1)
    assert.equal(current.event.state, 'revoked')
    assert.equal(current.event.outcome, null)
  } finally { await app.close() }
})
