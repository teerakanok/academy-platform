import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, writeFile, rm, rmdir } from 'node:fs/promises'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createDockerInvoker, assertNoAmbientContainerAuthority } from './test-identity-lifecycle-page-store-postgres.mjs'

export const IMAGE = 'sha256:deb28ee471183cb0c303113dac9b2433c51eeeeb678def7af9a9ec5820367815'
const DATABASE = 'academy_profile_test'
const LABEL = 'com.cyberskills.test'
const OWNER = 'com.cyberskills.test-run'
const TEST = 'academy-profile-ledger'
const PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

export function validateAuthority() {
  const cliLink = '/usr/local/bin/docker'
  const cli = realpathSync(cliLink)
  const socketLink = '/var/run/docker.sock'
  const socket = realpathSync(socketLink)
  assert.equal(cli, '/Applications/Docker.app/Contents/Resources/bin/docker')
  assert.equal(socket, join(homedir(), '.docker/run/docker.sock'))
  for (const link of [cliLink, socketLink]) {
    assert(lstatSync(link).isSymbolicLink())
    assert.equal(lstatSync(link).uid, 0)
  }
  assert(statSync(cli).isFile())
  assert(statSync(socket).isSocket())
  for (const path of [cli, socket]) {
    assert.equal(statSync(path).uid, process.getuid())
    assert.equal(statSync(path).mode & 0o022, 0)
  }
  return { cli, socket }
}

