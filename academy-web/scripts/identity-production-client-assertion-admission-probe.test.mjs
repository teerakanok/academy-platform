import assert from 'node:assert/strict'
import { generateKeyPairSync, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'

import {
  AcademyIdentityAdmissionProbeError,
  EXPECTED_PUBLIC_JWK_SHA256,
  provePrivateJwk,
  runAdmissionProbe,
} from './identity-production-client-assertion-admission-probe.mjs'

const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const privateJwk = pair.privateKey.export({ format: 'jwk' })
const privateJwkText = JSON.stringify({
  kty: privateJwk.kty,
  crv: privateJwk.crv,
  x: privateJwk.x,
  y: privateJwk.y,
  d: privateJwk.d,
})
const publicJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: privateJwk.x,
  y: privateJwk.y,
  use: 'sig',
  key_ops: ['verify'],
}
const expectedDigest = await webcrypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(JSON.stringify(sortObject(publicJwk))),
)
const publicJwkSha256 = Buffer.from(expectedDigest).toString('hex')

describe('Identity production client-assertion admission probe', () => {
  it('pins the accepted Identity registry public fingerprint from the release freeze', () => {
    const freeze = JSON.parse(readFileSync(new URL(
      '../../reports/reviews/academy-production-release-freeze-20260828.json',
      import.meta.url,
    ), 'utf8'))
    assert.equal(EXPECTED_PUBLIC_JWK_SHA256, freeze.assertionKey.publicJwkSha256)
    assert.equal(freeze.assertionKey.clientId, 'academy-web')
    assert.equal(freeze.assertionKey.keyId, 'academy-prod-2026-08')
    assert.equal(
      freeze.assertionKey.publicKeyReference,
      'config://client-keys/academy-web/academy-prod-2026-08',
    )
  })

  it('proves a canonical private key, derived public fingerprint, and native sign/verify', async () => {
    const result = await provePrivateJwk(privateJwkText, publicJwkSha256)
    assert.equal(result.publicJwkSha256, publicJwkSha256)
  })

  it('rejects noncanonical, mismatched, and malformed custody input without reflecting it', async () => {
    const cases = [
      `${privateJwkText}\n`,
      JSON.stringify({ crv: privateJwk.crv, kty: privateJwk.kty, x: privateJwk.x, y: privateJwk.y, d: privateJwk.d }),
      JSON.stringify({ ...JSON.parse(privateJwkText), d: 'A'.repeat(43) }),
      '{',
    ]
    for (const value of cases) {
      await assert.rejects(
        provePrivateJwk(value, publicJwkSha256),
        (error) => error instanceof AcademyIdentityAdmissionProbeError
          && !error.message.includes(value)
          && !String(error.stack).includes(value),
      )
    }
    await assert.rejects(
      provePrivateJwk(privateJwkText, '0'.repeat(64)),
      (error) => error instanceof AcademyIdentityAdmissionProbeError
        && error.code === 'PUBLIC_KEY_MISMATCH',
    )
  })

  it('admits only exact code_not_found after one signed synthetic request', async () => {
    let calls = 0
    const result = await runAdmissionProbe({
      privateJwkText,
      expectedPublicJwkSha256: publicJwkSha256,
      now: () => new Date('2026-09-03T00:00:00.000Z'),
      randomId: () => '11111111-1111-4111-8111-111111111111',
      randomOpaque: sequence('A'.repeat(43), 'B'.repeat(43)),
      fetchPort: async (url, init) => {
        calls += 1
        assert.equal(url, 'https://accounts.cyberskills.co.th/v1/code/exchange')
        assert.equal(init.method, 'POST')
        assert.equal(init.redirect, 'manual')
        const body = JSON.parse(init.body)
        assert.deepEqual(Object.keys(body).sort(), [
          'clientAssertion', 'clientId', 'code', 'codeVerifier', 'redirectUri',
        ])
        assert.equal(body.clientId, 'academy-web')
        assert.equal(body.redirectUri, 'https://academy.cyberskills.co.th/auth/callback')
        assert.equal(body.code, 'A'.repeat(43))
        assert.equal(body.codeVerifier, 'B'.repeat(43))
        const [header, claims, signature] = body.clientAssertion.split('.')
        assert.deepEqual(decodeJson(header), { alg: 'ES256', kid: 'academy-prod-2026-08', typ: 'JWT' })
        assert.deepEqual(decodeJson(claims), {
          aud: 'https://accounts.cyberskills.co.th/v1/code/exchange',
          exp: 1_788_393_720,
          iat: 1_788_393_600,
          iss: 'academy-web',
          jti: '11111111-1111-4111-8111-111111111111',
          sub: 'academy-web',
        })
        assert.equal(Buffer.from(signature, 'base64url').byteLength, 64)
        return jsonResponse(404, { error: 'code_not_found' })
      },
    })
    assert.equal(calls, 1)
    assert.equal(result.admission, 'accepted')
  })

  it('classifies authentication rejection and never sends a second request', async () => {
    let calls = 0
    await assert.rejects(runAdmissionProbe({
      privateJwkText,
      expectedPublicJwkSha256: publicJwkSha256,
      randomId: () => '22222222-2222-4222-8222-222222222222',
      randomOpaque: sequence('C'.repeat(43), 'D'.repeat(43)),
      fetchPort: async () => {
        calls += 1
        return jsonResponse(401, { error: 'client_authentication_failed' })
      },
    }), (error) => error instanceof AcademyIdentityAdmissionProbeError
      && error.code === 'CLIENT_AUTHENTICATION_FAILED')
    assert.equal(calls, 1)
  })

  it('fails closed on redirects, unexpected status/body, oversized body, and transport loss', async () => {
    const cases = [
      async () => new Response('', { status: 303, headers: { location: 'https://example.invalid' } }),
      async () => jsonResponse(500, { error: 'internal_error' }),
      async () => jsonResponse(404, { error: 'code_not_found', requestId: 'forbidden' }),
      async () => new Response('x'.repeat(513), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
      async () => { throw new Error('contains-sensitive-upstream-text') },
    ]
    for (const fetchPort of cases) {
      await assert.rejects(runAdmissionProbe({
        privateJwkText,
        expectedPublicJwkSha256: publicJwkSha256,
        randomId: () => '33333333-3333-4333-8333-333333333333',
        randomOpaque: sequence('E'.repeat(43), 'F'.repeat(43)),
        fetchPort,
      }), (error) => error instanceof AcademyIdentityAdmissionProbeError
        && !error.message.includes('contains-sensitive-upstream-text')
        && !String(error.stack).includes('contains-sensitive-upstream-text'))
    }
  })

  it('keeps the owner prompt TTY-only, hidden, single-use, and fileless', () => {
    const wrapper = readFileSync(new URL(
      './run-identity-production-client-assertion-admission-probe.sh',
      import.meta.url,
    ), 'utf8')
    assert.match(wrapper, /\[\[ \$# -eq 0 && -t 0 && -t 2 && -f "\$PROBE" \]\]/)
    assert.match(wrapper, /IFS= read -r -s private_jwk/)
    assert.match(wrapper, /printf '%s' "\$private_jwk" \| node "\$PROBE" --admission-probe/)
    assert.doesNotMatch(wrapper, />\s*[^&\n]|tee|mktemp|history|echo .*private_jwk/)
    assert.equal((wrapper.match(/read -r -s private_jwk/g) ?? []).length, 1)
  })

  it('emits only a fixed failure marker for rejected stdin', () => {
    const rejected = 'this-is-not-a-private-jwk-secret-value'
    const result = spawnSync(process.execPath, [
      new URL('./identity-production-client-assertion-admission-probe.mjs', import.meta.url).pathname,
      '--admission-probe',
    ], {
      encoding: 'utf8',
      input: rejected,
      env: {},
    })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, 'ACADEMY_IDENTITY_ASSERTION_PROBE=FAIL_LOCAL_KEYPAIR\n')
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(rejected))
  })
})

function jsonResponse(status, value) {
  const response = new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  Object.defineProperty(response, 'url', {
    value: 'https://accounts.cyberskills.co.th/v1/code/exchange',
  })
  return response
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function sequence(...values) {
  return () => {
    const value = values.shift()
    if (!value) throw new Error('test sequence exhausted')
    return value
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  }
  return value
}
