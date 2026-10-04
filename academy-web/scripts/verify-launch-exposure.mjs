#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const EXPECTATIONS = new Set(['gated', 'public'])
const LOCALES = ['en', 'th']
export const PUBLIC_COURSE_SLUGS = ['basic-os-linux', 'git-essentials']
export const HIDDEN_COURSE_SLUGS = [
  'assembly',
  'c-low-level',
  'computer-architecture',
  'computer-networking',
  'operating-systems',
  'setup-and-environment',
]
const HIDDEN_COURSE_LESSON_IDS = new Map([
  ['assembly', 'why-read-assembly'],
  ['c-low-level', 'why-c'],
  ['computer-architecture', 'what-is-an-isa'],
  ['computer-networking', 'how-machines-talk'],
  ['operating-systems', 'kernel-vs-user-mode'],
  ['setup-and-environment', 'choose-your-environment'],
])
const INTERNAL_PATHS = ['/admin', '/admin/courses', '/api/admin/courses', '/player']
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_ANON_REDIRECT_BODY_BYTES = 2048
export const HIDDEN_COURSE_ANON_SCOPE_NOTE =
  'Anonymous hidden lesson/start probes prove only 404 or a same-origin sign-in redirect without course content; authenticated refusal is proven by AL-03 tests/canary, not this probe.'
export const HELP_TEXT = `Usage: verify-launch-exposure.mjs --base <origin> --expect gated|public [options]

Read-only launch exposure checks. --expect gated requires Cloudflare Access redirects;
--expect public requires the two launch courses, exact catalog visibility, hidden-course
absence, and internal routes not served anonymously.

${HIDDEN_COURSE_ANON_SCOPE_NOTE}

Local Next receipts should use --base http://localhost:<port>: Next rewrites loopback
redirects to localhost, and the anonymous-gate checks compare the received target origin.

Options:
  --base <origin>             Academy origin (http:// or https://, no path/query)
  --expect <mode>             gated or public
  --raw-host <workers-origin> Require 404 on the raw *.workers.dev origin
  --timeout-ms <250-30000>    Bounded per-request timeout
  --skip-access-boundary      Local public-mode only: skip Cloudflare-owned checks
  -h, --help                  Show this help
`

export function parseLaunchExposureArgs(argv) {
  const options = {
    base: undefined,
    expect: undefined,
    rawHost: undefined,
    timeoutMs: 5_000,
    skipAccessBoundary: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--base') {
      options.base = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--expect') {
      options.expect = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--raw-host') {
      options.rawHost = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--timeout-ms') {
      const raw = requireValue(argv, index, argument)
      index += 1
      if (!/^\d+$/.test(raw)) throw new Error('--timeout-ms ต้องเป็นจำนวนเต็มบวก')
      options.timeoutMs = Number(raw)
    } else if (argument === '--skip-access-boundary') {
      options.skipAccessBoundary = true
    } else {
      throw new Error(`อาร์กิวเมนต์ไม่รู้จัก: ${argument}`)
    }
  }

  if (!options.base) throw new Error('ต้องระบุ --base <url>')
  if (!options.expect || !EXPECTATIONS.has(options.expect)) {
    throw new Error('--expect ต้องเป็น gated หรือ public')
  }
  if (options.timeoutMs < 250 || options.timeoutMs > 30_000) {
    throw new Error('--timeout-ms ต้องอยู่ระหว่าง 250 ถึง 30000 milliseconds')
  }
  if (options.skipAccessBoundary && options.expect !== 'public') {
    throw new Error('--skip-access-boundary ใช้ได้เฉพาะ local receipt ของ --expect public')
  }
  options.base = parseBaseUrl(options.base)
  options.rawHost = options.rawHost ? parseRawHost(options.rawHost) : undefined
  return options
}

function requireValue(argv, index, argument) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${argument} ต้องมีค่า`)
  return value
}

function parseBaseUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('--base ต้องเป็น URL ที่ถูกต้อง')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--base ต้องเป็น http หรือ https')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--base ต้องเป็น origin เท่านั้น')
  }
  return url.origin
}

function parseRawHost(value) {
  const candidate = value.includes('://') ? value : `https://${value}`
  let url
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('--raw-host ต้องเป็น workers.dev host หรือ https origin')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev')) {
    throw new Error('--raw-host ต้องเป็น *.workers.dev และใช้ https')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--raw-host ต้องเป็น origin เท่านั้น')
  }
  return url.origin
}

