#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { unstable_readConfig } from 'wrangler'
import { assertAdmissionReleasePolicy } from './admission-release-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactPath = path.join(root, '.open-next/worker.js')
const entryPath = path.join(root, 'worker.ts')
assertAdmissionReleasePolicy(unstable_readConfig({ config: path.join(root, 'wrangler.jsonc') }))

if (!existsSync(entryPath) || !existsSync(artifactPath)) {
  console.error('FAIL final OpenNext artifact is missing; run the OpenNext build first')
  process.exit(1)
}

const bundleDirectory = path.join(root, '.next/final-worker-bundle')
const bundlePath = path.join(bundleDirectory, 'worker.js')
rmSync(bundleDirectory, { force: true, recursive: true })
mkdirSync(bundleDirectory, { recursive: true })

const bundling = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js',
  'deploy', '--dry-run', `--outdir=${bundleDirectory}`,
  '--autoconfig=false', '--keep-vars',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
})

if (bundling.status !== 0) {
  console.error('FAIL final production Worker bundling failed')
  if (bundling.stdout) console.error(bundling.stdout)
  if (bundling.stderr) console.error(bundling.stderr)
  process.exit(1)
}

const bundle = await readFileSync(bundlePath, 'utf8')
if (bundle.includes('server-only')) {
  console.error('FAIL final Worker startup imported the React server-only boundary')
  process.exit(1)
}

const relativeBundle = './bundle.js'
const wasmModules = [...bundle.matchAll(/from\s*"(\.\/[^"]+\.wasm)"/g)]
  .map((match) => match[1])
  .filter((name, index, names) => names.indexOf(name) === index)
const dataModules = [...bundle.matchAll(/(?:from\s*|import\s*\()\s*"(\.\/[^"]+\.bin)"/g)]
  .map((match) => match[1])
  .filter((name, index, names) => names.indexOf(name) === index)
const moduleEntries = [
  { name: './bundle.js', type: 'esModule' },
  ...wasmModules.map((name) => ({ name, type: 'wasm' })),
  ...dataModules.map((name) => ({ name, type: 'data' })),
]

const moduleDefinition = (entry) => {
  const sourceName = entry.name === './bundle.js' ? 'worker.js' : path.basename(entry.name)
  return `(name="${entry.name}", ${entry.type}=embed "final-worker-bundle/${sourceName}")`
}

const testModule = `
import worker from '${relativeBundle}'
export default {
  async test() {
    if (typeof worker.fetch !== 'function') throw new Error('Worker fetch handler is missing')
    if (typeof worker.scheduled !== 'function') throw new Error('Worker scheduled lifecycle handler is missing')

    const outbound = await fetch('https://outbound-gate.invalid/')
    if (outbound.status !== 503 || outbound.headers.get('x-outbound-request-blocked') !== 'true') {
      throw new Error('outbound service was not intercepted')
    }

    const response = await worker.fetch(
      new Request('https://raw-host.example/'),
      { IDENTITY_LIFECYCLE_ENABLED: 'false' },
      { waitUntil() {}, passThroughOnException() {} },
    )
    if (response.status !== 404 || response.headers.get('cache-control') !== 'no-store') {
      throw new Error('raw-host gate returned ' + response.status)
    }

    for (const mode of ['maintenance', '', 'OPEN', 'invalid']) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        for (const pathname of ['/', '/_next/static/fixture.js', '/media/fixture', '/api/progress']) {
          const env = new Proxy({ ACADEMY_ADMISSION_MODE: mode }, {
            get(target, key) {
              if (key === 'ACADEMY_SERVED_HOSTS') return undefined
              if (key === 'ACADEMY_ADMISSION_MODE') return target.ACADEMY_ADMISSION_MODE
              throw new Error('maintenance touched dependency ' + String(key))
            },
          })
          const closed = await worker.fetch(new Request('https://academy.cyberskills.co.th' + pathname, { method }), env, {})
          if (closed.status !== 503 || closed.headers.get('cache-control') !== 'no-store' || closed.headers.get('retry-after') !== '60') {
            throw new Error('maintenance gate did not close ' + method + ' ' + pathname)
          }
        }
      }
    }
    for (const method of ['GET', 'HEAD']) {
      const rejected = await worker.fetch(new Request('https://raw-host.example/_next/static/fixture.js', { method }), { ACADEMY_ADMISSION_MODE: 'open' }, {})
      if (rejected.status !== 404) throw new Error('raw-host static path bypass')
      let assetReads = 0
      const staticResponse = await worker.fetch(new Request('https://academy.cyberskills.co.th/_next/static/fixture.js', { method }), {
        ACADEMY_ADMISSION_MODE: 'open',
        ASSETS: { async fetch() { assetReads++; return new Response(method === 'HEAD' ? null : 'public fixture', { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }) } },
      }, { waitUntil() {}, passThroughOnException() {} })
      if (staticResponse.status !== 200 || assetReads !== 1 || staticResponse.headers.get('cache-control') !== 'public, max-age=31536000, immutable') {
        throw new Error('open static asset delivery/cache changed')
      }
    }
    let scheduledReads = 0
    await worker.scheduled({}, new Proxy({ IDENTITY_LIFECYCLE_ENABLED: 'false' }, {
      get(target, key) {
        if (key === 'ACADEMY_ADMISSION_MODE') throw new Error('maintenance gated scheduled recovery')
        if (key === 'IDENTITY_LIFECYCLE_ENABLED') scheduledReads++
        return target[key]
      },
    }))
    if (scheduledReads === 0) throw new Error('scheduled lifecycle handler did not execute')
  },
}
`
const testModulePath = path.join(root, '.next/final-worker-startup-test.js')
const configPath = path.join(root, '.next/final-worker-startup.capnp')
writeFileSync(testModulePath, testModule)
writeFileSync(configPath, `using Config = import "/workerd/workerd.capnp".Config;
const config :Config = (
  services = [
    (
      name = "blocked-outbound",
      worker = (
        modules = [(name="blocked.js", esModule="export default { async fetch() { return new Response(null, { status: 503, headers: { 'x-outbound-request-blocked': 'true' } }) } }")],
        compatibilityDate = "2025-03-25",
      ),
    ),
    (
      name = "academy-final-worker",
      worker = (
        modules = [(name="gate.js", esModule=embed "final-worker-startup-test.js"), ${moduleEntries.map(moduleDefinition).join(', ')}],
        compatibilityDate = "2025-03-25",
        compatibilityFlags = ["nodejs_compat", "global_fetch_strictly_public"],
        globalOutbound = "blocked-outbound",
      ),
    ),
  ],
);
`)

const runtime = spawnSync(path.join(root, 'node_modules/.bin/workerd'), [
  'test',
  '-Inode_modules',
  '--no-verbose',
  configPath,
  'academy-final-worker',
], { cwd: root, encoding: 'utf8' })

if (runtime.stdout) console.log(runtime.stdout.trim())
if (runtime.status !== 0) {
  console.error('FAIL final Worker did not initialize on real workerd')
  if (runtime.stderr) console.error(runtime.stderr)
  process.exit(1)
}

console.log(`PASS final OpenNext Worker initialized on real workerd; raw-host/static gate HTTP 404; maintenance rejects before bindings; open assets preserve cache; scheduled recovery remains reachable; outbound requests blocked; bundle ${(bundle.length / 1024).toFixed(1)} KiB`)
