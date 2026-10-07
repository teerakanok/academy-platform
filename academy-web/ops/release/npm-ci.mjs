#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED_OUTCOME = {
  dependencies_installed: true,
}

function verifyNodeModules(webDir) {
  const nodeModulesDir = join(webDir, 'node_modules')
  if (!existsSync(nodeModulesDir)) return false
  const contents = readdirSync(nodeModulesDir)
  return contents.includes('next') || contents.includes('wrangler') || contents.length > 5
}

async function runNpmCi(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = join(root, 'academy-web')
  const stateDir = getStateDir(card, args.stateDir)

  if (verifyNodeModules(webDir)) {
    process.stdout.write(`node_modules already populated and verified (idempotent)\n`)
    saveState(card, 'npm-ci', { dependencies_installed: true, verified: true }, stateDir)
    return
  }

  if (args.dryRun) {
    saveState(card, 'npm-ci', { dependencies_installed: true, dryRun: true }, stateDir)
    process.stdout.write(`[local] npm ci simulated (dry-run)\n`)
    return
  }

  process.stdout.write(`Running npm ci in ${webDir}...\n`)
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: webDir,
    stdio: 'inherit',
    timeout: 280_000,
  })

  if (!verifyNodeModules(webDir)) {
    throw new Error('npm ci completed but node_modules could not be verified')
  }

  saveState(card, 'npm-ci', { dependencies_installed: true, verified: true }, stateDir)
  process.stdout.write(`Dependencies installed and verified\n`)
}

async function checkNpmCi(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = join(root, 'academy-web')
  const stateDir = getStateDir(card, args.stateDir)

  const isPopulated = verifyNodeModules(webDir)
  const receipt = loadState(card, 'npm-ci', stateDir)

  if (isPopulated || receipt?.dependencies_installed) {
    outputCheck('matches_expected', EXPECTED_OUTCOME)
    return
  }

  outputCheck('not_applied', { dependencies_installed: false })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkNpmCi(args)
  } else {
    await runNpmCi(args)
  }
}

main().catch((err) => {
  process.stderr.write(`npm-ci error: ${err.message}\n`)
  process.exit(1)
})