export function createArguments(name, nonce) {
  assert.match(nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(name, `academy-profile-${nonce}`)
  return ['create', '--pull', 'never', '--name', name,
    '--label', `${LABEL}=${TEST}`, '--label', `${OWNER}=${nonce}`,
    '--network', 'none', '--cpus', '1', '--memory', '512m', '--pids-limit', '128',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
    '--env', 'POSTGRES_DB', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_PASSWORD',
    IMAGE, '-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=12']
}

export function verifyContainer(row, expected) {
  assert.equal(row.Id, expected.id)
  assert.equal(row.Name, `/${expected.name}`)
  assert.equal(row.Image, IMAGE)
  assert.equal(row.Config.Image, IMAGE)
  assert.deepEqual(row.Config.Labels, { [LABEL]: TEST, [OWNER]: expected.nonce })
  assert.equal(row.HostConfig.NetworkMode, 'none')
  assert.deepEqual(row.HostConfig.PortBindings ?? {}, {})
  assert.deepEqual(row.HostConfig.Binds ?? [], [])
  assert.equal(row.HostConfig.Memory, 512 * 1024 * 1024)
  assert.equal(row.HostConfig.NanoCpus, 1e9)
  assert.equal(row.HostConfig.PidsLimit, 128)
  assert.deepEqual(row.HostConfig.Tmpfs, { '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m' })
  assert(row.Mounts.every((mount) => mount.Type === 'tmpfs'))
}

export function exactAbsence(result, id) {
  if (result.status !== 1 || result.error) return false
  const stdout = result.stdout.trim(), stderr = result.stderr.trim()
  return stdout === '[]' && stderr === `Error: No such object: ${id}`
    || ['', '[]'].includes(stdout) && stderr === `Error response from daemon: No such container: ${id}`
    || ['', '[]'].includes(stdout) && stderr === `Error response from daemon: {"message":"No such container: ${id}"}`
}

function confirmAbsence(invoke, expected, first) {
  createArguments(expected.name, expected.nonce)
  if (expected.id) assert.match(expected.id, /^[0-9a-f]{64}$/)
  const target = expected.id ?? expected.name
  assert(exactAbsence(first, target), 'exact container absence response required')
  if (expected.id) assert(exactAbsence(invoke(['container','inspect',expected.name]), expected.name),
    'owned name absence not proven')
  const inventory = invoke(['ps','-a','--filter',`label=${LABEL}=${TEST}`,
    '--filter',`label=${OWNER}=${expected.nonce}`,'--format','{{.ID}}'])
  assert.equal(inventory.status, 0, 'owned label inventory unavailable')
  assert.equal(inventory.stderr.trim(), '', 'owned label inventory uncertain')
  assert.equal(inventory.stdout.trim(), '', 'owned label inventory is not empty')
}

export function cleanupContainer(invoke, expected) {
  const before = invoke(['container', 'inspect', expected.id])
  if (exactAbsence(before, expected.id)) return confirmAbsence(invoke, expected, before)
  assert.equal(before.status, 0, 'owned container inspect failed; retained')
  const rows = JSON.parse(before.stdout)
  assert.equal(rows.length, 1)
  verifyContainer(rows[0], expected)
  const removed = invoke(['rm', '--force', expected.id])
  assert.equal(removed.status, 0, 'owned container remove failed')
  confirmAbsence(invoke, expected, invoke(['container', 'inspect', expected.id]))
}

export function cleanupAfterAttempt(invoke, expected, createAttempted) {
  if (!createAttempted) return 'container create not attempted'
  if (!expected.id) {
    const inspected = invoke(['container','inspect',expected.name])
    if (exactAbsence(inspected, expected.name)) {
      confirmAbsence(invoke, expected, inspected)
      return 'uncertain create resolved to exact absence'
    }
    assert.equal(inspected.status, 0, 'uncertain create outcome; retained')
    const rows = JSON.parse(inspected.stdout)
    assert.equal(rows.length, 1)
    expected.id = rows[0].Id
    assert.match(expected.id, /^[0-9a-f]{64}$/)
    verifyContainer(rows[0], expected)
  }
  cleanupContainer(invoke, expected)
  return 'exact owned container absence verified'
}

export function probeFinalServer(invoke, id) {
  const pid1 = invoke(['exec',id,'cat','/proc/1/comm'], { timeoutMs: 2_000 })
  if (pid1.status !== 0 || pid1.stderr.trim() || pid1.stdout.trim() !== 'postgres') return false
  const sql = invoke(['exec',id,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DATABASE,
    '-c','select 1'], { timeoutMs: 2_000 })
  return sql.status === 0 && sql.stderr.trim() === '' && sql.stdout.trim() === '1'
}

export async function connectBeforeFixtures({ probe, connect, sleep = delay, now = Date.now, timeoutMs = 30_000 }) {
  const until = now() + timeoutMs
  for (let attempt = 0; attempt < 120 && now() < until; attempt++) {
    if (await probe()) {
      try { return await connect() } catch (error) {
        if (!/^psql closed \(2\): psql: error: connection to server .*failed: (?:No such file or directory|Connection refused|FATAL:  the database system is starting up)/s.test(error.message)) throw error
      }
    }
    await sleep(250)
  }
  assert.fail('bounded final PostgreSQL startup/readiness failed before fixtures')
}

class Session {
  constructor(authority, config, id) {
    this.pending = null
    this.buffer = ''
    this.errors = ''
    this.child = spawn(authority.cli, ['--host', `unix://${authority.socket}`, '--config', config,
      'exec', '-i', id, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE],
    { env: { PATH, LANG: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk
      for (;;) {
        const at = this.buffer.indexOf('\n')
        if (at < 0) break
        const line = this.buffer.slice(0, at).replace(/\r$/, '')
        this.buffer = this.buffer.slice(at + 1)
        const pending = this.pending
        if (!pending) continue
        if (line === pending.marker) {
          this.pending = null
          clearTimeout(pending.timer)
          pending.resolve(pending.lines.join('\n').trim())
        } else pending.lines.push(line)
      }
    })
    this.child.stderr.on('data', (chunk) => { this.errors += chunk })
    this.closed = new Promise((done) => this.child.once('close', (code) => {
      this.exitCode = code
      if (this.pending) {
        clearTimeout(this.pending.timer)
        this.pending.reject(new Error(`psql closed (${code}): ${this.errors}`))
        this.pending = null
      }
      done()
    }))
    this.child.on('error', (error) => {
      this.pending?.reject(error)
      this.pending = null
    })
  }
  sql(sql) {
    assert.equal(this.pending, null, 'one statement group per session')
    assert.equal(this.exitCode, undefined, 'session must be alive')
    const marker = `done_${randomBytes(12).toString('hex')}`
    return new Promise((resolveQuery, reject) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGTERM')
        reject(new Error('bounded psql response timeout'))
      }, 15_000)
      this.pending = { marker, resolve: resolveQuery, reject, timer, lines: [] }
      this.child.stdin.write(`${sql};\n\\echo ${marker}\n`)
    })
  }
  async stop() {
    if (this.exitCode === undefined) this.child.stdin.end('rollback;\n\\q\n')
    await this.closed
  }
}