export async function verifyLaunchExposure(options) {
  const base = parseBaseUrl(options.base)
  const expect = options.expect
  if (!EXPECTATIONS.has(expect)) throw new Error('expect ต้องเป็น gated หรือ public')
  const timeoutMs = options.timeoutMs ?? 5_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30_000) {
    throw new Error('timeoutMs ต้องอยู่ระหว่าง 250 ถึง 30000 milliseconds')
  }
  const skipAccessBoundary = options.skipAccessBoundary === true
  if (skipAccessBoundary && expect !== 'public') {
    throw new Error('skipAccessBoundary ใช้ได้เฉพาะ local receipt ของ expect=public')
  }
  const rawHost = options.rawHost ? parseRawHost(options.rawHost) : undefined
  const fetch = options.fetch ?? globalThis.fetch
  if (typeof fetch !== 'function') throw new Error('fetch ไม่พร้อมใช้งาน')

  const responseCache = new Map()
  const load = async (url) => {
    const cacheKey = String(url)
    if (!responseCache.has(cacheKey)) {
      responseCache.set(cacheKey, requestUrl(fetch, cacheKey, timeoutMs))
    }
    return responseCache.get(cacheKey)
  }

  const checks = []
  const addCheck = (check) => checks.push(normalizeCheck(check))
  const probePaths = buildProbePaths()

  for (const path of probePaths) {
    const url = `${base}${path}`
    if (expect === 'gated') {
      const response = await load(url)
      addCheck({
        id: `access:${path}`,
        kind: 'access-gate',
        url,
        response,
        pass: isCloudflareAccessRedirect(response),
        expected: 'Cloudflare Access redirect without credentials',
      })
      continue
    }

    if ((path === '/' || isPublicCoursePath(path)) && path !== '/courses') {
      const response = await load(url)
      const publicRoute = await publicRouteResult({
        load,
        base,
        path,
        response,
      })
      addCheck({
        id: `public:${path}`,
        kind: 'public-route',
        url,
        response: publicRoute.response,
        pass: publicRoute.pass,
        expected: publicRoute.expected,
        observed: publicRoute.observed,
      })
    }
  }

  if (expect === 'public') {
    const catalogUrl = `${base}/courses`
    const catalog = await load(catalogUrl)
    const observedCatalogSlugs = catalog.body ? courseSlugsInHtml(catalog.body) : []
    addCheck({
      id: 'catalog:exact',
      kind: 'catalog-exact',
      url: catalogUrl,
      response: catalog,
      pass: catalog.status === 200 &&
        !isCloudflareAccessRedirect(catalog) &&
        arraysEqual(observedCatalogSlugs, PUBLIC_COURSE_SLUGS),
      expected: `course links exactly ${PUBLIC_COURSE_SLUGS.join(', ')}`,
      observed: observedCatalogSlugs,
    })

    for (const slug of HIDDEN_COURSE_SLUGS) {
      const response = await hiddenRouteResponse(load, base, slug)
      addCheck({
        id: `hidden:${slug}`,
        kind: 'hidden-course',
        url: response.url,
        response,
        pass: response.allAccepted,
        expected:
          'overview/en/th return 404; anonymous lesson/start return 404 or same-origin sign-in without course content',
      })
    }

    const sitemapUrl = `${base}/sitemap.xml`
    const sitemap = await load(sitemapUrl)
    for (const slug of HIDDEN_COURSE_SLUGS) {
      addCheck({
        id: `sitemap:${slug}`,
        kind: 'sitemap-hidden',
        url: sitemapUrl,
        response: sitemap,
        pass: sitemap.status === 200 && !sitemap.body?.includes(slug),
        expected: 'hidden slug absent from sitemap.xml',
        observed: { slugPresent: sitemap.body?.includes(slug) === true },
      })
    }

    for (const path of INTERNAL_PATHS) {
      const url = `${base}${path}`
      if (skipAccessBoundary) {
        addCheck({
          id: `internal:${path}`,
          kind: 'internal-surface',
          url,
          response: null,
          pass: null,
          status: 'skipped',
          expected: 'local run cannot prove the Cloudflare Access boundary',
          observed: 'skipped by --skip-access-boundary',
        })
        continue
      }
      const response = await load(url)
      addCheck({
        id: `internal:${path}`,
        kind: 'internal-surface',
        url,
        response,
        pass: response.status === 404 || isCloudflareAccessRedirect(response),
        expected: '404 or Cloudflare Access redirect',
      })
    }
  }

  if (rawHost) {
    const url = `${rawHost}/`
    if (expect === 'public' && skipAccessBoundary) {
      addCheck({
        id: 'raw-host:not-served',
        kind: 'raw-host',
        url,
        response: null,
        pass: null,
        status: 'skipped',
        expected: 'local Next server does not own the workers.dev host policy',
        observed: 'skipped by --skip-access-boundary',
      })
    } else {
      const response = await load(url)
      addCheck({
        id: 'raw-host:not-served',
        kind: 'raw-host',
        url,
        response,
        pass: response.status === 404,
        expected: '404 on raw workers.dev host',
      })
    }
  }

  const passed = checks.filter((check) => check.pass === true).length
  const failed = checks.filter((check) => check.pass === false).length
  const skipped = checks.filter((check) => check.pass === null).length
  return {
    mode: expect,
    base,
    rawHost: rawHost ?? null,
    timeoutMs,
    scopeNotes: expect === 'public' ? [HIDDEN_COURSE_ANON_SCOPE_NOTE] : [],
    overall: failed === 0,
    summary: { passed, failed, skipped, total: checks.length },
    checks,
  }
}

