import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RECORD = resolve(HERE, '../config/identity-production-authority-2951f5d.json')
const SIGNATURE = resolve(HERE, '../config/identity-production-authority-2951f5d.sig')
const SIGNERS = resolve(HERE, '../config/identity-production-authority.allowed_signers')
const SSH_KEYGEN = '/usr/bin/ssh-keygen'
const IDENTITY = 'academy-production-authority'
const NAMESPACE = 'cyberskills-academy-identity-authority-v1'
const SIGNERS_SHA256 = '3121e888fc152ade56f15b5d5afcc27c5f4206bdde49530bf1a8a871ec17ec1b'
const SIGNATURE_SHA256 = 'cff1d817db5efded3d3ec191f69d9d5d01947a5b03085dbce97257b834bf9b80'
export const IDENTITY_PRODUCTION_AUTHORITY_SHA256 = '0f681a2ad7be38da537b16534b061c40c42561041b8735ca77687595369f8f6c'

export class IdentityProductionAuthorityError extends Error {
  constructor() { super('Identity production authority rejected'); this.name = 'IdentityProductionAuthorityError' }
}

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype && JSON.stringify(Object.keys(value)) === JSON.stringify(keys)
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const deepFreeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); if (!Object.isFrozen(value)) Object.freeze(value) } return value }
const file = value => exact(value, ['path','owner','mode','nlink','bytes','sha256'])
  && value.path.startsWith('/') && value.owner.length > 0 && /^0[46][04]0$/.test(value.mode)
  && value.nlink === 1 && Number.isSafeInteger(value.bytes) && value.bytes > 0 && sha256(value.sha256)

export function parseIdentityProductionAuthority(source, observedAt = new Date()) {
  try {
    const value = JSON.parse(source)
    if (source !== `${JSON.stringify(value)}\n` || !exact(value, ['schema','observedAt','expiresAt','ssh','release','inputs','artifacts','receipts','registry'])
      || value.schema !== 'academy-identity-production-authority/v1'
      || !exact(value.ssh, ['alias','hostKeyFingerprint','operatorIdentity','operatorKeyFingerprint','signatureNamespace'])
      || value.ssh.alias !== 'ssh-db.cyberskills.co.th' || value.ssh.hostKeyFingerprint !== 'SHA256:0cMCepqYWfbsO5oxsR02fAIRJ4iQLTeSbUy3cyelTbY'
      || value.ssh.operatorIdentity !== IDENTITY || value.ssh.operatorKeyFingerprint !== 'SHA256:wmTqkPLWsKot3ByVert0kAyU7xm1jfef4APBTlbPx3k' || value.ssh.signatureNamespace !== NAMESPACE
      || !exact(value.release, ['sha','sourcePath','installedMarker']) || !/^[a-f0-9]{40}$/.test(value.release.sha)
      || value.release.sourcePath !== '/opt/identity-control/src' || !file(value.release.installedMarker)
      || !exact(value.inputs, ['freeze','runtime']) || !file(value.inputs.freeze)
      || !exact(value.inputs.runtime, ['path','owner','mode','nlink','bytes','sha256','keySetJsonPointer','canonicalProjectionSha256','keySetReadinessFileSha256'])
      || !file(Object.fromEntries(Object.entries(value.inputs.runtime).slice(0, 6)))
      || value.inputs.runtime.keySetJsonPointer !== '/authorization/resultSigning/verificationKeySet'
      || !sha256(value.inputs.runtime.canonicalProjectionSha256) || !sha256(value.inputs.runtime.keySetReadinessFileSha256)
      || !exact(value.artifacts, ['directory','api','accountCenter']) || !value.artifacts.directory.startsWith('/root/.identity-control-artifacts-')
      || !exact(value.receipts, ['deploy','preflightGo']) || !file(value.receipts.deploy) || !file(value.receipts.preflightGo)
      || !exact(value.registry, ['activeKeyIds','overlapKeyIds','academyClient','resultSigning'])
      || JSON.stringify(value.registry.activeKeyIds) !== JSON.stringify(['academy-prod-2026-08','identity-result-prod-2026-08'])
      || JSON.stringify(value.registry.overlapKeyIds) !== '[]'
      || !exact(value.registry.academyClient, ['clientId','serviceId','enabled','keyId','reference'])
      || value.registry.academyClient.clientId !== 'academy-web' || value.registry.academyClient.serviceId !== 'academy'
      || value.registry.academyClient.enabled !== true || value.registry.academyClient.keyId !== value.registry.activeKeyIds[0]
      || value.registry.academyClient.reference !== `config://client-keys/academy-web/${value.registry.activeKeyIds[0]}`
      || !exact(value.registry.resultSigning, ['keyId','issuer','revision','state'])
      || value.registry.resultSigning.keyId !== value.registry.activeKeyIds[1]
      || value.registry.resultSigning.issuer !== 'https://accounts.cyberskills.co.th/v1/code/results'
      || value.registry.resultSigning.revision !== 1 || value.registry.resultSigning.state !== 'active') throw new IdentityProductionAuthorityError()
    for (const [name, expectedPath] of [['api','api.tar'],['accountCenter','ac.tar']]) {
      const artifact = value.artifacts[name]
      if (!exact(artifact, ['path','owner','mode','nlink','bytes','sha256','extractedPath','extractedFiles','extractedBytes','extractedManifestSha256'])
        || artifact.path !== expectedPath || artifact.owner !== 'root' || artifact.mode !== '0644' || artifact.nlink !== 1
        || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || !sha256(artifact.sha256)
        || !artifact.extractedPath.startsWith(`/opt/identity-control/releases/${value.release.sha}/`)
        || !Number.isSafeInteger(artifact.extractedFiles) || artifact.extractedFiles < 1
        || !Number.isSafeInteger(artifact.extractedBytes) || artifact.extractedBytes < 1 || !sha256(artifact.extractedManifestSha256)) throw new IdentityProductionAuthorityError()
    }
    const now = observedAt.valueOf(), observed = Date.parse(value.observedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isFinite(now) || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 60_000 || expires <= now || expires > observed + 7 * 86400000) throw new IdentityProductionAuthorityError()
    return deepFreeze({ releaseSha: value.release.sha, runtimeSha256: value.inputs.runtime.sha256,
      freezeSha256: value.inputs.freeze.sha256, keySetSha256: value.inputs.runtime.keySetReadinessFileSha256,
      keySetProjection: Object.freeze({ pointer: value.inputs.runtime.keySetJsonPointer, sha256: value.inputs.runtime.canonicalProjectionSha256 }),
      artifacts: Object.freeze({ accountCenter: Object.freeze({ bytes: value.artifacts.accountCenter.bytes, path: value.artifacts.accountCenter.path, sha256: value.artifacts.accountCenter.sha256 }), api: Object.freeze({ bytes: value.artifacts.api.bytes, path: value.artifacts.api.path, sha256: value.artifacts.api.sha256 }) }),
      registry: Object.freeze(structuredClone(value.registry)), receipts: Object.freeze({ deploySha256: value.receipts.deploy.sha256, preflightGoSha256: value.receipts.preflightGo.sha256 }),
      extraction: Object.freeze({ apiSha256: value.artifacts.api.extractedManifestSha256, accountCenterSha256: value.artifacts.accountCenter.extractedManifestSha256 }) })
  } catch (error) { if (error instanceof IdentityProductionAuthorityError) throw error; throw new IdentityProductionAuthorityError() }
}

