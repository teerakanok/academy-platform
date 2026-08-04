#!/usr/bin/env node
import pg from 'pg'

const ROLES = new Set(['owner', 'learner-support', 'privacy-officer', 'content-ops'])

function parseArgs(argv) {
  const values = new Map()
  let action = null
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--enable' || arg === '--disable') action = arg.slice(2)
    else if (arg === '--apply') apply = true
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
  return { values, action, apply }
}

async function accountId(client, issuer, subject, label) {
  const result = await client.query(
    `select id from academy.users where issuer = $1 and subject = $2`,
    [issuer, subject],
  )
  if (result.rowCount !== 1) throw new Error(`${label} identity did not resolve to exactly one Academy account`)
  return result.rows[0].id
}

const { values, action, apply } = parseArgs(process.argv.slice(2))
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required and must not be printed')

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  const actorId = await accountId(client, values.get('actor-issuer'), values.get('actor-subject'), 'actor')
  const targetId = await accountId(client, values.get('target-issuer'), values.get('target-subject'), 'target')
  const before = await client.query(
    `select revoked_at is null as active from academy.staff_role_assignment where account_id = $1 and role = $2`,
    [targetId, values.get('role')],
  )

  if (!apply) {
    console.log(`dry_run=true action=${action} role=${values.get('role')} currently_active=${before.rows[0]?.active === true}`)
    process.exit(0)
  }

  await client.query('begin')
  await client.query('set local role academy_staff_admin')
  const changed = await client.query(
    `select academy.set_staff_role($1, $2, $3, $4, $5) as changed`,
    [actorId, targetId, values.get('role'), action === 'enable', values.get('reference').trim()],
  )
  await client.query('commit')

  const verified = await client.query(
    `select revoked_at is null as active from academy.staff_role_assignment where account_id = $1 and role = $2`,
    [targetId, values.get('role')],
  )
  const expectedActive = action === 'enable'
  if (verified.rows[0]?.active !== expectedActive) throw new Error('post-change assignment verification failed')
  if (changed.rows[0].changed) {
    const audit = await client.query(
      `select exists (
         select 1 from academy.staff_role_audit
          where account_id = $1 and role = $2 and actor_account_id = $3
            and action = $4 and authorization_reference = $5
       ) as recorded`,
      [targetId, values.get('role'), actorId, action === 'enable' ? 'granted' : 'revoked', values.get('reference').trim()],
    )
    if (!audit.rows[0].recorded) throw new Error('post-change audit verification failed')
  }
  console.log(`applied=true changed=${changed.rows[0].changed} role=${values.get('role')} active=${expectedActive}`)
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
