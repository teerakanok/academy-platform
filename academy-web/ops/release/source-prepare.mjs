#!/usr/bin/env node
import { outputCheck, parseArgs, prepareSourceSnapshot, requireSourceSnapshot, saveState } from './common.mjs'

const args = parseArgs(process.argv)
try {
  if (args.action === 'check') {
    const { receipt } = requireSourceSnapshot(args)
    if (receipt) outputCheck('matches_expected', { archive_verified: true, commit: receipt.commit })
    else outputCheck('not_applied', { archive_verified: false, commit: args.commit })
  } else {
    const { receipt, unchanged } = prepareSourceSnapshot(args)
    saveState(args.card, 'source-prepare', {
      archive_verified: true, commit: receipt.commit, file_count: receipt.file_count, unchanged,
      completed_at: new Date().toISOString(),
    }, args.stateDir)
    process.stdout.write(`pinned source prepared: ${receipt.commit} (${receipt.file_count} files)\n`)
  }
} catch (error) {
  if (args.action === 'check') {
    if (process.env.AL23_DEBUG === '1') process.stderr.write(`${error?.stack ?? ''}\n`)
    outputCheck('unknown', { archive_verified: false, reason: 'source_verification_failed' })
  }
  else {
    process.stderr.write(`source-prepare error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
}
