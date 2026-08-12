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
        sourceRevision: 'd7f517adb408ee2f50f3b5734c10dd14cbea6530',
        contractDigests: {
          'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
          'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
          'docs/integration/consumer-conformance-kit.md': '52c402cc4582d5dfc1f54ce12cf9d9ed96bf4e6eace10a411585e1c8ee92c6f9',
          'docs/integration/lifecycle-pull-consumer-contract.md': 'ba7ca71fd5ab845821f6dc9cfc09bc612bef1ed12914331e4ad4e65a0ce6f17c',
          'packages/contracts/src/index.ts': '185e8e95282036bb5d979cdc2c2c163cf5cdabe4816880dc08cb484631c9b39f',
          'packages/testing/src/index.ts': '72aa668be65434cac203c15e16d3c5c7c2d1bf89143bc1b1255d3972305069f6',
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
