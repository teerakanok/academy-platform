import { createIdentityClientAssertionProvider } from '../src/lib/identity/client-assertion-provider'
import { createIdentityClientAssertionWebCryptoSigner } from '../src/lib/identity/client-assertion-webcrypto-signer'

const CLIENT_ID = 'academy-web'
const KEY_ID = 'academy-prod-2026-08'
const ENDPOINT = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const REDIRECT_URI = 'https://academy.cyberskills.co.th/auth/callback'
const CANONICAL_ORIGIN = 'https://academy.cyberskills.co.th'
const DIAGNOSTIC_PATH = '/.well-known/academy-ops/identity-client-assertion-custody-v1'
const DIAGNOSTIC_REQUEST_MARKER = 'academy-custody-recovery-20260903-v1'
const DIAGNOSTIC_JTI = 'academy-custody-recovery-20260903-admission-v1'
const EXPECTED_PUBLIC_JWK_SHA256 = '8b7a176b27ac5ffc7eb65fbe9d1b0724b1e1b24e91d8cbb93abbb3ae30f6f5c4'
const MAX_PRIVATE_JWK_BYTES = 4_096
const MAX_RESPONSE_BYTES = 512
const ACCESS_ASSERTION_MAX_CHARACTERS = 8_192
const MAX_EMPTY_BODY_READS = 4
const READINESS_HEADER = 'x-academy-identity-diagnostic-ready'
const READINESS_VALUE = 'v1'
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/
const ACCESS_ASSERTION = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const PRIVATE_JWK_KEYS = ['kty', 'crv', 'x', 'y', 'd'] as const

export const IDENTITY_SECRET_DIAGNOSTIC = Object.freeze({
  path: DIAGNOSTIC_PATH,
  requestMarker: DIAGNOSTIC_REQUEST_MARKER,
  expectedPublicJwkSha256: EXPECTED_PUBLIC_JWK_SHA256,
})

export type IdentitySecretDiagnosticMarker =
  | 'PASS_CODE_NOT_FOUND'
  | 'FAIL_BINDING'
  | 'FAIL_IMPORT'
  | 'FAIL_FINGERPRINT'
  | 'FAIL_SIGN_VERIFY'
  | 'FAIL_ASSERTION'
  | 'FAIL_ADMISSION'

type DiagnosticEnvironment = {
  IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK?: string
  ACADEMY_IDENTITY_DIAGNOSTIC_NONCE?: string
  CF_VERSION_METADATA?: {
    id?: string
  }
}

type DiagnosticDependencies = {
  fetchPort?: typeof globalThis.fetch
  now?: () => Date
  randomOpaque?: () => string
  expectedPublicJwkSha256?: string
}

type DiagnosticWorker = {
  fetch(request: Request, environment: DiagnosticEnvironment, context: unknown): Promise<Response>
}

type DiagnosticPrivateJwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  d: string
}

export async function runIdentityClientAssertionSecretDiagnostic(
  privateJwkText: unknown,
  dependencies: DiagnosticDependencies = {},
): Promise<IdentitySecretDiagnosticMarker> {
  if (typeof privateJwkText !== 'string' || privateJwkText.length === 0) return 'FAIL_BINDING'

  let privateJwk: DiagnosticPrivateJwk
  let signer: Awaited<ReturnType<typeof createIdentityClientAssertionWebCryptoSigner>>
  try {
    privateJwk = parseCanonicalPrivateJwk(privateJwkText)
    signer = await createIdentityClientAssertionWebCryptoSigner({
      clientId: CLIENT_ID,
      purpose: 'code_exchange',
      keyId: KEY_ID,
      privateJwk: privateJwkText,
    })
  } catch {
    return 'FAIL_IMPORT'
  }

  const publicJwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: privateJwk.x,
    y: privateJwk.y,
    use: 'sig',
    key_ops: ['verify'],
  }
  try {
    const fingerprint = await sha256Hex(JSON.stringify({
      crv: 'P-256',
      key_ops: ['verify'],
      kty: 'EC',
      use: 'sig',
      x: privateJwk.x,
      y: privateJwk.y,
    }))
    const expected = dependencies.expectedPublicJwkSha256 ?? EXPECTED_PUBLIC_JWK_SHA256
    if (!constantTimeHexEqual(fingerprint, expected)) return 'FAIL_FINGERPRINT'
  } catch {
    return 'FAIL_FINGERPRINT'
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const signingInput = new TextEncoder().encode('academy-identity-custody-diagnostic-v1')
    const signature = await signer.sign({
      algorithm: 'ES256',
      clientId: CLIENT_ID,
      purpose: 'code_exchange',
      keyId: KEY_ID,
      signingInput,
    })
    const signatureBytes = new Uint8Array(signature.byteLength)
    signatureBytes.set(signature)
    if (!await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBytes,
      signingInput,
    )) return 'FAIL_SIGN_VERIFY'
  } catch {
    return 'FAIL_SIGN_VERIFY'
  }

  let assertion: string
  let code: string
  let codeVerifier: string
  try {
    const randomOpaque = dependencies.randomOpaque ?? createRandomOpaque
    code = randomOpaque()
    codeVerifier = randomOpaque()
    if (!BASE64URL_32.test(code) || !BASE64URL_32.test(codeVerifier) || code === codeVerifier) {
      return 'FAIL_ASSERTION'
    }
    const provider = createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: 'code_exchange',
      audience: ENDPOINT,
      keyId: KEY_ID,
      lifetimeSeconds: 120,
      clock: { now: dependencies.now ?? (() => new Date()) },
      jtiSource: { next: () => DIAGNOSTIC_JTI },
      signer,
    })
    assertion = await provider.createClientAssertion({ audience: ENDPOINT })
  } catch {
    return 'FAIL_ASSERTION'
  }

  try {
    const response = await (dependencies.fetchPort ?? globalThis.fetch)(ENDPOINT, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientAssertion: assertion,
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
      return 'FAIL_ADMISSION'
    }
    const body = await readBoundedJson(response)
    return response.status === 404 && isExactError(body, 'code_not_found')
      ? 'PASS_CODE_NOT_FOUND'
      : 'FAIL_ADMISSION'
  } catch {
    return 'FAIL_ADMISSION'
  }
}

