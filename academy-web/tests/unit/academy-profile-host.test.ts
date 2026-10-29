import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { CourseDashboard } from '@/components/course/CourseDashboard'
import { AcademyProfileSurface, AcademySharedProfile } from '@/components/profile/AcademyProfileSurface'
import { ProfileCard } from '@/core-profile-ui'
import { createShareCommandSchema, privateProfileSchema, publicShareSchema } from '@/core-profile-ui/contracts'

const assessedAt = '2026-10-01T00:00:00.000Z'
const syntheticProfile = privateProfileSchema.parse({
  schemaVersion: '1',
  asOf: '2026-10-29T00:00:00.000Z',
  interpretation: { version: 'synthetic-v1', label: 'Synthetic interpretation' },
  skills: [{ id: 'synthetic-skill', label: 'Synthetic skill', level: 2, evidenceIds: ['synthetic-result'], assessedAt }],
  history: [],
  evidence: [
    { id: 'synthetic-result', product: 'academy', assessmentId: 'synthetic-assessment', title: 'Synthetic assessment', kind: 'verified_assessment', attribution: 'individual', assessedAt, status: 'eligible', reason: null, skillIds: ['synthetic-skill'], verificationReference: null },
    { id: 'synthetic-ta', product: 'academy', assessmentId: 'synthetic-ta-check', title: 'Synthetic TA test activity', kind: 'practice', attribution: 'individual', assessedAt, status: 'excluded', reason: 'testing', skillIds: [], verificationReference: null },
  ],
  roles: [],
  goal: { roleId: null, level: 'entry' },
  shares: [],
  shareIdentity: { state: 'ready', displayName: 'Synthetic Account Name' },
})

const syntheticShare = publicShareSchema.parse({
  schemaVersion: '1', shareId: 'synthetic-share', displayName: 'Synthetic Account Name',
  nameAttestation: { source: 'identity-control', assurance: 'account_name', observedAt: assessedAt },
  createdAt: assessedAt, expiresAt: '2026-12-01T00:00:00.000Z',
  interpretation: syntheticProfile.interpretation, skills: syntheticProfile.skills,
  evidence: [syntheticProfile.evidence[0]], roleComparison: null, digest: 'a'.repeat(64),
})

const actions = {
  saveGoal: vi.fn(), share: vi.fn(), revoke: vi.fn(), failureText: () => 'Could not load profile',
}

// Vitest's existing JSX transform uses the classic runtime; Next uses automatic JSX.
vi.stubGlobal('React', React)

function renderUnavailable(locale: 'en' | 'th') {
  return renderToStaticMarkup(createElement(LocaleProvider, {
    initialLocale: locale,
    children: createElement(AcademyProfileSurface, { connection: { status: 'unavailable' } }),
  }))
}

