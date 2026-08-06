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
