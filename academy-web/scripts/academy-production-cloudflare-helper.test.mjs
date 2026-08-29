import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { executeAcademyCloudflareHelper, runWranglerJson } from './academy-production-cloudflare-helper.mjs'

const D = 'a'.repeat(64)
const R = 'b'.repeat(40)
const deployment = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const common = ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',R,'--readiness',D,'--valid-until','2026-08-29T12:00:00Z']
const provider = [{ id: deployment, created_on: '2026-08-29T10:00:00Z', versions: [{ version_id: version, percentage: 100 }] }]
const options = { clock: () => Date.parse('2026-08-29T11:00:00Z'), run: async () => JSON.stringify(provider) }

test('discovers only one exact 100 percent deployment', async () => {
  const value = await executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], options)
  assert.deepEqual(value, { deployments: provider })
})

test('reconcile remains fail-closed without provider recovery evidence', async () => {
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','reconcile','--journal',D], options))
})

test('residue fails closed until zero-traffic versions are inventoried', async () => {
  const args = [...common,'--operation','residue','--deployment',deployment,'--version',version]
  await assert.rejects(executeAcademyCloudflareHelper(args, options))
})

test('duplicate provider JSON is rejected before member collapse', async () => {
  const source = JSON.stringify(provider).replace(`"id":"${deployment}"`, `"id":"${deployment}","id":"${deployment}"`)
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], { ...options, run: async () => source }))
})

test('rejects expired authority and ambiguous arguments before provider execution', async () => {
  let calls = 0
  const run = async () => { calls += 1; return provider }
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--version',version], { clock: () => Date.parse('2026-08-29T12:00:00Z'), run }))
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--deployment',deployment,'--version',version], { ...options, run }))
  assert.equal(calls, 0)
})

async function executable(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'academy-cloudflare-helper-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'wrangler')
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 })
  await chmod(path, 0o700)
  return { root, path }
}

test('real runner returns raw JSON and drains quick success', async t => {
  const fixture = await executable(t, `printf '%s' '${JSON.stringify(provider)}'`)
  assert.equal(await runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 }), JSON.stringify(provider))
})

test('real runner kills and reaps a timed out process group with descendants', async t => {
  const pidPath = join(tmpdir(), `academy-helper-child-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const fixture = await executable(t, `sleep 30 & echo $! > '${pidPath}'; wait`)
  const execution = runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 })
  let pid
  const readyDeadline = Date.now() + 1_000
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  await assert.rejects(execution)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('real runner kills and reaps descendants after successful leader exit', async t => {
  const pidPath = join(tmpdir(), `academy-helper-success-descendant-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const fixture = await executable(t, `sleep 30 </dev/null >/dev/null 2>&1 & echo $! > '${pidPath}'; printf '%s' '${JSON.stringify(provider)}'; exit 0`)
  const execution = runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 })
  let helperFailure
  execution.catch(error => { helperFailure = error })
  let pid
  const readyDeadline = Date.now() + 1_000
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  await execution.catch(() => {})
  assert.ok(helperFailure instanceof Error)
  let gone = false
  const goneDeadline = Date.now() + 1_000
  while (Date.now() < goneDeadline) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') { gone = true; break }
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(gone, true)
})

test('real runner rejects oversized output and duplicate JSON', async t => {
  const oversized = await executable(t, `dd if=/dev/zero bs=1048577 count=1 2>/dev/null | tr '\\000' x`)
  await assert.rejects(runWranglerJson({ executable: oversized.path, cwd: oversized.root, deadlineMs: Date.now() + 2_000 }))
  const duplicate = await executable(t, `printf '%s' '[{"id":"${deployment}","id":"${deployment}","created_on":"2026-08-29T10:00:00Z","versions":[{"version_id":"${version}","percentage":100}]}]'`)
  const raw = await runWranglerJson({ executable: duplicate.path, cwd: duplicate.root, deadlineMs: Date.now() + 2_000 })
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], { ...options, run: async () => raw }))
})
