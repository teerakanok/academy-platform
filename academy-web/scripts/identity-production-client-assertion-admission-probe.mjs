import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify,
  webcrypto,
} from 'node:crypto'
import { readSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const EXPECTED_PUBLIC_JWK_SHA256 = '8b7a176b27ac5ffc7eb65fbe9d1b0724b1e1b24e91d8cbb93abbb3ae30f6f5c4'
const ENDPOINT = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const CLIENT_ID = 'academy-web'
const KEY_ID = 'academy-prod-2026-08'
const REDIRECT_URI = 'https://academy.cyberskills.co.th/auth/callback'
const PRIVATE_JWK_KEYS = ['kty', 'crv', 'x', 'y', 'd']
const MAX_PRIVATE_JWK_BYTES = 4_096
const MAX_RESPONSE_BYTES = 512

export class AcademyIdentityAdmissionProbeError extends Error {
  constructor(code) {
    super('Academy Identity client assertion admission probe failed')
    this.name = 'AcademyIdentityAdmissionProbeError'
    this.code = code
  }
}

export async function provePrivateJwk(privateJwkText, expectedPublicJwkSha256) {
  try {
    if (typeof expectedPublicJwkSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(expectedPublicJwkSha256)) {
      throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
    }
    const privateJwk = parseCanonicalPrivateJwk(privateJwkText)
    const expectedPublicJwk = canonicalPublicJwk(privateJwk)
    const publicJwkSha256 = sha256(JSON.stringify(sortObject(expectedPublicJwk)))
    if (publicJwkSha256 !== expectedPublicJwkSha256) {
      throw new AcademyIdentityAdmissionProbeError('PUBLIC_KEY_MISMATCH')
    }

    const nodePrivateKey = createPrivateKey({ key: privateJwk, format: 'jwk' })
    const derived = createPublicKey(nodePrivateKey).export({ format: 'jwk' })
    if (derived.kty !== 'EC'
      || derived.crv !== 'P-256'
      || derived.x !== privateJwk.x
      || derived.y !== privateJwk.y) {
      throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
    }

    const subtlePrivateKey = await webcrypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    const proof = new TextEncoder().encode('academy-identity-client-assertion-custody-proof/v1')
    const signature = new Uint8Array(await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      subtlePrivateKey,
      proof,
    ))
    if (signature.byteLength !== 64
      || !verify('sha256', Buffer.from(proof), {
        key: createPublicKey({ key: expectedPublicJwk, format: 'jwk' }),
        dsaEncoding: 'ieee-p1363',
      }, signature)) {
      throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
    }

    return Object.freeze({ privateJwk, publicJwkSha256 })
  } catch (error) {
    if (error instanceof AcademyIdentityAdmissionProbeError) throw error
    throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
  }
}

export async function runAdmissionProbe({
  privateJwkText,
  expectedPublicJwkSha256 = EXPECTED_PUBLIC_JWK_SHA256,
  fetchPort = globalThis.fetch,
  now = () => new Date(),
  randomId = () => randomUUID(),
  randomOpaque = () => randomBytes(32).toString('base64url'),
} = {}) {
  const keyProof = await provePrivateJwk(privateJwkText, expectedPublicJwkSha256)
  try {
    if (typeof fetchPort !== 'function') throw new Error('invalid fetch port')
    const issuedAt = Math.floor(now().getTime() / 1_000)
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new Error('invalid clock')
    const jti = randomId()
    const code = randomOpaque()
    const codeVerifier = randomOpaque()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jti)
      || !/^[A-Za-z0-9_-]{43}$/.test(code)
      || !/^[A-Za-z0-9_-]{43}$/.test(codeVerifier)) {
      throw new Error('invalid synthetic input')
    }

    const header = encodeJson({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
    const claims = encodeJson({
      aud: ENDPOINT,
      exp: issuedAt + 120,
      iat: issuedAt,
      iss: CLIENT_ID,
      jti,
      sub: CLIENT_ID,
    })
    const signingInput = `${header}.${claims}`
    const key = await webcrypto.subtle.importKey(
      'jwk',
      keyProof.privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    const signature = new Uint8Array(await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput),
    ))
    if (signature.byteLength !== 64) throw new Error('invalid signature')

    const response = await fetchPort(ENDPOINT, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientAssertion: `${signingInput}.${Buffer.from(signature).toString('base64url')}`,
        redirectUri: REDIRECT_URI,
        code,
        codeVerifier,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!(response instanceof Response)
      || response.url !== ENDPOINT
      || response.redirected
      || response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      throw new AcademyIdentityAdmissionProbeError('UNEXPECTED_RESPONSE')
    }
    const bodyText = await readBoundedBody(response)
    const body = JSON.parse(bodyText)
    if (!isExactErrorBody(body)) throw new AcademyIdentityAdmissionProbeError('UNEXPECTED_RESPONSE')
    if (response.status === 404 && body.error === 'code_not_found') {
      return Object.freeze({ publicJwkSha256: keyProof.publicJwkSha256, admission: 'accepted' })
    }
    if (response.status === 401 && body.error === 'client_authentication_failed') {
      throw new AcademyIdentityAdmissionProbeError('CLIENT_AUTHENTICATION_FAILED')
    }
    throw new AcademyIdentityAdmissionProbeError('UNEXPECTED_RESPONSE')
  } catch (error) {
    if (error instanceof AcademyIdentityAdmissionProbeError) throw error
    throw new AcademyIdentityAdmissionProbeError('TRANSPORT')
  }
}

