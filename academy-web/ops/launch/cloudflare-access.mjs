#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const HOST = 'academy.cyberskills.co.th'
const ORIGIN = `https://${HOST}`
const API_BASE = 'https://api.cloudflare.com/client/v4'
const RAW_HOST = 'https://cyberskills-academy.songpon-te.workers.dev'
const EXISTING_APP_ID = '72f37caa-6573-4898-8bd1-b4aaaba741cc'
const EXISTING_POLICY_ID = 'd5aa4dcf-f77c-4b63-b14f-5c2dc909fff2'
const ADMIN_APP_NAME = 'Academy internal admin UI'
const ADMIN_API_APP_NAME = 'Academy internal admin API'
const PLAYER_APP_NAME = 'Academy internal player'
const BASELINE_PATHS = ['/', '/courses', '/auth/callback', '/admin', '/player']
const MODES = new Set(['identity', 'snapshot', 'apply', 'rollback', 'check'])
const PHASES = new Set(['snapshot', 'launch', 'rollback'])
const APPLICATION_FIELDS = new Set([
  'name', 'domain', 'path', 'session_duration', 'auto_redirect_to_identity',
  'enable_binding_cookie', 'enable_reload_refresh', 'cors_headers', 'same_site',
  'allowed_idps', 'app_launcher_visible', 'app_launcher_logs', 'service_auth401',
  'custom_denial_message', 'custom_pages', 'logo_url', 'skip_interstitial',
  'ai_policy_id',
])
const POLICY_FIELDS = new Set([
  'name', 'decision', 'include', 'exclude', 'require', 'precedence',
  'approval_groups', 'session_duration',
])
const TARGETS = [
  { provider: 'cloudflare-access', resource_id: `app/${EXISTING_APP_ID}`, display: 'Academy canonical Access application' },
  { provider: 'cloudflare-access', resource_id: `host/${HOST}`, display: 'Academy host Access topology' },
  { provider: 'postgres', resource_id: 'academy/course_settings', display: 'Academy runtime course settings' },
]

function requireValue(argv, index, name) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} must have a value`)
  return value
}

export function parseCloudflareAccessArgs(argv) {
  const options = {
    mode: undefined,
    phase: 'snapshot',
    apiBase: API_BASE,
    origin: ORIGIN,
    rawHost: RAW_HOST,
    outputDir: undefined,
    timeoutMs: 10_000,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--mode') {
      options.mode = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--phase') {
      options.phase = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--api-base') {
      options.apiBase = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--origin') {
      options.origin = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--raw-host') {
      options.rawHost = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--output-dir') {
      options.outputDir = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--timeout-ms') {
      const raw = requireValue(argv, index, argument)
      index += 1
      if (!/^\d+$/.test(raw)) throw new Error('--timeout-ms must be a positive integer')
      options.timeoutMs = Number(raw)
    } else {
      throw new Error(`unknown Cloudflare Access argument: ${argument}`)
    }
  }
  if (!MODES.has(options.mode)) throw new Error('--mode must be identity, snapshot, apply, rollback, or check')
  if (!PHASES.has(options.phase)) throw new Error('--phase must be snapshot, launch, or rollback')
  if (options.mode !== 'identity' && !options.outputDir) throw new Error('--output-dir is required')
  if (options.timeoutMs < 250 || options.timeoutMs > 30_000) {
    throw new Error('--timeout-ms must be between 250 and 30000')
  }
  options.apiBase = parseApiBase(options.apiBase)
  options.origin = parseAcademyOrigin(options.origin, '--origin')
  options.rawHost = parseAcademyOrigin(options.rawHost, '--raw-host')
  return options
}

function parseApiBase(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('--api-base must be an HTTP(S) URL base')
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' && !/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/i.test(url.pathname)) {
    throw new Error('--api-base must be an HTTP(S) URL base without a query')
  }
  return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')}`
}

