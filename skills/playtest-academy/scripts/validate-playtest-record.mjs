#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const statuses = new Set(['pass', 'fail', 'blocked', 'not_run'])
const finalStatuses = new Set(['PASS', 'FAIL', 'BLOCKED'])
const cleanupStatuses = new Set(['not_needed', 'verified', 'retained'])
const forbiddenKey = /(secret|password|passphrase|private.?key|cookie|token|otp|code|credential)/i
const sha256 = /^[a-f0-9]{64}$/

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertSafeShape(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeShape(entry, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    assert(!forbiddenKey.test(key), `forbidden sensitive field at ${path}.${key}`)
    assertSafeShape(entry, `${path}.${key}`)
  }
}

function assertUrl(value, field) {
  const url = new URL(value)
  assert(url.protocol === 'https:', `${field} must use https`)
  assert(!url.username && !url.password && !url.search && !url.hash, `${field} must not contain credentials, query, or fragment`)
}

export function validatePlaytestRecord(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'record must be an object')
  assertSafeShape(record)
  assert(record.schema === 'academy-zero-knowledge-playtest/v1', 'unsupported schema')
  assert(finalStatuses.has(record.status), 'invalid final status')
  assertUrl(record.target, 'target')
  assert(Number.isFinite(Date.parse(record.started_at)), 'invalid started_at')
  assert(Number.isFinite(Date.parse(record.ended_at)), 'invalid ended_at')
  assert(Date.parse(record.ended_at) >= Date.parse(record.started_at), 'ended_at precedes started_at')
  assert(typeof record.journey_boundary === 'string' && record.journey_boundary.trim(), 'journey_boundary is required')
  assert(Array.isArray(record.viewports) && record.viewports.length >= 2, 'desktop and mobile viewports are required')
  assert(record.viewports.some((item) => item?.kind === 'desktop'), 'desktop viewport is missing')
  assert(record.viewports.some((item) => item?.kind === 'mobile'), 'mobile viewport is missing')
  for (const viewport of record.viewports) {
    assert(Number.isInteger(viewport.width) && viewport.width > 0, 'viewport width must be a positive integer')
    assert(Number.isInteger(viewport.height) && viewport.height > 0, 'viewport height must be a positive integer')
  }

  assert(Array.isArray(record.checkpoints) && record.checkpoints.length > 0, 'checkpoints are required')
  for (const checkpoint of record.checkpoints) {
    assert(typeof checkpoint.name === 'string' && checkpoint.name.trim(), 'checkpoint name is required')
    assert(statuses.has(checkpoint.status), `invalid checkpoint status for ${checkpoint.name}`)
    assert(typeof checkpoint.evidence === 'string' && checkpoint.evidence.trim(), `checkpoint evidence is required for ${checkpoint.name}`)
  }
  assert(Array.isArray(record.findings), 'findings must be an array')

  const canary = record.canary
  assert(canary && typeof canary === 'object' && typeof canary.used === 'boolean', 'canary.used is required')
  assert(cleanupStatuses.has(canary.cleanup_status), 'invalid canary cleanup_status')
  if (canary.used) {
    assert(sha256.test(canary.identifier_sha256), 'used canary requires a SHA-256 identifier digest')
    assert(typeof canary.cleanup_owner === 'string' && canary.cleanup_owner.trim(), 'used canary requires cleanup_owner')
    assert(canary.cleanup_status !== 'not_needed', 'used canary cannot have cleanup_status not_needed')
    if (canary.cleanup_status === 'verified') {
      assert(canary.cleanup_verified === true, 'verified cleanup requires cleanup_verified=true')
      assert(typeof canary.cleanup_evidence === 'string' && canary.cleanup_evidence.trim(), 'verified cleanup requires cleanup_evidence')
    } else {
      assert(canary.cleanup_verified === false, 'retained cleanup requires cleanup_verified=false')
    }
  } else {
    assert(canary.cleanup_status === 'not_needed', 'unused canary requires cleanup_status not_needed')
    assert(!('identifier_sha256' in canary), 'unused canary must not carry an identifier digest')
  }

  const allPassed = record.checkpoints.every((checkpoint) => checkpoint.status === 'pass')
  const cleanupComplete = !canary.used || canary.cleanup_status === 'verified'
  if (record.status === 'PASS') {
    assert(allPassed, 'PASS requires every checkpoint to pass')
    assert(cleanupComplete, 'PASS requires verified canary cleanup')
    assert(!record.findings.some((finding) => finding?.severity === 'critical' && finding?.status !== 'closed'), 'PASS cannot retain an open critical finding')
  }
  if (record.status === 'FAIL') assert(record.checkpoints.some((checkpoint) => checkpoint.status === 'fail'), 'FAIL requires a failed checkpoint')
  if (record.status === 'BLOCKED') assert(record.checkpoints.some((checkpoint) => checkpoint.status === 'blocked'), 'BLOCKED requires a blocked checkpoint')
  return record
}

async function main(argv) {
  assert(argv.length === 1, 'usage: validate-playtest-record.mjs <record.json>')
  const record = JSON.parse(await readFile(argv[0], 'utf8'))
  validatePlaytestRecord(record)
  process.stdout.write('academy playtest record: PASS\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`academy playtest record: FAIL: ${error.message}\n`)
    process.exitCode = 1
  })
}
