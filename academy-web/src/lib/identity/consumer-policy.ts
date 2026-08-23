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