function parseAcademyOrigin(value, name) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an origin`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin`)
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new Error('Academy origins must use https outside local rehearsal')
  }
  return url.origin
}

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname.replace(/^\[|\]$/g, ''))
}

function canonical(value) {
  return JSON.stringify(value, null, 2)
}

function stableCanonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableCanonical(item)).join(',')}]`
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) return JSON.stringify(value ?? null)
  const source = value instanceof Map ? [...value] : Object.entries(value)
  return `{${source
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableCanonical(item)}`)
    .join(',')}}`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedState(state) {
  const volatile = new Set(['created_at', 'updated_at', 'modified_at'])
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value)
      .filter(([key, item]) => item !== undefined && !volatile.has(key))
      .map(([key, item]) => [key, clean(item)]))
  }
  return JSON.parse(stableCanonical(clean(structuredClone(state))))
}

async function writeProtectedJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const encoded = `${canonical(value)}\n`
  try {
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(encoded, 'utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (await readFile(path, 'utf8') !== encoded) {
      throw new Error(`protected output already exists with different content: ${dirname(path)}`)
    }
  }
  return { path, fileSha256: sha256(encoded) }
}

async function readProtectedJson(path, schema) {
  const value = JSON.parse(await readFile(path, 'utf8'))
  if (value.schema !== schema) throw new Error(`protected ${schema} input is invalid`)
  return value
}

async function readSnapshot(outputDir) {
  const base = outputDir.replace(/\/+$/, '')
  const snapshot = await readProtectedJson(`${base}/access-snapshot.json`, 'academy-access-snapshot/v1')
  const hash = JSON.parse(await readFile(`${base}/access-snapshot.sha256`, 'utf8')).sha256
  const raw = await readFile(`${base}/access-snapshot.json`, 'utf8')
  if (sha256(raw) !== hash) throw new Error('protected Access snapshot hash mismatch')
  return snapshot
}

async function apiJson({ fetch, apiBase, token, path, method = 'GET', body, timeoutMs }) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Cloudflare API returned non-JSON content')
  }
  if (!response.ok || value?.success !== true) {
    throw new Error(`Cloudflare API rejected ${method} ${path.split('?')[0]} with HTTP ${response.status}`)
  }
  return value.result
}

function accountPath(options, suffix) {
  return `/accounts/${encodeURIComponent(options.accountKey)}/${suffix}`
}

async function listApplications(dependencies, options) {
  const result = await apiJson({
    ...dependencies,
    path: `${accountPath(options, 'access/apps')}?per_page=100`,
  })
  if (!Array.isArray(result)) throw new Error('Cloudflare Access application list is invalid')
  return result
}

async function listPolicies(dependencies, options, applicationId) {
  const result = await apiJson({
    ...dependencies,
    path: `${accountPath(options, `access/apps/${encodeURIComponent(applicationId)}/policies`)}?per_page=100`,
  })
  if (!Array.isArray(result)) throw new Error('Cloudflare Access policy list is invalid')
  return result
}

async function captureState(dependencies, options) {
  const host = new URL(options.origin).hostname
  const applications = []
  for (const application of await listApplications(dependencies, options)) {
    const applicationHost = String(application.domain ?? '').split('/')[0].toLowerCase()
    if (applicationHost !== host) continue
    applications.push({
      application,
      policies: await listPolicies(dependencies, options, application.id),
    })
  }
  applications.sort((left, right) => String(left.application.id).localeCompare(String(right.application.id)))
  return { applications }
}

async function probeOrigin({ fetch, origin, path, timeoutMs }) {
  const response = await fetch(`${origin}${path}`, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(timeoutMs),
  })
  await response.arrayBuffer().catch(() => undefined)
  const location = response.headers.get('location')
  let sanitizedLocation = null
  if (location) {
    try {
      const url = new URL(location, origin)
      sanitizedLocation = { origin: url.origin, path: url.pathname }
    } catch {
      sanitizedLocation = { origin: null, path: null }
    }
  }
  return { path, status: response.status, location: sanitizedLocation }
}

