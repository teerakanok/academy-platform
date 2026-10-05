#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import pg from 'pg'

export const LAUNCH_VISIBILITY = Object.freeze({
  'basic-os-linux': 'published',
  'git-essentials': 'published',
  assembly: 'unpublished',
  'c-low-level': 'unpublished',
  'computer-architecture': 'unpublished',
  'computer-networking': 'unpublished',
  'operating-systems': 'unpublished',
  'setup-and-environment': 'unpublished',
})

const MODES = new Set(['snapshot', 'apply', 'rollback', 'check'])
const PHASES = new Set(['snapshot', 'launch', 'rollback'])
const OUTPUT_FILE = 'course-settings-snapshot.json'

function requireValue(argv, index, name) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} must have a value`)
  return value
}

export function parseCourseVisibilityArgs(argv) {
  const options = {
    mode: undefined,
    phase: 'snapshot',
    outputDir: undefined,
    approvalReference: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--mode') {
      options.mode = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--phase') {
      options.phase = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--output-dir') {
      options.outputDir = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--approval-reference') {
      options.approvalReference = requireValue(argv, index, argument)
      index += 1
    } else {
      throw new Error(`unknown course visibility argument: ${argument}`)
    }
  }
  if (!MODES.has(options.mode)) throw new Error('--mode must be snapshot, apply, rollback, or check')
  if (!PHASES.has(options.phase)) throw new Error('--phase must be snapshot, launch, or rollback')
  if (!options.outputDir) throw new Error('--output-dir is required')
  if ((options.mode === 'apply' || options.mode === 'rollback') && !options.approvalReference) {
    throw new Error('--approval-reference is required for apply and rollback')
  }
  if (options.mode === 'check' && options.phase === 'snapshot' && options.approvalReference) {
    throw new Error('--approval-reference is not used by snapshot checks')
  }
  const reference = options.approvalReference?.trim()
  if (reference && (reference.length < 8 || reference.length > 120)) {
    throw new Error('--approval-reference must be 8-120 characters')
  }
  return { ...options, approvalReference: reference }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function launchShape(effectiveVisibility) {
  const expected = Object.entries(LAUNCH_VISIBILITY)
  const actual = Object.entries(effectiveVisibility ?? {})
  return expected.length === actual.length
    && expected.every(([slug, visibility]) => effectiveVisibility?.[slug] === visibility)
}

async function inspect(client) {
  const result = await client.query('select academy.inspect_launch_course_visibility() as result')
  const value = result.rows[0]?.result
  if (!value?.state || !value?.stateSha256 || !value?.effectiveVisibility) {
    throw new Error('course visibility inspection returned an invalid envelope')
  }
  return value
}

async function readSnapshot(outputDir) {
  const path = `${outputDir.replace(/\/+$/, '')}/${OUTPUT_FILE}`
  const raw = await readFile(path, 'utf8')
  const expectedHash = JSON.parse(await readFile(`${path}.sha256`, 'utf8')).sha256
  const snapshot = JSON.parse(raw)
  if (snapshot?.schema !== 'academy-launch-course-settings/v1'
    || !Array.isArray(snapshot.state)
    || !/^[0-9a-f]{64}$/.test(snapshot.stateSha256 ?? '')) {
    throw new Error('protected course visibility snapshot is invalid')
  }
  if (sha256(raw) !== expectedHash) throw new Error('protected course visibility snapshot hash mismatch')
  return { path, snapshot }
}

async function writeProtectedJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const encoded = `${JSON.stringify(value, undefined, 2)}\n`
  try {
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(encoded, 'utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const existing = JSON.parse(await readFile(path, 'utf8'))
    if (sha256(JSON.stringify(existing, undefined, 2) + '\n') !== sha256(encoded)) {
      throw new Error(`protected output already exists with different content: ${dirname(path)}`)
    }
  }
  return { path, fileSha256: sha256(encoded) }
}

function checkEnvelope(status, observed) {
  return `${JSON.stringify({ status, observed })}\n`
}

async function requireLaunchOperator(client) {
  const result = await client.query(
    'select pg_has_role(current_user, $1, $2) as authorized',
    ['academy_staff_admin', 'member'],
  )
  if (result.rows[0]?.authorized !== true) {
    throw new Error('database credential is not a member of academy_staff_admin')
  }
}

export async function runCourseVisibilityOperation({
  argv,
  environment = process.env,
  createClient = (connectionString) => new pg.Client({ connectionString }),
  output = process.stdout,
  now = () => new Date(),
} = {}) {
  const options = parseCourseVisibilityArgs(argv)
  const credential = environment.ACADEMY_LAUNCH_DATABASE_CREDENTIAL
  if (!credential) throw new Error('ACADEMY_LAUNCH_DATABASE_CREDENTIAL is required and never printed')
  const outputDir = options.outputDir.replace(/\/+$/, '')
  const client = createClient(credential)
  await client.connect()
  try {
    await requireLaunchOperator(client)
    const current = await inspect(client)

    if (options.mode === 'snapshot') {
      const snapshot = {
        schema: 'academy-launch-course-settings/v1',
        capturedAt: now().toISOString(),
        state: current.state,
        stateSha256: current.stateSha256,
        effectiveVisibility: current.effectiveVisibility,
      }
      const written = await writeProtectedJson(`${outputDir}/${OUTPUT_FILE}`, snapshot)
      await writeProtectedJson(`${outputDir}/${OUTPUT_FILE}.sha256`, { sha256: written.fileSha256 })
      await writeProtectedJson(`${outputDir}/course-settings-summary.json`, {
        schema: 'academy-launch-course-settings-summary/v1',
        fileSha256: written.fileSha256,
        rows: current.state.map((row) => ({
          courseSlug: row.courseSlug,
          exists: row.exists,
          visibility: row.visibility,
          hasTitleOverride: row.titleOverride != null,
          hasSubtitleOverride: row.subtitleOverride != null,
        })),
      })
      output.write(`${JSON.stringify({
        applied: true,
        snapshot: 'created-or-already-present',
        stateSha256: current.stateSha256,
      })}\n`)
      return
    }

    if (options.mode === 'check') {
      let snapshot
      try {
        ;({ snapshot } = await readSnapshot(outputDir))
      } catch {
        output.write(checkEnvelope('not_applied', {
          phase: options.phase,
          reason: 'snapshot-missing-or-invalid',
        }))
        return
      }
      if (options.phase === 'snapshot') {
        const matches = current.stateSha256 === snapshot.stateSha256
        output.write(checkEnvelope(
          matches ? 'matches_expected' : 'not_applied',
          { phase: 'snapshot', snapshotValid: true, stateMatchesSnapshot: matches },
        ))
        return
      }
      if (options.phase === 'launch') {
        const matches = launchShape(current.effectiveVisibility)
          && current.latestAudit?.action === 'launch'
          && current.latestAudit?.approvalReference === options.approvalReference
        output.write(checkEnvelope(
          matches ? 'matches_expected' : 'not_applied',
          {
            phase: 'launch',
            founderLaunchShape: matches,
            auditAction: current.latestAudit?.action ?? 'none',
          },
        ))
        return
      }
      const matches = current.stateSha256 === snapshot.stateSha256
        && current.latestAudit?.action === 'rollback'
        && current.latestAudit?.approvalReference === options.approvalReference
      output.write(checkEnvelope(
        matches ? 'matches_expected' : 'not_applied',
        {
          phase: 'rollback',
          stateMatchesSnapshot: current.stateSha256 === snapshot.stateSha256,
          auditAction: current.latestAudit?.action ?? 'none',
        },
      ))
      return
    }

    const { snapshot } = await readSnapshot(outputDir)
    const rollback = options.mode === 'rollback'
    const alreadyApplied = rollback
      ? current.stateSha256 === snapshot.stateSha256
        && current.latestAudit?.action === 'rollback'
        && current.latestAudit?.approvalReference === options.approvalReference
      : launchShape(current.effectiveVisibility)
        && current.latestAudit?.action === 'launch'
        && current.latestAudit?.approvalReference === options.approvalReference
    if (alreadyApplied) {
      output.write(`${JSON.stringify({
        applied: true,
        changed: false,
        action: options.mode,
        auditReferenceMatches: true,
      })}\n`)
      return
    }
    if (!rollback && current.stateSha256 !== snapshot.stateSha256) {
      throw new Error('live course state differs from the protected pre-launch snapshot')
    }
    if (rollback && current.stateSha256 === snapshot.stateSha256) {
      throw new Error('live course state already matches baseline without a matching rollback audit')
    }

    const result = await client.query(
      'select academy.set_launch_course_visibility($1, $2, $3, $4, $5) as result',
      [
        rollback ? null : LAUNCH_VISIBILITY,
        rollback ? snapshot.state : null,
        options.approvalReference,
        current.stateSha256,
        rollback,
      ],
    )
    const value = result.rows[0]?.result
    if (value?.changed !== true && value?.auditWritten !== true) {
      throw new Error('course visibility RPC did not return an audited result')
    }
    const verified = await inspect(client)
    if (verified.stateSha256 !== value.stateSha256) {
      throw new Error('course visibility post-change hash mismatch')
    }
    output.write(`${JSON.stringify({
      applied: true,
      changed: value.changed !== false,
      action: value.action,
      stateSha256: value.stateSha256,
      auditWritten: value.auditWritten !== false,
    })}\n`)
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('ops/launch/course-visibility.mjs')) {
  runCourseVisibilityOperation().catch((error) => {
    process.stderr.write(`COURSE_VISIBILITY_OPERATION_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}