const q = (text) => `'${text.replaceAll("'", "''")}'`
const user = '00000000-0000-4000-8000-000000000001'
const owner = '00000000-0000-4000-8000-000000000002'
const attempt = '00000000-0000-4000-8000-000000000003'
const claim = '00000000-0000-4000-8000-000000000004'
const sourceKey = `${attempt}:0`
const accountLock = `pg_advisory_xact_lock(hashtextextended('academy.profile-account:${user}',0))`
const prepare = `select source_key from academy.prepare_profile_result_export(array[${q(sourceKey)}])`
const classify = `select academy.set_profile_activity_classification(${q(owner)},${q(user)},true,'native-classification')`
const suspend = `update academy.service_activation set status='suspended' where user_id=${q(user)}`
const policy = (enabled) => `select academy.set_profile_source_policy(${q(owner)},${enabled},true,'native-policy-disable')`
const commit = `select academy.commit_attempt_result(${q(attempt)},${q(user)},${q(claim)},'course','capstone','checkpoint','{"passed":true}','completed')`

export async function seed(db, withResult = true) {
  await db.sql(`truncate academy.users,academy.attempt,academy.service_activation,academy.test_progress,
    academy.profile_source_policy,academy.profile_activity_classification,academy.profile_activity_classification_audit,
    academy.attempt_profile_result,academy.profile_result_revocation cascade;
    insert into academy.users values (${q(user)},'https://accounts.example.test/','learner-1'),
      (${q(owner)},'https://accounts.example.test/','owner');
    insert into academy.service_activation values (${q(user)},'active');
    set role academy_staff_admin; ${policy(true)};
    select academy.set_profile_activity_classification(${q(owner)},${q(user)},false,'native-classification'); reset role;
    set role academy_runtime;
    insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
      values (${q(attempt)},${q(user)},'course','capstone','checkpoint','v1','{"profileEvidence":{"synthetic":true}}',${q(claim)},0);
    reset role`)
  if (withResult) assert.equal(await db.sql(`set role academy_runtime; ${commit}; reset role`), 't')
}

async function state(db) {
  return JSON.parse(await db.sql(`select json_build_object(
    'marked',(select export_started_at is not null from academy.attempt_profile_result where attempt_id=${q(attempt)}),
    'mark',(select export_started_at::text from academy.attempt_profile_result where attempt_id=${q(attempt)}),
    'snapshot',(select snapshot from academy.attempt_profile_result where attempt_id=${q(attempt)}),
    'withdrawals',(select count(*) from academy.profile_result_revocation),
    'withdrawalSnapshot',(select snapshot from academy.profile_result_revocation where attempt_id=${q(attempt)}),
    'enabled',(select enabled from academy.profile_source_policy where id),
    'results',(select count(*) from academy.attempt_profile_result),
    'progress',(select count(*) from academy.test_progress))`))
}

async function blocked(observer, waiter, holder) {
  for (let i = 0; i < 100; i++) {
    const row = JSON.parse(await observer.sql(`select json_build_object('wait',wait_event_type,
      'blockers',pg_blocking_pids(pid)) from pg_stat_activity where pid=${waiter.pid}`))
    if (row.wait === 'Lock' && row.blockers.includes(holder.pid)) return row
    await delay(25)
  }
  assert.fail('did not observe the expected native backend lock wait')
}

