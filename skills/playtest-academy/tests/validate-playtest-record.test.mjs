import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePlaytestRecord } from '../scripts/validate-playtest-record.mjs'

function validRecord() {
  return {
    schema: 'academy-zero-knowledge-playtest/v1',
    status: 'PASS',
    target: 'https://academy.example.test/',
    started_at: '2026-09-01T00:00:00.000Z',
    ended_at: '2026-09-01T00:10:00.000Z',
    journey_boundary: 'public discovery through one enrolled lesson',
    viewports: [
      { kind: 'desktop', width: 1440, height: 900 },
      { kind: 'mobile', width: 393, height: 852 },
    ],
    checkpoints: [{ name: 'course discovery', status: 'pass', evidence: 'Visible controls led to the catalog.' }],
    findings: [],
    canary: {
      used: true,
      identifier_sha256: 'a'.repeat(64),
      cleanup_owner: 'academy_product_operations',
      cleanup_status: 'verified',
      cleanup_verified: true,
      cleanup_evidence: 'Independent lookup returned no active canary resource.',
    },
  }
}

test('accepts a complete sanitized record', () => {
  assert.equal(validatePlaytestRecord(validRecord()).status, 'PASS')
})

test('rejects sensitive field names anywhere in the record', () => {
  const record = validRecord()
  record.findings.push({ severity: 'low', status: 'closed', access_token: 'redacted' })
  assert.throws(() => validatePlaytestRecord(record), /forbidden sensitive field/)
})

test('rejects credential-bearing or stateful target URLs', () => {
  const record = validRecord()
  record.target = 'https://academy.example.test/?state=opaque'
  assert.throws(() => validatePlaytestRecord(record), /must not contain credentials, query, or fragment/)
})

test('rejects PASS when a checkpoint did not pass', () => {
  const record = validRecord()
  record.checkpoints[0].status = 'blocked'
  assert.throws(() => validatePlaytestRecord(record), /PASS requires every checkpoint to pass/)
})

test('rejects PASS without independently verified cleanup', () => {
  const record = validRecord()
  record.canary.cleanup_status = 'retained'
  record.canary.cleanup_verified = false
  delete record.canary.cleanup_evidence
  assert.throws(() => validatePlaytestRecord(record), /PASS requires verified canary cleanup/)
})

test('allows a blocked run with retained cleanup ownership', () => {
  const record = validRecord()
  record.status = 'BLOCKED'
  record.checkpoints[0].status = 'blocked'
  record.canary.cleanup_status = 'retained'
  record.canary.cleanup_verified = false
  delete record.canary.cleanup_evidence
  assert.equal(validatePlaytestRecord(record).status, 'BLOCKED')
})

test('allows a public-only run without a canary', () => {
  const record = validRecord()
  record.canary = { used: false, cleanup_status: 'not_needed' }
  assert.equal(validatePlaytestRecord(record).status, 'PASS')
})
