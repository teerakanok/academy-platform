import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IMAGE, createArguments, verifyContainer, cleanupContainer, cleanupAfterAttempt, exactAbsence,
  probeFinalServer, connectBeforeFixtures } from './test-profile-ledger-native-postgres.mjs'

const nonce = '00000000-0000-4000-8000-000000000001'
const name = `academy-profile-${nonce}`
const id = 'a'.repeat(64)
const expected = { nonce, name, id }
const owned = () => ({ Id: id, Name: `/${name}`, Image: IMAGE,
  Config: { Image: IMAGE, Labels: { 'com.cyberskills.test': 'academy-profile-ledger', 'com.cyberskills.test-run': nonce } },
  HostConfig: { NetworkMode: 'none', PortBindings: {}, Binds: [], Memory: 512 * 1024 * 1024,
    NanoCpus: 1e9, PidsLimit: 128, Tmpfs: { '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m' } },
  Mounts: [{ Type: 'tmpfs' }] })
const response = (value) => ({ status: 0, stdout: JSON.stringify([value]), stderr: '' })
const absent = (target = id) => ({ status: 1, stdout: '[]\n', stderr: `Error: No such object: ${target}\n` })
const daemonAbsent = (target = id) => ({ status: 1, stdout: '[]\n', stderr: `Error response from daemon: No such container: ${target}\n` })
const empty = { status: 0, stdout: '', stderr: '' }

test('creation uses cached exact image and no external network, mounts or published ports', () => {
  const args = createArguments(name, nonce)
  assert.equal(args[0], 'create')
  assert.equal(args[args.indexOf('--pull') + 1], 'never')
  assert.equal(args[args.indexOf('--network') + 1], 'none')
  assert(args.includes(IMAGE))
  for (const forbidden of ['--publish', '-p', '--volume', '-v', '--mount', '--privileged']) assert(!args.includes(forbidden))
  assert(args.includes('listen_addresses=127.0.0.1'))
  assert.throws(() => createArguments('foreign', nonce))
  assert.throws(() => createArguments(name, 'not-a-nonce'))
})

test('cleanup revalidates exact ID, image, name, nonce and isolation before any deletion', () => {
  const mutations = [
    (row) => { row.Id = 'b'.repeat(64) },
    (row) => { row.Name = '/foreign' },
    (row) => { row.Image = 'sha256:foreign' },
    (row) => { row.Config.Image = 'postgres:latest' },
    (row) => { row.Config.Labels['com.cyberskills.test-run'] = 'foreign' },
    (row) => { row.Config.Labels.extra = 'unexpected' },
    (row) => { row.HostConfig.NetworkMode = 'bridge' },
    (row) => { row.HostConfig.PortBindings = { '5432/tcp': [{ HostIp: '0.0.0.0' }] } },
    (row) => { row.HostConfig.Binds = ['/foreign:/data'] },
    (row) => { row.Mounts = [{ Type: 'volume' }] },
    (row) => { row.HostConfig.Tmpfs = {} },
  ]
  for (const mutate of mutations) {
    const row = owned(); mutate(row)
    const calls = []
    assert.throws(() => cleanupContainer((args) => { calls.push(args); return response(row) }, expected))
    assert.deepEqual(calls, [['container', 'inspect', id]])
  }
})

test('cleanup removes only captured exact ID and requires exact absence', () => {
  const calls = []
  cleanupContainer((args) => {
    calls.push(args)
    return calls.length === 1 ? response(owned()) : calls.length === 2
      ? { status: 0, stdout: id, stderr: '' } : calls.length === 3 ? daemonAbsent()
        : calls.length === 4 ? daemonAbsent(name) : empty
  }, expected)
  assert.deepEqual(calls.slice(0,4), [['container','inspect',id],['rm','--force',id],['container','inspect',id],['container','inspect',name]])
  assert.equal(calls[4][0], 'ps')
  verifyContainer(owned(), expected)
  assert(exactAbsence(absent(), id))
  assert(exactAbsence(daemonAbsent(), id))
  assert(!exactAbsence(daemonAbsent('foreign'), id))
  assert(!exactAbsence(absent('foreign'), id))
  assert(!exactAbsence({ status: 1, stdout: '', stderr: 'daemon unavailable' }, id))
})

test('pre-create failure cannot inspect or remove a container that was never attempted', () => {
  assert.equal(cleanupAfterAttempt(() => assert.fail('no Docker call before create attempt'),
    { ...expected, id: null }, false), 'container create not attempted')
  const calls = []
  assert.equal(cleanupAfterAttempt((args) => { calls.push(args); return args[0] === 'ps' ? empty : absent(name) },
    { ...expected, id: null }, true), 'uncertain create resolved to exact absence')
  assert.deepEqual(calls[0], ['container','inspect',name])
  assert.equal(calls[1][0], 'ps')
})

test('absence requires exact ID and name plus empty owned label inventory; ambiguous results never delete', () => {
  for (const badInventory of [{ ...empty, stdout: 'foreign-id\n' }, { ...empty, status: 1 },
    { ...empty, stderr: 'daemon uncertain' }]) {
    const calls = []
    assert.throws(() => cleanupContainer((args) => {
      calls.push(args)
      if (args[0] === 'ps') return badInventory
      return daemonAbsent(args[2])
    }, expected))
    assert(!calls.some((args) => args[0] === 'rm'))
  }
  const calls = []
  assert.throws(() => cleanupContainer((args) => {
    calls.push(args)
    return args[2] === id ? daemonAbsent(id) : response(owned())
  }, expected))
  assert(!calls.some((args) => args[0] === 'rm'))
})

test('temporary init-server PID1 never reaches the SQL readiness probe', () => {
  const calls = []
  assert.equal(probeFinalServer((args) => {
    calls.push(args)
    return { ...empty, stdout: 'docker-entrypoi\n' }
  }, id), false)
  assert.deepEqual(calls, [['exec',id,'cat','/proc/1/comm']])
  const replies = [{ ...empty, stdout: 'postgres\n' }, { ...empty, stdout: '1\n' }]
  assert.equal(probeFinalServer(() => replies.shift(), id), true)
})

test('startup socket loss retries only connection setup; bounded readiness and non-startup failures stop', async () => {
  let time = 0, connections = 0, probes = 0
  const connected = await connectBeforeFixtures({
    probe: async () => ++probes > 1,
    connect: async () => {
      connections++
      if (connections === 1) throw new Error('psql closed (2): psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory')
      return ['ready']
    }, sleep: async (ms) => { time += ms }, now: () => time,
  })
  assert.deepEqual(connected, ['ready']); assert.equal(connections, 2)
  await assert.rejects(connectBeforeFixtures({ probe: async () => false, connect: () => assert.fail(),
    sleep: async (ms) => { time += ms }, now: () => time, timeoutMs: 500 }), /before fixtures/)
  let fatalAttempts = 0
  await assert.rejects(connectBeforeFixtures({ probe: async () => true, connect: async () => {
    fatalAttempts++; throw new Error('fixture SQL failure')
  } }), /fixture SQL failure/)
  assert.equal(fatalAttempts, 1)
})