export async function runCases(a, b, db, { setup = seed, activationMutation = suspend } = {}) {
  const results = []
  const begin = (session, role) => session.sql(`begin isolation level read committed; set local role ${role}`)
  for (const [name, role, mutation] of [['classification','academy_staff_admin',classify],['activation','academy_runtime',activationMutation]]) {
    await setup(db)
    await begin(a, role); await a.sql(mutation)
    await begin(b, 'academy_runtime')
    const pending = b.sql(prepare)
    const wait = await blocked(db, b, a)
    await a.sql('commit')
    assert.equal(await pending, '')
    await b.sql('commit')
    assert.equal((await state(db)).marked, false)
    results.push({ name: `${name}-before-mark`, observedWait: wait, admitted: false })

    await setup(db)
    await begin(a, 'academy_runtime'); assert.equal(await a.sql(prepare), sourceKey)
    await begin(b, role)
    const mutationPending = b.sql(mutation)
    const reverseWait = await blocked(db, b, a)
    await a.sql('commit'); await mutationPending; await b.sql('commit')
    const marked = await state(db)
    assert.equal(marked.marked, true); assert.equal(marked.withdrawals, 1)
    assert.deepEqual(marked.snapshot, marked.withdrawalSnapshot)
    await begin(b, role); await b.sql(mutation); await b.sql('commit')
    assert.equal((await state(db)).withdrawals, 1)
    assert.equal(await db.sql(`set role academy_runtime; ${prepare}; reset role`), '')
    assert.equal((await state(db)).mark, marked.mark)
    results.push({ name: `${name}-after-mark`, observedWait: reverseWait, immutableMark: true, withdrawals: 1 })
  }
  await setup(db)
  assert.equal(await db.sql(`set role academy_runtime; ${prepare}; reset role`), sourceKey)
  const firstMark = (await state(db)).mark
  assert.equal(await db.sql(`set role academy_runtime; ${prepare}; reset role`), sourceKey)
  assert.equal((await state(db)).mark, firstMark)
  results.push({ name: 'repeat-prepare-keeps-original-mark', immutableMark: true })

  await setup(db, false)
  await begin(a, 'academy_runtime'); assert.equal(await a.sql(commit), 't')
  await begin(b, 'academy_runtime'); const duplicate = b.sql(commit)
  const commitWait = await blocked(db, b, a)
  await a.sql('commit'); assert.equal(await duplicate, 'f'); await b.sql('commit')
  const committed = await state(db)
  assert.equal(committed.results, 1); assert.equal(committed.progress, 1)
  results.push({ name: 'concurrent-same-claim', observedWait: commitWait, results: 1, progress: 1 })

  await setup(db)
  await begin(a, 'academy_runtime'); await a.sql(`select ${accountLock}`)
  await begin(b, 'academy_runtime'); const waitingPrepare = b.sql(prepare)
  const policyWait = await blocked(db, b, a)
  await db.sql(`set role academy_staff_admin; ${policy(false)}; reset role`)
  await a.sql('commit'); assert.equal(await waitingPrepare, ''); await b.sql('commit')
  assert.equal((await state(db)).marked, false)
  results.push({ name: 'committed-policy-disable-during-account-wait', observedWait: policyWait, admitted: false })

  await setup(db)
  await begin(a, 'academy_staff_admin'); await a.sql(policy(false))
  await begin(b, 'academy_runtime'); const overlap = await b.sql(prepare)
  await b.sql('commit'); await a.sql('commit')
  const disabled = await state(db)
  assert.equal(overlap, sourceKey); assert.equal(disabled.enabled, false)
  assert.equal(disabled.marked, true); assert.equal(disabled.withdrawals, 0)
  assert.equal(await db.sql(`set role academy_runtime; ${prepare}; reset role`), '')
  results.push({ name: 'uncommitted-policy-disable-overlap', admittedBeforeDisableCommit: true,
    subsequentAdmission: false, withdrawals: 0,
    semantics: 'Policy disable gates admissions observed after commit; it does not retract previously admitted or delivered events. No stronger fence is claimed.' })
  return results
}

