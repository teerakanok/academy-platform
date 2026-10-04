import { describe, expect, it } from 'vitest'

import {
  HELP_TEXT,
  HIDDEN_COURSE_ANON_SCOPE_NOTE,
  HIDDEN_COURSE_SLUGS,
  parseLaunchExposureArgs,
  verifyLaunchExposure,
} from '../../scripts/verify-launch-exposure.mjs'

const BASE = 'https://academy.test'
const RAW_HOST = 'https://raw.test.workers.dev'
const CATALOG_HTML = `
  <a href="/courses/basic-os-linux/en">Basic OS &amp; Linux</a>
  <a href="/courses/git-essentials/en">Git Essentials</a>
`

type Failure = {
  path: string
  kind: string
  slug?: string
}

function response(status: number, body = '', location?: string) {
  return {
    status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'location' ? location ?? null : null
      },
    },
    text: async () => body,
  }
}

function accessRedirect() {
  return response(
    302,
    '',
    'https://team.cloudflareaccess.com/cdn-cgi/access/login/issuer?opaque=value',
  )
}

function signInRedirect(slug: string, base: string) {
  return response(
    307,
    '',
    `${base}/sign-in?next=%2Fcourses%2F${slug}%2Fstart`,
  )
}

function fetchFor(expect: 'gated' | 'public', failure?: Failure) {
  const seen: Array<{ url: string; init: RequestInit }> = []
  const fetch = async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    const path = new URL(url).pathname

    if (url.startsWith(RAW_HOST)) {
      return failure?.kind === 'raw-host' ? response(200, 'raw route leaked') : response(404)
    }
    if (expect === 'gated') {
      return failure && path === failure.path
        ? response(302, '', 'https://evil.test/login?opaque=value')
        : accessRedirect()
    }

    if (failure?.kind === 'public-route' && path === failure.path) return accessRedirect()
    if (failure?.kind === 'catalog-exact' && path === '/courses') {
      return response(200, '<a href="/courses/basic-os-linux/en">only one</a>')
    }
    if (failure?.kind === 'sitemap-hidden' && path === '/sitemap.xml') {
      return response(200, `<urlset><loc>${BASE}/courses/${failure.slug}/en</loc></urlset>`)
    }
    if (failure?.kind === 'internal-surface' && path === failure.path) {
      return response(200, 'internal surface leaked')
    }

    if (path === '/') return response(200, CATALOG_HTML)
    if (path === '/courses') return response(200, CATALOG_HTML)
    if (path === '/sitemap.xml') return response(200, '<urlset><loc>https://academy.test/</loc></urlset>')
    if (path === '/api/admin/courses') return accessRedirect()
    if (path.startsWith('/admin') || path === '/player') return response(404)

    const hiddenLesson = /^\/courses\/([^/]+)\/lessons\//.exec(path)
    const slug = hiddenLesson?.[1]
    if (slug && HIDDEN_COURSE_SLUGS.includes(slug)) {
      return failure?.kind === 'hidden-course' && failure.slug === slug
        ? response(200, 'hidden lesson leaked')
        : response(404)
    }
    const hiddenStart = /^\/courses\/([^/]+)\/start$/.exec(path)
    const startSlug = hiddenStart?.[1]
    const origin = new URL(url).origin
    if (startSlug && HIDDEN_COURSE_SLUGS.includes(startSlug)) return signInRedirect(startSlug, origin)
    if (path === '/courses/basic-os-linux') {
      const canonicalLocale = failure?.kind === 'public-route' && failure.path === '/courses/basic-os-linux/en'
        ? 'th'
        : 'en'
      return response(308, '', `${origin}/courses/basic-os-linux/${canonicalLocale}`)
    }
    if (path === '/courses/git-essentials') {
      const canonicalLocale = failure?.kind === 'public-route' && failure.path === '/courses/git-essentials/en'
        ? 'th'
        : 'en'
      return response(308, '', `${origin}/courses/git-essentials/${canonicalLocale}`)
    }
    if (path === '/courses/basic-os-linux/en' || path === '/courses/basic-os-linux/th') return response(200)
    if (path === '/courses/git-essentials/en' || path === '/courses/git-essentials/th') return response(200)

    return response(404)
  }
  return { fetch, seen }
}

function failureForCheck(check: { id: string; kind: string; url: string }): Failure {
  if (check.kind === 'catalog-exact') return { path: '/courses', kind: check.kind }
  if (check.kind === 'sitemap-hidden') {
    return { path: '/sitemap.xml', kind: check.kind, slug: check.id.split(':')[1] }
  }
  if (check.kind === 'hidden-course') {
    const slug = check.id.split(':')[1]
    return { path: `/courses/${slug}/lessons/lesson`, kind: check.kind, slug }
  }
  const path = new URL(check.url).pathname
  return { path, kind: check.kind }
}

