#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { findRepoRoot, parseArgs, saveState } from './common.mjs'

const SSH_HOST = 'root@ssh-db.cyberskills.co.th'
const WORKER = 'cyberskills-academy'

function childEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin',
    HOME: process.env.HOME ?? '/tmp', LANG: 'C', LC_ALL: 'C',
    ...(process.env.CLOUDFLARE_API_TOKEN ? { CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN } : {}),
  }
}

function cloudflareIdentity() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required')
  const path = join(findRepoRoot(), 'academy-web/node_modules/.bin/wrangler')
  if (!existsSync(path)) throw new Error('repository wrangler is not installed')
  const deployments = JSON.parse(execFileSync(path, ['deployments', 'list', '--name', WORKER, '--json'], {
    encoding: 'utf8', timeout: 30_000, env: childEnv(),
  }))
  if (!Array.isArray(deployments) || deployments.length === 0) throw new Error('Cloudflare deployment identity is absent')
  return { worker: WORKER, deployment_count: deployments.length }
}

function postgresIdentity() {
  if (process.env.SSH_AUTH_SOCK === undefined) throw new Error('SSH_AUTH_SOCK is required')
  const identity = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', SSH_HOST,
      'docker exec -i supabase-db psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At -F "|"'],
    { input: "select current_database(), current_user, 'academy';", encoding: 'utf8', timeout: 30_000 },
  ).trim()
  const [database, user, schema] = identity.split('|')
  if (database !== 'postgres' || user !== 'supabase_admin' || schema !== 'academy') {
    throw new Error('PostgreSQL target identity mismatch')
  }
  return { host: SSH_HOST, container: 'supabase-db', database, schema, observed: true }
}

const args = parseArgs(process.argv)
try {
  const observed = args.dryRun ? {
    cloudflare: { worker: WORKER, observed: true },
    ...(args.card === 'AL-09'
      ? { postgres: { host: SSH_HOST, container: 'supabase-db', database: 'postgres', schema: 'academy', observed: true } }
      : {}),
  } : {
    cloudflare: cloudflareIdentity(),
    ...(args.card === 'AL-09' ? { postgres: postgresIdentity() } : {}),
  }
  const receipt = {
    targets: [
      { provider: 'cloudflare', resource_id: `worker:${WORKER}` },
      ...(args.card === 'AL-09'
        ? [{ provider: 'ssh', resource_id: 'host:ssh-db.cyberskills.co.th:supabase-db:postgres:academy' }]
        : []),
    ],
    observed, verified_at: new Date().toISOString(), dry_run: args.dryRun,
  }
  saveState(args.card, 'target-identity', receipt, args.stateDir)
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
} catch (error) {
  process.stderr.write(`target-identity error: ${error?.code ?? 'operation_failed'}\n`)
  process.exitCode = 1
}
