#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const template = JSON.parse(readFileSync(
  new URL('../ops/identity/production-runtime-config.template.json', import.meta.url),
  'utf8',
))
for (const key of [
  'IDENTITY_RUNTIME_ENABLED',
  'IDENTITY_RUNTIME_WIRED',
  'IDENTITY_RELEASE_APPROVAL',
]) {
  if (template[key] !== 'false') throw new Error(`Template kill switch ${key} must remain false`)
}
if (template.IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK
  !== '${CLOUDFLARE_VERSION_SECRET:IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK}'
  || template.IDENTITY_RESULT_KEY_SET_DOCUMENT
  !== '${IDENTITY_PROTECTED_RESULT_KEY_SET_DOCUMENT}') {
  throw new Error('Production runtime template must contain protected placeholders only')
}

const result = spawnSync(process.execPath, [
  './node_modules/vitest/vitest.mjs',
  'run',
  '--project',
  'unit',
  'tests/unit/identity-production-runtime.test.ts',
  'tests/unit/identity-production-runtime-routes.test.ts',
], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('Academy Identity production disabled/enabled smoke: PASS')
