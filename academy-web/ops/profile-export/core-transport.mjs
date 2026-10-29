import { createHash, randomUUID, sign } from 'node:crypto'

export const CORE_INGEST_PATH = '/v1/events/ingest'
const OPERATIONS = new Map([
  [CORE_INGEST_PATH, 'events.ingest'],
  ['/v1/self/profile', 'self.profile.read'],
  ['/v1/self/goal', 'self.goal.write'],
  ['/v1/self/shares', 'self.share.create'],
  ['/v1/self/shares/revoke', 'self.share.revoke'],
  ['/v1/public/shares/read', 'public.share.read'],
])

/** Implements Core's existing service-request v1 wire contract (EdDSA, body and nonce bound).
 * @param {{enabled?: boolean, origin: string, clientId: string, keyId: string,
 * privateKey: import('node:crypto').KeyObject, environment: string, fetchImpl?: typeof fetch}} config
 * @returns {null | ((path: string, operation: string, body: string) => Promise<Response>)}
 */
export function createCoreSignedRequest({ enabled = false, origin, clientId, keyId, privateKey, environment, fetchImpl = fetch }) {
  if (!enabled) return null
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^[a-z][a-z0-9.-]{2,63}$/.test(clientId ?? '')
    || typeof keyId !== 'string' || keyId.length < 1 || keyId.length > 128
    || typeof environment !== 'string' || environment.length < 1 || environment.length > 128
    || privateKey?.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') throw new Error('invalid Core transport configuration')
  return async (path, operation, body) => {
    if (!OPERATIONS.has(path) || OPERATIONS.get(path) !== operation) throw new Error('invalid Core operation')
    const issued = Math.floor(Date.now() / 1000)
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const header = encode({ alg: 'EdDSA', typ: 'crux-service-request+jwt', kid: keyId })
    const payload = encode({ iss: clientId, aud: 'cyberskills-core', iat: issued, exp: issued + 30, jti: randomUUID(),
      env: environment, ver: '1', dir: `${clientId}->cyberskills-core`, op: operation, htm: 'POST', htu: path,
      body_sha256: createHash('sha256').update(body).digest('base64url') })
    const input = `${header}.${payload}`
    const token = `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`
    return fetchImpl(new URL(path, url), { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body,
      signal: AbortSignal.timeout(15_000) })
  }
}

/** @param {Parameters<typeof createCoreSignedRequest>[0]} config */
export function createCoreTransport(config) {
  const request = createCoreSignedRequest(config)
  if (!request) return { enabled: false }
  return { enabled: true, async ingest(events) {
    if (events.length < 1 || events.length > 200) throw new Error('invalid Core batch size')
    const body = JSON.stringify({ schemaVersion: '1', product: 'academy', events, completeScopes: [] })
    const response = await request(CORE_INGEST_PATH, 'events.ingest', body)
    if (response.status !== 200) throw new Error(`Core ingest rejected (${response.status})`)
    const result = await response.json()
    if (!Number.isSafeInteger(result?.inserted) || result.inserted < 0
      || !Number.isSafeInteger(result?.replayed) || result.replayed < 0
      || result.inserted + result.replayed !== events.length || result.withdrawn !== 0) {
      throw new Error('Core ingest acknowledgement invalid')
    }
  } }
}