function buildProbePaths() {
  const paths = ['/', '/courses', '/sitemap.xml']
  for (const slug of PUBLIC_COURSE_SLUGS) {
    paths.push(`/courses/${slug}`)
    for (const locale of LOCALES) paths.push(`/courses/${slug}/${locale}`)
  }
  for (const slug of HIDDEN_COURSE_SLUGS) {
    paths.push(`/courses/${slug}`)
    for (const locale of LOCALES) paths.push(`/courses/${slug}/${locale}`)
    paths.push(`/courses/${slug}/lessons/${HIDDEN_COURSE_LESSON_IDS.get(slug)}`)
    paths.push(`/courses/${slug}/start`)
  }
  paths.push(...INTERNAL_PATHS)
  return paths
}

async function hiddenRouteResponse(load, base, slug) {
  const lessonId = HIDDEN_COURSE_LESSON_IDS.get(slug)
  const routes = [
    { path: `/courses/${slug}`, anonymousGateAllowed: false },
    { path: `/courses/${slug}/en`, anonymousGateAllowed: false },
    { path: `/courses/${slug}/th`, anonymousGateAllowed: false },
    { path: `/courses/${slug}/lessons/${lessonId}`, anonymousGateAllowed: true },
    { path: `/courses/${slug}/start`, anonymousGateAllowed: true },
  ]
  const responses = []
  const routeResults = {}
  const anonGatedPaths = []
  const evaluatedResponses = []
  for (const route of routes) {
    const response = await load(`${base}${route.path}`)
    responses.push(response)
    const anonymousGateAccepted = route.anonymousGateAllowed &&
      isAnonymousSignInRedirect(response, base)
    const accepted = response.status === 404 || anonymousGateAccepted
    routeResults[route.path] = {
      status: response.status,
      outcome: accepted ? (response.status === 404 ? 'not-found' : 'anon-gated') : 'unexpected',
    }
    if (anonymousGateAccepted) anonGatedPaths.push(route.path)
    evaluatedResponses.push({ response, accepted })
  }
  const firstFailure = evaluatedResponses.find(({ accepted }) => !accepted)?.response
  const representative = firstFailure ?? responses.find((response) => response.status !== 404) ?? responses[0]
  return {
    url: `${base}/courses/${slug}`,
    status: representative?.status ?? 404,
    locationHost: representative?.locationHost ?? null,
    error: responses.find((response) => response.error)?.error ?? null,
    allAccepted: evaluatedResponses.length === routes.length &&
      evaluatedResponses.every(({ accepted }) => accepted),
    routeResults,
    anonGatedPaths,
  }
}

async function requestUrl(fetch, url, timeoutMs) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const location = response.headers?.get?.('location')
    return {
      status: response.status,
      locationHost: locationHost(location, url),
      location,
      body: await readBoundedBody(response),
      error: null,
    }
  } catch (error) {
    return { status: null, locationHost: null, body: null, error: errorName(error) }
  }
}

