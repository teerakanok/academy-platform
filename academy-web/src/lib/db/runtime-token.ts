import 'server-only'

export const ACADEMY_RUNTIME_ROLE = 'academy_runtime'
export const ACADEMY_RUNTIME_AUDIENCE = 'academy-data-api'
export const ACADEMY_RUNTIME_TOKEN_TTL_SECONDS = 60

const encoder = new TextEncoder()
const MINIMUM_SECRET_BYTES = 32

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * Creates a capability for the dedicated Academy data API. It is deliberately
 * not a Supabase JWT and cannot be accepted by Pool A's shared PostgREST.
 */
export async function issueAcademyRuntimeToken(secret: string, now = new Date()): Promise<string> {
  const secretBytes = encoder.encode(secret)
  if (secretBytes.byteLength < MINIMUM_SECRET_BYTES) {
    throw new Error(`ACADEMY_DATA_API_JWT_SECRET ต้องมีอย่างน้อย ${MINIMUM_SECRET_BYTES} bytes`)
  }

  const issuedAt = Math.floor(now.getTime() / 1000)
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        aud: ACADEMY_RUNTIME_AUDIENCE,
        exp: issuedAt + ACADEMY_RUNTIME_TOKEN_TTL_SECONDS,
        iat: issuedAt,
        role: ACADEMY_RUNTIME_ROLE,
      }),
    ),
  )
  const signed = `${header}.${payload}`
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signed))
  return `${signed}.${base64Url(new Uint8Array(signature))}`
}