function applicationPayload(application, overrides) {
  const payload = {}
  for (const [key, value] of Object.entries(application)) {
    if (APPLICATION_FIELDS.has(key) && value !== undefined) payload[key] = value
  }
  return { ...payload, ...overrides }
}

function policyPayload(policy) {
  const payload = {}
  for (const [key, value] of Object.entries(policy)) {
    if (POLICY_FIELDS.has(key) && value !== undefined) payload[key] = value
  }
  return payload
}

function findApplication(state, predicate) {
  return state.applications.find((entry) => predicate(entry.application))?.application
}

function internalTarget(state) {
  return [
    { name: ADMIN_APP_NAME, path: '/admin' },
    { name: ADMIN_API_APP_NAME, path: '/api/admin' },
    { name: PLAYER_APP_NAME, path: '/player' },
  ].every(({ name, path }) => {
    const application = findApplication(state, (item) => item.name === name && item.path === path)
    return Boolean(application) && application.path === path
  })
}

function launchTopology(state) {
  const existing = findApplication(state, (item) => item.id === EXISTING_APP_ID)
  return Boolean(existing)
    && existing.path === '/admin'
    && existing.name === ADMIN_APP_NAME
    && internalTarget(state)
    && !state.applications.some((entry) => {
      const application = entry.application
      return application.id !== EXISTING_APP_ID
        && (!application.path || application.path === '/')
    })
}

function sameState(left, right) {
  return stableCanonical(normalizedState(left)) === stableCanonical(normalizedState(right))
}

function policySignature(policies) {
  return policies.map(policyPayload).map((policy) => stableCanonical(policy))
}

function sameApplication(left, right) {
  return stableCanonical(applicationPayload(left)) === stableCanonical(applicationPayload(right))
}

function sanitizeSummary(state, probes) {
  return {
    schema: 'academy-access-snapshot-summary/v1',
    applications: state.applications.map(({ application, policies }) => ({
      id: application.id,
      name: application.name,
      domain: application.domain,
      path: application.path ?? '/',
      policyCount: policies.length,
      decisions: policies.map((policy) => policy.decision).sort(),
      includeRuleTypes: [...new Set(policies.flatMap((policy) => Array.isArray(policy.include)
        ? policy.include.map((rule) => Object.keys(rule)[0]).filter(Boolean)
        : []))].sort(),
    })),
    probes,
  }
}

function checkEnvelope(status, observed) {
  return `${JSON.stringify({ status, observed })}\n`
}

async function verifyBaseline(snapshot) {
  const existing = findApplication(snapshot.state, (item) => item.id === EXISTING_APP_ID)
  if (!existing) throw new Error('canonical Access application is absent from the protected snapshot')
  if (!snapshot.state.applications.some((entry) => entry.policies.some((policy) => policy.id === EXISTING_POLICY_ID))) {
    throw new Error('canonical Access policy is absent from the protected snapshot')
  }
  const gated = snapshot.probes.filter((probe) => probe.status === 302
    && probe.location?.origin?.endsWith('.cloudflareaccess.com'))
  if (gated.length !== snapshot.probes.length) {
    throw new Error('baseline probes do not prove the canonical host Access-gated')
  }
  return existing
}

/**
 * @param {{
 *   argv?: string[],
 *   environment?: Record<string, string | undefined>,
 *   fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>,
 *   output?: { write: (chunk: string) => void },
 *   now?: () => Date,
 * }} [options]
 */