export async function main(argv = process.argv.slice(2), executeCases = runCases) {
  assert.equal(argv.length, 6, 'expected --evidence-directory PATH --session-id ID --governance-root PATH')
  assert.equal(argv[0], '--evidence-directory'); assert.equal(argv[2], '--session-id'); assert.equal(argv[4], '--governance-root')
  const evidence = resolve(argv[1]), sessionId = argv[3], governance = resolve(argv[5])
  assertNoAmbientContainerAuthority(process.env)
  const authority = validateAuthority()
  const lifecycle = await import(pathToFileURL(join(governance, 'scripts/work-session.mjs')).href)
  const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  lifecycle.registerCreatedResource({ repo, session_id: sessionId, resource_type: 'self_running',
    resource_ref: `pid:${process.pid}`, recovery_reference: 'retain:finite native PG runner owns exact-nonce container cleanup' })
  const nonce = randomUUID(), name = `academy-profile-${nonce}`
  const config = join(tmpdir(), `academy-profile-docker-${nonce}`)
  lifecycle.createRegisteredDirectory({ repo, session_id: sessionId, resource_type: 'temp_directory',
    resource_ref: config, recovery_reference: 'retain:runner removes its own empty Docker config after exact container cleanup' })
  await writeFile(join(config, 'config.json'), '{}\n', { mode: 0o600, flag: 'wx' })
  const rawInvoke = createDockerInvoker({ cliPath: authority.cli, socketPath: authority.socket, configDirectory: config })
  const invoke = (args, options = {}) => rawInvoke(args, { timeoutMs: 15_000, ...options })
  const expected = { id: null, name, nonce }
  const sessions = []
  const result = { schema: 'academy-profile-native-pg/v1', status: 'running', nonce, name, image: IMAGE,
    fixtureScope: 'minimal synthetic schema and progress/staff helpers; actual candidate0041 functions; not a full migration-chain or production proof' }
  let deadline
  let createAttempted = false
  let cleanupPromise
  const cleanup = () => cleanupPromise ??= (async () => {
    for (const session of sessions) if (session.exitCode === undefined) session.child.kill('SIGTERM')
    const containerCleanup = cleanupAfterAttempt(invoke, expected, createAttempted)
    await rm(join(config, 'config.json')); await rmdir(config)
    result.cleanup = `${containerCleanup}; private empty config removed`
  })()
  let stopping = false
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    if (stopping) return
    stopping = true
    cleanup().then(() => process.exit(1), () => process.exit(1))
  })
  try {
    const image = invoke(['image','inspect',IMAGE])
    assert.equal(image.status, 0, `cached image required; no pull; inspect outcome ${image.error?.code ?? image.status}`)
    const metadata = JSON.parse(image.stdout)[0]
    assert.equal(metadata.Id, IMAGE); assert.equal(metadata.Architecture, 'arm64')
    assert(metadata.RepoDigests.includes(`postgres@${IMAGE}`))
    const duplicate = invoke(['ps','-a','--filter',`label=${LABEL}=${TEST}`,'--format','{{.ID}}'])
    assert.equal(duplicate.status, 0); assert.equal(duplicate.stdout.trim(), '', 'another profile native container exists; do not duplicate')
    confirmAbsence(invoke, expected, invoke(['container','inspect',name]))
    result.preflightUniqueName = 'exact new name absence and empty owned label inventory verified before create'
    createAttempted = true
    const created = invoke(createArguments(name, nonce), { env: { POSTGRES_DB: DATABASE, POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: randomBytes(32).toString('base64url') }, timeoutMs: 15_000 })
    assert.equal(created.status, 0, 'owned disposable create failed')
    expected.id = created.stdout.trim(); assert.match(expected.id, /^[0-9a-f]{64}$/)
    verifyContainer(JSON.parse(invoke(['container','inspect',expected.id]).stdout)[0], expected)
    result.containerId = expected.id
    await writeFile(join(evidence,'native-run.json'), JSON.stringify(result,null,2)+'\n', { flag: 'wx' })
    assert.equal(invoke(['start',expected.id]).status, 0)
    deadline = setTimeout(() => process.kill(process.pid,'SIGTERM'), 120_000)
    const connected = await connectBeforeFixtures({ probe: () => probeFinalServer(invoke, expected.id), connect: async () => {
      const candidates = []
      try {
        for (const label of ['A','B','observer']) {
          const session = new Session(authority, config, expected.id); sessions.push(session); candidates.push(session)
          session.pid = Number(await session.sql(`set application_name='academy-profile-${label}';
            set statement_timeout='12s'; set lock_timeout='10s'; select pg_backend_pid()`))
          assert(Number.isInteger(session.pid) && session.pid > 0)
        }
        return candidates
      } catch (error) {
        for (const session of candidates) await session.stop()
        throw error
      }
    } })
    result.readiness = 'PID1 final postgres + SQL probe + all sessions connected before fixtures; no fixture/case retry'
    const [a,b,db] = connected
    const fixture = await readFile(new URL('./fixtures/profile-ledger.sql', import.meta.url), 'utf8')
    const migration = await readFile(new URL('../supabase/migrations/0041_attempt_profile_result.sql', import.meta.url), 'utf8')
    const grantSource = await readFile(new URL('../supabase/migrations/0019_dedicated_runtime_api.sql', import.meta.url), 'utf8')
    const activationGrant = 'grant select, insert, update on academy.service_activation to academy_runtime;'
    assert(grantSource.includes(activationGrant))
    result.fixtureSha256 = createHash('sha256').update(fixture).digest('hex')
    result.migrationSha256 = createHash('sha256').update(migration).digest('hex')
    result.postgresVersion = await db.sql('show server_version')
    assert.match(result.postgresVersion, /^16\./)
    await db.sql(fixture); await db.sql(migration); await db.sql(activationGrant)
    result.cases = await executeCases(a,b,db)
    result.status = 'passed'
    process.stdout.write(`PASS native PostgreSQL16 profile ledger ${result.cases.length}/${result.cases.length} cases\n`)
    for (const row of result.cases) process.stdout.write(JSON.stringify(row)+'\n')
    for (const session of sessions) await session.stop()
  } catch (error) {
    result.status = 'failed'; result.error = error.message
    throw error
  } finally {
    clearTimeout(deadline)
    try { await cleanup() } catch (error) { result.cleanup = `failed: ${error.message}`; result.status = 'failed'; process.exitCode = 1 }
    await writeFile(join(evidence,'native-result.json'), JSON.stringify(result,null,2)+'\n')
    process.stdout.write(`Cleanup: ${result.cleanup}\n`)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { process.stderr.write(error.message+'\n'); process.exitCode = 1 })
}
