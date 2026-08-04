const encoder = new TextEncoder()

export interface MediaGrant {
  assetId: string
  courseSlug: string
  nodeId: string
  expiresAt: number
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const binary = atob(padded)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  if (encoder.encode(secret).byteLength < 32) throw new Error('MEDIA_SIGNING_SECRET must be at least 32 bytes')
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

function validGrant(value: unknown): value is MediaGrant {
  if (!value || typeof value !== 'object') return false
  const grant = value as Record<string, unknown>
  return (
    typeof grant.assetId === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,100}$/.test(grant.assetId) &&
    typeof grant.courseSlug === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,100}$/.test(grant.courseSlug) &&
    typeof grant.nodeId === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,100}$/.test(grant.nodeId) &&
    typeof grant.expiresAt === 'number' &&
    Number.isSafeInteger(grant.expiresAt)
  )
}

export async function issueMediaGrant(grant: MediaGrant, secret: string): Promise<string> {
  if (!validGrant(grant)) throw new Error('invalid media grant')
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(grant)))
  const signature = encodeBase64Url(await hmac(secret, payload))
  return `${payload}.${signature}`
}

export async function verifyMediaGrant(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<MediaGrant | null> {
  const value = await verifyMediaGrantSignature(token, secret)
  return value && value.expiresAt > nowSeconds ? value : null
}

export async function verifyMediaGrantSignature(token: string, secret: string): Promise<MediaGrant | null> {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const signatureBytes = decodeBase64Url(signature)
  const payloadBytes = decodeBase64Url(payload)
  if (!signatureBytes || !payloadBytes) return null

  const expected = await hmac(secret, payload)
  if (expected.byteLength !== signatureBytes.byteLength) return null
  let mismatch = 0
  for (let i = 0; i < expected.byteLength; i++) mismatch |= expected[i] ^ signatureBytes[i]
  if (mismatch !== 0) return null

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payloadBytes))
    if (!validGrant(value)) return null
    return value
  } catch {
    return null
  }
}
