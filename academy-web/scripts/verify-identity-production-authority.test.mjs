import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { IdentityProductionAuthorityError, parseIdentityProductionAuthority, verifyIdentityProductionAuthority } from './verify-identity-production-authority.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RECORD = resolve(HERE, '../config/identity-production-authority-2951f5d.json')
const SIGNATURE = resolve(HERE, '../config/identity-production-authority-2951f5d.sig')
const SIGNERS = resolve(HERE, '../config/identity-production-authority.allowed_signers')
const NOW = new Date('2026-08-29T03:10:00.000Z')

test('verifies the byte-exact pinned authority with absolute ssh-keygen boundary', async () => {
  const authority = await verifyIdentityProductionAuthority(NOW)
  assert.equal(authority.sha256, 'd431ff061511807e8b433813fa02600a5f00825ccda24c93e7e62468822eeed9')
  assert.equal(authority.expected.releaseSha, '2951f5dc4433f4a20a7b7da3bde9110ae907531c')
  assert.equal(Object.isFrozen(authority.expected.registry.academyClient), true)
  await assert.rejects(verifyIdentityProductionAuthority(new Date('2026-09-05T03:00:00.000Z')), IdentityProductionAuthorityError)
})

test('semantic verifier owns pointer, projection, artifact, extraction, receipt, and registry relationships', async () => {
  const original = JSON.parse(await readFile(RECORD, 'utf8'))
  const mutations = [
    value => { value.inputs.runtime.keySetJsonPointer = '/authorization/resultSigning/keyId' },
    value => { value.inputs.runtime.canonicalProjectionSha256 = 'bad' },
    value => { value.inputs.runtime.keySetReadinessFileSha256 = 'bad' },
    value => { value.artifacts.api.path = 'other.tar' },
    value => { value.artifacts.api.extractedPath = '/tmp/api' },
    value => { value.artifacts.api.extractedManifestSha256 = 'bad' },
    value => { value.receipts.deploy.nlink = 2 },
    value => { value.registry.activeKeyIds.reverse() },
    value => { value.registry.academyClient = { ...value.registry.academyClient, enabled: false } },
  ]
  for (const mutate of mutations) {
    const value = structuredClone(original); mutate(value)
    assert.throws(() => parseIdentityProductionAuthority(`${JSON.stringify(value)}\n`, NOW), IdentityProductionAuthorityError)
  }
})

test('signature refuses forged identity and namespace', async () => {
  const record = await readFile(RECORD)
  for (const [identity, namespace] of [['forged-operator','cyberskills-academy-identity-authority-v1'], ['academy-production-authority','forged-namespace']]) {
    const result = spawnSync('/usr/bin/ssh-keygen', ['-Y','verify','-f',SIGNERS,'-I',identity,'-n',namespace,'-s',SIGNATURE], { input: record })
    assert.notEqual(result.status, 0)
  }
})

test('rejects alternate, forged, linked, symlinked, and wrong-mode authority paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'academy-authority-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const copy = join(root, 'authority.json'), hard = join(root, 'hard.json'), symbolic = join(root, 'symbolic.json')
  await writeFile(copy, await readFile(RECORD), { mode: 0o644 })
  await assert.rejects(verifyIdentityProductionAuthority(NOW, { record: copy }), IdentityProductionAuthorityError)
  const forged = JSON.parse(await readFile(RECORD, 'utf8')); forged.inputs.runtime.canonicalProjectionSha256 = 'a'.repeat(64)
  await writeFile(copy, `${JSON.stringify(forged)}\n`, { mode: 0o644 })
  await assert.rejects(verifyIdentityProductionAuthority(NOW, { record: copy }), IdentityProductionAuthorityError)
  await rm(copy); await link(RECORD, hard)
  await assert.rejects(verifyIdentityProductionAuthority(NOW, { record: hard }), IdentityProductionAuthorityError)
  await rm(hard); await symlink(RECORD, symbolic)
  await assert.rejects(verifyIdentityProductionAuthority(NOW, { record: symbolic }), IdentityProductionAuthorityError)
  await writeFile(copy, await readFile(RECORD), { mode: 0o600 }); await chmod(copy, 0o600)
  await assert.rejects(verifyIdentityProductionAuthority(NOW, { record: copy }), IdentityProductionAuthorityError)
})
