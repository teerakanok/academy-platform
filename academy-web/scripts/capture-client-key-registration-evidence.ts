import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  createAcademyClientKeyRegistrationEvidenceSubmission,
  runAcademyClientAssertionRegistrationRehearsal,
  type AcademyClientAssertionRehearsalRegistry,
} from '../src/lib/identity/client-assertion-registration-rehearsal'

const authenticatorPath = new URL(
  '../../../identity-control/packages/core/src/client-assertion.ts', import.meta.url,
).href
const controlPath = new URL(
  '../../../identity-control/packages/core/src/client-control.ts', import.meta.url,
).href

await Promise.all([
  verifyIdentitySource(authenticatorPath, 5938, '6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6'),
  verifyIdentitySource(controlPath, 2363, '5c3544a6b8056f95021f0dc871ca465d16235cad482984646b3b5b3a9455063c'),
])

const [authenticatorModule, controlModule] = await Promise.all([
  import(authenticatorPath),
  import(controlPath),
])
const Authenticator = authenticatorModule.Es256ClientAssertionAuthenticator
const ClientControlRegistry = controlModule.ClientControlRegistry
if (typeof Authenticator !== 'function' || typeof ClientControlRegistry !== 'function') {
  throw new Error('Committed Identity Control rehearsal contracts are unavailable')
}

const result = await runAcademyClientAssertionRegistrationRehearsal({
  createControlRegistry: () => new ClientControlRegistry(),
  createAuthenticator: (registry) => identityControlAuthenticator(registry),
})
const submission = await createAcademyClientKeyRegistrationEvidenceSubmission(result)
process.stdout.write(`${JSON.stringify(submission, null, 2)}\n`)

async function verifyIdentitySource(url: string, expectedBytes: number, expectedSha256: string) {
  const source = await readFile(new URL(url))
  const digest = createHash('sha256').update(source).digest('hex')
  if (source.byteLength !== expectedBytes || digest !== expectedSha256) {
    throw new Error('Committed Identity Control rehearsal contract bytes drifted')
  }
}

function identityControlAuthenticator(registry: AcademyClientAssertionRehearsalRegistry) {
  const keyResolver = {
    async resolve(clientId: string, keyId: string) {
      const key = registry.keys.find((candidate) => (
        candidate.clientId === clientId && candidate.keyId === keyId
        && (candidate.state === 'active' || candidate.state === 'overlap')
      ))
      return key
        ? { keyId: key.keyId, algorithm: key.algorithm, publicJwk: structuredClone(key.publicJwk) }
        : null
    },
  }
  const reservations = new Set<string>()
  return new Authenticator({
    audience: registry.audience,
    keyResolver,
    replayStore: {
      async reserve(_clientId: string, digest: string) {
        if (reservations.has(digest)) return false
        reservations.add(digest)
        return true
      },
    },
    now: () => new Date(registry.nowSeconds * 1_000),
    sha256: (value: string) => createHash('sha256').update(value).digest('base64url'),
    clockSkewSeconds: 30,
    maxLifetimeSeconds: 120,
  })
}
