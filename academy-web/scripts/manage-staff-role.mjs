#!/usr/bin/env node
import pg from 'pg'
import { assertExclusiveModes, rehearseMutation } from './admin-rehearsal.mjs'

const ROLES = new Set(['owner', 'learner-support', 'privacy-officer', 'content-ops'])

export function parseStaffArgs(argv) {
  const values = new Map()
  let action = null
  let apply = false
  let rehearse = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--enable' || arg === '--disable') action = arg.slice(2)
    else if (arg === '--apply') apply = true
    else if (arg === '--rehearse') rehearse = true
    else if (arg.startsWith('--')) values.set(arg.slice(2), argv[++i])
    else throw new Error(`unexpected argument: ${arg}`)
  }
  const required = ['actor-issuer', 'actor-subject', 'target-issuer', 'target-subject', 'role', 'reference']
  for (const key of required) if (!values.get(key)) throw new Error(`missing --${key}`)
  if (!action) throw new Error('choose --enable or --disable')
  if (!ROLES.has(values.get('role'))) throw new Error('invalid --role')
  if (values.get('reference').trim().length < 8 || values.get('reference').trim().length > 120) {
    throw new Error('--reference must be 8-120 characters')
  }
  return { values, action, apply, rehearse, mode: assertExclusiveModes({ apply, rehearse }) }
}

async function accountId(client, issuer, subject, label) {
  const result = await client.query(
    `select academy.resolve_staff_account($1, $2)::text as account_id`,
    [issuer, subject],
  )
  if (result.rowCount !== 1) throw new Error(`${label} identity did not resolve to one Academy account`)
  return result.rows[0].account_id
}

export async function inspectState(client, actorId, targetId, role) {
  const result = await client.query(
    `select academy.inspect_staff_role($1, $2, $3) as state`,
    [actorId, targetId, role],
  )
  return result.rows[0].state
}

export async function latestAudit(client, actorId, targetId, role) {
  const result = await client.query(
    `select academy.inspect_staff_role_audit($1, $2, $3) as audit`,
    [actorId, targetId, role],
  )
  return result.rows[0].audit
}

export async function main({
  argv = process.argv.slice(2),
  environment = process.env,
  createClient = (connectionString) => new pg.Client({ connectionString }),
  output = console.log,
} = {}) {
  const options = parseStaffArgs(argv)
  const databaseUrl = environment.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required and must not be printed')

  const client = createClient(databaseUrl)
  await client.connect()
  try {
    const identity = await client.query(`select current_user as user_name`)
    if (identity.rows[0].user_name !== 'academy_staff_admin') {
      throw new Error('DATABASE_URL must connect directly as academy_staff_admin')
    }
    const actorId = await accountId(client, options.values.get('actor-issuer'), options.values.get('actor-subject'), 'actor')
    const targetId = await accountId(client, options.values.get('target-issuer'), options.values.get('target-subject'), 'target')
    const role = options.values.get('role')
    const reference = options.values.get('reference').trim()

    if (options.mode === 'inspect') {
      const before = await inspectState(client, actorId, targetId, role)
      output(`dry_run=true action=${options.action} role=${role} actor_authorized=${before.actorAuthorized} currently_active=${before.active}`)
      return
    }

    const stateQuery = () => inspectState(client, actorId, targetId, role)
    const auditQuery = () => latestAudit(client, actorId, targetId, role)
    const mutate = () => client.query(
      `select academy.set_staff_role($1, $2, $3, $4, $5) as changed`,
      [actorId, targetId, role, options.action === 'enable', reference],
    ).then((result) => result.rows[0].changed)
    const expectedActive = options.action === 'enable'

    if (options.mode === 'rehearse') {
      await rehearseMutation({
        client,
        inspectState: stateQuery,
        inspectAudit: auditQuery,
        mutate,
        expectedActive,
        expectedActorAuthorized: role === 'owner' && actorId === targetId && expectedActive ? true : undefined,
        verifyIntendedAudit: (audit) => {
          if (audit === null
            || audit.action !== (expectedActive ? 'granted' : 'revoked')
            || audit.authorizationReference !== reference) {
            throw new Error('in-transaction audit verification failed')
          }
        },
        output: ({ changed }) => output(`rehearsed=true changed=${changed} role=${role} active=${expectedActive}`),
      })
      return
    }

    await client.query('begin')
    const changed = await mutate()
    await client.query('commit')

    const verified = await stateQuery()
    if (verified.active !== expectedActive) throw new Error('post-change assignment verification failed')
    if (changed) {
      if (verified.lastAuditReference !== reference) {
        throw new Error('post-change audit verification failed')
      }
    }
    output(`applied=true changed=${changed} role=${role} active=${expectedActive}`)
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('manage-staff-role.mjs')) {
  await main()
}
