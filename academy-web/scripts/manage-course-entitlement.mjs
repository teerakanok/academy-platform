#!/usr/bin/env node
import pg from 'pg'
import { assertExclusiveModes, rehearseMutation } from './admin-rehearsal.mjs'

const CANONICAL_SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const COURSE_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/
const EMAIL = /^\S+@\S+\.\S+$/
const SOURCES = new Set(['invitation', 'grant'])

function parseArgs(argv) {
  const values = new Map()
  let action = null
  let apply = false
  let rehearse = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--grant' || argument === '--revoke') action = argument.slice(2)
    else if (argument === '--apply') apply = true
    else if (argument === '--rehearse') rehearse = true
    else if (argument.startsWith('--')) values.set(argument.slice(2), argv[++index])
    else throw new Error(`unexpected argument: ${argument}`)
  }
  if (!action) throw new Error('choose --grant or --revoke')
  const required = [
    'actor-issuer',
    'actor-subject',
    'target-issuer',
    'target-subject',
    'course',
    'source',
    'reference',
  ]
  for (const key of required) if (!values.get(key)) throw new Error(`missing --${key}`)
  for (const key of ['actor-subject', 'target-subject']) {
    if (!CANONICAL_SUBJECT.test(values.get(key))) throw new Error(`--${key} must be a canonical UUID subject`)
  }
  for (const key of ['actor-issuer', 'target-issuer']) validateIssuer(values.get(key), key)
  if (!COURSE_SLUG.test(values.get('course'))) throw new Error('--course must be a bounded course slug')
  if (!SOURCES.has(values.get('source'))) throw new Error('--source must be invitation or grant')
  const reference = values.get('reference').trim()
  if (reference.length < 8 || reference.length > 120) throw new Error('--reference must be 8-120 characters')
  for (const key of ['actor-email-hint', 'target-email-hint']) {
    const email = values.get(key)
    if (email !== undefined && (!EMAIL.test(email) || email !== email.trim().toLowerCase() || email.length > 320)) {
      throw new Error(`--${key} must be a lowercase normalized email hint`)
    }
  }
  let expiresAt = null
  if (action === 'grant' && values.has('expires-at')) {
    const parsed = new Date(values.get('expires-at'))
    if (values.get('expires-at').length > 40 || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new Error('--expires-at must be a bounded future RFC 3339 timestamp')
    }
    expiresAt = parsed.toISOString()
  }
  return {
    values,
    action,
    apply,
    rehearse,
    mode: assertExclusiveModes({ apply, rehearse }),
    reference,
    expiresAt,
  }
}

function validateIssuer(value, key) {
  let issuer
  try {
    issuer = new URL(value)
  } catch {
    throw new Error(`--${key} must be a valid HTTPS issuer URL`)
  }
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new Error(`--${key} must be a bare HTTPS issuer URL`)
  }
  if (value.length > 2048) throw new Error(`--${key} must be at most 2048 characters`)
}

async function accountId(client, issuer, subject, emailHint, label) {
  const result = await client.query(
    `select academy.resolve_entitlement_account($1, $2, $3)::text as account_id`,
    [issuer, subject, emailHint ?? null],
  )
  if (result.rowCount !== 1) throw new Error(`${label} identity did not resolve to one Academy account`)
  return result.rows[0].account_id
}

export const internals = { parseArgs, validateIssuer }

async function inspectState(client, actorId, targetId, course) {
  const result = await client.query(
    `select academy.inspect_course_entitlement($1, $2, $3) as state`,
    [actorId, targetId, course],
  )
  return result.rows[0].state
}

async function latestAudit(client, actorId, targetId, course) {
  const result = await client.query(
    `select academy.inspect_course_entitlement_audit($1, $2, $3) as audit`,
    [actorId, targetId, course],
  )
  return result.rows[0].audit
}

async function main() {
  await runMain({ argv: process.argv.slice(2), environment: process.env })
}

/**
 * Dependencies expose only the database operations used by this command.
 * @param {{ argv?: string[], environment?: { DATABASE_URL?: string },
 *   createClient?: (connectionString: string) => {
 *     connect: () => Promise<void>, end: () => Promise<void>,
 *     query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[], rowCount: number | null }>
 *   }, output?: (line: string) => void }} [dependencies]
 */
export async function runMain({
  argv = process.argv.slice(2),
  environment = process.env,
  createClient = (connectionString) => new pg.Client({ connectionString }),
  output = console.log,
} = {}) {
  const options = parseArgs(argv)
  const databaseUrl = environment.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required and must not be printed')
  const client = createClient(databaseUrl)
  await client.connect()
  try {
    const identity = await client.query(`select current_user as user_name`)
    if (identity.rows[0].user_name !== 'academy_entitlement_operator') {
      throw new Error('DATABASE_URL must connect directly as academy_entitlement_operator')
    }
    const actorId = await accountId(
      client,
      options.values.get('actor-issuer'),
      options.values.get('actor-subject'),
      options.values.get('actor-email-hint'),
      'actor',
    )
    const targetId = await accountId(
      client,
      options.values.get('target-issuer'),
      options.values.get('target-subject'),
      options.values.get('target-email-hint'),
      'target',
    )
    const course = options.values.get('course')
    if (options.mode === 'inspect') {
      const inspection = await inspectState(client, actorId, targetId, course)
      output(
        `dry_run=true action=${options.action} actor_authorized=${inspection.actorAuthorized} active=${inspection.active} course=${course} target_account=${targetId}`,
      )
      return
    }

    const stateQuery = () => inspectState(client, actorId, targetId, course)
    const auditQuery = () => latestAudit(client, actorId, targetId, course)
    const mutate = () => client.query(
      `select academy.set_course_entitlement($1, $2, $3, $4, $5, $6, $7) as changed`,
      [
        actorId,
        targetId,
        course,
        options.action === 'grant',
        options.values.get('source'),
        options.expiresAt,
        options.reference,
      ],
    ).then((result) => result.rows[0].changed)
    const expectedActive = options.action === 'grant'

    if (options.mode === 'rehearse') {
      await rehearseMutation({
        client,
        inspectState: stateQuery,
        inspectAudit: auditQuery,
        mutate,
        expectedActive,
        verifyIntendedAudit: (audit) => {
          if (audit === null
            || audit.action !== (expectedActive ? 'granted' : 'revoked')
            || audit.authorizationReference !== options.reference) {
            throw new Error('in-transaction audit verification failed')
          }
        },
        output: ({ changed }) => output(
          `rehearsed=true changed=${changed} action=${options.action} course=${course}`,
        ),
      })
      return
    }

    await client.query('begin')
    const changed = await mutate()
    await client.query('commit')
    output(
      `applied=true changed=${changed} action=${options.action} course=${course}`,
    )
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('manage-course-entitlement.mjs')) {
  await main()
}
