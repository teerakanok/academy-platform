#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
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
  const path = process.env.PATH ?? ''
  const found = path.split(':').filter(Boolean).map((directory) => join(directory, 'wrangler'))
    .find((candidate) => {
      try { execFileSync(candidate, ['--version'], { timeout: 5_000, env: childEnv() }); return true } catch { return false }
    })
  if (!found) throw new Error('rehearsal wrangler is not on PATH')
  return found
}

function invoke(executable, argv) {
  return execFileSync(executable, argv, { encoding: 'utf8', timeout: 60_000, env: childEnv() })
}

function currentDeployment(executable, worker) {
  const deployments = JSON.parse(invoke(executable, ['deployments', 'list', '--name', worker, '--json']))
  if (!Array.isArray(deployments) || deployments.length === 0 || deployments.length > 100) {
    throw new Error('invalid wrangler deployment inventory')
  }
  const ordered = deployments.map((deployment) => ({
    id: deployment?.id, created_on: deployment?.created_on,
    versions: Array.isArray(deployment?.versions) ? deployment.versions : [],
  })).sort((left, right) => Date.parse(right.created_on) - Date.parse(left.created_on))
  const current = ordered[0]
  if (!UUID.test(current.id) || !Number.isFinite(Date.parse(current.created_on))) throw new Error('invalid current deployment')
  const serving = current.versions.filter((version) => version?.percentage !== 0)
  if (serving.length !== 1 || serving[0].percentage !== 100 || !UUID.test(serving[0].version_id)) {
    throw new Error('current traffic allocation is ambiguous')
  }
  return { deployment_id: current.id, version_id: serving[0].version_id }
}

const args = parseArgs(process.argv)
try {
  const worker = RELEASES[args.card].worker
  const { sourceRoot, receipt: source } = requireSourceSnapshot(args)
  if (!source) throw new Error('pinned source is not prepared')
  const upload = loadState(args.card, 'versions-upload', args.stateDir)
  const candidate = upload?.candidate_version_id
  if (!candidate || !UUID.test(candidate) || upload.source_commit !== args.commit) throw new Error('uploaded candidate is absent')
  const executable = resolveWrangler(sourceRoot, args.dryRun)
  if (args.action === 'check') {
    const current = currentDeployment(executable, worker)
    outputCheck(current.version_id === candidate ? 'matches_expected' : 'not_applied', { traffic_percentage: 100 })
  } else {
    const state = loadState(args.card, 'deploy-100', args.stateDir)
    if (state?.traffic_percentage === 100 && state.candidate_version_id === candidate) {
      process.stdout.write(`worker candidate already active: ${candidate}\n`)
    } else {
      const previous = currentDeployment(executable, worker)
      invoke(executable, [
        'versions', 'deploy', `${candidate}@100`, '--name', worker,
        '--message', `activate;s=${args.commit};prev=${previous.version_id}`, '--yes',
      ])
      const after = currentDeployment(executable, worker)
      if (after.version_id !== candidate || after.deployment_id === previous.deployment_id) {
        throw new Error('candidate activation readback failed')
      }
      saveState(args.card, 'deploy-100', {
        candidate_version_id: candidate, previous_version_id: previous.version_id,
        previous_deployment_id: previous.deployment_id, deployment_id: after.deployment_id,
        traffic_percentage: 100, source_commit: args.commit, dry_run: args.dryRun,
        completed_at: new Date().toISOString(),
      }, args.stateDir)
      process.stdout.write(`worker candidate active at 100% (rollback predecessor: ${previous.version_id})\n`)
    }
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { traffic_percentage: 0, reason: 'deployment_readback_failed' })
  else {
    process.stderr.write(`deploy-100 error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
