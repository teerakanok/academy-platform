import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  parseCloudflareAccessArgs,
  runCloudflareAccessOperation,
} from '../../ops/launch/cloudflare-access.mjs'
import { parseCourseVisibilityArgs } from '../../ops/launch/course-visibility.mjs'
import { runLaunchPostcheck } from '../../ops/launch/postcheck.mjs'
import {
  HIDDEN_COURSE_SLUGS,
  PUBLIC_COURSE_SLUGS,
} from '../../scripts/verify-launch-exposure.mjs'

const manifestPath = join(process.cwd(), 'ops/runbooks/AL-10.json')
const migrationPath = join(process.cwd(), 'supabase/migrations/0043_launch_course_visibility_rpc.sql')
const rollbackPath = join(process.cwd(), 'supabase/rollbacks/0043_launch_course_visibility_rpc.rollback.sql')
const packageJsonPath = join(process.cwd(), 'package.json')
const courseSourcePath = join(process.cwd(), 'ops/launch/course-visibility.mjs')

function jsonResult(value: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result: value }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeCloudflareApi() {
  type FakeApplication = Record<string, unknown> & { id: string; name: string; path: string }
  type FakePolicy = Record<string, unknown> & { id: string }
  const policies = new Map<string, FakePolicy[]>([
    ['72f37caa-6573-4898-8bd1-b4aaaba741cc', [
      {
        id: 'd5aa4dcf-f77c-4b63-b14f-5c2dc909fff2',
        name: 'Academy owner allow',
        decision: 'allow',
        include: [{ email: { email: 'owner@example.test' } }],
        precedence: 1,
      },
    ]],
  ])
  const applications: FakeApplication[] = [
    {
      id: '72f37caa-6573-4898-8bd1-b4aaaba741cc',
      name: 'Academy canonical gated site',
      domain: 'academy.cyberskills.co.th',
      path: '',
      session_duration: '24h',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]
  const seen: Array<{ authorized: boolean; method: string; path: string }> = []
  let nextId = 1

  const fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    seen.push({
      authorized: (init?.headers as Record<string, string>)?.authorization === 'Bearer fake-token',
      method: init?.method ?? 'GET',
      path: url.pathname,
    })
    if (!url.pathname.startsWith('/accounts/')) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://test.cloudflareaccess.com/cdn-cgi/access/login/issuer' },
      })
    }
    if ((init?.headers as Record<string, string>)?.authorization !== 'Bearer fake-token') {
      return jsonResult({ unauthorized: true }, 401)
    }
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>
    const prefix = '/accounts/fake-account/access/apps'
    const policyMatch = /^\/accounts\/[^/]+\/access\/apps\/([^/]+)\/policies$/.exec(url.pathname)
    const appMatch = /^\/accounts\/[^/]+\/access\/apps\/([^/]+)$/.exec(url.pathname)

    if (init?.method === 'GET' && url.pathname === prefix) return jsonResult(applications)
    if (init?.method === 'GET' && policyMatch) return jsonResult(policies.get(policyMatch[1]) ?? [])
    if (init?.method === 'POST' && url.pathname === prefix) {
      const application = {
        ...(body ?? {}),
        id: `created-${nextId}`,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      } as unknown as FakeApplication
      nextId += 1
      applications.push(application)
      policies.set(application.id, [])
      return jsonResult(application, 201)
    }
    if (init?.method === 'POST' && policyMatch) {
      const policy = { ...(body ?? {}), id: `policy-${nextId}` }
      nextId += 1
      policies.get(policyMatch[1])?.push(policy)
      return jsonResult(policy, 201)
    }
    if (init?.method === 'PUT' && appMatch) {
      const index = applications.findIndex((application) => application.id === appMatch[1])
      expect(index).toBeGreaterThanOrEqual(0)
      applications[index] = {
        ...applications[index],
        ...(body ?? {}),
        id: appMatch[1],
        updated_at: '2026-01-03T00:00:00Z',
      }
      return jsonResult(applications[index])
    }
    if (init?.method === 'DELETE' && appMatch) {
      const index = applications.findIndex((application) => application.id === appMatch[1])
      expect(index).toBeGreaterThanOrEqual(0)
      applications.splice(index, 1)
      policies.delete(appMatch[1])
      return jsonResult({ id: appMatch[1] })
    }
    return jsonResult({ notFound: true }, 404)
  }
  return { applications, fetch, policies, seen }
}