async function stableBytes(path) {
  const before = await lstat(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o644n || before.uid !== BigInt(process.getuid()) || await realpath(path) !== path) throw new IdentityProductionAuthorityError()
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const bytes = await handle.readFile(); const after = await handle.stat({ bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) throw new IdentityProductionAuthorityError()
    return bytes
  } finally { await handle.close() }
}

export async function verifyIdentityProductionAuthority(observedAt = new Date(), paths = {}) {
  try {
    const recordPath = resolve(paths.record ?? RECORD), signaturePath = resolve(paths.signature ?? SIGNATURE), signersPath = resolve(paths.signers ?? SIGNERS)
    const [record, signature, signers] = await Promise.all([stableBytes(recordPath), stableBytes(signaturePath), stableBytes(signersPath)])
    const digest = createHash('sha256').update(record).digest('hex')
    if (digest !== IDENTITY_PRODUCTION_AUTHORITY_SHA256 || createHash('sha256').update(signature).digest('hex') !== SIGNATURE_SHA256
      || createHash('sha256').update(signers).digest('hex') !== SIGNERS_SHA256
      || recordPath !== RECORD || signaturePath !== SIGNATURE || signersPath !== SIGNERS) throw new IdentityProductionAuthorityError()
    const expected = parseIdentityProductionAuthority(record.toString(), observedAt)
    const result = spawnSync(SSH_KEYGEN, ['-Y','verify','-f',signersPath,'-I',IDENTITY,'-n',NAMESPACE,'-s',signaturePath], { input: record, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, timeout: 5000, maxBuffer: 4096 })
    const expectedOutput = `Good "${NAMESPACE}" signature for ${IDENTITY} with ED25519 key SHA256:wmTqkPLWsKot3ByVert0kAyU7xm1jfef4APBTlbPx3k\n`
    if (result.status !== 0 || result.signal !== null || result.stdout !== expectedOutput || result.stderr !== '') throw new IdentityProductionAuthorityError()
    return Object.freeze({ sha256: digest, source: record.toString(), expected })
  } catch (error) { if (error instanceof IdentityProductionAuthorityError) throw error; throw new IdentityProductionAuthorityError() }
}
