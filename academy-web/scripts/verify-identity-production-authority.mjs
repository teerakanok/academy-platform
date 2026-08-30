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
const SIGNATURE_SHA256 = 'fc78e8a9de83065f2f8d70823fd6896349172d7e6228fd56eba08c0b5403dabe'
export const IDENTITY_PRODUCTION_AUTHORITY_SHA256 = '95e3deb74b21077320e5001277524c07261732aa9096dbcd8d24ff7bfa82a74b'

export class IdentityProductionAuthorityError extends Error {
  constructor() { super('Identity production authority rejected'); this.name = 'IdentityProductionAuthorityError' }
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
    const value = JSON.parse(record)
    if (record.toString() !== `${JSON.stringify(value)}\n` || value.schema !== 'academy-identity-production-authority/v1'
      || value.ssh?.alias !== 'ssh-db.cyberskills.co.th' || value.ssh?.hostKeyFingerprint !== 'SHA256:0cMCepqYWfbsO5oxsR02fAIRJ4iQLTeSbUy3cyelTbY'
      || value.ssh?.operatorIdentity !== IDENTITY || value.ssh?.operatorKeyFingerprint !== 'SHA256:wmTqkPLWsKot3ByVert0kAyU7xm1jfef4APBTlbPx3k'
      || value.ssh?.signatureNamespace !== NAMESPACE || value.release?.sha !== '2951f5dc4433f4a20a7b7da3bde9110ae907531c'
      || value.inputs?.runtime?.keySetJsonPointer !== '/authorization/resultSigning/verificationKeySet'
      || value.inputs?.runtime?.canonicalProjectionSha256 !== '66c32585b7fe963f25df7c04560f0bdf0be0c4fe2185c85ebd1577eb9a599e42'
      || value.inputs?.freeze?.sha256 !== 'ef86b70e426bc8fd8bda4a9d85e502f10bb22539bb8ad9832a01989450671683'
      || value.inputs?.runtime?.sha256 !== 'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d'
      || value.artifacts?.api?.sha256 !== 'f80cd4a87d451c5ec36e90d7d2e7db76a62f6480b78a3a3bcfd0dce91b4926e1'
      || value.artifacts?.accountCenter?.sha256 !== '3227c635dbc9235d1861f133615ed2b761351df50f7c3b93c924b088524759f8') throw new IdentityProductionAuthorityError()
    const now = observedAt.valueOf(), observed = Date.parse(value.observedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isFinite(now) || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 60_000 || expires <= now || expires > observed + 7 * 24 * 60 * 60 * 1000) throw new IdentityProductionAuthorityError()
    const result = spawnSync(SSH_KEYGEN, ['-Y','verify','-f',signersPath,'-I',IDENTITY,'-n',NAMESPACE,'-s',signaturePath], { input: record, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, timeout: 5000, maxBuffer: 4096 })
    const expectedOutput = `Good "${NAMESPACE}" signature for ${IDENTITY} with ED25519 key SHA256:wmTqkPLWsKot3ByVert0kAyU7xm1jfef4APBTlbPx3k\n`
    if (result.status !== 0 || result.signal !== null || result.stdout !== expectedOutput || result.stderr !== '') throw new IdentityProductionAuthorityError()
    return Object.freeze({ sha256: digest, releaseSha: value.release.sha })
  } catch (error) { if (error instanceof IdentityProductionAuthorityError) throw error; throw new IdentityProductionAuthorityError() }
}