function fakePublicLaunchFetch(base: string, rawHost: string) {
  const catalog = `
    <a href="/courses/${PUBLIC_COURSE_SLUGS[0]}/en">Linux</a>
    <a href="/courses/${PUBLIC_COURSE_SLUGS[1]}/en">Git</a>
  `
  return async (input: string | URL, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    const url = new URL(String(input))
    if (url.origin === rawHost) return new Response(null, { status: 404 })
    if (url.origin !== base) return new Response(null, { status: 404 })
    if (url.pathname === '/' || url.pathname === '/courses') {
      return new Response(catalog, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.pathname === '/sitemap.xml') {
      return new Response('<urlset></urlset>', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      })
    }
    if (url.pathname === '/api/admin/courses') {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://test.cloudflareaccess.com/login' },
      })
    }
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/player')) {
      return new Response(null, { status: 404 })
    }
    for (const slug of PUBLIC_COURSE_SLUGS) {
      if (url.pathname === `/courses/${slug}`) {
        return new Response(null, {
          status: 308,
          headers: { location: `${base}/courses/${slug}/en` },
        })
      }
      if (url.pathname === `/courses/${slug}/en` || url.pathname === `/courses/${slug}/th`) {
        return new Response('course', { status: 200 })
      }
    }
    for (const slug of HIDDEN_COURSE_SLUGS) {
      if (url.pathname === `/courses/${slug}/start`) {
        return new Response(`Redirecting to ${base}/sign-in?next=%2Fcourses%2F${slug}%2Fstart (307)\n`, {
          status: 307,
          headers: { location: `${base}/sign-in?next=%2Fcourses%2F${slug}%2Fstart` },
        })
      }
    }
    return new Response(null, { status: 404 })
  }
}

