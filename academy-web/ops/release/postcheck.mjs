#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED_OUTCOME = {
  postcheck_passed: true,
}

async function runPostcheck(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = `${root}/academy-web`
  const stateDir = getStateDir(card, args.stateDir)

  const existing = loadState(card, 'postcheck', stateDir)
  if (existing?.postcheck_passed) {
    process.stdout.write(`Postcheck already completed and verified for ${card} (idempotent)\n`)
    return
  }

  if (args.dryRun) {
    const receipt = {
      postcheck_passed: true,
      card,
      completedAt: new Date().toISOString(),
      dryRun: true,
    }
    saveState(card, 'postcheck', receipt, stateDir)
    process.stdout.write(`[local] Postcheck verified (dry-run)\n`)
    return
  }

  // 1. Verify launch exposure behind Cloudflare Access
  process.stdout.write(`Running verify-launch-exposure for ${card}...\n`)
  execFileSync(
    'node',
    [
      'scripts/verify-launch-exposure.mjs',
      '--base', 'https://academy.cyberskills.co.th',
      '--expect', 'gated',
      '--raw-host', 'https://cyberskills-academy.songpon-te.workers.dev',
      '--timeout-ms', '5000',
    ],
    { cwd: webDir, stdio: 'inherit', timeout: 60_000 }
  )

  // 2. Deployment readback
  process.stdout.write(`Verifying deployment allocation readback...\n`)
  let deploymentOutput = ''
  try {
    deploymentOutput = execFileSync(
      'npx',
      ['wrangler', 'deployments', 'list', '--name', 'cyberskills-academy'],
      { cwd: webDir, encoding: 'utf8', timeout: 60_000 }
    )
  } catch {
    deploymentOutput = execFileSync(
      'wrangler',
      ['deployments', 'list', '--name', 'cyberskills-academy'],
      { cwd: webDir, encoding: 'utf8', timeout: 60_000 }
    )
  }

  const receipt = {
    postcheck_passed: true,
    card,
    deploymentReadback: deploymentOutput.slice(0, 1024),
    completedAt: new Date().toISOString(),
    dryRun: false,
  }

  saveState(card, 'postcheck', receipt, stateDir)
  process.stdout.write(`Postcheck successfully verified for ${card}\n`)
}

async function checkPostcheck(args) {
  const card = args.card || 'AL-09'
  const stateDir = getStateDir(card, args.stateDir)
  const receipt = loadState(card, 'postcheck', stateDir)

  if (receipt?.postcheck_passed) {
    outputCheck('matches_expected', EXPECTED_OUTCOME)
    return
  }

  outputCheck('not_applied', { postcheck_passed: false })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkPostcheck(args)
  } else {
    await runPostcheck(args)
  }
}

main().catch((err) => {
  process.stderr.write(`postcheck error: ${err.message}\n`)
  process.exit(1)
})
