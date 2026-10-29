import path from 'node:path'
import { expect, it } from 'vitest'

it.runIf(process.env.PROFILE_HOST_BROWSER_TEST === '1')('loads a public share using the fragment only in the same-origin POST body', async () => {
  const { build } = await import('esbuild')
  const { chromium } = await import('@playwright/test')
  const root = process.cwd()
  const shareId = `shr_${'a'.repeat(32)}`
  const secret = 'b'.repeat(64)
  const source = `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {AcademyPublicProfile} from '@/components/profile/AcademyPublicProfile';
    createRoot(document.getElementById('root')).render(React.createElement(AcademyPublicProfile,{shareId:${JSON.stringify(shareId)}}));`
  const bundle = await build({ absWorkingDir: root, stdin: { contents: source, resolveDir: root, loader: 'jsx' },
    alias: { '@': path.join(root, 'src') }, bundle: true, write: false, outfile: 'public-share-test.js',
    platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'synthetic-public-share', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'synthetic' }))
      builder.onLoad({ filter: /^link$/, namespace: 'synthetic' }, () => ({
        contents: "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
        loader: 'js', resolveDir: root,
      }))
      builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'css' }))
    } }] })
  const script = bundle.outputFiles.find(file => file.path.endsWith('.js'))?.text
  if (!script) throw new Error('Synthetic browser bundle unavailable')
  const browser = await chromium.launch({ headless: true })
  const calls: Array<{ url: string; body: unknown; referer: string | undefined }> = []
  try {
    const page = await browser.newPage()
    await page.route('**/*', async route => {
      const request = route.request()
      if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/profile/share/')) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' })
      }
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/profile/public/read') {
        calls.push({ url: request.url(), body: request.postDataJSON(), referer: request.headers().referer })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          schemaVersion: '1', shareId, displayName: 'Synthetic Account Name',
          nameAttestation: { source: 'identity-control', assurance: 'account_name', observedAt: '2026-10-01T00:00:00.000Z' },
          createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z',
          interpretation: { version: 'synthetic', label: 'Synthetic interpretation' },
          skills: [], evidence: [], roleComparison: null, digest: 'c'.repeat(64),
        }) })
      }
      return route.abort()
    })
    await page.goto(`https://academy.example.test/profile/share/${shareId}#${secret}`)
    await page.addScriptTag({ content: script })
    await page.getByRole('heading', { name: 'Synthetic Account Name' }).waitFor()
    expect(calls).toEqual([{ url: 'https://academy.example.test/api/profile/public/read', body: { shareId, secret }, referer: undefined }])
    await page.goto(`https://academy.example.test/profile/share/${shareId}#invalid`)
    await page.addScriptTag({ content: script })
    await page.getByText('This share link is unavailable.').waitFor()
    expect(calls).toHaveLength(1)
    await page.close()
  } finally { await browser.close() }
}, 30_000)
