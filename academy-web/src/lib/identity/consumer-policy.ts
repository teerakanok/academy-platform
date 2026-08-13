/**
 * Non-secret Academy-side projection of Identity Control Consumer Registry v1.
 *
 * This is evidence for local contract tests and documentation only. It is not
 * production runtime configuration: the registry is release-blocked, disabled,
 * and must be published by Identity Control before Academy wires sign-in.
 */
export const APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 = {
  schema: 'identity-control-consumer-registry/v1',
  revision: 1,
  status: 'approved-policy-release-blocked',
  identityControlSource: {
    repository: 'products/cyberskills/identity-control',
    sourceRevision: '4efd9b7e76f48e00aa6e3896bc14626cd38bcb6a',
    contractDigests: {
      'config/consumer-registry-v1.approved.json': '572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875',
      'docs/integration/consumer-registry-v1.md': 'd880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4',
      'docs/integration/consumer-conformance-kit.md': '52c402cc4582d5dfc1f54ce12cf9d9ed96bf4e6eace10a411585e1c8ee92c6f9',
      'docs/integration/lifecycle-pull-consumer-contract.md': 'ba7ca71fd5ab845821f6dc9cfc09bc612bef1ed12914331e4ad4e65a0ce6f17c',
      'packages/contracts/src/index.ts': '3954689f4749b0f43763b02b4cd1bf4c840304ca594d5a565a5f0af77d910aaa',
      'packages/testing/src/index.ts': '72aa668be65434cac203c15e16d3c5c7c2d1bf89143bc1b1255d3972305069f6',
    },
  },
  accountCenter: {
    origin: 'https://accounts.cyberskills.co.th',
    codeExchangeAudience: 'https://accounts.cyberskills.co.th/v1/code/exchange',
  },
  client: {
    clientId: 'academy-web',
    serviceId: 'academy',
    activationPolicy: 'open',
    enabled: false,
    configRevision: 1,
    redirectUris: ['https://academy.cyberskills.co.th/auth/callback'],
    resultAudience: 'https://academy.cyberskills.co.th',
    clientAssertionAudience: 'https://accounts.cyberskills.co.th/v1/code/exchange',
    privateKeyOwner: 'academy-runtime',
    verificationKeys: { active: null, overlap: [] },
    lifecycle: {
      transport: 'authenticated_pull',
      publisherEndpoint: null,
      clientAssertionAudience: null,
      eventAudience: null,
    },
    killSwitchOwner: null,
    releaseBlockers: [
      'canonical-domain-deployment-evidence',
      'client-public-key-registration-and-rotation-rehearsal',
      'lifecycle-publisher-endpoint-and-audience',
      'named-kill-switch-operator',
      'consumer-conformance-rehearsal',
      'separate-production-authorization',
    ],
    accessInvariant:
      'Service activation may create or bind only the Academy profile. Course access still requires Academy-owned entitlement and resource authorization; founder bootstrap occurs only after canonical sign-in.',
  },
} as const

const CLIENT_PUBLIC_KEY_REGISTRATION_BLOCKER = 'client-public-key-registration-and-rotation-rehearsal'

type AcademyClientAssertionBoundary = {
  enabled: boolean
  privateKeyOwner: string | null
  releaseBlockers: readonly string[]
}

/**
 * The policy mirror intentionally has no private key material. Before the
 * release gate clears, client assertion must remain disabled and product-owned.
 */
export function assertAcademyClientAssertionBoundary(client: AcademyClientAssertionBoundary): void {
  if (client.enabled) {
    throw new Error('Academy client assertion must remain disabled until release authorization')
  }
  if (client.privateKeyOwner !== 'academy-runtime') {
    throw new Error('Academy client assertion must use an Academy-owned private key boundary')
  }
  if (!client.releaseBlockers.includes(CLIENT_PUBLIC_KEY_REGISTRATION_BLOCKER)) {
    throw new Error('Academy client assertion requires the public-key registration release blocker')
  }
}
