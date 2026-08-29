import assert from 'node:assert/strict'
import test from 'node:test'

import { executeAcademyCloudflareHelper } from './academy-production-cloudflare-helper.mjs'

const D = 'a'.repeat(64)
const R = 'b'.repeat(40)
const deployment = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const common = ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',R,'--readiness',D,'--valid-until','2026-08-29T12:00:00Z']
const provider = [{ id: deployment, created_on: '2026-08-29T10:00:00Z', versions: [{ version_id: version, percentage: 100 }] }]
const options = { clock: () => Date.parse('2026-08-29T11:00:00Z'), run: async () => provider }

test('discovers only one exact 100 percent deployment', async () => {
  const value = await executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], options)
  assert.deepEqual(value, { deployments: provider })
})

test('reconcile remains fail-closed without provider recovery evidence', async () => {
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','reconcile','--journal',D], options))
})

test('residue binds exact deployment and version with a deterministic receipt', async () => {
  const args = [...common,'--operation','residue','--deployment',deployment,'--version',version]
  const first = await executeAcademyCloudflareHelper(args, options)
  const second = await executeAcademyCloudflareHelper(args, options)
  assert.deepEqual(first, second)
  assert.equal(first.status, 'PASS')
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--version','33333333-3333-4333-8333-333333333333'], options))
})

test('rejects expired authority and ambiguous arguments before provider execution', async () => {
  let calls = 0
  const run = async () => { calls += 1; return provider }
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--version',version], { clock: () => Date.parse('2026-08-29T12:00:00Z'), run }))
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--deployment',deployment,'--version',version], { ...options, run }))
  assert.equal(calls, 0)
})
