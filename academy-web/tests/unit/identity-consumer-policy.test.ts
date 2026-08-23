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
        sourceRevision: 'f0e1cc5dd89271ca2a1a78fd4b3c7b825bf61c1e',
        contractDigests: {
          'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
          'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
          'docs/integration/consumer-conformance-kit.md': 'df1ef8c8b385be09cfcf0481f6e0643db4517eb3a72fb406e8612e388beadb97',
          'docs/integration/lifecycle-pull-consumer-contract.md': 'ba7ca71fd5ab845821f6dc9cfc09bc612bef1ed12914331e4ad4e65a0ce6f17c',
          'packages/contracts/src/index.ts': 'e3f22d7bb02f255c01d3552022b874202df849cf31410ebff98fac7460f5799f',
          'packages/testing/src/index.ts': 'd12f81616596dc37a9f62ae16e37873c08efabc222427f4b82ced187c0b6a51d',
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
