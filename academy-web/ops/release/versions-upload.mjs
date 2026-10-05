#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { RELEASES, loadState, outputCheck, parseArgs, requireSourceSnapshot, saveState } from './common.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function childEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin', HOME: process.env.HOME ?? '/tmp',
    LANG: 'C', LC_ALL: 'C',
    ...(process.env.CLOUDFLARE_API_TOKEN ? { CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN } : {}),
  }
}

function resolveWrangler(sourceRoot, dryRun) {
  if (!dryRun) {
    if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required')
    return join(sourceRoot, 'academy-web/node_modules/.bin/wrangler')
  }
  for (const directory of (process.env.PATH ?? '').split(':')) {
    if (!directory) continue
    const candidate = join(directory, 'wrangler')
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { continue }
  }
  throw new Error('rehearsal wrangler is not on PATH')
}

function invoke(executable, argv) {
  return execFileSync(executable, argv, { encoding: 'utf8', timeout: 60_000, env: childEnv() })
}

function inventory(executable, worker) {
  const values = JSON.parse(invoke(executable, ['versions', 'list', '--name', worker, '--json']))
  if (!Array.isArray(values) || values.length > 100) throw new Error('invalid wrangler version inventory')
  return values.map((value) => ({
    id: value?.id,
    tag: value?.annotations?.['workers/tag'] ?? '',
    message: value?.annotations?.['workers/message'] ?? '',
  }))
}

const args = parseArgs(process.argv)
try {
  const worker = RELEASES[args.card].worker
  const { sourceRoot, receipt: source } = requireSourceSnapshot(args)
  if (!source) throw new Error('pinned source is not prepared')
  const expected = { uploaded: true, source_commit: args.commit }
  const executable = resolveWrangler(sourceRoot, args.dryRun)
  const tag = `release-${args.commit.slice(0, 12)}`
  const message = `s=${args.commit};gathering-ops=${args.card}`
  if (args.action === 'check') {
    const state = loadState(args.card, 'versions-upload', args.stateDir)
    const values = inventory(executable, worker)
    const match = values.filter((value) => value.id === state?.candidate_version_id
      && value.tag === tag && value.message === message)
    outputCheck(match.length === 1 && UUID.test(match[0].id) ? 'matches_expected' : 'not_applied', expected)
  } else {
    const existing = loadState(args.card, 'versions-upload', args.stateDir)
    if (existing?.uploaded && existing.source_commit === args.commit) {
      process.stdout.write(`worker candidate already uploaded: ${existing.candidate_version_id}\n`)
    } else {
      const before = new Set(inventory(executable, worker).map((value) => value.id))
      const output = invoke(executable, [
        'versions', 'upload', '--name', worker, '--keep-vars', '--tag', tag, '--message', message,
      ])
      const emitted = output.match(UUID)?.[0]
      const after = inventory(executable, worker).filter((value) => !before.has(value.id)
        && value.tag === tag && value.message === message)
      const candidate = after.length === 1 ? after[0].id : emitted
      if (!candidate || !UUID.test(candidate)) throw new Error('candidate version identity is unknown')
      saveState(args.card, 'versions-upload', {
        uploaded: true, candidate_version_id: candidate, source_commit: args.commit, tag,
        dry_run: args.dryRun, completed_at: new Date().toISOString(),
      }, args.stateDir)
      process.stdout.write(`worker candidate recorded: ${candidate}\n`)
    }
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { uploaded: false, reason: 'version_inventory_failed' })
  else {
    process.stderr.write(`versions-upload error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
