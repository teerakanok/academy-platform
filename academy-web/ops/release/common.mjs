import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

export const RELEASES = Object.freeze({
  'AL-09': Object.freeze({
    commit: 'cfa59b4df7db480a7254f35dcea7fb98bbfdc58d',
    worker: 'cyberskills-academy',
  }),
  'AL-21': Object.freeze({
    commit: '00f07ed1528b04b755b8da5e0703aa4c3143df36',
    worker: 'cyberskills-academy',
  }),
})

export function parseArgs(argv) {
  const flags = {
    action: 'run', card: 'AL-09', commit: undefined, dryRun: false,
    migration: undefined, sourceDir: undefined, stateDir: undefined, dbUrl: undefined,
  }
  const positional = []
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') flags.dryRun = true
    else if (['--card', '--commit', '--migration', '--source-dir', '--state-dir', '--db-url'].includes(argument)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
      const key = {
        '--card': 'card', '--commit': 'commit', '--migration': 'migration',
        '--source-dir': 'sourceDir', '--state-dir': 'stateDir', '--db-url': 'dbUrl',
      }[argument]
      flags[key] = value
    } else if (!argument.startsWith('--') && positional.length < 2) positional.push(argument)
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (positional.length === 1) flags.action = positional[0]
  else if (positional.length === 2) {
    if (positional[0].startsWith('AL-')) [flags.card, flags.action] = positional
    else [flags.action, flags.card] = positional
  } else if (positional.length > 2) throw new Error('too many positional arguments')
  if (!RELEASES[flags.card]) throw new Error(`unknown release card: ${flags.card}`)
  if (flags.action !== 'run' && flags.action !== 'check') throw new Error(`unknown action: ${flags.action}`)
  flags.commit = RELEASES[flags.card].commit
  return flags
}

export function findRepoRoot(startDir = process.cwd()) {
  let current = resolve(startDir)
  while (current !== '/') {
    if (existsSync(join(current, 'academy-web/package.json')) && existsSync(join(current, 'AGENTS.md'))) return current
    current = resolve(current, '..')
  }
  throw new Error('Academy repository root not found')
}

export function getStateDir(card, customDir) {
  const directory = customDir ?? join(findRepoRoot(), 'academy-web/ops/runbooks/state', card)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return directory
}

export function sourceDirectory(args) {
  return args.sourceDir ?? join(getStateDir(args.card, args.stateDir), 'source')
}

export function saveState(card, key, data, customDir) {
  const file = join(getStateDir(card, customDir), `${key}.json`)
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

export function loadState(card, key, customDir) {
  const file = join(getStateDir(card, customDir), `${key}.json`)
  if (!existsSync(file)) return null
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function outputCheck(status, observed) {
  if (!['matches_expected', 'not_applied', 'unknown'].includes(status)) throw new Error('invalid check status')
  process.stdout.write(`${JSON.stringify({ status, observed })}\n`)
}

function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: options.timeoutMs ?? 30_000, maxBuffer: 32 * 1024 * 1024,
  })
}

function sourceInventory(root, commit) {
  const raw = git(root, ['ls-tree', '-r', '-z', commit, 'academy-web/'], { timeoutMs: 60_000 })
  return raw.split('\0').filter(Boolean).map((entry) => {
    const [metadata, path] = entry.split('\t')
    const [mode, type, oid] = metadata.split(' ')
    if (!path || type !== 'blob' || !/^\d{6}$/.test(mode) || !/^[0-9a-f]{40}$/.test(oid)) {
      throw new Error('invalid pinned source inventory')
    }
    return { mode, oid, path }
  })
}

function fileSha1(path, metadata) {
  const content = metadata.mode === '120000'
    ? Buffer.from(readlinkSync(path), 'utf8')
    : readFileSync(path)
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

function archiveSha256(root, commit, archivePath) {
  rmSync(archivePath, { force: true })
  execFileSync('git', ['-C', root, 'archive', '--format=tar', '--prefix=academy-web/', '--output', archivePath, `${commit}:academy-web/`], {
    timeout: 90_000, maxBuffer: 1024 * 1024,
  })
  return createHash('sha256').update(readFileSync(archivePath)).digest('hex')
}

function verifyInventory(sourceRoot, inventory) {
  for (const entry of inventory) {
    const path = join(sourceRoot, entry.path)
    const metadata = lstatSync(path)
    if ((entry.mode === '120000') !== metadata.isSymbolicLink()) throw new Error('pinned source shape changed')
    if (entry.mode !== '120000' && (metadata.mode & 0o777) !== (Number.parseInt(entry.mode, 8) & 0o777)) {
      throw new Error('pinned source mode changed')
    }
    if (fileSha1(path, entry) !== entry.oid) throw new Error('pinned source hash changed')
  }
}

export function prepareSourceSnapshot(args) {
  const root = findRepoRoot()
  const stateDir = getStateDir(args.card, args.stateDir)
  const sourceRoot = sourceDirectory(args)
  const archivePath = join(stateDir, 'source.tar')
  const expectedHead = git(root, ['rev-parse', '--verify', `${args.commit}^{commit}`]).trim()
  if (expectedHead !== args.commit) throw new Error('release commit is ambiguous')
  const tree = git(root, ['rev-parse', '--verify', `${args.commit}^{tree}`]).trim()
  const digest = archiveSha256(root, args.commit, archivePath)
  const existing = loadState(args.card, 'source', args.stateDir)
  if (existing?.commit === args.commit && existing?.tree_oid === tree) {
    verifyInventory(sourceRoot, existing.inventory)
    return { sourceRoot, receipt: existing, unchanged: true }
  }
  rmSync(sourceRoot, { recursive: true, force: true })
  mkdirSync(sourceRoot, { recursive: true, mode: 0o700 })
  execFileSync('tar', ['-xf', archivePath, '-C', sourceRoot], { timeout: 120_000, maxBuffer: 1024 * 1024 })
  const inventory = sourceInventory(root, args.commit)
  verifyInventory(sourceRoot, inventory)
  const receipt = {
    card: args.card, commit: args.commit, tree_oid: tree, archive_sha256: digest,
    file_count: inventory.length, prepared_at: new Date().toISOString(), inventory,
  }
  saveState(args.card, 'source', receipt, args.stateDir)
  return { sourceRoot, receipt, unchanged: false }
}

export function requireSourceSnapshot(args) {
  const receipt = loadState(args.card, 'source', args.stateDir)
  const sourceRoot = sourceDirectory(args)
  if (receipt?.commit !== args.commit || !Array.isArray(receipt.inventory)) return { receipt: null, sourceRoot }
  const root = findRepoRoot()
  const tree = git(root, ['rev-parse', '--verify', `${args.commit}^{tree}`]).trim()
  if (receipt.tree_oid !== tree) return { receipt: null, sourceRoot }
  if (args.dryRun) return { receipt, sourceRoot }
  verifyInventory(sourceRoot, receipt.inventory)
  return { receipt, sourceRoot }
}

export function safeError(error) {
  return error && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'operation_failed'
}
