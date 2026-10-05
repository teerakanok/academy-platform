#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadState, outputCheck, parseArgs, requireSourceSnapshot, saveState } from './common.mjs'

const EXPECTED = { build_completed: true, source_commit: '' }

function childEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin', HOME: process.env.HOME ?? '/tmp',
    LANG: 'C', LC_ALL: 'C', TMPDIR: process.env.TMPDIR ?? '/tmp',
  }
}

function artifact(webDirectory) {
  const worker = join(webDirectory, '.open-next/worker.js')
  const assets = join(webDirectory, '.open-next/assets')
  return existsSync(worker) && existsSync(assets) && readdirSync(assets).length > 0
}

function receipt(webDirectory, args, dryRun) {
  const worker = join(webDirectory, '.open-next/worker.js')
  return {
    build_completed: true, source_commit: args.commit, dry_run: dryRun,
    worker_sha256: createHash('sha256').update(readFileSync(worker)).digest('hex'),
    asset_count: readdirSync(join(webDirectory, '.open-next/assets')).length,
    completed_at: new Date().toISOString(),
  }
}

const args = parseArgs(process.argv)
EXPECTED.source_commit = args.commit
try {
  const { sourceRoot, receipt: source } = requireSourceSnapshot(args)
  const webDirectory = join(sourceRoot, 'academy-web')
  if (!source) throw new Error('pinned source is not prepared')
  if (args.action === 'check') {
    const state = loadState(args.card, 'build-cf', args.stateDir)
    if (state?.build_completed && state.source_commit === args.commit && artifact(webDirectory)) {
      outputCheck('matches_expected', { build_completed: true, source_commit: args.commit })
    } else outputCheck('not_applied', { build_completed: false, source_commit: args.commit })
  } else {
    const existing = loadState(args.card, 'build-cf', args.stateDir)
    if (existing?.build_completed && existing.source_commit === args.commit && artifact(webDirectory)) {
      process.stdout.write('pinned Cloudflare build already present\n')
    } else if (args.dryRun) {
      mkdirSync(join(webDirectory, '.open-next/assets'), { recursive: true })
      writeFileSync(join(webDirectory, '.open-next/worker.js'), 'export default {}\n', { mode: 0o600 })
      writeFileSync(join(webDirectory, '.open-next/assets/BUILD_ID'), `${args.commit}\n`, { mode: 0o600 })
      saveState(args.card, 'build-cf', receipt(webDirectory, args, true), args.stateDir)
      process.stdout.write('Cloudflare build locally rehearsed\n')
    } else {
      execFileSync('npm', ['run', 'build:cf'], {
        cwd: webDirectory, stdio: 'inherit', timeout: 280_000, env: childEnv(),
      })
      if (!artifact(webDirectory)) throw new Error('Cloudflare build artifact is absent')
      saveState(args.card, 'build-cf', receipt(webDirectory, args, false), args.stateDir)
      process.stdout.write('pinned Cloudflare build completed\n')
    }
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { build_completed: false, reason: 'build_probe_failed' })
  else {
    process.stderr.write(`build-cf error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
