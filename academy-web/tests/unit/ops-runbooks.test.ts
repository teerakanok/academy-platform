import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '../../..')
const RELEASE_DIR = join(REPO_ROOT, 'academy-web/ops/release')
const GOVERNANCE_SCRIPTS = process.env.GATHERING_GOVERNANCE_SCRIPTS
  ?? '/Users/teerakanok/Dev/cyberskills-director-governance/scripts'
const CANDIDATE = 'a1b2c3d4-1234-5678-9abc-def012345678'
const PREVIOUS = '733e4fa3-52c4-4717-b3da-aed3aafe5023'

function runReleaseScript(script: string, arguments_: string[], environment = process.env) {
  return execFileSync('node', [join(RELEASE_DIR, script), ...arguments_], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000, env: environment,
  })
}

function scriptJson(value: string) {
  const line = value.trim().split('\n').at(-1)
  if (!line) throw new Error('script returned no JSON')
  return JSON.parse(line) as { status: string; observed: Record<string, unknown> }
}

function makeTemporaryDirectory() {
  return `${tmpdir()}/al23-ops-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

describe('Academy typed release runbooks (AL-23)', () => {
  let temporaryRoot: string
  let fakeBin: string
  let state09: string
  let state21: string
  let fakePath: string

  beforeAll(() => {
    temporaryRoot = makeTemporaryDirectory()
    fakeBin = join(temporaryRoot, 'bin')
    state09 = join(temporaryRoot, 'state/AL-09')
    state21 = join(temporaryRoot, 'state/AL-21')
    mkdirSync(fakeBin, { recursive: true, mode: 0o755 })
    mkdirSync(state09, { recursive: true, mode: 0o700 })
    mkdirSync(state21, { recursive: true, mode: 0o700 })

    const stateFile = join(temporaryRoot, 'fake-wrangler-state.json')
    const initial = { uploaded: false, activated: false }
    writeFileSync(stateFile, `${JSON.stringify(initial)}\n`, { mode: 0o600 })
    fakePath = `${fakeBin}:${process.env.PATH ?? ''}`
    const fakeWrangler = `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
const stateFile = ${JSON.stringify(stateFile)}
const state = JSON.parse(readFileSync(stateFile, 'utf8'))
const args = process.argv.slice(2)
const candidate = ${JSON.stringify(CANDIDATE)}
const previous = ${JSON.stringify(PREVIOUS)}
if (args[0] === '--version') { console.log('4.120.0'); process.exit(0) }
if (args[0] === 'versions' && args[1] === 'upload') {
  if (!args.includes('--keep-vars')) process.exit(2)
  state.uploaded = true
  state.tag = args[args.indexOf('--tag') + 1]
  state.message = args[args.indexOf('--message') + 1]
  writeFileSync(stateFile, JSON.stringify(state))
  console.log('Worker Version ID: ' + candidate)
  process.exit(0)
}
if (args[0] === 'versions' && args[1] === 'list') {
  console.log(JSON.stringify(state.uploaded ? [{
    id: candidate,
    annotations: {
      'workers/tag': state.tag,
      'workers/message': state.message,
    },
  }] : []))
  process.exit(0)
}
if (args[0] === 'deployments' && args[1] === 'list') {
  const active = state.activated ? candidate : previous
  const inactive = state.activated ? previous : (state.uploaded ? candidate : null)
  console.log(JSON.stringify([{
    id: state.activated ? 'c0000000-0000-4000-8000-000000000002' : 'c0000000-0000-4000-8000-000000000001',
    created_on: '2026-10-05T12:00:0' + (state.activated ? '1' : '0') + 'Z',
    versions: [{ version_id: active, percentage: 100 }, ...(inactive ? [{ version_id: inactive, percentage: 0 }] : [])],
  }]))
  process.exit(0)
}
if (args[0] === 'versions' && args[1] === 'deploy') {
  if (!args[2]?.startsWith(candidate + '@100')) process.exit(3)
  state.activated = true
  writeFileSync(stateFile, JSON.stringify(state))
  console.log('activated ' + candidate)
  process.exit(0)
}
process.exit(4)
`
    const fakeWranglerPath = join(fakeBin, 'wrangler')
    writeFileSync(fakeWranglerPath, fakeWrangler, { mode: 0o755 })
    chmodSync(fakeWranglerPath, 0o755)
  }, 240_000)

  afterAll(() => {
    rmSync(temporaryRoot, { recursive: true, force: true })
  })

  it('validates both manifests with the governance validator', () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(GOVERNANCE_SCRIPTS)})
from gathering_ops import _validate_manifest
for card in ('AL-09', 'AL-21'):
    with open(f'academy-web/ops/runbooks/{card}.json', encoding='utf-8') as source:
        manifest = _validate_manifest(json.load(source))
    print(json.dumps({'card': card, 'steps': len(manifest['steps']), 'targets': manifest['target_keys']}))
`
    const output = execFileSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' })
    const rows = output.trim().split('\n').map((line) => JSON.parse(line) as {
      card: string; steps: number; targets: string[]
    })
    expect(rows).toEqual([
      {
        card: 'AL-09', steps: 9, targets: [
          'cloudflare:worker:cyberskills-academy',
          'ssh:host:ssh-db.cyberskills.co.th:supabase-db:postgres:academy',
        ],
      },
      { card: 'AL-21', steps: 6, targets: ['cloudflare:worker:cyberskills-academy'] },
    ])
  })

  it('keeps live commands direct, tracked, idempotent, and reversible', () => {
    for (const card of ['AL-09', 'AL-21']) {
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, `academy-web/ops/runbooks/${card}.json`), 'utf8')) as {
        execution_inputs: string[]; steps: { id: string; argv: string[]; mutating: boolean; irreversible: boolean; check: { argv: string[] } }[]
        runtime_env: string[]; writable_outputs: string[]
      }
      expect(manifest.runtime_env.every((name) => /^(CLOUDFLARE_API_TOKEN|SSH_AUTH_SOCK)$/.test(name))).toBe(true)
      expect(new Set(manifest.execution_inputs).size).toBe(manifest.execution_inputs.length)
      for (const path of manifest.execution_inputs) expect(existsSync(join(REPO_ROOT, path))).toBe(true)
      for (const output of manifest.writable_outputs) expect(existsSync(join(REPO_ROOT, output))).toBe(false)
      for (const step of manifest.steps) {
        expect(step.argv[0]).toBe('node')
        expect(step.argv[1]).toMatch(/^academy-web\/ops\/release\/[a-z0-9-]+\.mjs$/)
        expect(step.argv).not.toContain('--dry-run')
        expect(step.argv).not.toContain('--db-url')
        expect(step.mutating).toBe(true)
        expect(step.irreversible).toBe(false)
        expect(manifest.execution_inputs).toContain(step.argv[1])
        expect(step.check.argv[0]).toBe('node')
        expect(manifest.execution_inputs).toContain(step.check.argv[1])
      }
    }
  })

  it('prepares and verifies both exact pinned source snapshots', () => {
    for (const [card, state, commit] of [
      ['AL-09', state09, 'cfa59b4df7db480a7254f35dcea7fb98bbfdc58d'],
      ['AL-21', state21, '00f07ed1528b04b755b8da5e0703aa4c3143df36'],
    ] as const) {
      const output = runReleaseScript('source-prepare.mjs', ['run', '--card', card, '--state-dir', state])
      expect(output).toContain(commit)
      const check = scriptJson(runReleaseScript('source-prepare.mjs', ['check', '--card', card, '--dry-run', '--state-dir', state]))
      expect(check.status).toBe('matches_expected')
      expect(check.observed).toEqual({ archive_verified: true, commit })
    }
  }, 120_000)

  it('rehearses backup and both migrations, then proves idempotence', () => {
    expect(runReleaseScript('db-backup.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09]))
      .toContain('database backup verified')
    expect(scriptJson(runReleaseScript('db-backup.mjs', ['check', '--card', 'AL-09', '--dry-run', '--state-dir', state09])).status)
      .toBe('matches_expected')
    for (const migration of ['0041', '0042']) {
      expect(runReleaseScript('db-migration.mjs', ['run', '--migration', migration, '--card', 'AL-09', '--dry-run', '--state-dir', state09]))
        .toContain('locally rehearsed and applied')
      expect(runReleaseScript('db-migration.mjs', ['run', '--migration', migration, '--card', 'AL-09', '--dry-run', '--state-dir', state09]))
        .toContain('already applied')
      expect(scriptJson(runReleaseScript('db-migration.mjs', ['check', '--migration', migration, '--card', 'AL-09', '--dry-run', '--state-dir', state09])).status)
        .toBe('matches_expected')
    }
  }, 60_000)

  it('runs dependency and build receipts against a fake wrangler', () => {
    const commit = 'cfa59b4df7db480a7254f35dcea7fb98bbfdc58d'
    const environment = {
      ...process.env, PATH: fakePath, AL23_CARD: 'AL-09', AL23_EXPECTED_COMMIT: commit,
    }
    expect(runReleaseScript('npm-ci.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      .toContain('dependency installation locally rehearsed')
    expect(runReleaseScript('build-cf.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      .toContain('Cloudflare build locally rehearsed')
  }, 60_000)

  it('records candidate and rollback predecessor with a fake wrangler', () => {
    const commit = 'cfa59b4df7db480a7254f35dcea7fb98bbfdc58d'
    const environment = {
      ...process.env, PATH: fakePath, AL23_CARD: 'AL-09', AL23_EXPECTED_COMMIT: commit,
    }
    expect(runReleaseScript('versions-upload.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      .toContain(CANDIDATE)
    const upload = JSON.parse(readFileSync(join(state09, 'versions-upload.json'), 'utf8')) as { candidate_version_id: string }
    expect(upload.candidate_version_id).toBe(CANDIDATE)
    expect(runReleaseScript('deploy-100.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      .toContain(PREVIOUS)
    const deployment = JSON.parse(readFileSync(join(state09, 'deploy-100.json'), 'utf8')) as {
      candidate_version_id: string; previous_version_id: string; traffic_percentage: number
    }
    expect(deployment).toMatchObject({ candidate_version_id: CANDIDATE, previous_version_id: PREVIOUS, traffic_percentage: 100 })
  }, 60_000)

  it('runs postcheck and read-only checks against the fake deployment', () => {
    const commit = 'cfa59b4df7db480a7254f35dcea7fb98bbfdc58d'
    const environment = {
      ...process.env, PATH: fakePath, AL23_CARD: 'AL-09', AL23_EXPECTED_COMMIT: commit,
    }
    expect(runReleaseScript('postcheck.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      .toContain('release postcheck locally rehearsed')
    for (const script of ['npm-ci', 'build-cf', 'versions-upload', 'deploy-100', 'postcheck']) {
      const check = scriptJson(runReleaseScript(`${script}.mjs`, ['check', '--card', 'AL-09', '--dry-run', '--state-dir', state09], environment))
      expect(check.status).toBe('matches_expected')
    }
  }, 60_000)

  it('reports the declared target identities without a live call', () => {
    const output = runReleaseScript('target-identity.mjs', ['run', '--card', 'AL-09', '--dry-run', '--state-dir', state09])
    const receipt = JSON.parse(output.trim()) as { targets: { provider: string; resource_id: string }[] }
    expect(receipt.targets).toEqual([
      { provider: 'cloudflare', resource_id: 'worker:cyberskills-academy' },
      { provider: 'ssh', resource_id: 'host:ssh-db.cyberskills.co.th:supabase-db:postgres:academy' },
    ])
  })

  it('keeps authentication material and provider output out of receipts', () => {
    const forbidden = [/postgres(?:ql)?:\/\//i, /CLOUDFLARE_API_TOKEN\s*=/i, /SSH_AUTH_SOCK\s*=/i, /rawOutput/i]
    for (const state of [state09, state21]) {
      for (const file of ['source.json', 'db-backup.json', 'migration-0041.json', 'migration-0042.json',
        'versions-upload.json', 'deploy-100.json', 'postcheck.json']) {
        const path = join(state, file)
        if (!existsSync(path)) continue
        const text = readFileSync(path, 'utf8')
        for (const pattern of forbidden) expect(text.match(pattern)).toBeNull()
      }
    }
  })
})

describe('Academy release migration round trip on local PostgreSQL (AL-23)', () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)('applies 0041 and 0042 once, reports idempotence, and checks catalog state', () => {
    const temporaryRoot = makeTemporaryDirectory()
    const state = join(temporaryRoot, 'AL-09')
    mkdirSync(state, { recursive: true, mode: 0o700 })
    try {
      runReleaseScript('source-prepare.mjs', ['run', '--card', 'AL-09', '--state-dir', state])
      runReleaseScript('npm-ci.mjs', ['run', '--card', 'AL-09', '--state-dir', state])
      const database = ['--db-url', process.env.TEST_DATABASE_URL as string]
      expect(runReleaseScript('db-backup.mjs', ['run', '--card', 'AL-09', ...database, '--state-dir', state]))
        .toContain('database backup verified')
      expect(scriptJson(runReleaseScript('db-backup.mjs', ['check', '--card', 'AL-09', ...database, '--state-dir', state])).status)
        .toBe('matches_expected')
      for (const migration of ['0041', '0042']) {
        const first = runReleaseScript('db-migration.mjs', ['run', '--migration', migration, '--card', 'AL-09', ...database, '--state-dir', state])
        expect(first).toContain('rehearsed and committed')
        const second = runReleaseScript('db-migration.mjs', ['run', '--migration', migration, '--card', 'AL-09', ...database, '--state-dir', state])
        expect(second).toContain('already applied')
        const check = scriptJson(runReleaseScript('db-migration.mjs', ['check', '--migration', migration, '--card', 'AL-09', ...database, '--state-dir', state]))
        expect(check.status).toBe('matches_expected')
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  }, 300_000)
})
