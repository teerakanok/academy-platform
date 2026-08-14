const DOCUMENT_KEYS = ['issuer', 'revision', 'keys', 'retiredKeyFingerprints', 'retiredKeyIds'] as const
const KEY_KEYS = ['keyId', 'algorithm', 'publicJwk', 'state'] as const
const JWK_KEYS = ['kty', 'crv', 'x', 'y'] as const
const KEY_ID = /^identity-result-[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/
const COORDINATE = /^[A-Za-z0-9_-]{43}$/
const FINGERPRINT = /^[a-f0-9]{64}$/
const MAXIMUM_KEYS = 3
const MAXIMUM_TOMBSTONES = 64
const MAXIMUM_DOCUMENT_BYTES = 64 * 1024
const FAILURE_MESSAGE = 'Identity result key set import failed'

const STATES = ['active', 'overlap', 'retired'] as const

export type IdentityResultKeyState = (typeof STATES)[number]

export type IdentityResultPublicJwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

export type IdentityResultKey = {
  keyId: string
  algorithm: 'ES256'
  publicJwk: IdentityResultPublicJwk
  state: IdentityResultKeyState
}

export type IdentityResultKeySet = {
  issuer: string
  revision: number
  keys: readonly IdentityResultKey[]
}

export type ImportedIdentityResultKeySet = {
  keySet: IdentityResultKeySet
  retiredKeyFingerprints: readonly string[]
  retiredKeyIds: readonly string[]
}

/**
 * Only results this module produced. Succession is decided from provenance, not
 * from shape: a hand-built object that merely looks like an import result has
 * not been through fingerprint recomputation or self-consistency checking, so
 * it must not be able to answer a rotation question.
 */
const imported = new WeakSet<object>()
const fingerprintsOf = new WeakMap<object, ReadonlyMap<string, string>>()

export class IdentityResultKeySetImportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityResultKeySetImportFailure',
      configurable: true,
    })
  }
}

/**
 * Import Identity's published result verification-key set from its raw text.
 *
 * The input is the document as it arrives on the wire, not an object graph.
 * That is deliberate: JavaScript has no browser-safe way to tell a Proxy from
 * the object it wraps, so an object-shaped input can lie about its own keys,
 * answer differently on a second read, or throw a value of the attacker's
 * choosing out of this boundary. Parsing the text here means everything below
 * works on plain data that nothing can trap.
 *
 * Fingerprints are RECOMPUTED rather than trusted from the document. The
 * tombstone lists are the producer's claim about which keys have retired; a
 * consumer that took them at face value could be handed a list that omits the
 * key it is about to accept. The normative definition is the SHA-256 of the
 * key's DER SPKI encoding, and it is byte-identical between the producer's Node
 * crypto and this WebCrypto path.
 *
 * This creates no route, no runtime wiring, and no enablement.
 */
export async function importIdentityResultKeySet(text: unknown): Promise<ImportedIdentityResultKeySet> {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAXIMUM_DOCUMENT_BYTES) fail()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail()
  }

  const document = exactRecord(parsed, DOCUMENT_KEYS)
  if (!isCanonicalHttpsUrl(document.issuer)) fail()
  if (!Number.isSafeInteger(document.revision) || (document.revision as number) < 1) fail()

  const entries = denseArray(document.keys, MAXIMUM_KEYS)
  if (entries.length < 1) fail()

  const keys: IdentityResultKey[] = []
  const fingerprintByKeyId = new Map<string, string>()
  const keyIdByFingerprint = new Map<string, string>()

  for (const entry of entries) {
    const key = exactRecord(entry, KEY_KEYS)
    const jwk = exactRecord(key.publicJwk, JWK_KEYS)
    if (typeof key.keyId !== 'string' || !KEY_ID.test(key.keyId)) fail()
    if (key.algorithm !== 'ES256') fail()
    if (typeof key.state !== 'string' || !STATES.includes(key.state as IdentityResultKeyState)) fail()
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') fail()
    if (typeof jwk.x !== 'string' || !COORDINATE.test(jwk.x)) fail()
    if (typeof jwk.y !== 'string' || !COORDINATE.test(jwk.y)) fail()

    const publicJwk: IdentityResultPublicJwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
    const fingerprint = await keyFingerprint(publicJwk)

    // One key ID means one key, and one key means one ID — in both directions.
    // Without the second direction the same material can appear twice under
    // different names, and a consumer caching by key ID would disagree with
    // itself about which key it holds.
    if (fingerprintByKeyId.has(key.keyId) || keyIdByFingerprint.has(fingerprint)) fail()
    fingerprintByKeyId.set(key.keyId, fingerprint)
    keyIdByFingerprint.set(fingerprint, key.keyId)

    keys.push(Object.freeze({
      keyId: key.keyId,
      algorithm: 'ES256' as const,
      publicJwk: Object.freeze(publicJwk),
      state: key.state as IdentityResultKeyState,
    }))
  }

  if (keys.filter((key) => key.state === 'active').length !== 1) fail()

  const retiredKeyFingerprints = sortedUnique(document.retiredKeyFingerprints, FINGERPRINT)
  const retiredKeyIds = sortedUnique(document.retiredKeyIds, KEY_ID)

  // The document must agree with itself in both dimensions. Either one alone can
  // be reused: material can return under a fresh ID, and an ID can return
  // carrying fresh material.
  const tombstonedMaterial = new Set(retiredKeyFingerprints)
  const tombstonedIds = new Set(retiredKeyIds)
  for (const key of keys) {
    const retired = key.state === 'retired'
    if (retired !== tombstonedMaterial.has(fingerprintByKeyId.get(key.keyId)!)) fail()
    if (retired !== tombstonedIds.has(key.keyId)) fail()
  }

  const result: ImportedIdentityResultKeySet = Object.freeze({
    keySet: Object.freeze({
      issuer: document.issuer,
      revision: document.revision as number,
      keys: Object.freeze(keys),
    }),
    retiredKeyFingerprints: Object.freeze(retiredKeyFingerprints),
    retiredKeyIds: Object.freeze(retiredKeyIds),
  })
  imported.add(result)
  fingerprintsOf.set(result, fingerprintByKeyId)
  return result
}

