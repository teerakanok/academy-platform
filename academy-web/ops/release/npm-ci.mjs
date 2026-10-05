#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadState, outputCheck, parseArgs, requireSourceSnapshot, saveState } from './common.mjs'

const EXPECTED = { dependencies_installed: true }

function childEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin', HOME: process.env.HOME ?? '/tmp',
    LANG: 'C', LC_ALL: 'C', TMPDIR: process.env.TMPDIR ?? '/tmp',
  }
}

function wranglerPath(webDirectory) {
  return join(webDirectory, 'node_modules/.bin/wrangler')
}

function installed(webDirectory) {
  return existsSync(wranglerPath(webDirectory)) && existsSync(join(webDirectory, 'node_modules/wrangler/package.json'))
}

function version(webDirectory) {
  return execFileSync(wranglerPath(webDirectory), ['--version'], {
    encoding: 'utf8', timeout: 30_000, env: childEnv(),
  }).trim()
}

const args = parseArgs(process.argv)
try {
  const { sourceRoot, receipt: source } = requireSourceSnapshot(args)
  const webDirectory = join(sourceRoot, 'academy-web')
  if (!source) throw new Error('pinned source is not prepared')
  if (args.action === 'check') {
    const receipt = loadState(args.card, 'npm-ci', args.stateDir)
    if (receipt?.dry_run && receipt.dependencies_installed) outputCheck('matches_expected', EXPECTED)
    else if (receipt?.dependencies_installed && installed(webDirectory)) {
      version(webDirectory)
      outputCheck('matches_expected', EXPECTED)
    } else if (installed(webDirectory)) outputCheck('not_applied', { dependencies_installed: false })
    else outputCheck('not_applied', EXPECTED)
  } else {
    const existing = loadState(args.card, 'npm-ci', args.stateDir)
    if (!args.dryRun && existing?.dependencies_installed && existing.source_commit === args.commit
      && installed(webDirectory)) {
      process.stdout.write(`dependencies already installed (wrangler ${version(webDirectory)})\n`)
    } else if (args.dryRun) {
      saveState(args.card, 'npm-ci', {
        dependencies_installed: true, source_commit: args.commit, dry_run: true,
        completed_at: new Date().toISOString(),
      }, args.stateDir)
      process.stdout.write('dependency installation locally rehearsed\n')
    } else {
      execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
        cwd: webDirectory, stdio: 'inherit', timeout: 280_000, env: childEnv(),
      })
      if (!installed(webDirectory)) throw new Error('wrangler installation is absent')
      saveState(args.card, 'npm-ci', {
        dependencies_installed: true, source_commit: args.commit, dry_run: false,
        wrangler_version: version(webDirectory), completed_at: new Date().toISOString(),
      }, args.stateDir)
      process.stdout.write('pinned dependencies installed\n')
    }
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { dependencies_installed: false, reason: 'dependency_probe_failed' })
  else {
    process.stderr.write(`npm-ci error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