export async function runCloudflareAccessOperation({
  argv,
  environment = process.env,
  fetch = globalThis.fetch,
  output = process.stdout,
  now = () => new Date(),
} = {}) {
  const options = parseCloudflareAccessArgs(argv)
  if (options.mode === 'identity') {
    output.write(`${JSON.stringify({ targets: TARGETS })}\n`)
    return
  }
  const token = environment.CLOUDFLARE_API_TOKEN
  const accountKey = environment.CLOUDFLARE_ACCOUNT_KEY
  if (!token || !accountKey) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_KEY are required')
  options.accountKey = accountKey
  const dependencies = { fetch, apiBase: options.apiBase, token, timeoutMs: options.timeoutMs }
  const outputDir = options.outputDir.replace(/\/+$/, '')

  if (options.mode === 'snapshot') {
    const state = await captureState(dependencies, options)
    const probes = []
    for (const path of BASELINE_PATHS) probes.push(await probeOrigin({ fetch, origin: options.origin, path, timeoutMs: options.timeoutMs }))
    await verifyBaseline({ state, probes })
    const snapshot = {
      schema: 'academy-access-snapshot/v1',
      capturedAt: now().toISOString(),
      origin: options.origin,
      state,
      probes,
    }
    const existing = await readSnapshot(outputDir).catch(() => null)
    if (existing && !sameState(existing.state, state)) {
      throw new Error('protected Access snapshot exists and live Access state changed')
    }
    if (!existing) {
      const written = await writeProtectedJson(`${outputDir}/access-snapshot.json`, snapshot)
      await writeProtectedJson(`${outputDir}/access-snapshot.sha256`, { sha256: written.fileSha256 })
      await writeProtectedJson(`${outputDir}/baseline-probes.json`, { schema: 'academy-access-probes/v1', probes })
      await writeProtectedJson(`${outputDir}/access-snapshot-summary.json`, sanitizeSummary(state, probes))
    }
    output.write(`${JSON.stringify({
      applied: true,
      snapshot: existing ? 'already-present' : 'created',
      applications: state.applications.length,
      probes: probes.length,
    })}\n`)
    return
  }

  if (options.mode === 'check') {
    let snapshot
    let state
    try {
      snapshot = await readSnapshot(outputDir)
      state = await captureState(dependencies, options)
    } catch {
      output.write(checkEnvelope('unknown', { phase: options.phase, reason: 'snapshot-or-live-read-unavailable' }))
      return
    }
    if (options.phase === 'snapshot') {
      const matches = sameState(snapshot.state, state)
      output.write(checkEnvelope(
        matches ? 'matches_expected' : 'not_applied',
        { phase: 'snapshot', snapshotValid: true, liveMatchesSnapshot: matches },
      ))
      return
    }
    if (options.phase === 'launch') {
      const matches = launchTopology(state)
      output.write(checkEnvelope(
        matches ? 'matches_expected' : 'not_applied',
        { phase: 'launch', adminInternalOnly: matches, internalFamilies: ['/admin', '/api/admin', '/player'] },
      ))
      return
    }
    const matches = sameState(snapshot.state, state)
    output.write(checkEnvelope(
      matches ? 'matches_expected' : 'not_applied',
      { phase: 'rollback', liveMatchesBaselineSnapshot: matches },
    ))
    return
  }

  const snapshot = await readSnapshot(outputDir)
  const baselineApplication = await verifyBaseline(snapshot)
  const live = await captureState(dependencies, options)

  if (options.mode === 'apply') {
    if (launchTopology(live)) {
      const receiptPath = `${outputDir}/access-launch-receipt.json`
      if (!await readFile(receiptPath, 'utf8').then(() => true, () => false)) {
        await writeProtectedJson(receiptPath, {
          schema: 'academy-access-launch-receipt/v1',
          completedAt: now().toISOString(),
          state: live,
        })
      }
      output.write(`${JSON.stringify({ applied: true, changed: false, topology: 'public-with-internal-families' })}\n`)
      return
    }
    const baselineEntry = snapshot.state.applications
      .find((entry) => entry.application.id === EXISTING_APP_ID)
    const liveBaseline = live.applications.find((entry) => entry.application.id === EXISTING_APP_ID)
    if (!baselineEntry || !liveBaseline || !sameApplication(baselineEntry.application, liveBaseline.application)) {
      throw new Error('live canonical Access application differs from the protected snapshot')
    }
    const knownNames = new Set([ADMIN_APP_NAME, ADMIN_API_APP_NAME, PLAYER_APP_NAME])
    if (live.applications.some((entry) => entry.application.id !== EXISTING_APP_ID
      && !knownNames.has(entry.application.name))) {
      throw new Error('live Access topology contains an unknown host application')
    }

    const definitions = [
      { name: ADMIN_API_APP_NAME, path: '/api/admin' },
      { name: PLAYER_APP_NAME, path: '/player' },
    ]
    for (const definition of definitions) {
      const existing = live.applications.find((entry) => entry.application.name === definition.name
        && entry.application.domain === baselineApplication.domain)
      if (existing) {
        if (existing.application.path !== definition.path
          || stableCanonical(policySignature(existing.policies))
            !== stableCanonical(policySignature(baselineEntry.policies))) {
          throw new Error(`internal Access application already exists with an unexpected shape: ${definition.path}`)
        }
        continue
      }
      const created = await apiJson({
        ...dependencies,
        method: 'POST',
        path: accountPath(options, 'access/apps'),
        body: applicationPayload(baselineApplication, { name: definition.name, path: definition.path }),
      })
      for (const policy of baselineEntry.policies) {
        await apiJson({
          ...dependencies,
          method: 'POST',
          path: accountPath(options, `access/apps/${encodeURIComponent(created.id)}/policies`),
          body: policyPayload(policy),
        })
      }
    }

    await apiJson({
      ...dependencies,
      method: 'PUT',
      path: accountPath(options, `access/apps/${encodeURIComponent(EXISTING_APP_ID)}`),
      body: applicationPayload(baselineApplication, { name: ADMIN_APP_NAME, path: '/admin' }),
    })
    const after = await captureState(dependencies, options)
    if (!launchTopology(after)) throw new Error('Cloudflare Access launch topology verification failed')
    await writeProtectedJson(`${outputDir}/access-launch-receipt.json`, {
      schema: 'academy-access-launch-receipt/v1',
      completedAt: now().toISOString(),
      state: after,
    })
    output.write(`${JSON.stringify({ applied: true, changed: true, topology: 'public-with-internal-families' })}\n`)
    return
  }

  if (sameState(snapshot.state, live)) {
    output.write(`${JSON.stringify({ applied: true, changed: false, topology: 'baseline-access-gated' })}\n`)
    return
  }
  const createdNames = new Set([ADMIN_API_APP_NAME, PLAYER_APP_NAME])
  for (const entry of [...live.applications].reverse()) {
    if (createdNames.has(entry.application.name)) {
      await apiJson({
        ...dependencies,
        method: 'DELETE',
        path: accountPath(options, `access/apps/${encodeURIComponent(entry.application.id)}`),
      })
    }
  }
  await apiJson({
    ...dependencies,
    method: 'PUT',
    path: accountPath(options, `access/apps/${encodeURIComponent(EXISTING_APP_ID)}`),
    body: applicationPayload(baselineApplication, {
      name: baselineApplication.name,
      path: baselineApplication.path ?? '/',
    }),
  })
  const restored = await captureState(dependencies, options)
  if (!sameState(snapshot.state, restored)) throw new Error('Cloudflare Access rollback verification failed')
  const receiptPath = `${outputDir}/access-rollback-receipt.json`
  if (!await readFile(receiptPath, 'utf8').then(() => true, () => false)) {
    await writeProtectedJson(receiptPath, {
      schema: 'academy-access-rollback-receipt/v1',
      completedAt: now().toISOString(),
      state: restored,
    })
  }
  output.write(`${JSON.stringify({ applied: true, changed: true, topology: 'baseline-access-gated' })}\n`)
}

if (process.argv[1] && process.argv[1].endsWith('ops/launch/cloudflare-access.mjs')) {
  runCloudflareAccessOperation().catch((error) => {
    process.stderr.write(`CLOUDFLARE_ACCESS_OPERATION_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}
