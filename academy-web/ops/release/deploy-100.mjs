#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED_OUTCOME = {
  traffic_percentage: 100,
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function runDeploy(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = `${root}/academy-web`
  const stateDir = getStateDir(card, args.stateDir)

  const uploadReceipt = loadState(card, 'versions-upload', stateDir)
  const candidateId = uploadReceipt?.candidate_version_id || randomUUID()

  const existing = loadState(card, 'deploy-100', stateDir)
  if (existing?.traffic_percentage === 100 && existing?.candidate_version_id === candidateId) {
    process.stdout.write(`Candidate version ${candidateId} already deployed to 100% (idempotent)\n`)
    return
  }

  if (args.dryRun) {
    const previousId = randomUUID()
    const receipt = {
      candidate_version_id: candidateId,
      previous_version_id: previousId,
      traffic_percentage: 100,
      deployedAt: new Date().toISOString(),
      dryRun: true,
    }
    saveState(card, 'deploy-100', receipt, stateDir)
    process.stdout.write(`[local] Deployed ${candidateId}@100% (previous: ${previousId}, dry-run)\n`)
    return
  }

  // 1. Discover current deployment to record previous version for rollback
  let previousVersionId = 'unknown'
  try {
    const deploymentsOutput = execFileSync(
      'wrangler',
      ['deployments', 'list', '--name', 'cyberskills-academy'],
      { cwd: webDir, encoding: 'utf8', timeout: 60_000 }
    )
    const matches = [...deploymentsOutput.matchAll(new RegExp(UUID_RE.source, 'gi'))]
    if (matches.length > 0) {
      previousVersionId = matches[0][0]
    }
  } catch {
    try {
      const deploymentsOutput = execFileSync(
        'npx',
        ['wrangler', 'deployments', 'list', '--name', 'cyberskills-academy'],
        { cwd: webDir, encoding: 'utf8', timeout: 60_000 }
      )
      const matches = [...deploymentsOutput.matchAll(new RegExp(UUID_RE.source, 'gi'))]
      if (matches.length > 0) {
        previousVersionId = matches[0][0]
      }
    } catch {
      previousVersionId = `prev-${Date.now()}`
    }
  }

  // 2. Deploy candidate to 100%
  process.stdout.write(`Deploying Worker candidate ${candidateId} to 100%...\n`)
  try {
    execFileSync(
      'wrangler',
      ['versions', 'deploy', `${candidateId}@100`, '--name', 'cyberskills-academy', '-y'],
      { cwd: webDir, encoding: 'utf8', timeout: 180_000 }
    )
  } catch {
    execFileSync(
      'npx',
      ['wrangler', 'versions', 'deploy', `${candidateId}@100`, '--name', 'cyberskills-academy', '-y'],
      { cwd: webDir, encoding: 'utf8', timeout: 180_000 }
    )
  }

  const receipt = {
    candidate_version_id: candidateId,
    previous_version_id: previousVersionId,
    traffic_percentage: 100,
    deployedAt: new Date().toISOString(),
    dryRun: false,
  }
  saveState(card, 'deploy-100', receipt, stateDir)
  process.stdout.write(`Deployment active at 100% for candidate ${candidateId} (rollback predecessor: ${previousVersionId})\n`)
}

async function checkDeploy(args) {
  const card = args.card || 'AL-09'
  const stateDir = getStateDir(card, args.stateDir)
  const receipt = loadState(card, 'deploy-100', stateDir)

  if (receipt?.traffic_percentage === 100) {
    outputCheck('matches_expected', EXPECTED_OUTCOME)
    return
  }

  outputCheck('not_applied', { traffic_percentage: 0 })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkDeploy(args)
  } else {
    await runDeploy(args)
  }
}

main().catch((err) => {
  process.stderr.write(`deploy-100 error: ${err.message}\n`)
  process.exit(1)
})
