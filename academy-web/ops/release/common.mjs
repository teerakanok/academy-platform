import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const TARGETS_AL_09 = Object.freeze([
  {
    provider: 'cloudflare',
    resource_id: 'worker:cyberskills-academy',
    display: 'Cloudflare Worker cyberskills-academy',
  },
  {
    provider: 'ssh',
    resource_id: 'host:ssh-db.cyberskills.co.th:supabase-db:postgres:academy',
    display: 'Pool A PostgreSQL academy schema on ssh-db',
  },
])

export const TARGETS_AL_21 = Object.freeze([
  {
    provider: 'cloudflare',
    resource_id: 'worker:cyberskills-academy',
    display: 'Cloudflare Worker cyberskills-academy',
  },
])

export function parseArgs(argv) {
  const flags = {
    action: undefined,
    card: undefined,
    migration: undefined,
    dryRun: process.env.OPS_DRY_RUN === '1',
    stateDir: process.env.OPS_STATE_DIR,
    dbUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  }

  const positional = []
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      flags.dryRun = true
    } else if (arg === '--card' && i + 1 < argv.length) {
      flags.card = argv[++i]
    } else if (arg === '--migration' && i + 1 < argv.length) {
      flags.migration = argv[++i]
    } else if (arg === '--state-dir' && i + 1 < argv.length) {
      flags.stateDir = argv[++i]
    } else if (arg === '--db-url' && i + 1 < argv.length) {
      flags.dbUrl = argv[++i]
    } else if (!arg.startsWith('--')) {
      positional.push(arg)
    }
  }

  if (positional.length > 0) {
    if (positional[0].startsWith('AL-')) {
      flags.card = positional[0]
      if (positional.length > 1) {
        flags.action = positional[1]
      }
    } else {
      flags.action = positional[0]
      if (positional.length > 1 && positional[1].startsWith('AL-')) {
        flags.card = positional[1]
      }
    }
  }

  if (!flags.card) {
    flags.card = 'AL-09'
  }

  return flags
}

export function findRepoRoot(startDir = process.cwd()) {
  let curr = resolve(startDir)
  while (curr !== '/') {
    if (existsSync(join(curr, 'academy-web')) && existsSync(join(curr, 'docs'))) {
      return curr
    }
    const parent = resolve(curr, '..')
    if (parent === curr) break
    curr = parent
  }
  return process.cwd()
}

export function getStateDir(card, customDir) {
  if (customDir) {
    if (!existsSync(customDir)) {
      mkdirSync(customDir, { recursive: true, mode: 0o700 })
    }
    return customDir
  }
  const root = findRepoRoot()
  const dir = join(root, 'academy-web', 'ops', 'runbooks', 'state', card)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  return dir
}

export function saveState(card, key, data, customDir) {
  const dir = getStateDir(card, customDir)
  const file = join(dir, `${key}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  return file
}

export function loadState(card, key, customDir) {
  const dir = getStateDir(card, customDir)
  const file = join(dir, `${key}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function outputCheck(status, observed) {
  const payload = {
    status, // 'matches_expected' | 'not_applied' | 'unknown'
    observed,
  }
  process.stdout.write(JSON.stringify(payload) + '\n')
}
