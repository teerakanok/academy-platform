import { createHash, randomUUID, sign } from 'node:crypto'

export const CORE_INGEST_PATH = '/v1/events/ingest'

/** Implements Core's existing service-request v1 wire contract (EdDSA, body and nonce bound). */
export function createCoreTransport({ enabled = false, origin, clientId, keyId, privateKey, environment, fetchImpl = fetch }) {
  if (!enabled) return { enabled: false }
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^[a-z][a-z0-9.-]{2,63}$/.test(clientId ?? '')
    || typeof keyId !== 'string' || keyId.length < 1 || keyId.length > 128
    || typeof environment !== 'string' || environment.length < 1 || environment.length > 128
    || privateKey?.asymmetricKeyType !== 'ed25519') throw new Error('invalid Core transport configuration')
  return { enabled: true, async ingest(events) {
    if (events.length < 1 || events.length > 200) throw new Error('invalid Core batch size')
    const body = JSON.stringify({ schemaVersion: '1', product: 'academy', events, completeScopes: [] })
    const issued = Math.floor(Date.now() / 1000)
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const header = encode({ alg: 'EdDSA', typ: 'crux-service-request+jwt', kid: keyId })
    const payload = encode({ iss: clientId, aud: 'cyberskills-core', iat: issued, exp: issued + 30, jti: randomUUID(),
      env: environment, ver: '1', dir: `${clientId}->cyberskills-core`, op: 'events.ingest', htm: 'POST', htu: CORE_INGEST_PATH,
      body_sha256: createHash('sha256').update(body).digest('base64url') })
    const input = `${header}.${payload}`
    const token = `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`
    const response = await fetchImpl(new URL(CORE_INGEST_PATH, url), { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body,
      signal: AbortSignal.timeout(15_000) })
    if (response.status !== 200) throw new Error(`Core ingest rejected (${response.status})`)
    const result = await response.json()
    if (!Number.isSafeInteger(result?.inserted) || result.inserted < 0
      || !Number.isSafeInteger(result?.replayed) || result.replayed < 0
      || result.inserted + result.replayed !== events.length || result.withdrawn !== 0) {
      throw new Error('Core ingest acknowledgement invalid')
    }
  } }
}