async function readBoundedBody(response) {
  const contentLength = Number(response.headers?.get?.('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new Error('response body exceeds the bounded receipt limit')
  }
  if (typeof response.text !== 'function') return ''
  const body = await response.text()
  if (body.length > MAX_BODY_BYTES) throw new Error('response body exceeds the bounded receipt limit')
  return body
}

function locationHost(location, requestUrl) {
  if (!location) return null
  try {
    return new URL(location, requestUrl).host
  } catch {
    return null
  }
}

function isCloudflareAccessRedirect(response) {
  if (!response || !REDIRECT_STATUSES.has(response.status)) return false
  const host = response.locationHost?.toLowerCase()
  return host === 'cloudflareaccess.com' || host?.endsWith('.cloudflareaccess.com') === true
}

async function publicRouteResult({ load, base, path, response }) {
  if (response.status === 200 && !isCloudflareAccessRedirect(response)) {
    return {
      response,
      pass: true,
      expected: '200 without Cloudflare Access redirect',
      observed: { directStatus: 200 },
    }
  }

  const canonicalUrl = canonicalPublicCourseLocation(response, base, path)
  if (!canonicalUrl) {
    return {
      response,
      pass: false,
      expected: '200 without Cloudflare Access redirect',
      observed: { directStatus: response.status },
    }
  }

  const target = await load(canonicalUrl)
  return {
    response,
    pass: target.status === 200 && !isCloudflareAccessRedirect(target),
    expected:
      '200 without Cloudflare Access redirect, or 301/308 to a same-origin course locale whose target returns 200',
    observed: {
      directStatus: response.status,
      canonicalLocaleRedirect: true,
      redirectTargetStatus: target.status,
    },
  }
}

function canonicalPublicCourseLocation(response, base, path) {
  if (!response || (response.status !== 301 && response.status !== 308) || !response.location) return null
  const slug = PUBLIC_COURSE_SLUGS.find((candidate) => path === `/courses/${candidate}`)
  if (!slug) return null
  let url
  try {
    url = new URL(response.location, base)
  } catch {
    return null
  }
  if (url.origin !== base || url.search || url.hash) return null
  return url.pathname === `/courses/${slug}/en` || url.pathname === `/courses/${slug}/th` ? url : null
}

function isAnonymousSignInRedirect(response, base) {
  if (!response || !REDIRECT_STATUSES.has(response.status) || !response.location) return false
  let url
  try {
    url = new URL(response.location, base)
  } catch {
    return false
  }
  const body = response.body ?? ''
  const normalizedBody = body.toLowerCase()
  return url.origin === base &&
    url.pathname === '/sign-in' &&
    Buffer.byteLength(body, 'utf8') <= MAX_ANON_REDIRECT_BODY_BYTES &&
    !normalizedBody.includes('<html') &&
    !normalizedBody.includes('<article') &&
    !normalizedBody.includes('<h1') &&
    !normalizedBody.includes('lesson-title')
}

function isPublicCoursePath(path) {
  return PUBLIC_COURSE_SLUGS.some((slug) =>
    path === `/courses/${slug}` || LOCALES.some((locale) => path === `/courses/${slug}/${locale}`))
}

function courseSlugsInHtml(html) {
  const slugs = new Set()
  for (const match of html.matchAll(/href="\/courses\/([a-z0-9-]+)(?:[/?#][^"]*)?"/g)) {
    slugs.add(match[1])
  }
  return [...slugs].sort()
}

function arraysEqual(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function normalizeCheck(check) {
  const response = check.response
  const result = {
    id: check.id,
    kind: check.kind,
    url: check.url,
    method: 'GET',
    status: check.status ?? response?.status ?? null,
    locationHost: response?.locationHost ?? null,
    expected: check.expected,
    pass: check.pass,
  }
  if (response?.error) result.error = response.error
  if ('observed' in check) result.observed = check.observed
  if (response && 'routeResults' in response) result.observed = response.routeResults
  return result
}

function errorName(error) {
  return error && typeof error.name === 'string' ? error.name : 'FetchError'
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(HELP_TEXT)
    return
  }
  const options = parseLaunchExposureArgs(argv)
  const receipt = await verifyLaunchExposure(options)
  console.log(JSON.stringify(receipt))
  process.exitCode = receipt.overall ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
