import { generateKeyPairSync, randomUUID } from 'node:crypto'
import path from 'node:path'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

const { currentUser, marker } = vi.hoisted(() => ({ currentUser: vi.fn(), marker: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/edge-rate-limit-policy', () => ({ hasEdgeRateLimitMarker: marker }))
import { createCoreHostClient } from '@/lib/profile/core-host-client'
import { captureAttemptProfileSnapshot, projectAttemptProfileResult } from '@/lib/profile/attempt-evidence'
import { createCoreSignedRequest, createCoreTransport } from '../../ops/profile-export/core-transport.mjs'
import { POST as self } from '@/app/(site)/api/profile/self/route'
import { POST as publicRead } from '@/app/(site)/api/profile/public/read/route'
import ProfilePage from '@/app/(site)/profile/page'
import type { PrivateProfile, PublicShare } from '@/core-profile-ui/contracts'

const root = process.env.CORE_TEST_DIST_ROOT
const issuer = 'https://accounts.example.test/'
const principal = { issuer, subject: 'synthetic-learner' }

async function browserJourney(initialProfile: PrivateProfile) {
  const { build } = await import('esbuild')
  const { chromium } = await import('@playwright/test')
  const cwd = process.cwd()
  const scripts = [
    `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {AcademyConnectedProfile} from '@/components/profile/AcademyConnectedProfile';
      createRoot(document.getElementById('root')).render(React.createElement(AcademyConnectedProfile,{initialProfile:${JSON.stringify(initialProfile)}}));`,
    `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {AcademyPublicProfile} from '@/components/profile/AcademyPublicProfile';
      createRoot(document.getElementById('root')).render(React.createElement(AcademyPublicProfile,{shareId:document.documentElement.dataset.shareId}));`,
  ]
  const bundles = await Promise.all(scripts.map(async source => {
    const result = await build({ absWorkingDir: cwd, stdin: { contents: source, resolveDir: cwd, loader: 'jsx' },
      alias: { '@': path.join(cwd, 'src') }, bundle: true, write: false, outfile: 'synthetic.js', platform: 'browser', format: 'iife',
      jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixture', setup(builder) {
        builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'synthetic' }))
        builder.onLoad({ filter: /^link$/, namespace: 'synthetic' }, () => ({
          contents: "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
          loader: 'js', resolveDir: cwd,
        }))
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'css' }))
      } }] })
    const code = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
    if (!code) throw new Error('Synthetic browser bundle unavailable')
    return code
  }))
  const browser = await chromium.launch({ headless: true })
  const publicUrls: string[] = []
  try {
    const context = await browser.newContext()
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (req.method() === 'GET' && (url.pathname === '/profile' || url.pathname.startsWith('/profile/share/'))) {
        const id = url.pathname.split('/').pop() ?? ''
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<html data-share-id="${id}"><div id="root"></div></html>` })
      }
      if (req.method() === 'POST' && ['/api/profile/self', '/api/profile/public/read'].includes(url.pathname)) {
        if (url.pathname.endsWith('/public/read')) publicUrls.push(req.url())
        const input = new Request(req.url(), { method: 'POST',
          headers: { origin: 'https://academy.example.test', 'content-type': 'application/json' }, body: req.postData() })
        const response = url.pathname.endsWith('/public/read') ? await publicRead(input) : await self(input)
        return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
      }
      return route.abort()
    })
    const owner = await context.newPage()
    await owner.goto('https://academy.example.test/profile')
    await owner.addScriptTag({ content: bundles[0] })
    await owner.getByRole('checkbox', { name: 'Log analysis' }).check()
    await owner.getByRole('button', { name: 'Create share link', exact: true }).click()
    const link = owner.getByLabel('Your share link')
    await link.waitFor()
    const shareUrl = await link.inputValue()
    const parsed = new URL(shareUrl)
    expect(parsed.pathname).toMatch(/^\/profile\/share\/shr_[0-9a-f]{32}$/)
    expect(parsed.search).toBe('')
    expect(parsed.hash).toMatch(/^#[0-9a-f]{64}$/)
    const viewer = await context.newPage()
    await viewer.goto(shareUrl)
    await viewer.addScriptTag({ content: bundles[1] })
    await viewer.getByRole('heading', { name: 'Synthetic Account Name' }).waitFor()
    expect(publicUrls).toEqual(['https://academy.example.test/api/profile/public/read'])
    const revoke = owner.getByRole('button', { name: 'Revoke link' })
    await revoke.waitFor()
    await revoke.click()
    await owner.getByText('Sharing revoked. The link no longer opens the profile.').waitFor()
    await viewer.goto(shareUrl)
    await viewer.addScriptTag({ content: bundles[1] })
    await viewer.getByText('This share link is unavailable.').waitFor()
    await context.close()
  } finally { await browser.close() }
}

describe('Academy host against actual Core in memory', () => {
  it('does not construct a transport when disabled or incomplete', () => {
    const fetchImpl = vi.fn()
    expect(createCoreHostClient({ environment: {}, fetchImpl })).toBeNull()
    expect(createCoreHostClient({ environment: { ACADEMY_CORE_PROFILE_ENABLED: '1' }, fetchImpl })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.runIf(!!root)('binds signed self, goal and share operations; excludes TA/test evidence', async () => {
    const { ClientRegistry } = await import(/* @vite-ignore */ `${root}/src/auth.js`)
    const { MemoryReplayGuard } = await import(/* @vite-ignore */ `${root}/src/vendor/service-auth/signed-request.js`)
    const { buildCoreApp } = await import(/* @vite-ignore */ `${root}/src/http.js`)
    const { MemoryCoreStore } = await import(/* @vite-ignore */ `${root}/src/store.js`)
    const { LearningProfileService } = await import(/* @vite-ignore */ `${root}/src/service.js`)
    const { PolicyIndex, POLICY_V1, policySchema } = await import(/* @vite-ignore */ `${root}/src/policy.js`)
    // The test key pair is generated in memory only and is never stored or used outside this app.inject fixture.
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const registry = await ClientRegistry.create([{ clientId: 'academy-host-test', productNamespace: 'academy',
      principalIssuers: [issuer], operations: ['events.ingest', 'self.profile.read', 'self.goal.write',
        'self.share.create', 'self.share.revoke', 'public.share.read'], keys: { synthetic: publicKey.export({ format: 'jwk' }) } }],
    { environment: 'test', replayGuard: new MemoryReplayGuard() })
    const snapshot = captureAttemptProfileSnapshot({ principal, courseSlug: 'synthetic-course', nodeId: 'capstone',
      courseVersion: 'v1', assessed: true, integrityEnforced: true, environment: 'production' })
    const policy = policySchema.parse({ ...POLICY_V1, assessmentMappings: [{ product: 'academy',
      definitionId: snapshot.definitionId, version: snapshot.definitionVersion, publicAssessmentId: 'synthetic-module',
      publicTitle: 'Synthetic module', requiredKind: 'module', passRatio: 1,
      claims: [{ skillId: 'log-analysis', level: 4 }] }] })
    const service = new LearningProfileService({ store: new MemoryCoreStore(), policy: new PolicyIndex(policy),
      names: { async resolve(p: typeof principal) { return { status: 'present', principal: p, name: 'Synthetic Account Name',
        source: 'identity-control', assurance: 'account_name', observedAt: new Date() } } } })
    const app = buildCoreApp({ registry, service })
    const calls: Array<{ path: string; payload: string; authorization: string }> = []
    const fetchImpl: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname
      const headers = options?.headers as Record<string, string>
      const payload = String(options?.body)
      calls.push({ path, payload, authorization: headers.authorization })
      const response = await app.inject({ method: 'POST', url: path, payload, headers })
      return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } })
    }
    try {
      const environment = { ACADEMY_CORE_PROFILE_ENABLED: '1', ACADEMY_CORE_PROFILE_ORIGIN: 'https://core.example.test',
        ACADEMY_CORE_PROFILE_CLIENT_ID: 'academy-host-test', ACADEMY_CORE_PROFILE_KEY_ID: 'synthetic',
        ACADEMY_CORE_PROFILE_ENVIRONMENT: 'test', ACADEMY_CORE_PROFILE_ISSUER: issuer }
      const client = createCoreHostClient({ environment, privateKey, fetchImpl })
      expect(client).not.toBeNull()
      expect(createCoreHostClient({ environment, privateKey: publicKey, fetchImpl })).toBeNull()
      // Only synthetic in-memory credentials are injected; the handler below uses
      // the real production composition and resolves its principal from the session.
      for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
      vi.stubEnv('ACADEMY_CORE_PROFILE_PRIVATE_KEY_PEM', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())
      vi.stubGlobal('fetch', fetchImpl)
      vi.stubGlobal('React', React)
      currentUser.mockResolvedValue({ account: principal })
      marker.mockResolvedValue(true)
      const request = (path: string, body: unknown) => new Request(`https://academy.example.test${path}`, {
        method: 'POST', headers: { origin: 'https://academy.example.test', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const exported = projectAttemptProfileResult({ attempt_id: '00000000-0000-4000-8000-000000000001', passed: true,
        recorded_at: new Date().toISOString(), snapshot: { ...snapshot, actorRole: 'learner', testActivity: false, policyRevision: 1 } }, issuer)
      if (!exported.ok || !client) throw new Error('Synthetic source projection failed')
      const exporter = createCoreTransport({ enabled: true, origin: environment.ACADEMY_CORE_PROFILE_ORIGIN,
        clientId: environment.ACADEMY_CORE_PROFILE_CLIENT_ID, keyId: 'synthetic', privateKey, environment: 'test', fetchImpl })
      if (!exporter.ingest) throw new Error('Synthetic exporter missing')
      await exporter.ingest([exported.event,
        { ...exported.event, resultId: 'synthetic-test', context: { ...exported.event.context, actorRole: 'test' } },
        { ...exported.event, resultId: 'synthetic-ta', context: { ...exported.event.context, actorRole: 'ta' } }])
      const page = await ProfilePage()
      const profile = page.props.initialProfile as PrivateProfile
      expect(profile.skills.find(s => s.id === 'log-analysis')?.level).toBe(2)
      expect(profile.evidence.filter(e => e.status === 'eligible')).toHaveLength(1)
      expect(profile.evidence.filter(e => e.status === 'excluded')).toHaveLength(2)
      expect(profile.shareIdentity).toEqual({ state: 'ready', displayName: 'Synthetic Account Name' })
      const profileResponse = await self(request('/api/profile/self', { operation: 'profile' }))
      expect(profileResponse.status).toBe(200)
      const goalResponse = await self(request('/api/profile/self', { operation: 'goal',
        command: { requestId: randomUUID(), roleId: 'soc-analyst', level: 'entry' } }))
      expect(goalResponse.status).toBe(200)
      const updated = await goalResponse.json()
      expect(updated.goal.roleId).toBe('soc-analyst')
      const secret = 'a'.repeat(64)
      const shareResponse = await self(request('/api/profile/self', { operation: 'share', command: {
        requestId: randomUUID(), skillIds: ['log-analysis'], includeRoleComparison: false, expiresInDays: 7, secret } }))
      expect(shareResponse.status).toBe(200)
      const created = await shareResponse.json()
      const publicResponse = await publicRead(request('/api/profile/public/read', { shareId: created.share.id, secret }))
      expect(publicResponse.status).toBe(200)
      const view = await publicResponse.json() as PublicShare
      expect(view.displayName).toBe('Synthetic Account Name')
      expect(view.nameAttestation.source).toBe('identity-control')
      expect(view.skills.find(s => s.id === 'log-analysis')?.level).toBe(2)
      expect(JSON.stringify(view)).not.toContain(secret)
      const wrongShare = createCoreHostClient({ environment, privateKey, fetchImpl: async () => new Response(
        JSON.stringify({ ...view, shareId: `shr_${'f'.repeat(32)}` }), { headers: { 'content-type': 'application/json' } },
      ) })!
      await expect(wrongShare.publicShare(created.share.id, secret)).rejects.toThrow('Core share response invalid')
      let controller!: ReadableStreamDefaultController<Uint8Array>
      let readStarted!: () => void
      const waitingForBody = new Promise<void>(resolve => { readStarted = resolve })
      const delayedBody = new ReadableStream<Uint8Array>({
        start(value) { controller = value },
        pull() { readStarted() },
      }, { highWaterMark: 0 })
      const delayedPublicRead = publicRead(new Request('https://academy.example.test/api/profile/public/read', {
        method: 'POST', headers: { origin: 'https://academy.example.test', 'content-type': 'application/json' },
        body: delayedBody, duplex: 'half',
      } as RequestInit))
      await waitingForBody
      const revoked = await self(request('/api/profile/self', { operation: 'revoke', shareId: created.share.id,
        command: { requestId: randomUUID() } }))
      expect(revoked.status).toBe(200)
      const authCallsAfterRevoke = currentUser.mock.calls.length
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ shareId: created.share.id, secret })))
      controller.close()
      expect((await delayedPublicRead).status).toBe(404)
      expect(currentUser).toHaveBeenCalledTimes(authCallsAfterRevoke)
      expect((await publicRead(request('/api/profile/public/read', { shareId: created.share.id, secret }))).status).toBe(404)
      expect((await self(request('/api/profile/self', { operation: 'profile', principal: { ...principal, subject: 'other' } }))).status).toBe(400)
      const before = calls.length
      await expect(client.profile({ issuer: 'https://other.example.test/', subject: principal.subject })).rejects.toThrow()
      expect(calls).toHaveLength(before)
      const send = createCoreSignedRequest({ enabled: true, origin: environment.ACADEMY_CORE_PROFILE_ORIGIN,
        clientId: environment.ACADEMY_CORE_PROFILE_CLIENT_ID, keyId: 'synthetic', privateKey, environment: 'test', fetchImpl })!
      await expect(send('/v1/self/profile', 'events.ingest', '{}')).rejects.toThrow()
      await expect(send('/v1/unknown', 'self.profile.read', '{}')).rejects.toThrow()
      expect(calls).toHaveLength(before)
      const first = calls.find(call => call.path === '/v1/self/profile')!
      const replay = await app.inject({ method: 'POST', url: first.path, payload: first.payload,
        headers: { 'content-type': 'application/json', authorization: first.authorization } })
      expect(replay.statusCode).toBe(401)
      if (process.env.PROFILE_HOST_BROWSER_TEST === '1') await browserJourney(profile)
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      await app.close()
    }
  }, 30_000)
})
