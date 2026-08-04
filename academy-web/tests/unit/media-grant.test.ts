import { describe, expect, it } from 'vitest'
import { issueMediaGrant, verifyMediaGrant, type MediaGrant } from '@/lib/media/grant'

const SECRET = 'test-only-media-signing-secret-32-bytes-minimum'
const grant: MediaGrant = {
  assetId: 'os-video-en',
  courseSlug: 'basic-os-linux',
  nodeId: 'os-what-it-does',
  expiresAt: 2_000,
}

describe('private media grant', () => {
  it('round-trips a bound, unexpired grant', async () => {
    const token = await issueMediaGrant(grant, SECRET)
    await expect(verifyMediaGrant(token, SECRET, 1_999)).resolves.toEqual(grant)
  })

  it('rejects expiry, payload tampering, signature tampering, and the wrong secret', async () => {
    const token = await issueMediaGrant(grant, SECRET)
    const [payload, signature] = token.split('.')
    await expect(verifyMediaGrant(token, SECRET, 2_000)).resolves.toBeNull()
    await expect(verifyMediaGrant(`${payload}a.${signature}`, SECRET, 1_000)).resolves.toBeNull()
    await expect(verifyMediaGrant(`${payload}.${signature.slice(0, -1)}a`, SECRET, 1_000)).resolves.toBeNull()
    await expect(verifyMediaGrant(token, `${SECRET}-different`, 1_000)).resolves.toBeNull()
  })

  it('refuses weak secrets and unsafe object keys', async () => {
    await expect(issueMediaGrant(grant, 'short')).rejects.toThrow(/32 bytes/)
    await expect(issueMediaGrant({ ...grant, assetId: '../secret.env' }, SECRET)).rejects.toThrow(/invalid media grant/)
  })
})
