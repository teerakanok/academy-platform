import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createIdentityResultKeySetCache } from '@/lib/identity/result-key-set-cache'

const issuer = 'https://identity.example.test/v1/code/results'

type PublicJwk = { kty: 'EC', crv: 'P-256', x: string, y: string }

function publicJwk(): PublicJwk {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string, y: string }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
}

function fingerprint(jwk: PublicJwk): string {
  const der = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

const v4 = publicJwk()
const v3 = publicJwk()
const v2 = publicJwk()
const v5 = publicJwk()

const revision4 = {
  issuer,
  revision: 4,
  keys: [
    { keyId: 'identity-result-active-v4', algorithm: 'ES256', publicJwk: v4, state: 'active' },
    { keyId: 'identity-result-overlap-v3', algorithm: 'ES256', publicJwk: v3, state: 'overlap' },
    { keyId: 'identity-result-retired-v2', algorithm: 'ES256', publicJwk: v2, state: 'retired' },
  ],
  retiredKeyFingerprints: [fingerprint(v2)],
  retiredKeyIds: ['identity-result-retired-v2'],
}

const revision5 = {
  issuer,
  revision: 5,
  keys: [
    { keyId: 'identity-result-active-v5', algorithm: 'ES256', publicJwk: v5, state: 'active' },
    { keyId: 'identity-result-active-v4', algorithm: 'ES256', publicJwk: v4, state: 'overlap' },
    { keyId: 'identity-result-overlap-v3', algorithm: 'ES256', publicJwk: v3, state: 'retired' },
  ],
  retiredKeyFingerprints: [fingerprint(v2), fingerprint(v3)].sort(),
  retiredKeyIds: ['identity-result-overlap-v3', 'identity-result-retired-v2'].sort(),
}

function harness(documents: unknown[], options: { cooldownMs?: number, negativeCacheMs?: number } = {}) {
  let now = 1_000_000
  const loads: number[] = []
  let index = 0
  const cache = createIdentityResultKeySetCache({
    load: async () => {
      loads.push(now)
      const value = documents[Math.min(index, documents.length - 1)]
      index += 1
      // The importer takes the document as it arrives on the wire.
      if (typeof value === 'function') return (value as () => string)()
      return JSON.stringify(value)
    },
    clock: () => now,
    cooldownMs: options.cooldownMs ?? 60_000,
    negativeCacheMs: options.negativeCacheMs ?? 300_000,
  })
  return {
    cache,
    loads,
    advance: (ms: number) => { now += ms },
  }
}

describe('identity result key set cache', () => {
  it('resolves active and overlap keys and never a retired or unknown one', async () => {
    const { cache, loads } = harness([revision4])

    await expect(cache.resolve(issuer, 'identity-result-active-v4')).resolves.toMatchObject({ state: 'active' })
    await expect(cache.resolve(issuer, 'identity-result-overlap-v3')).resolves.toMatchObject({ state: 'overlap' })
    // Retired and unknown are indistinguishable on purpose: both must fail
    // verification, and rotation state is not a consumer's business.
    await expect(cache.resolve(issuer, 'identity-result-retired-v2')).resolves.toBeNull()
    await expect(cache.resolve('https://other.example.test/v1', 'identity-result-active-v4')).resolves.toBeNull()
    expect(loads.length).toBeGreaterThanOrEqual(1)
  })

  it('refreshes once for an unseen key and then serves it', async () => {
    const { cache, loads } = harness([revision4, revision5])

    await expect(cache.resolve(issuer, 'identity-result-active-v4')).resolves.toMatchObject({ state: 'active' })
    const first = loads.length

    // A key the current revision has never seen is the one case worth a refresh.
    await expect(cache.resolve(issuer, 'identity-result-active-v5')).resolves.toMatchObject({ state: 'active' })
    expect(loads.length).toBe(first + 1)
    expect(cache.current()?.keySet.revision).toBe(5)
  })

  it('collapses concurrent misses for the same key into one refresh', async () => {
    const { cache, loads } = harness([revision4, revision5])
    await cache.resolve(issuer, 'identity-result-active-v4')
    const before = loads.length

    const results = await Promise.all([
      cache.resolve(issuer, 'identity-result-active-v5'),
      cache.resolve(issuer, 'identity-result-active-v5'),
      cache.resolve(issuer, 'identity-result-active-v5'),
    ])
    expect(results.every((key) => key?.keyId === 'identity-result-active-v5')).toBe(true)
    // A replayed envelope must not turn into one network call per replay.
    expect(loads.length).toBe(before + 1)
  })

  it('negative-caches a miss so a replay cannot amplify into refreshes', async () => {
    const { cache, loads, advance } = harness([revision4], { negativeCacheMs: 300_000, cooldownMs: 1_000 })
    await cache.resolve(issuer, 'identity-result-active-v4')
    const before = loads.length

    await expect(cache.resolve(issuer, 'identity-result-absent-v9')).resolves.toBeNull()
    const afterFirstMiss = loads.length
    expect(afterFirstMiss).toBe(before + 1)

    advance(1_000)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(cache.resolve(issuer, 'identity-result-absent-v9')).resolves.toBeNull()
    }
    expect(loads.length).toBe(afterFirstMiss)

    // Once the negative entry ages out, one more attempt is allowed.
    advance(300_001)
    await expect(cache.resolve(issuer, 'identity-result-absent-v9')).resolves.toBeNull()
    expect(loads.length).toBe(afterFirstMiss + 1)
  })

  it('holds a cooldown between refreshes even for different unseen keys', async () => {
    const { cache, loads, advance } = harness([revision4], { cooldownMs: 60_000, negativeCacheMs: 1 })
    await cache.resolve(issuer, 'identity-result-active-v4')
    const before = loads.length

    await cache.resolve(issuer, 'identity-result-absent-a1')
    expect(loads.length).toBe(before + 1)

    advance(2)
    await cache.resolve(issuer, 'identity-result-absent-b2')
    expect(loads.length, 'a second refresh inside the cooldown must not happen').toBe(before + 1)

    advance(60_000)
    await cache.resolve(issuer, 'identity-result-absent-c3')
    expect(loads.length).toBe(before + 2)
  })

  it('keeps the current revision when a refresh would go backwards', async () => {
    const stale = { ...revision4, revision: 3, retiredKeyFingerprints: [], retiredKeyIds: [], keys: [revision4.keys[0]] }
    const { cache } = harness([revision5, stale])

    await cache.resolve(issuer, 'identity-result-active-v5')
    expect(cache.current()?.keySet.revision).toBe(5)

    // A refresh that does not legitimately succeed the current document is
    // discarded; going backwards is how a retired key would come back.
    await expect(cache.resolve(issuer, 'identity-result-unseen-v9')).resolves.toBeNull()
    expect(cache.current()?.keySet.revision).toBe(5)
    await expect(cache.resolve(issuer, 'identity-result-active-v5')).resolves.toMatchObject({ state: 'active' })
  })

  it('does not remember a failed refresh as proof that a key is absent', async () => {
    // A transient network or parse failure says nothing about which keys exist.
    // Caching it as a miss would lock a legitimate new key out for the whole
    // negative-cache window — a real user-facing failure from a blip.
    let attempt = 0
    const loads: number[] = []
    let now = 1_000_000
    const cache = createIdentityResultKeySetCache({
      load: async () => {
        loads.push(attempt)
        attempt += 1
        if (attempt === 1) return JSON.stringify(revision4)
        if (attempt === 2) throw new Error('transient')
        return JSON.stringify(revision5)
      },
      clock: () => now,
      cooldownMs: 1_000,
      negativeCacheMs: 300_000,
    })

    await expect(cache.resolve(issuer, 'identity-result-active-v4')).resolves.toMatchObject({ state: 'active' })
    await expect(cache.resolve(issuer, 'identity-result-active-v5')).resolves.toBeNull()
    expect(loads.length).toBe(2)

    now += 1_001
    await expect(cache.resolve(issuer, 'identity-result-active-v5')).resolves.toMatchObject({ state: 'active' })
    expect(loads.length).toBe(3)
  })

  it('survives a load that fails or returns a malformed document', async () => {
    const failing = createIdentityResultKeySetCache({
      load: async () => { throw new Error('network') },
      clock: () => 1_000_000,
      cooldownMs: 1_000,
      negativeCacheMs: 1_000,
    })
    await expect(failing.resolve(issuer, 'identity-result-active-v4')).resolves.toBeNull()
    expect(failing.current()).toBeNull()

    const malformed = createIdentityResultKeySetCache({
      load: async () => JSON.stringify({ issuer, revision: 1 }),
      clock: () => 1_000_000,
      cooldownMs: 1_000,
      negativeCacheMs: 1_000,
    })
    await expect(malformed.resolve(issuer, 'identity-result-active-v4')).resolves.toBeNull()
    expect(malformed.current()).toBeNull()
  })
})