describe('Academy public launch typed operations', () => {
  it('defines a validator-shaped five-step direct-argv runbook with checks', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.schema).toBe('gathering-ops/v1')
    expect(manifest.operation).toBe('deploy')
    expect(manifest.steps.map((step: { id: string }) => step.id)).toEqual([
      'access-snapshot',
      'course-visibility-snapshot',
      'course-visibility-launch',
      'access-expose-public',
      'public-launch-postcheck',
    ])
    for (const step of manifest.steps) {
      expect(step.mutating).toBe(true)
      expect(step.irreversible).toBe(false)
      expect(step.timeout_seconds).toBeLessThanOrEqual(300)
      expect(step.argv[0]).not.toMatch(/\/^(?:bash|sh|zsh)$/)
      expect(step.argv).not.toContain('-c')
      expect(step.check.argv[0]).toBe('node')
      expect(step.expected_outcome).toBeTypeOf('object')
    }
    expect(manifest.runtime_env).toEqual([
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_KEY',
      'ACADEMY_LAUNCH_DATABASE_CREDENTIAL',
    ])
    expect(manifest.writable_outputs).toEqual([
      'academy-web/ops/launch/run-output/access',
      'academy-web/ops/launch/run-output/course-visibility',
      'academy-web/ops/launch/run-output/postcheck',
    ])
  })

  it('uses an audited owner-attributed RPC and leaves no launch table rights with the operator', async () => {
    const migration = await readFile(migrationPath, 'utf8')
    const rollback = await readFile(rollbackPath, 'utf8')
    expect(migration).toContain('create table academy.course_settings_launch_audit')
    expect(migration).toContain('approval_reference text not null')
    expect(migration).toContain('actor_account_id uuid not null')
    expect(migration).toContain('before_state jsonb not null')
    expect(migration).toContain('after_state jsonb not null')
    expect(migration).toContain('academy.set_launch_course_visibility')
    expect(migration).toContain('launch mutation requires exactly one active owner')
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+table\s+academy\.course_settings\s+to\s+academy_staff_admin/i)
    expect(migration).toContain('grant execute on function academy.set_launch_course_visibility')
    expect(rollback).toContain('drop table if exists academy.course_settings_launch_audit')
  })

  it('binds course visibility commands to the RPC rather than table SQL', async () => {
    const source = await readFile(courseSourcePath, 'utf8')
    expect(source).toContain('academy.inspect_launch_course_visibility()')
    expect(source).toContain('academy.set_launch_course_visibility($1, $2, $3, $4, $5)')
    expect(source).not.toMatch(/\b(?:insert\s+into|update|delete\s+from|select\s+.+from)\s+academy\.course_settings\b/i)
    expect(parseCourseVisibilityArgs([
      '--mode', 'apply',
      '--approval-reference', 'AL-10-FOUNDER-OPS-APPROVAL',
      '--output-dir', 'ops/launch/run-output/course-visibility',
    ])).toMatchObject({ mode: 'apply', phase: 'snapshot' })
    expect(() => parseCourseVisibilityArgs(['--mode', 'apply', '--output-dir', 'out']))
      .toThrow('--approval-reference is required')
  })

  it('keeps the exact package-script postcheck used by the manifest', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    const postcheck = manifest.steps.at(-1)
    expect(postcheck.argv.slice(0, 3)).toEqual(['npm', 'run', 'verify:launch-exposure'])
    expect(postcheck.argv).toEqual(expect.arrayContaining(['--expect', 'public']))
    expect(pkg.scripts['verify:launch-exposure']).toBe('node scripts/verify-launch-exposure.mjs')
  })

  it('rehearses snapshot, exposure, and rollback against an in-process fake Cloudflare API', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'academy-launch-ops-'))
    const fake = fakeCloudflareApi()
    const output = () => {
      let value = ''
      return {
        write(line: string) {
          value += line
        },
        value: () => value,
      }
    }
    const base = ['--api-base', 'https://api.test', '--origin', 'https://academy.cyberskills.co.th', '--output-dir', outputDir, '--timeout-ms', '1500']

    const snapshot = output()
    await runCloudflareAccessOperation({
      argv: ['--mode', 'snapshot', ...base],
      environment: { CLOUDFLARE_API_TOKEN: 'fake-token', CLOUDFLARE_ACCOUNT_KEY: 'fake-account' },
      fetch: fake.fetch,
      output: snapshot,
      now: () => new Date('2026-10-05T00:00:00Z'),
    })
    expect(snapshot.value()).toContain('"snapshot":"created"')

    const apply = output()
    await runCloudflareAccessOperation({
      argv: ['--mode', 'apply', ...base],
      environment: { CLOUDFLARE_API_TOKEN: 'fake-token', CLOUDFLARE_ACCOUNT_KEY: 'fake-account' },
      fetch: fake.fetch,
      output: apply,
      now: () => new Date('2026-10-05T00:01:00Z'),
    })
    expect(apply.value()).toContain('"topology":"public-with-internal-families"')
    expect(fake.applications.map((application) => [application.name, application.path])).toEqual([
      ['Academy internal admin UI', '/admin'],
      ['Academy internal admin API', '/api/admin'],
      ['Academy internal player', '/player'],
    ])

    const launchCheck = output()
    await runCloudflareAccessOperation({
      argv: ['--mode', 'check', '--phase', 'launch', ...base],
      environment: { CLOUDFLARE_API_TOKEN: 'fake-token', CLOUDFLARE_ACCOUNT_KEY: 'fake-account' },
      fetch: fake.fetch,
      output: launchCheck,
    })
    expect(JSON.parse(launchCheck.value())).toEqual({
      status: 'matches_expected',
      observed: {
        phase: 'launch',
        adminInternalOnly: true,
        internalFamilies: ['/admin', '/api/admin', '/player'],
      },
    })

    const rollback = output()
    await runCloudflareAccessOperation({
      argv: ['--mode', 'rollback', ...base],
      environment: { CLOUDFLARE_API_TOKEN: 'fake-token', CLOUDFLARE_ACCOUNT_KEY: 'fake-account' },
      fetch: fake.fetch,
      output: rollback,
      now: () => new Date('2026-10-05T00:02:00Z'),
    })
    expect(rollback.value()).toContain('"topology":"baseline-access-gated"')
    expect(fake.applications).toHaveLength(1)
    expect(fake.applications[0]).toMatchObject({ path: '', name: 'Academy canonical gated site' })

    const files = await readdir(outputDir)
    expect(files).toEqual(expect.arrayContaining([
      'access-snapshot.json',
      'access-snapshot.sha256',
      'baseline-probes.json',
      'access-snapshot-summary.json',
      'access-launch-receipt.json',
      'access-rollback-receipt.json',
    ]))
    const protectedSnapshot = await stat(join(outputDir, 'access-snapshot.json'))
    expect(protectedSnapshot.mode & 0o077).toBe(0)
    expect(JSON.stringify(fake.seen)).not.toContain('fake-token')
  })

  it('writes and checks a public postcheck receipt with the raw workers.dev 404 gate', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'academy-launch-postcheck-'))
    const base = 'https://academy.cyberskills.co.th'
    const rawHost = 'https://cyberskills-academy.songpon-te.workers.dev'
    const fetch = fakePublicLaunchFetch(base, rawHost)
    const runOutput = {
      value: '',
      write(line: string) {
        this.value += line
      },
    }
    await runLaunchPostcheck({
      argv: [
        '--mode', 'run',
        '--base', base,
        '--raw-host', rawHost,
        '--output-dir', outputDir,
        '--timeout-ms', '1500',
      ],
      fetch,
      output: runOutput,
      now: () => new Date('2026-10-05T00:00:00Z'),
    })
    expect(JSON.parse(runOutput.value)).toEqual({
      phase: 'postcheck',
      overall: true,
      failed: 0,
      rawHost404: true,
    })
    await expect(readFile(join(outputDir, 'launch-postcheck.json'), 'utf8')).resolves.toContain('"overall": true')

    const checkOutput = {
      value: '',
      write(line: string) {
        this.value += line
      },
    }
    await runLaunchPostcheck({
      argv: [
        '--mode', 'check',
        '--base', base,
        '--raw-host', rawHost,
        '--output-dir', outputDir,
        '--timeout-ms', '1500',
      ],
      fetch,
      output: checkOutput,
    })
    expect(JSON.parse(checkOutput.value)).toEqual({
      status: 'matches_expected',
      observed: {
        phase: 'postcheck',
        overall: true,
        failed: 0,
        rawHost404: true,
      },
    })
  })

  it('rejects unsafe origins while allowing a loopback-only API rehearsal', () => {
    expect(() => parseCloudflareAccessArgs(['--mode', 'snapshot', '--origin', 'http://academy.cyberskills.co.th', '--output-dir', 'out'])).toThrow(/https/)
    expect(parseCloudflareAccessArgs(['--mode', 'snapshot', '--api-base', 'http://127.0.0.1:1', '--origin', 'http://127.0.0.1:1', '--output-dir', 'out'])).toMatchObject({
      apiBase: 'http://127.0.0.1:1',
      origin: 'http://127.0.0.1:1',
    })
  })
})
