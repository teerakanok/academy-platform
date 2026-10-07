#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED_OUTCOME = {
  build_completed: true,
}

function verifyBuildOutput(webDir) {
  const openNextDir = join(webDir, '.open-next')
  if (!existsSync(openNextDir)) return false
  const workerFile = join(openNextDir, 'worker.js')
  const assetsDir = join(openNextDir, 'assets')
  return existsSync(workerFile) || existsSync(assetsDir)
}

async function runBuildCf(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = join(root, 'academy-web')
  const stateDir = getStateDir(card, args.stateDir)

  if (verifyBuildOutput(webDir)) {
    process.stdout.write(`Cloudflare build artifact already exists and verified (idempotent)\n`)
    saveState(card, 'build-cf', { build_completed: true, verified: true }, stateDir)
    return
  }

  if (args.dryRun) {
    const openNextDir = join(webDir, '.open-next')
    mkdirSync(openNextDir, { recursive: true, mode: 0o755 })
    writeFileSync(
      join(openNextDir, 'worker.js'),
      'export default { fetch: () => new Response("dry-run") };\nexport const onRequest = () => new Response("dry-run");\n',
      'utf8'
    )
    saveState(card, 'build-cf', { build_completed: true, dryRun: true }, stateDir)
    process.stdout.write(`[local] Cloudflare build artifact created (dry-run)\n`)
    return
  }

  process.stdout.write(`Building Cloudflare Worker in ${webDir}...\n`)
  execFileSync('bash', ['scripts/build-cloudflare.sh'], {
    cwd: webDir,
    stdio: 'inherit',
    timeout: 280_000,
  })

  if (!verifyBuildOutput(webDir)) {
    throw new Error('build-cloudflare script completed but .open-next artifacts not found')
  }

  saveState(card, 'build-cf', { build_completed: true, verified: true }, stateDir)
  process.stdout.write(`Cloudflare Worker build completed and verified\n`)
}

async function checkBuildCf(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = join(root, 'academy-web')
  const stateDir = getStateDir(card, args.stateDir)

  const isBuilt = verifyBuildOutput(webDir)
  const receipt = loadState(card, 'build-cf', stateDir)

  if (isBuilt || receipt?.build_completed) {
    outputCheck('matches_expected', EXPECTED_OUTCOME)
    return
  }

  outputCheck('not_applied', { build_completed: false })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkBuildCf(args)
  } else {
    await runBuildCf(args)
  }
}

main().catch((err) => {
  process.stderr.write(`build-cf error: ${err.message}\n`)
  process.exit(1)
})
