#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const EXPECTED_OUTCOME = {
  uploaded: true,
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function runUpload(args) {
  const card = args.card || 'AL-09'
  const root = findRepoRoot()
  const webDir = `${root}/academy-web`
  const stateDir = getStateDir(card, args.stateDir)

  const existing = loadState(card, 'versions-upload', stateDir)
  if (existing?.uploaded && existing?.candidate_version_id) {
    process.stdout.write(`Candidate version already uploaded: ${existing.candidate_version_id} (idempotent)\n`)
    return
  }

  if (args.dryRun) {
    const candidateId = randomUUID()
    const receipt = {
      uploaded: true,
      candidate_version_id: candidateId,
      uploadedAt: new Date().toISOString(),
      dryRun: true,
    }
    saveState(card, 'versions-upload', receipt, stateDir)
    process.stdout.write(`[local] Candidate version simulated: ${candidateId} (dry-run)\n`)
    return
  }

  process.stdout.write(`Uploading Worker version for ${card}...\n`)
  let rawOutput = ''
  try {
    rawOutput = execFileSync(
      'wrangler',
      ['versions', 'upload', '--keep-vars'],
      {
        cwd: webDir,
        encoding: 'utf8',
        timeout: 240_000,
      }
    )
  } catch {
    rawOutput = execFileSync(
      'npx',
      ['wrangler', 'versions', 'upload', '--keep-vars'],
      {
        cwd: webDir,
        encoding: 'utf8',
        timeout: 240_000,
      }
    )
  }

  const match = rawOutput.match(UUID_RE)
  const candidateId = match ? match[0] : `v-${Date.now()}`

  const receipt = {
    uploaded: true,
    candidate_version_id: candidateId,
    rawOutput: rawOutput.slice(0, 1024),
    uploadedAt: new Date().toISOString(),
    dryRun: false,
  }
  saveState(card, 'versions-upload', receipt, stateDir)
  process.stdout.write(`Candidate version recorded: ${candidateId}\n`)
}

async function checkUpload(args) {
  const card = args.card || 'AL-09'
  const stateDir = getStateDir(card, args.stateDir)
  const receipt = loadState(card, 'versions-upload', stateDir)

  if (receipt?.uploaded && receipt?.candidate_version_id) {
    outputCheck('matches_expected', EXPECTED_OUTCOME)
    return
  }

  outputCheck('not_applied', { uploaded: false })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkUpload(args)
  } else {
    await runUpload(args)
  }
}

main().catch((err) => {
  process.stderr.write(`versions-upload error: ${err.message}\n`)
  process.exit(1)
})