export function createIdentityClientAssertionSecretDiagnosticWorker(
  runDiagnostic: typeof runIdentityClientAssertionSecretDiagnostic = runIdentityClientAssertionSecretDiagnostic,
): DiagnosticWorker {
  return {
    async fetch(request, environment) {
      const admitted = await requestAdmission(request, environment)
      if (!admitted) return fixedResponse('DENIED', 404)
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 204,
          headers: {
            'cache-control': 'no-store',
            [READINESS_HEADER]: READINESS_VALUE,
          },
        })
      }
      const marker = await runDiagnostic(environment.IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK)
      return fixedResponse(marker, marker === 'PASS_CODE_NOT_FOUND' ? 200 : 503)
    },
  }
}

async function requestAdmission(request: Request, environment: DiagnosticEnvironment): Promise<boolean> {
  try {
    const url = new URL(request.url)
    const versionId = environment.CF_VERSION_METADATA?.id
    const accessAssertion = request.headers.get('cf-access-jwt-assertion')
    const metadataAdmitted = (request.method === 'POST' || request.method === 'HEAD')
      && url.origin === CANONICAL_ORIGIN
      && url.pathname === DIAGNOSTIC_PATH
      && url.search === ''
      && typeof versionId === 'string'
      && VERSION_ID.test(versionId)
      && request.headers.get('x-academy-diagnostic-version') === versionId
      && request.headers.get('x-academy-diagnostic-operation') === DIAGNOSTIC_REQUEST_MARKER
      && constantTimeOpaqueEqual(
        request.headers.get('x-academy-diagnostic-nonce'),
        environment.ACADEMY_IDENTITY_DIAGNOSTIC_NONCE,
      )
      && request.headers.get('origin') === CANONICAL_ORIGIN
      && request.headers.get('sec-fetch-site') === 'same-origin'
      && typeof accessAssertion === 'string'
      && accessAssertion.length <= ACCESS_ASSERTION_MAX_CHARACTERS
      && ACCESS_ASSERTION.test(accessAssertion)
    if (!metadataAdmitted) return false
    if (request.method === 'HEAD') return request.body === null
    return request.body === null || await consumeExactlyEmptyBody(request.body)
  } catch {
    return false
  }
}

async function consumeExactlyEmptyBody(body: ReadableStream<Uint8Array>): Promise<boolean> {
  const reader = body.getReader()
  let completed = false
  try {
    for (let read = 0; read < MAX_EMPTY_BODY_READS; read += 1) {
      const result = await reader.read()
      if (result.done) {
        completed = true
        return true
      }
      if (!(result.value instanceof Uint8Array) || result.value.byteLength !== 0) return false
    }
    return false
  } catch {
    return false
  } finally {
    if (!completed) {
      try {
        await reader.cancel()
      } catch {
        // Cancellation uncertainty remains a denied request.
      }
    }
    reader.releaseLock()
  }
}

function constantTimeOpaqueEqual(left: string | null, right: string | undefined): boolean {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !BASE64URL_32.test(left) || !BASE64URL_32.test(right)) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function parseCanonicalPrivateJwk(text: string): DiagnosticPrivateJwk {
  if (new TextEncoder().encode(text).byteLength > MAX_PRIVATE_JWK_BYTES) throw new Error('invalid')
  const value = JSON.parse(text) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(PRIVATE_JWK_KEYS)) throw new Error('invalid')
  const jwk = value as Record<(typeof PRIVATE_JWK_KEYS)[number], unknown>
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256'
    || !isCanonicalCoordinate(jwk.x) || !isCanonicalCoordinate(jwk.y)
    || !isCanonicalCoordinate(jwk.d)) throw new Error('invalid')
  const canonical: DiagnosticPrivateJwk = {
    kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d,
  }
  if (text !== JSON.stringify(canonical) && text !== `${JSON.stringify(canonical)}\n`) throw new Error('invalid')
  return canonical
}

function isCanonicalCoordinate(value: unknown): value is string {
  if (typeof value !== 'string' || !BASE64URL_32.test(value)) return false
  try {
    const decoded = Uint8Array.from(atob(`${value.replaceAll('-', '+').replaceAll('_', '/')}=`), (part) => part.charCodeAt(0))
    let binary = ''
    for (const byte of decoded) binary += String.fromCharCode(byte)
    return decoded.byteLength === 32
      && btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') === value
  } catch {
    return false
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function createRandomOpaque(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('invalid')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('invalid')
    }
    chunks.push(result.value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body))
}

function isExactError(value: unknown, error: string): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 1
    && (value as { error?: unknown }).error === error
}

function fixedResponse(marker: IdentitySecretDiagnosticMarker | 'DENIED', status: number): Response {
  return new Response(`ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=${marker}\n`, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

export default createIdentityClientAssertionSecretDiagnosticWorker()
