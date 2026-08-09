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
        sourceRevision: 'b63a1fd5f2822cdcf4187df952a6f356d9bee324',
        contractDigests: {
          'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
          'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
          'docs/integration/consumer-conformance-kit.md': 'd49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0',
          'docs/integration/lifecycle-pull-consumer-contract.md': '7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5',
          'packages/contracts/src/index.ts': '74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6',
          'packages/testing/src/index.ts': 'f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9',
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
