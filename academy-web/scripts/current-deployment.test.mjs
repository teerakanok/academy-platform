import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { parseCurrentDeploymentJson, selectCurrentDeployment } from './current-deployment.mjs'

function deployment(overrides = {}) {
  return {
    id: 'deployment-old',
    created_on: '2026-01-01T00:00:00Z',
    versions: [{ version_id: 'version-old', percentage: 100 }],
    ...overrides,
  }
}

const newest = deployment({
  id: 'deployment-new',
  created_on: '2026-02-01T00:00:00+07:00',
  versions: [
    { version_id: 'version-a', percentage: 75 },
    { version_id: 'version-b', percentage: 25 },
  ],
})

const expectedNewest = {
  id: 'deployment-new',
  created_on: '2026-02-01T00:00:00+07:00',
  versions: [
    { id: 'version-a', percentage: 75 },
    { id: 'version-b', percentage: 25 },
  ],
}

describe('current deployment selection', () => {
  test('chooses the newest deployment from an old-to-new list', () => {
    assert.deepEqual(selectCurrentDeployment([deployment(), newest]), expectedNewest)
  })

  test('chooses the same newest deployment from a new-to-old list', () => {
    assert.deepEqual(selectCurrentDeployment([newest, deployment()]), expectedNewest)
  })

  test('orders RFC3339 years below 100 without the Date.UTC 1900 offset', () => {
    const yearOne = deployment({ id: 'year-0001', created_on: '0001-01-01T00:00:00Z' })
    const yearOneHundred = deployment({ id: 'year-0100', created_on: '0100-01-01T00:00:00Z' })

    assert.equal(selectCurrentDeployment([yearOne, yearOneHundred]).id, 'year-0100')
    assert.equal(selectCurrentDeployment([yearOneHundred, yearOne]).id, 'year-0100')
  })

  test('rejects multiple deployments tied for the latest timestamp', () => {
    const tiedNewest = deployment({
      id: 'deployment-other-new',
      created_on: '2026-01-31T17:00:00Z',
    })

    assert.throws(
      () => selectCurrentDeployment([deployment(), newest, tiedNewest]),
      /more than one deployment has the latest timestamp/,
    )
  })

  test('rejects a malformed timestamp', () => {
    assert.throws(
      () => selectCurrentDeployment([deployment({ created_on: '2026-02-30T00:00:00Z' })]),
      /created_on is not a valid RFC3339 timestamp/,
    )
    assert.throws(
      () => selectCurrentDeployment([deployment({ created_on: '2026-01-01 00:00:00Z' })]),
      /created_on is not a valid RFC3339 timestamp/,
    )
    assert.throws(
      () => selectCurrentDeployment([deployment({ created_on: '2026-01-01T00:00:00-00:00' })]),
      /created_on is not a valid RFC3339 timestamp/,
    )
    assert.throws(
      () => selectCurrentDeployment([deployment({ created_on: '2026-01-01T00:00:60Z' })]),
      /created_on is not a valid RFC3339 timestamp/,
    )
  })

  test('rejects empty and non-array deployment lists', () => {
    assert.throws(() => selectCurrentDeployment([]), /non-empty array/)
    assert.throws(() => selectCurrentDeployment({ deployments: [] }), /non-empty array/)
  })

  test('rejects missing required fields and malformed version rows', () => {
    assert.throws(() => selectCurrentDeployment([deployment({ id: '' })]), /non-empty string/)
    assert.throws(() => selectCurrentDeployment([deployment({ created_on: undefined })]), /created_on/)
    assert.throws(() => selectCurrentDeployment([deployment({ versions: [] })]), /versions/)
    assert.throws(() => selectCurrentDeployment([deployment({ versions: [{}] })]), /versions\[0\]\.version_id/)
    assert.throws(() => selectCurrentDeployment([deployment({ versions: [{ version_id: 'v' }] })]), /percentage/)
    assert.throws(
      () => selectCurrentDeployment([deployment({ versions: [{ version_id: 'v', percentage: 101 }] })]),
      /percentage/,
    )
  })

  test('parses JSON and returns only allowlisted fields', () => {
    const json = JSON.stringify([{
      id: 'deployment',
      created_on: '2026-03-01T00:00:00.123456Z',
      source: 'direct-upload',
      versions: [{
        version_id: 'version',
        percentage: 100,
        annotations: { ignored: true },
      }],
    }])

    assert.deepEqual(parseCurrentDeploymentJson(json), {
      id: 'deployment',
      created_on: '2026-03-01T00:00:00.123456Z',
      versions: [{ id: 'version', percentage: 100 }],
    })
  })

  test('rejects duplicate JSON members before value collapse', () => {
    const duplicateTopLevelField = '[{"id":"deployment","id":"shadowed","created_on":"2026-03-01T00:00:00Z","versions":[{"version_id":"version","percentage":100}]}]'
    const duplicateEscapedField = '[{"id":"deployment","created_on":"2026-03-01T00:00:00Z","versions":[{"version_id":"version","\\u0070ercentage":100,"percentage":50}]}]'

    assert.throws(() => parseCurrentDeploymentJson(duplicateTopLevelField), /duplicate JSON member: id/)
    assert.throws(() => parseCurrentDeploymentJson(duplicateEscapedField), /duplicate JSON member: percentage/)
  })

  test('reads the deployment list from the file path supplied to the CLI', () => {
    const scriptDirectory = dirname(fileURLToPath(import.meta.url))
    const directory = mkdtempSync(join(scriptDirectory, '.current-deployment-'))
    const inputPath = join(directory, 'deployments.json')

    try {
      writeFileSync(inputPath, `${JSON.stringify([newest])}\n`)
      const result = spawnSync(process.execPath, [join(scriptDirectory, 'current-deployment.mjs'), inputPath], {
        encoding: 'utf8',
      })

      assert.equal(result.status, 0)
      assert.deepEqual(JSON.parse(result.stdout), expectedNewest)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