describe('launch exposure verification', () => {
  it('parses the bounded read-only command contract', () => {
    expect(parseLaunchExposureArgs([
      '--base', BASE,
      '--expect', 'public',
      '--raw-host', 'raw.test.workers.dev',
      '--timeout-ms', '1500',
    ])).toEqual({
      base: BASE,
      expect: 'public',
      rawHost: RAW_HOST,
      timeoutMs: 1500,
      skipAccessBoundary: false,
    })

    expect(() => parseLaunchExposureArgs(['--base', `${BASE}/path`, '--expect', 'public']))
      .toThrow(/origin/)
    expect(() => parseLaunchExposureArgs(['--base', BASE, '--expect', 'open']))
      .toThrow(/gated หรือ public/)
    expect(() => parseLaunchExposureArgs(['--base', BASE, '--expect', 'public', '--extra']))
      .toThrow(/อาร์กิวเมนต์ไม่รู้จัก/)
  })

  it('passes the public launch shape with one bounded GET per unique URL and no credential-forwarding', async () => {
    const { fetch, seen } = fetchFor('public')
    const receipt = await verifyLaunchExposure({
      base: BASE,
      expect: 'public',
      rawHost: RAW_HOST,
      timeoutMs: 1500,
      fetch,
    })

    expect(receipt.overall).toBe(true)
    expect(receipt.summary.failed).toBe(0)
    expect(receipt.summary.skipped).toBe(0)
    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen.map((request) => request.url)).size).toBe(seen.length)
    for (const request of seen) {
      expect(request.init.method).toBe('GET')
      expect(request.init.redirect).toBe('manual')
      expect(request.init.credentials).toBe('omit')
      expect(request.init.signal).toBeInstanceOf(AbortSignal)
    }

    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain('opaque=value')
    expect(serialized).not.toContain('/cdn-cgi/access/login')
    expect(serialized).not.toContain('cookie')

    const canonicalRedirect = receipt.checks.find((check) => check.id === 'public:/courses/basic-os-linux')
    expect(canonicalRedirect?.status).toBe(308)
    expect(canonicalRedirect?.observed).toEqual({
      directStatus: 308,
      canonicalLocaleRedirect: true,
      redirectTargetStatus: 200,
    })

    const hiddenCheck = receipt.checks.find((check) => check.id === 'hidden:assembly')
    expect(hiddenCheck?.pass).toBe(true)
    expect(hiddenCheck?.observed['/courses/assembly/start']).toEqual({
      status: 307,
      outcome: 'anon-gated',
    })
    expect(receipt.scopeNotes).toContain(HIDDEN_COURSE_ANON_SCOPE_NOTE)
    expect(HELP_TEXT).toContain(HIDDEN_COURSE_ANON_SCOPE_NOTE)
  })

  it('accepts only a same-origin locale target for canonical public course redirects', async () => {
    const cases = [
      { location: 'https://evil.test/courses/basic-os-linux/en', targetStatus: 200 },
      { location: `${BASE}/courses/basic-os-linux/not-a-locale`, targetStatus: 200 },
      { location: `${BASE}/courses/basic-os-linux/en`, targetStatus: 404 },
    ]
    for (const { location, targetStatus } of cases) {
      const seen: string[] = []
      const defaultFetch = fetchFor('public').fetch
      const fetch = async (url: string, init: RequestInit) => {
        seen.push(url)
        if (url === `${BASE}/courses/basic-os-linux`) {
          return response(308, '', location)
        }
        if (url === `${BASE}/courses/basic-os-linux/en` && targetStatus !== 200) return response(targetStatus)
        return defaultFetch(url, init)
      }
      const receipt = await verifyLaunchExposure({
        base: BASE,
        expect: 'public',
        timeoutMs: 1500,
        fetch,
      })
      const targetCheck = receipt.checks.find((check) => check.id === 'public:/courses/basic-os-linux')

      expect(targetCheck?.pass).toBe(false)
      expect(receipt.overall).toBe(false)
      expect(seen).not.toContain('https://evil.test/courses/basic-os-linux/en')
      expect(targetCheck?.observed).toEqual(location === `${BASE}/courses/basic-os-linux/en`
        ? {
            directStatus: 308,
            canonicalLocaleRedirect: true,
            redirectTargetStatus: targetStatus,
          }
        : { directStatus: 308 })
      if (location.startsWith('https://evil.test')) {
        expect(JSON.stringify(receipt)).not.toContain(location)
      }
    }
  })

  it('accepts hidden lesson/start anonymous redirects only to the same-origin sign-in path', async () => {
    const cases = [
      'https://evil.test/sign-in',
      `${BASE}/dashboard`,
      `${BASE}/sign-in/lessons/assembly`,
    ]
    for (const location of cases) {
      const seen: string[] = []
      const defaultFetch = fetchFor('public').fetch
      const fetch = async (url: string, init: RequestInit) => {
        seen.push(url)
        if (url === `${BASE}/courses/assembly/lessons/why-read-assembly`) {
          return response(307, '', location)
        }
        return defaultFetch(url, init)
      }
      const receipt = await verifyLaunchExposure({
        base: BASE,
        expect: 'public',
        timeoutMs: 1500,
        fetch,
      })
      const hiddenCheck = receipt.checks.find((check) => check.id === 'hidden:assembly')

      expect(hiddenCheck?.pass).toBe(false)
      expect(receipt.overall).toBe(false)
      expect(hiddenCheck?.observed['/courses/assembly/lessons/why-read-assembly']).toEqual({
        status: 307,
        outcome: 'unexpected',
      })
      expect(seen).not.toContain('https://evil.test/sign-in')
      expect(JSON.stringify(receipt)).not.toContain(location)
    }
  })

  it('passes gated mode when every Academy path is redirected by Cloudflare Access', async () => {
    const { fetch } = fetchFor('gated')
    const receipt = await verifyLaunchExposure({
      base: BASE,
      expect: 'gated',
      rawHost: RAW_HOST,
      timeoutMs: 1500,
      fetch,
    })

    expect(receipt.overall).toBe(true)
    expect(receipt.summary.failed).toBe(0)
    expect(receipt.checks.every((check) => check.kind === 'raw-host' || check.locationHost === 'team.cloudflareaccess.com')).toBe(true)
  })

  it('fails every individual public-mode check without weakening the other checks', async () => {
    const baseline = await verifyLaunchExposure({
      base: BASE,
      expect: 'public',
      rawHost: RAW_HOST,
      timeoutMs: 1500,
      fetch: fetchFor('public').fetch,
    })
    expect(baseline.overall).toBe(true)

    for (const baselineCheck of baseline.checks) {
      const failure = failureForCheck(baselineCheck)
      const receipt = await verifyLaunchExposure({
        base: BASE,
        expect: 'public',
        rawHost: RAW_HOST,
        timeoutMs: 1500,
        fetch: fetchFor('public', failure).fetch,
      })
      const target = receipt.checks.find((check) => check.id === baselineCheck.id)

      expect(target, baselineCheck.id).toBeDefined()
      expect(target?.pass, baselineCheck.id).toBe(false)
      expect(receipt.overall, baselineCheck.id).toBe(false)
      expect(receipt.summary.failed, baselineCheck.id).toBe(1)
    }
  })

  it('fails every individual gated path check when a redirect is not Cloudflare Access', async () => {
    const baseline = await verifyLaunchExposure({
      base: BASE,
      expect: 'gated',
      timeoutMs: 1500,
      fetch: fetchFor('gated').fetch,
    })
    expect(baseline.overall).toBe(true)

    for (const baselineCheck of baseline.checks.filter((check) => check.kind === 'access-gate')) {
      const receipt = await verifyLaunchExposure({
        base: BASE,
        expect: 'gated',
        timeoutMs: 1500,
        fetch: fetchFor('gated', failureForCheck(baselineCheck)).fetch,
      })
      const target = receipt.checks.find((check) => check.id === baselineCheck.id)

      expect(target?.pass, baselineCheck.id).toBe(false)
      expect(receipt.overall, baselineCheck.id).toBe(false)
    }
  })

  it('records explicit local skips only for Access-owned checks and still counts them transparently', async () => {
    const receipt = await verifyLaunchExposure({
      base: 'http://127.0.0.1:3000',
      expect: 'public',
      rawHost: RAW_HOST,
      timeoutMs: 1500,
      skipAccessBoundary: true,
      fetch: fetchFor('public').fetch,
    })

    expect(receipt.overall).toBe(true)
    expect(receipt.summary.skipped).toBe(5)
    expect(receipt.checks.filter((check) => check.status === 'skipped').map((check) => check.kind))
      .toEqual(expect.arrayContaining(['internal-surface', 'raw-host']))
  })
})