async function main() {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--admission-probe') {
      throw new AcademyIdentityAdmissionProbeError('USAGE')
    }
    const privateJwkText = readBoundedStdin(MAX_PRIVATE_JWK_BYTES)
    const result = await runAdmissionProbe({ privateJwkText })
    process.stdout.write('ACADEMY_IDENTITY_CUSTODY_KEYPAIR=PASS\n')
    process.stdout.write(`ACADEMY_IDENTITY_CUSTODY_PUBLIC_JWK_SHA256=${result.publicJwkSha256}\n`)
    process.stdout.write('ACADEMY_IDENTITY_ASSERTION_ADMISSION=PASS_CODE_NOT_FOUND\n')
  } catch (error) {
    const code = error instanceof AcademyIdentityAdmissionProbeError ? error.code : 'UNEXPECTED'
    const admitted = new Set([
      'USAGE',
      'LOCAL_KEYPAIR',
      'PUBLIC_KEY_MISMATCH',
      'CLIENT_AUTHENTICATION_FAILED',
      'UNEXPECTED_RESPONSE',
      'TRANSPORT',
    ])
    process.stderr.write(`ACADEMY_IDENTITY_ASSERTION_PROBE=FAIL_${admitted.has(code) ? code : 'UNEXPECTED'}\n`)
    process.exitCode = 1
  }
}

function parseCanonicalPrivateJwk(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) < 1 || Buffer.byteLength(text) > MAX_PRIVATE_JWK_BYTES) {
    throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(PRIVATE_JWK_KEYS)
    || value.kty !== 'EC'
    || value.crv !== 'P-256'
    || !isCoordinate(value.x)
    || !isCoordinate(value.y)
    || !isCoordinate(value.d)
    || text !== JSON.stringify({ kty: 'EC', crv: 'P-256', x: value.x, y: value.y, d: value.d })) {
    throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
  }
  return value
}

function readBoundedStdin(maximumBytes) {
  const chunks = []
  let total = 0
  while (true) {
    const buffer = Buffer.allocUnsafe(Math.min(1_024, maximumBytes + 1 - total))
    const bytesRead = readSync(0, buffer, 0, buffer.byteLength, null)
    if (bytesRead === 0) break
    total += bytesRead
    if (total > maximumBytes) throw new AcademyIdentityAdmissionProbeError('LOCAL_KEYPAIR')
    chunks.push(buffer.subarray(0, bytesRead))
  }
  return Buffer.concat(chunks, total).toString('utf8')
}

function canonicalPublicJwk(privateJwk) {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: privateJwk.x,
    y: privateJwk.y,
    use: 'sig',
    key_ops: ['verify'],
  }
}

function isCoordinate(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false
  const decoded = Buffer.from(value, 'base64url')
  return decoded.byteLength === 32 && decoded.toString('base64url') === value
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  }
  return value
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function readBoundedBody(response) {
  const reader = response.body?.getReader()
  if (!reader) throw new AcademyIdentityAdmissionProbeError('UNEXPECTED_RESPONSE')
  const chunks = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new AcademyIdentityAdmissionProbeError('UNEXPECTED_RESPONSE')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString('utf8')
}

function isExactErrorBody(value) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 1
    && typeof value.error === 'string'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
