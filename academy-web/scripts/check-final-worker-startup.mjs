#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactPath = path.join(root, '.open-next/worker.js')
const entryPath = path.join(root, 'worker.ts')

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

console.log(`PASS final OpenNext Worker initialized on real workerd; raw-host gate HTTP 404; outbound requests blocked; bundle ${(bundle.length / 1024).toFixed(1)} KiB`)
