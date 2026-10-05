#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

function localDatabaseUrl(value) {
  const url = new URL(value)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('course visibility rehearsal must point at a loopback PostgreSQL database')
  }
  return value
}

function run(args, credential) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', args, {
      cwd: resolve(process.cwd(), 'academy-web'),
      env: {
        ...process.env,
        ACADEMY_LAUNCH_DATABASE_CREDENTIAL: credential,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
  })
}

async function main(argv) {
  const outputDir = argv[0]
  const credential = process.env.ACADEMY_LAUNCH_DATABASE_CREDENTIAL
  if (!outputDir || argv.some((argument) => argument.startsWith('-')) || !credential) {
    throw new Error('usage: ACADEMY_LAUNCH_DATABASE_CREDENTIAL=<loopback-url> rehearse-course-visibility.mjs <output-dir>')
  }
  localDatabaseUrl(credential)
  const client = new pg.Client({ connectionString: credential })
  await client.connect()
  try {
    const { rows: functionRows } = await client.query(
      "select to_regfunction('academy.inspect_launch_course_visibility()') as present",
    )
    if (functionRows[0]?.present === null) {
      throw new Error('migration 0043 is absent; reset the disposable local database first')
    }
    const { rows: ownerRows } = await client.query(
      "select count(*)::int as count from academy.staff_role_assignment where role = 'owner' and revoked_at is null",
    )
    if (ownerRows[0].count === 0) {
      const subject = randomUUID()
      const { rows } = await client.query(
        `with account as (
           insert into academy.users(issuer, subject, email)
           values ($1, $2, $3)
           returning id
         )
         insert into academy.staff_role_assignment(account_id, role, granted_by)
         select id, 'owner', id from account
         returning account_id`,
        ['https://academy-launch-rehearsal.local', subject, `launch-${subject}@example.test`],
      )
      if (rows.length !== 1) throw new Error('local rehearsal owner bootstrap failed')
    } else if (ownerRows[0].count !== 1) {
      throw new Error('local rehearsal requires zero or one active owner')
    }
  } finally {
    await client.end()
  }

  const script = 'ops/launch/course-visibility.mjs'
  const reference = 'AL10-REHEARSAL-20261005'
  const commands = [
    ['snapshot', ['node', script, '--mode', 'snapshot', '--output-dir', outputDir]],
    ['check-snapshot', ['node', script, '--mode', 'check', '--phase', 'snapshot', '--output-dir', outputDir]],
    ['apply', ['node', script, '--mode', 'apply', '--approval-reference', reference, '--output-dir', outputDir]],
    ['check-launch', ['node', script, '--mode', 'check', '--phase', 'launch', '--approval-reference', reference, '--output-dir', outputDir]],
    ['rollback', ['node', script, '--mode', 'rollback', '--approval-reference', reference, '--output-dir', outputDir]],
    ['check-rollback', ['node', script, '--mode', 'check', '--phase', 'rollback', '--approval-reference', reference, '--output-dir', outputDir]],
  ]
  const results = []
  for (const [name, args] of commands) {
    const result = await run(args, credential)
    results.push({ name, exitCode: result.code, stdout: result.stdout.trim(), stderr: result.stderr.trim() })
    if (result.code !== 0) throw new Error(`${name} failed with exit ${result.code}`)
  }
  const receipt = {
    schema: 'academy-launch-course-visibility-rehearsal/v1',
    database: 'loopback-postgres',
    productionCall: false,
    results,
  }
  await mkdir(outputDir, { recursive: true, mode: 0o700 })
  const path = `${outputDir.replace(/\/+$/, '')}/course-visibility-rehearsal.json`
  const handle = await open(path, 'wx', 0o600)
  await handle.writeFile(`${JSON.stringify(receipt, undefined, 2)}\n`, 'utf8')
  await handle.close()
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

if (process.argv[1] && process.argv[1].endsWith('ops/launch/rehearse-course-visibility.mjs')) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`COURSE_VISIBILITY_REHEARSAL_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}
