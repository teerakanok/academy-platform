import { describe, expect, it } from 'vitest'
import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from '@/lib/identity/consumer-policy'

describe('approved Identity Control consumer policy mirror', () => {
  it('matches the approved non-secret Academy registration', () => {
    const { client } = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1

    expect(APPROVED_ACADEMY_CONSUMER_REGISTRY_V1).toMatchObject({
      schema: 'identity-control-consumer-registry/v1',
      revision: 1,
      status: 'approved-policy-release-blocked',
      accountCenter: {
        origin: 'https://accounts.cyberskills.co.th',
        codeExchangeAudience: 'https://accounts.cyberskills.co.th/v1/code/exchange',
      },
    })
    expect(client).toMatchObject({
      clientId: 'academy-web',
      serviceId: 'academy',
      activationPolicy: 'open',
      enabled: false,
      configRevision: 1,
      redirectUris: ['https://academy.cyberskills.co.th/auth/callback'],
      resultAudience: 'https://academy.cyberskills.co.th',
      clientAssertionAudience: 'https://accounts.cyberskills.co.th/v1/code/exchange',
      privateKeyOwner: 'academy-runtime',
    })
  })

  it('keeps release and key-delivery gates closed', () => {
    const { client } = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1

    expect(client.verificationKeys).toEqual({ active: null, overlap: [] })
    expect(client.lifecycle).toEqual({
      transport: 'authenticated_pull',
      publisherEndpoint: null,
      clientAssertionAudience: null,
      eventAudience: null,
    })
    expect(client.killSwitchOwner).toBeNull()
    expect(client.releaseBlockers.length).toBeGreaterThan(0)
    expect(client.accessInvariant).toMatch(/entitlement/i)
  })
})
