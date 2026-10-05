#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { RELEASES, findRepoRoot, loadState, outputCheck, parseArgs, requireSourceSnapshot, saveState } from './common.mjs'

function childEnv(needsToken) {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin', HOME: process.env.HOME ?? '/tmp',
    LANG: 'C', LC_ALL: 'C',
    ...(needsToken && process.env.CLOUDFLARE_API_TOKEN
      ? { CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN } : {}),
  }
}

const args = parseArgs(process.argv)
try {
  const worker = RELEASES[args.card].worker
  const deploy = loadState(args.card, 'deploy-100', args.stateDir)
  const candidate = deploy?.candidate_version_id
  if (args.action === 'check') {
    const state = loadState(args.card, 'postcheck', args.stateDir)
    outputCheck(state?.postcheck_passed && state.candidate_version_id === candidate
      ? 'matches_expected' : 'not_applied', { postcheck_passed: true })
  } else if (args.dryRun) {
    saveState(args.card, 'postcheck', {
      postcheck_passed: true, candidate_version_id: candidate, source_commit: args.commit,
      dry_run: true, completed_at: new Date().toISOString(),
    }, args.stateDir)
    process.stdout.write('release postcheck locally rehearsed\n')
  } else {
    if (!candidate) throw new Error('candidate deployment receipt is absent')
    execFileSync('npm', ['run', 'verify:launch-exposure', '--',
      '--base', 'https://academy.cyberskills.co.th',
      '--expect', 'gated', '--raw-host', 'https://cyberskills-academy.songpon-te.workers.dev',
      '--timeout-ms', '5000',
    ], {
      cwd: join(findRepoRoot(), 'academy-web'), stdio: 'inherit', timeout: 60_000, env: childEnv(false),
    })
    const { sourceRoot } = requireSourceSnapshot(args)
    const deployment = JSON.parse(execFileSync(
      join(sourceRoot, 'academy-web/node_modules/.bin/wrangler'),
      ['deployments', 'list', '--name', worker, '--json'],
      { encoding: 'utf8', timeout: 60_000, env: childEnv(true) },
    ))
    const latest = Array.isArray(deployment) ? deployment[0] : null
    const serving = latest?.versions?.filter((version) => version?.percentage !== 0) ?? []
    if (serving.length !== 1 || serving[0].percentage !== 100 || serving[0].version_id !== candidate) {
      throw new Error('deployment postcheck readback failed')
    }
    saveState(args.card, 'postcheck', {
      postcheck_passed: true, candidate_version_id: candidate, deployment_id: latest.id,
      source_commit: args.commit, dry_run: false, completed_at: new Date().toISOString(),
    }, args.stateDir)
    process.stdout.write('release postchecks passed\n')
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { postcheck_passed: false, reason: 'postcheck_receipt_failed' })
  else {
    process.stderr.write(`postcheck error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
