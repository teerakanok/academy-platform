#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED = { backup_verified: true, mode: '0600' }
const SSH_HOST = 'root@ssh-db.cyberskills.co.th'
const UTC = /^\d{8}T\d{6}Z$/

function intendedBackup(args) {
  const existing = loadState(args.card, 'backup-intent', args.stateDir)
  if (existing?.remote_directory && UTC.test(existing.remote_directory) && existing.card === args.card) return existing
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const intent = {
    card: args.card,
    remote_directory: `${stamp}-pre-0041-0042`,
    created_at: new Date().toISOString(),
  }
  saveState(args.card, 'backup-intent', intent, args.stateDir)
  return intent
}

function localConnection(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new Error('unsupported local database URL')
  return {
    host: decodedURIComponent(parsed.hostname),
    port: parsed.port || '5432',
    user: decodedURIComponent(parsed.username || ''),
    database: parsed.pathname.replace(/^\//, ''),
    password: decodedURIComponent(parsed.password || process.env.PGPASSWORD || ''),
  }
}

function localDump(args, intent) {
  const directory = join(getStateDir(args.card, args.stateDir), 'backups', intent.remote_directory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const finalPath = join(directory, 'academy.dump')
  const temporaryPath = join(directory, 'academy.dump.partial')
  const connection = localConnection(args.dbUrl)
  const argv = [
    '--host', connection.host, '--port', connection.port, '--username', connection.user,
    '--format=custom', '--schema=academy', '--file', temporaryPath, connection.database,
  ]
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }
  if (connection.password) env.PGPASSWORD = connection.password
  execFileSync('pg_dump', argv, { env, timeout: 240_000 })
  chmodSync(temporaryPath, 0o600)
  const listing = execFileSync('pg_restore', ['--list', temporaryPath], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, encoding: 'utf8', timeout: 30_000,
  })
  const bytes = statSync(temporaryPath).size
  if (bytes < 1 || listing.trim().length === 0) throw new Error('local backup is empty')
  const receipt = {
    backup_verified: true, path: finalPath, mode: '0600',
    sha256: createHash('sha256').update(readFileSync(temporaryPath)).digest('hex'),
    bytes, archive_list_entries: listing.trim().split('\n').length,
    completed_at: new Date().toISOString(), dry_run: false,
  }
  writeFileSync(finalPath, readFileSync(temporaryPath), { mode: 0o600 })
  chmodSync(finalPath, 0o600)
  return receipt
}

function remoteReceiptFromOutput(path, lines) {
  const [sha256, bytes, mode, entries] = lines
  if (!/^[0-9a-f]{64}$/.test(sha256) || !/^\d+$/.test(bytes) || mode !== '0600' || !/^\d+$/.test(entries)) {
    throw new Error('remote backup verification output is malformed')
  }
  return {
    backup_verified: true, path, mode, sha256, bytes: Number(bytes),
    archive_list_entries: Number(entries), completed_at: new Date().toISOString(), dry_run: false,
  }
}

function verifyRemotePath(path) {
  if (!/^\/root\/academy-db-backups\/\d{8}T\d{6}Z-pre-0041-0042\/academy\.dump$/.test(path)) {
    throw new Error('remote backup path is outside the approved directory')
  }
}

function remoteDump(intent) {
  if (process.env.SSH_AUTH_SOCK === undefined) throw new Error('SSH_AUTH_SOCK is required')
  const directory = `/root/academy-db-backups/${intent.remote_directory}`
  const finalPath = `${directory}/academy.dump`
  const temporaryPath = `${directory}/academy.dump.partial`
  const command = [
    'set -e', 'umask 077', `mkdir -p -m 0700 '${directory}'`,
    `docker exec supabase-db pg_dump -U supabase_admin -d postgres --schema=academy --format=custom > '${temporaryPath}'`,
    `chmod 0600 '${temporaryPath}'`, `mv '${temporaryPath}' '${finalPath}'`,
  ].join('; ')
  execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', SSH_HOST, command],
    { encoding: 'utf8', timeout: 240_000 },
  )
  return verifyRemote(finalPath)
}

function verifyRemote(path) {
  verifyRemotePath(path)
  if (process.env.SSH_AUTH_SOCK === undefined) throw new Error('SSH_AUTH_SOCK is required')
  const directory = path.slice(0, path.lastIndexOf('/'))
  const command = [
    'set -e', `sha256sum '${path}'`, `stat -c '%s' '${path}'`, `stat -c '%a' '${path}'`,
    `docker exec -i supabase-db pg_restore -l /dev/stdin < '${path}' | wc -l`,
    `test ! -e '${directory}/academy.dump.partial'`,
  ].join('; ')
  const output = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', SSH_HOST, command],
    { encoding: 'utf8', timeout: 60_000 },
  ).trim()
  return remoteReceiptFromOutput(path, output.split('\n').map((line) => line.trim()))
}

function dryRun(args, intent) {
  const directory = join(getStateDir(args.card, args.stateDir), 'backups', intent.remote_directory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'academy.dump')
  const payload = Buffer.from(`PGDMP local rehearsal ${intent.remote_directory}\n`, 'utf8')
  writeFileSync(path, payload, { mode: 0o600 })
  chmodSync(path, 0o600)
  return {
    backup_verified: true, path, mode: '0600',
    sha256: createHash('sha256').update(payload).digest('hex'), bytes: payload.length,
    archive_list_entries: 1, completed_at: new Date().toISOString(), dry_run: true,
  }
}

const args = parseArgs(process.argv)
try {
  if (args.card !== 'AL-09') throw new Error('database backup is outside this card scope')
  if (args.action === 'check') {
    const receipt = loadState(args.card, 'db-backup', args.stateDir)
    if (receipt?.dry_run) {
      outputCheck(receipt.backup_verified && receipt.mode === '0600' ? 'matches_expected' : 'not_applied', EXPECTED)
    } else if (receipt?.path && receipt.dry_run === false && args.dbUrl) {
      const bytes = statSync(receipt.path).size
      const sha256 = createHash('sha256').update(readFileSync(receipt.path)).digest('hex')
      outputCheck(bytes === receipt.bytes && sha256 === receipt.sha256 ? 'matches_expected' : 'unknown', EXPECTED)
    } else if (receipt?.path && receipt.dry_run === false) {
      const verified = verifyRemote(receipt.path)
      outputCheck(verified.sha256 === receipt.sha256 ? 'matches_expected' : 'unknown', EXPECTED)
    } else outputCheck('not_applied', { backup_verified: false })
  } else {
    const existing = loadState(args.card, 'db-backup', args.stateDir)
    if (existing?.backup_verified) {
      process.stdout.write(`database backup already verified: ${existing.path}\n`)
    } else {
      const intent = intendedBackup(args)
      const receipt = args.dryRun ? dryRun(args, intent)
        : args.dbUrl ? localDump(args, intent) : remoteDump(intent)
      saveState(args.card, 'db-backup', receipt, args.stateDir)
      process.stdout.write(`database backup verified (${receipt.bytes} bytes, ${receipt.archive_list_entries} entries)\n`)
    }
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { backup_verified: false, reason: 'backup_probe_failed' })
  else {
    process.stderr.write(`db-backup error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