describe('Academy profile host with synthetic fixtures', () => {
  it('links to the profile from My learning', () => {
    const html = renderToStaticMarkup(createElement(CourseDashboard, {}))
    expect(html).toContain('href="/profile"')
    expect(html).toContain('Skills profile')
  })

  it('shows an honest unavailable state in both languages without profile facts or share controls', () => {
    const en = renderUnavailable('en')
    const th = renderUnavailable('th')
    expect(en).toContain('Academy could not load your shared skills profile')
    expect(th).toContain('Academy ยังไม่สามารถโหลดโปรไฟล์ทักษะร่วมได้')
    expect(en).toContain('href="/dashboard"')
    expect(en).not.toContain('Synthetic Account Name')
    expect(en).not.toContain('Create share link')
    expect(en).not.toContain('<input')
  })

  it('uses Core account identity in the share editor and does not offer an editable name', () => {
    const html = renderToStaticMarkup(createElement(AcademyProfileSurface, {
      connection: { status: 'ready', profile: syntheticProfile, actions, loadProfile: async () => syntheticProfile },
    }))
    const identity = html.match(/<div class="lp-share-identity">[\s\S]*?<\/div>/)?.[0] ?? ''
    expect(identity).toContain('Synthetic Account Name')
    expect(identity).toContain('From your CYBERSKILLS account')
    expect(identity).not.toContain('<input')
    expect(html).toContain('Synthetic TA test activity')
    expect(html).toContain('Not counted towards skills')
    expect(actions.share).not.toHaveBeenCalled()
    expect(createShareCommandSchema.safeParse({
      requestId: '00000000-0000-4000-8000-000000000001', skillIds: ['synthetic-skill'],
      includeRoleComparison: false, expiresInDays: 30, secret: 'a'.repeat(64), displayName: 'Changed name',
    }).success).toBe(false)
  })

  it('shows the missing account name and initially disables the share button', () => {
    const profile = { ...syntheticProfile, shareIdentity: { state: 'name_missing' as const, displayName: null } }
    const html = renderToStaticMarkup(createElement(AcademyProfileSurface, {
      connection: { status: 'ready', profile, actions, loadProfile: async () => profile },
    }))
    expect(html).toContain('Add your name in your CYBERSKILLS account before creating a share link')
    const shareButton = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Create share link<\/button>/)?.[0] ?? ''
    expect(shareButton).toMatch(/^<button[^>]*\sdisabled=""/)
  })

  // Run with PROFILE_HOST_BROWSER_TEST=1 to exercise checkbox state in Chromium.
  it.runIf(process.env.PROFILE_HOST_BROWSER_TEST === '1')(
    'requires an account name after a skill has been selected', async () => {
      const { build } = await import('esbuild')
      const { chromium } = await import('@playwright/test')
      const webRoot = process.cwd()
      const source = `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { AcademyProfileSurface } from '@/components/profile/AcademyProfileSurface';
        const profile = ${JSON.stringify(syntheticProfile)};
        if (document.documentElement.dataset.accountName === 'missing') {
          profile.shareIdentity = { state: 'name_missing', displayName: null };
        }
        const refuse = async () => { throw new Error('No transport in synthetic test'); };
        const actions = { saveGoal: refuse, share: refuse, revoke: refuse, failureText: () => 'Unavailable' };
        createRoot(document.getElementById('root')).render(React.createElement(AcademyProfileSurface, {
          connection: { status: 'ready', profile, actions, loadProfile: async () => profile },
        }));
      `
      const bundle = await build({
        absWorkingDir: webRoot,
        stdin: { contents: source, resolveDir: webRoot, loader: 'jsx' },
        alias: { '@': path.join(webRoot, 'src') },
        bundle: true, write: false, outfile: 'synthetic-profile-test.js', platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{
          name: 'synthetic-profile-test',
          setup(builder) {
            builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'synthetic' }))
            builder.onLoad({ filter: /^link$/, namespace: 'synthetic' }, () => ({
              contents: "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
              loader: 'js', resolveDir: webRoot,
            }))
            builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'css' }))
          },
        }],
      })
      const script = bundle.outputFiles.find(file => file.path.endsWith('.js'))?.text
      if (!script) throw new Error('Synthetic browser bundle was not generated')

      const browser = await chromium.launch({ headless: true })
      try {
        for (const state of ['missing', 'ready'] as const) {
          const page = await browser.newPage()
          try {
            await page.route('**/*', route => route.abort())
            await page.setContent(`<html data-account-name="${state}"><body><div id="root"></div></body></html>`)
            await page.addScriptTag({ content: script })
            const skill = page.getByRole('checkbox', { name: 'Synthetic skill' })
            const createShare = page.getByRole('button', { name: 'Create share link', exact: true })
            await skill.check()
            expect(await skill.isChecked()).toBe(true)
            expect(await createShare.isDisabled()).toBe(state === 'missing')
          } finally {
            await page.close()
          }
        }
      } finally {
        await browser.close()
      }
    }, 30_000,
  )

  it('renders a public projection with the same Core card as the preview renderer', () => {
    const host = renderToStaticMarkup(createElement(AcademySharedProfile, { share: syntheticShare }))
    const card = renderToStaticMarkup(createElement(ProfileCard, { data: syntheticShare }))
    expect(host).toContain(card)
    expect(host).toContain('Synthetic Account Name')
    expect(host).not.toContain('Synthetic TA test activity')
    expect(host).toContain('--signal:rgb(var(--cs-accent-fill))')
    expect(host).toContain('--signal-text:rgb(var(--cs-accent))')
  })
})
