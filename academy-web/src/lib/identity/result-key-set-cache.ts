import {
  identityResultKeySetSucceeds,
  importIdentityResultKeySet,
  type IdentityResultKey,
  type ImportedIdentityResultKeySet,
} from './result-key-set-importer'

export type IdentityResultKeySetCacheOptions = {
  /** Fetches the published document. Injected so this module opens no socket. */
  load: () => Promise<unknown>
  /** Milliseconds since an arbitrary epoch. Injected so tests need no timers. */
  clock: () => number
  /** Minimum gap between refresh attempts, whatever triggered them. */
  cooldownMs: number
  /** How long a known-missing key is answered without another refresh. */
  negativeCacheMs: number
}

export type IdentityResultKeySetCache = {
  current(): ImportedIdentityResultKeySet | null
  resolve(issuer: string, keyId: string): Promise<IdentityResultKey | null>
}

/**
 * The consumer half of the rotation contract.
 *
 * A resolver miss is ambiguous by design: a retired key and an unknown key both
 * answer `null`, because both must fail verification and rotation state is not
 * a consumer's business. That ambiguity is exactly why a refresh policy is
 * needed. Refreshing on every miss turns a replayed retired envelope into one
 * fetch per replay; never refreshing leaves a genuinely new active key
 * unrecognised until something else happens to reload.
 *
 * So: at most one refresh per unseen key, concurrent misses share it, a
 * cooldown bounds the rate whatever triggered it, a negative entry answers
 * repeat misses without another fetch, and a document that does not legitimately
 * succeed the current one is discarded rather than adopted — going backwards is
 * how a retired key would return.
 *
 * Nothing here enables a route or a runtime. It resolves keys and nothing else.
 */
export function createIdentityResultKeySetCache(
  options: IdentityResultKeySetCacheOptions,
): IdentityResultKeySetCache {
  const { load, clock, cooldownMs, negativeCacheMs } = options
  let current: ImportedIdentityResultKeySet | null = null
  let lastAttemptAt = Number.NEGATIVE_INFINITY
  let inFlight: Promise<'advanced' | 'unchanged' | 'failed'> | null = null
  const missedUntil = new Map<string, number>()

  // One function so the key written and the key read can never drift apart.
  // NUL separates because no issuer or key ID may contain it.
  const missKeyFor = (issuer: string, keyId: string): string =>
    `${issuer}\u0000${keyId}\u0000${current?.keySet.revision ?? 'none'}`

  const lookup = (issuer: string, keyId: string): IdentityResultKey | null => {
    if (!current || current.keySet.issuer !== issuer) return null
    const key = current.keySet.keys.find((candidate) => candidate.keyId === keyId)
    // Retired resolves the same as unknown, on purpose.
    if (!key || key.state === 'retired') return null
    return key
  }

  const refresh = async (): Promise<'advanced' | 'unchanged' | 'failed'> => {
    // Single-flight: whoever arrives during a refresh waits for that one and
    // reports its outcome rather than starting a second fetch.
    if (inFlight) return inFlight
    const revisionBefore = current?.keySet.revision ?? 0
    inFlight = (async (): Promise<'advanced' | 'unchanged' | 'failed'> => {
      try {
        const imported = await importIdentityResultKeySet(await load())
        if (current === null) {
          current = imported
        } else if (identityResultKeySetSucceeds(current, imported)) {
          // Adopt only a legitimate successor. A stale or rolled-back document
          // is discarded and the known-good one stays in place, because going
          // backwards is how a retired key would come back.
          current = imported
        }
        return (current?.keySet.revision ?? 0) > revisionBefore ? 'advanced' : 'unchanged'
      } catch {
        // A failed or malformed load leaves the last known-good set untouched,
        // and must NOT be recorded as proof that a key does not exist.
        return 'failed'
      } finally {
        inFlight = null
      }
    })()
    const outcome = await inFlight
    // The cooldown starts after any refresh that did not advance the revision.
    // A fetch that produced a newer revision proved itself useful, and rate
    // limiting it would fail a legitimate rotation for a real user; a fetch
    // that produced the same revision is the shape an amplification attempt
    // takes, and a failed fetch must not be retried in a tight loop either.
    if (outcome !== 'advanced') lastAttemptAt = clock()
    return outcome
  }

  return Object.freeze({
    current: () => current,
    resolve: async (issuer: string, keyId: string) => {
      const known = lookup(issuer, keyId)
      if (known) return known

      const now = clock()
      const missKey = missKeyFor(issuer, keyId)
      const suppressedUntil = missedUntil.get(missKey)
      if (suppressedUntil !== undefined && now < suppressedUntil) return null
      if (now - lastAttemptAt < cooldownMs) {
        // Inside the cooldown the answer is still a truthful null; it just does
        // not cost a fetch.
        return null
      }

      const outcome = await refresh()

      const resolved = lookup(issuer, keyId)
      if (resolved) return resolved
      // Only a refresh that actually produced a document may record that this
      // key is absent. A transient network or parse failure proves nothing, and
      // caching it as a miss would lock a legitimate new key out for the whole
      // negative-cache window.
      if (outcome !== 'failed') missedUntil.set(missKeyFor(issuer, keyId), clock() + negativeCacheMs)
      return null
    },
  })
}