export function isImportedIdentityResultKeySet(value: unknown): value is ImportedIdentityResultKeySet {
  return value !== null && typeof value === 'object' && imported.has(value as object)
}

/**
 * Whether `next` may replace `previous`, decided from the two imported
 * documents alone.
 *
 * Rotation memory travels inside each document, so this consumer never needs a
 * history from anyone — and must not accept one, because a history supplied by
 * a caller can be truncated and a truncated history forgets retirements.
 */
export function identityResultKeySetSucceeds(previous: unknown, next: unknown): boolean {
  if (!isImportedIdentityResultKeySet(previous) || !isImportedIdentityResultKeySet(next)) return false
  if (previous.keySet.issuer !== next.keySet.issuer) return false
  if (next.keySet.revision <= previous.keySet.revision) return false

  const carriedMaterial = new Set(next.retiredKeyFingerprints)
  const carriedIds = new Set(next.retiredKeyIds)
  if (previous.retiredKeyFingerprints.some((entry) => !carriedMaterial.has(entry))) return false
  if (previous.retiredKeyIds.some((entry) => !carriedIds.has(entry))) return false

  // The bijection has to hold ACROSS the pair too, not only inside each
  // document: otherwise a key that is still verifying can quietly swap the
  // material behind its name between one revision and the next.
  const before = fingerprintsOf.get(previous)
  const after = fingerprintsOf.get(next)
  if (!before || !after) return false
  const materialById = new Map<string, string>()
  const idByMaterial = new Map<string, string>()
  for (const [keyId, fingerprint] of [...before, ...after]) {
    const boundMaterial = materialById.get(keyId)
    if (boundMaterial !== undefined && boundMaterial !== fingerprint) return false
    const boundId = idByMaterial.get(fingerprint)
    if (boundId !== undefined && boundId !== keyId) return false
    materialById.set(keyId, fingerprint)
    idByMaterial.set(fingerprint, keyId)
  }

  const successors = new Map(next.keySet.keys.map((key) => [key.keyId, key]))
  for (const key of previous.keySet.keys) {
    const successor = successors.get(key.keyId)
    if (!successor) {
      // Retired keys may be dropped; anything still verifying may not vanish.
      if (key.state !== 'retired') return false
      continue
    }
    if (!allowedTransition(key.state, successor.state)) return false
  }
  const previousIds = new Set(previous.keySet.keys.map((key) => key.keyId))
  return next.keySet.keys.every((key) => previousIds.has(key.keyId) || key.state === 'active')
}

function allowedTransition(from: IdentityResultKeyState, to: IdentityResultKeyState): boolean {
  if (from === 'active') return to === 'active' || to === 'overlap'
  if (from === 'overlap') return to === 'overlap' || to === 'retired'
  return to === 'retired'
}

/**
 * SHA-256 over the key's DER SPKI encoding. Importing the JWK first collapses
 * every spelling of the same key to one identity and doubles as proof that the
 * point is a usable P-256 key.
 */
async function keyFingerprint(jwk: IdentityResultPublicJwk): Promise<string> {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { ...jwk, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    )
    const spki = await crypto.subtle.exportKey('spki', key)
    const digest = await crypto.subtle.digest('SHA-256', spki)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return fail()
  }
}

function sortedUnique(value: unknown, pattern: RegExp): string[] {
  const entries = denseArray(value, MAXIMUM_TOMBSTONES)
  const values = entries.map((entry) => {
    if (typeof entry !== 'string' || !pattern.test(entry)) fail()
    return entry
  })
  const sorted = [...values].sort()
  if (new Set(values).size !== values.length) fail()
  if (values.some((entry, index) => entry !== sorted[index])) fail()
  return values
}

/**
 * `JSON.parse` output only: a plain object with a plain prototype, exactly the
 * expected own keys, and no accessors. Nothing here has to defend against a
 * Proxy, because a Proxy cannot come out of `JSON.parse`.
 */
function exactRecord<Key extends string>(value: unknown, keys: readonly Key[]): Record<Key, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail()
  }
  const actual = Object.keys(value as object)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key as Key))) fail()
  const record = {} as Record<Key, unknown>
  for (const key of keys) record[key] = (value as Record<string, unknown>)[key]
  return record
}

function denseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail()
  return [...value]
}

function isCanonicalHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const canonical = url.pathname === '/' ? url.origin : url.toString()
  return url.protocol === 'https:' && url.username === '' && url.password === ''
    && url.search === '' && url.hash === '' && canonical === value
}

function fail(): never {
  throw new IdentityResultKeySetImportFailure()
}
