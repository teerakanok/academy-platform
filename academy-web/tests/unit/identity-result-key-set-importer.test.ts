import { createHash, createPublicKey, generateKeyPairSync, webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  IdentityResultKeySetImportFailure,
  identityResultKeySetSucceeds,
  importIdentityResultKeySet,
  isImportedIdentityResultKeySet,
} from '@/lib/identity/result-key-set-importer'

// The importer takes the document as it arrives on the wire. Passing an object
// graph is exactly what it refuses to do, so every fixture serialises first.
const wire = (value: unknown) => JSON.stringify(value)

const issuer = 'https://identity.example.test/v1/code/results'

type PublicJwk = { kty: 'EC', crv: 'P-256', x: string, y: string }

function publicJwk(): PublicJwk {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string, y: string }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
}

/**
 * The producer computes this with Node crypto. The consumer computes it with
 * WebCrypto. They are byte-identical, which is the only reason the two products
 * can agree on which key is which; the fixture uses the producer's method so a
 * divergence would show up as a test failure rather than as silent mismatch.
 */
function fingerprint(jwk: PublicJwk): string {
  const der = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

const activeJwk = publicJwk()
const overlapJwk = publicJwk()
const retiredJwk = publicJwk()
const freshJwk = publicJwk()

function document() {
  return {
    issuer,
    revision: 4,
    keys: [
      { keyId: 'identity-result-active-v4', algorithm: 'ES256', publicJwk: { ...activeJwk }, state: 'active' },
      { keyId: 'identity-result-overlap-v3', algorithm: 'ES256', publicJwk: { ...overlapJwk }, state: 'overlap' },
      { keyId: 'identity-result-retired-v2', algorithm: 'ES256', publicJwk: { ...retiredJwk }, state: 'retired' },
    ],
    retiredKeyFingerprints: [fingerprint(retiredJwk)],
    retiredKeyIds: ['identity-result-retired-v2'],
  }
}

function rotated() {
  const previous = document()
  return {
    issuer,
    revision: 5,
    keys: [
      { keyId: 'identity-result-active-v5', algorithm: 'ES256', publicJwk: { ...freshJwk }, state: 'active' },
      { ...previous.keys[0], state: 'active' === 'active' ? 'overlap' : 'overlap' },
      { ...previous.keys[1], state: 'retired' },
    ],
    retiredKeyFingerprints: [fingerprint(retiredJwk), fingerprint(overlapJwk)].sort(),
    retiredKeyIds: ['identity-result-overlap-v3', 'identity-result-retired-v2'].sort(),
  }
}

describe('identity result key set importer', () => {
  it('projects the published document into the shape the verifier port accepts', async () => {
    const imported = await importIdentityResultKeySet(wire(document()))

    // The verifier port takes issuer/revision/keys only. Tombstones stay on the
    // import result so rotation can be checked without widening that contract.
    expect(Object.keys(imported.keySet).sort()).toEqual(['issuer', 'keys', 'revision'])
    expect(imported.keySet.issuer).toBe(issuer)
    expect(imported.keySet.revision).toBe(4)
    expect(imported.keySet.keys.map((key) => key.keyId)).toEqual([
      'identity-result-active-v4',
      'identity-result-overlap-v3',
      'identity-result-retired-v2',
    ])
    expect(imported.retiredKeyIds).toEqual(['identity-result-retired-v2'])
    expect(imported.retiredKeyFingerprints).toEqual([fingerprint(retiredJwk)])
    expect(Object.isFrozen(imported.keySet)).toBe(true)
    expect(Object.isFrozen(imported.keySet.keys[0]!.publicJwk)).toBe(true)
  })

  it('computes fingerprints itself instead of trusting the document', async () => {
    // A document that claims a tombstone for material it does not carry is a
    // document that disagrees with itself, however well-formed it looks.
    await expectRejection({ ...document(), retiredKeyFingerprints: ['a'.repeat(64)] })
    await expectRejection({ ...document(), retiredKeyFingerprints: [] })
    await expectRejection({ ...document(), retiredKeyIds: [] })
    await expectRejection({
      ...document(),
      retiredKeyFingerprints: [fingerprint(retiredJwk), fingerprint(activeJwk)].sort(),
      retiredKeyIds: ['identity-result-active-v4', 'identity-result-retired-v2'],
    })
  })

  it('fails closed on every malformed or hostile document', async () => {
    const base = document()
    await expectRejection('key-set')
    await expectRejection(null)
    await expectRejection({ ...base, issuer: 'http://identity.example.test/v1' })
    await expectRejection({ ...base, revision: 0 })
    await expectRejection({ ...base, revision: 1.5 })
    await expectRejection({ ...base, keys: [] })
    await expectRejection({ ...base, keys: [base.keys[0], base.keys[0]] })
    await expectRejection({ ...base, keys: [{ ...base.keys[0], state: 'overlap' }] })
    await expectRejection({ ...base, keys: [base.keys[0], { ...base.keys[1], state: 'active' }] })
    await expectRejection({ ...base, keys: [{ ...base.keys[0], algorithm: 'RS256' }] })
    await expectRejection({ ...base, keys: [{ ...base.keys[0], extra: true }] })
    await expectRejection({ ...base, extra: true })
    await expectRejection({ issuer, revision: 4, keys: base.keys })
    await expectRejection({
      ...base,
      keys: [{ ...base.keys[0], publicJwk: { ...activeJwk, d: 'private-material' } }],
    })
    await expectRejection({
      ...base,
      keys: [{ ...base.keys[0], publicJwk: { ...activeJwk, crv: 'P-384' } }],
    })
    // Well formed, but not a point on the curve.
    const zero = Buffer.alloc(32).toString('base64url')
    await expectRejection({
      ...base,
      keys: [{ ...base.keys[0], publicJwk: { kty: 'EC', crv: 'P-256', x: zero, y: zero } }],
    })
    await expectRejection({ ...base, retiredKeyFingerprints: [fingerprint(retiredJwk), fingerprint(retiredJwk)] })
    await expectRejection({ ...base, retiredKeyIds: ['b-identity-result', 'a-identity-result'] })
  })

  it('refuses an object graph, so no Proxy or accessor can reach the parser', async () => {
    // JavaScript has no browser-safe way to tell a Proxy from the object it
    // wraps. Taking the raw text removes the whole class instead of trying to
    // detect it: a Proxy cannot come out of JSON.parse.
    await expect(importIdentityResultKeySet(document())).rejects
      .toBeInstanceOf(IdentityResultKeySetImportFailure)
    await expect(importIdentityResultKeySet(new Proxy(document(), {}))).rejects
      .toBeInstanceOf(IdentityResultKeySetImportFailure)
    await expect(importIdentityResultKeySet('{ not json')).rejects
      .toBeInstanceOf(IdentityResultKeySetImportFailure)
    await expect(importIdentityResultKeySet('')).rejects
      .toBeInstanceOf(IdentityResultKeySetImportFailure)

    // A later mutation of the caller's object cannot reach what was imported.
    const source = document()
    const imported = await importIdentityResultKeySet(wire(source))
    source.revision = 99
    expect(imported.keySet.revision).toBe(4)
  })

  it('freezes every key so a consumer cannot revive a retired one', async () => {
    const imported = await importIdentityResultKeySet(wire(document()))
    const retired = imported.keySet.keys.find((key) => key.state === 'retired')!
    expect(Object.isFrozen(retired)).toBe(true)
    expect(() => { (retired as { state: string }).state = 'overlap' }).toThrow()
    expect(retired.state).toBe('retired')
  })

  it('requires one key ID to mean one key, in both directions', async () => {
    const base = document()
    const duplicateMaterial = {
      ...base,
      keys: [
        base.keys[0],
        { ...base.keys[1], publicJwk: { ...activeJwk } },
        base.keys[2],
      ],
    }
    await expect(importIdentityResultKeySet(wire(duplicateMaterial))).rejects
      .toBeInstanceOf(IdentityResultKeySetImportFailure)
  })

  it('refuses a rotation that swaps the material behind a surviving key ID', async () => {
    const first = await importIdentityResultKeySet(wire({
      issuer,
      revision: 1,
      keys: [{ keyId: 'identity-result-a', algorithm: 'ES256', publicJwk: activeJwk, state: 'active' }],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    }))
    // Same ID, different material: the name survived but the key behind it did
    // not, which is invisible to anything that compares IDs alone.
    const swapped = await importIdentityResultKeySet(wire({
      issuer,
      revision: 2,
      keys: [
        { keyId: 'identity-result-b', algorithm: 'ES256', publicJwk: freshJwk, state: 'active' },
        { keyId: 'identity-result-a', algorithm: 'ES256', publicJwk: overlapJwk, state: 'overlap' },
      ],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    }))
    expect(identityResultKeySetSucceeds(first, swapped)).toBe(false)
  })

  it('answers rotation questions only about documents it imported', async () => {
    const real = await importIdentityResultKeySet(wire(document()))
    const forged = {
      keySet: { issuer, revision: 99, keys: [{ keyId: 'invalid', state: 'active' }] },
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    }
    expect(isImportedIdentityResultKeySet(forged)).toBe(false)
    expect(identityResultKeySetSucceeds(real, forged)).toBe(false)
    expect(identityResultKeySetSucceeds(forged, real)).toBe(false)
    // A structural copy of a real result is not the real result either.
    expect(identityResultKeySetSucceeds(real, { ...real })).toBe(false)
  })

  it('accepts a legitimate rotation and refuses every way one can go backwards', async () => {
    const previous = await importIdentityResultKeySet(wire(document()))
    const next = await importIdentityResultKeySet(wire(rotated()))
    expect(identityResultKeySetSucceeds(previous, next)).toBe(true)

    // Each candidate is a REAL document that imports cleanly, so the refusal
    // below comes from the succession rule under test. Building candidates by
    // spreading an imported result would strip its provenance and prove only
    // that an unbranded object is refused.
    const base = rotated()
    const refused: Array<[string, Record<string, unknown>]> = [
      ['same revision', { ...base, revision: 4 }],
      ['revision rollback', { ...base, revision: 3 }],
      ['different issuer', { ...base, issuer: 'https://other.example.test/v1/code/results' }],
      // Keys are left exactly as a legitimate rotation leaves them, so the only
      // thing that differs is the tombstone being dropped. Changing the key set
      // as well would make the candidate fail an unrelated rule and prove
      // nothing about carry-forward.
      ['a dropped material tombstone', {
        ...base,
        retiredKeyFingerprints: base.retiredKeyFingerprints
          .filter((entry) => entry !== fingerprint(retiredJwk)),
      }],
      ['a dropped id tombstone', {
        ...base,
        retiredKeyIds: base.retiredKeyIds.filter((entry) => entry !== 'identity-result-retired-v2'),
      }],
    ]
    for (const [reason, candidate] of refused) {
      const imported = await importIdentityResultKeySet(wire(candidate))
      expect(isImportedIdentityResultKeySet(imported), `${reason} must import cleanly first`).toBe(true)
      expect(identityResultKeySetSucceeds(previous, imported), reason).toBe(false)
    }
  })

  it('refuses a key that has already retired, under any name', async () => {
    const previous = await importIdentityResultKeySet(wire(document()))

    // Same id, same material.
    await expectSuccessionRefused(previous, {
      issuer,
      revision: 6,
      keys: [{ keyId: 'identity-result-retired-v2', algorithm: 'ES256', publicJwk: { ...retiredJwk }, state: 'active' }],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    })
    // Fresh id, retired material.
    await expectSuccessionRefused(previous, {
      issuer,
      revision: 6,
      keys: [{ keyId: 'identity-result-renamed-v6', algorithm: 'ES256', publicJwk: { ...retiredJwk }, state: 'active' }],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    })
    // Retired id, fresh material.
    await expectSuccessionRefused(previous, {
      issuer,
      revision: 6,
      keys: [{ keyId: 'identity-result-retired-v2', algorithm: 'ES256', publicJwk: { ...freshJwk }, state: 'active' }],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    })
  })

  it('agrees with the producer on what a key fingerprint is', async () => {
    // The producer uses Node crypto; this consumer uses WebCrypto. If those ever
    // disagree the two products silently stop recognising the same key, so pin
    // the equality here rather than assuming it.
    const key = await webcrypto.subtle.importKey(
      'jwk',
      { ...activeJwk, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    )
    const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', key))
    const web = Buffer.from(await webcrypto.subtle.digest('SHA-256', spki)).toString('hex')
    expect(web).toBe(fingerprint(activeJwk))
  })
})

async function expectRejection(value: unknown) {
  await expect(importIdentityResultKeySet(wire(value))).rejects.toBeInstanceOf(IdentityResultKeySetImportFailure)
}

async function expectSuccessionRefused(previous: unknown, nextDocument: unknown) {
  // The import must SUCCEED here. A test that accepts "the importer rejected
  // it" as proof of a succession rule proves nothing about succession.
  const next = await importIdentityResultKeySet(wire(nextDocument))
  expect(identityResultKeySetSucceeds(previous, next)).toBe(false)
}
