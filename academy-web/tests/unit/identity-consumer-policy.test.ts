import { describe, expect, it } from 'vitest'
import {
  APPROVED_ACADEMY_CONSUMER_REGISTRY_V1,
  assertAcademyClientAssertionBoundary,
} from '@/lib/identity/consumer-policy'

describe('approved Identity Control consumer policy mirror', () => {
  it('matches the approved non-secret Academy registration', () => {
    const { client } = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1

    expect(APPROVED_ACADEMY_CONSUMER_REGISTRY_V1).toMatchObject({
      schema: 'identity-control-consumer-registry/v1',
      revision: 1,
      status: 'approved-policy-release-blocked',
      identityControlSource: {
        repository: 'products/cyberskills/identity-control',
        sourceRevision: 'ab958eeb7f8c9aabec5a0e0f371e27266fae88a4',
        contractDigests: {
          'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
          'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
          'docs/integration/consumer-conformance-kit.md': '203b1e43e8ea9e3b651029f9fb78d8f911b7f7c17942a11c9a1d1931268ed7d6',
          'docs/integration/lifecycle-pull-consumer-contract.md': 'ba7ca71fd5ab845821f6dc9cfc09bc612bef1ed12914331e4ad4e65a0ce6f17c',
          'packages/contracts/src/index.ts': 'b7cd6e7b79f0a5002c523d34dd81fd029ee1997cf9ab08b456bf7d9bfc72573c',
          'packages/testing/src/index.ts': '300982ed33a1a1ab277c436086d50dacd7aa96bb6dd53f1d86cf775ce9e91344',
        },
      },
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

  it('keeps the registered client disabled in the local policy mirror', () => {
    expect(APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.client.enabled).toBe(false)
  })

  it('keeps client assertion disabled until Academy-owned key registration is released', () => {
    const { client } = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1

    expect(() => assertAcademyClientAssertionBoundary(client)).not.toThrow()
    expect(() => assertAcademyClientAssertionBoundary({ ...client, enabled: true })).toThrow(/disabled/i)
    expect(() => assertAcademyClientAssertionBoundary({ ...client, privateKeyOwner: 'identity-control' })).toThrow(/Academy-owned/i)
    expect(() => assertAcademyClientAssertionBoundary({ ...client, releaseBlockers: [] })).toThrow(/public-key registration/i)
  })
})
