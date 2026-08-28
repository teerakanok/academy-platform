#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EXPECTED_TEMPLATE = Object.freeze({
  IDENTITY_ADAPTER: 'identity-control',
  IDENTITY_RUNTIME_ENABLED: 'false',
  IDENTITY_RUNTIME_WIRED: 'false',
  IDENTITY_RELEASE_APPROVAL: 'false',
  IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '1000',
  IDENTITY_CLIENT_ASSERTION_KEY_ID: 'academy-prod-2026-08',
  IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: '${CLOUDFLARE_VERSION_SECRET:IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK}',
  IDENTITY_RESULT_KEY_SET_DOCUMENT: '${IDENTITY_PROTECTED_RESULT_KEY_SET_DOCUMENT}',
})

export function validateProductionRuntimeTemplate(template) {
  try {
    if (!template || typeof template !== 'object' || Array.isArray(template)
      || Object.getPrototypeOf(template) !== Object.prototype) throw new Error()
    const actualKeys = Reflect.ownKeys(template)
    const expectedKeys = Object.keys(EXPECTED_TEMPLATE)
    if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) throw new Error()
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(template, key)
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
        || descriptor.value !== EXPECTED_TEMPLATE[key]) throw new Error()
    }
    return true
  } catch {
    throw new Error('Academy Identity production runtime template rejected')
  }
}

export function main() {
  const template = JSON.parse(readFileSync(
    new URL('../ops/identity/production-runtime-config.template.json', import.meta.url),
    'utf8',
  ))
  validateProductionRuntimeTemplate(template)

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
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) main()
