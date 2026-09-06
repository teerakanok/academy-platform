#!/usr/bin/env node
import pg from 'pg'

const CANONICAL_SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const COURSE_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/
const EMAIL = /^\S+@\S+\.\S+$/
const SOURCES = new Set(['invitation', 'grant'])

function parseArgs(argv) {
  const values = new Map()
  let action = null
  let apply = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--grant' || argument === '--revoke') action = argument.slice(2)
    else if (argument === '--apply') apply = true
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
  return { values, action, apply, reference, expiresAt }
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required and must not be printed')
  const client = new pg.Client({ connectionString: databaseUrl })
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
    const inspection = await client.query(
      `select academy.inspect_course_entitlement($1, $2, $3) as state`,
      [actorId, targetId, options.values.get('course')],
    )
    if (!options.apply) {
      console.log(
        `dry_run=true action=${options.action} actor_authorized=${inspection.rows[0].state.actorAuthorized} active=${inspection.rows[0].state.active} course=${options.values.get('course')} target_account=${targetId}`,
      )
      return
    }
    await client.query('begin')
    const changed = await client.query(
      `select academy.set_course_entitlement($1, $2, $3, $4, $5, $6, $7) as changed`,
      [
        actorId,
        targetId,
        options.values.get('course'),
        options.action === 'grant',
        options.values.get('source'),
        options.expiresAt,
        options.reference,
      ],
    )
    await client.query('commit')
    console.log(
      `applied=true changed=${changed.rows[0].changed} action=${options.action} course=${options.values.get('course')}`,
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
