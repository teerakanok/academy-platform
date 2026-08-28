import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validateProductionRuntimeTemplate } from './identity-production-runtime-smoke.mjs'

function validTemplate() {
  return {
    IDENTITY_ADAPTER: 'identity-control',
    IDENTITY_RUNTIME_ENABLED: 'false',
    IDENTITY_RUNTIME_WIRED: 'false',
    IDENTITY_RELEASE_APPROVAL: 'false',
    IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '1000',
    IDENTITY_CLIENT_ASSERTION_KEY_ID: 'academy-prod-2026-08',
    IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: '${CLOUDFLARE_VERSION_SECRET:IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK}',
    IDENTITY_RESULT_KEY_SET_DOCUMENT: '${IDENTITY_PROTECTED_RESULT_KEY_SET_DOCUMENT}',
  }
}

describe('Identity production runtime smoke template', () => {
  test('accepts only the exact disabled production mapping', () => {
    assert.equal(validateProductionRuntimeTemplate(validTemplate()), true)
  })

  test('rejects drift in every fixed value without reflecting supplied material', () => {
    for (const key of Object.keys(validTemplate())) {
      const template = validTemplate()
      template[key] = 'SENSITIVE_MARKER'
      assert.throws(
        () => validateProductionRuntimeTemplate(template),
        (error) => error instanceof Error
          && error.message === 'Academy Identity production runtime template rejected'
          && !error.message.includes('SENSITIVE_MARKER'),
      )
    }
  })

  test('rejects missing, reordered, surplus, accessor, and non-plain mappings', () => {
    const missing = validTemplate()
    delete missing.IDENTITY_ADAPTER

    const reordered = { ...validTemplate() }
    const adapter = reordered.IDENTITY_ADAPTER
    delete reordered.IDENTITY_ADAPTER
    reordered.IDENTITY_ADAPTER = adapter

    const surplus = { ...validTemplate(), IDENTITY_UNREVIEWED: 'false' }
    const accessor = validTemplate()
    Object.defineProperty(accessor, 'IDENTITY_ADAPTER', { enumerable: true, get: () => 'identity-control' })
    const nonPlain = Object.assign(Object.create(null), validTemplate())

    for (const template of [missing, reordered, surplus, accessor, nonPlain]) {
      assert.throws(() => validateProductionRuntimeTemplate(template), /template rejected/)
    }
  })
})
