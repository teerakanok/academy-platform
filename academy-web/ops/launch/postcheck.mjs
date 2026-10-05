#!/usr/bin/env node

import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { verifyLaunchExposure } from '../../scripts/verify-launch-exposure.mjs'

function requireValue(argv, index, name) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} must have a value`)
  return value
}

export function parsePostcheckArgs(argv) {
  const options = {
    mode: 'run',
    base: 'https://academy.cyberskills.co.th',
    rawHost: 'https://cyberskills-academy.songpon-te.workers.dev',
    timeoutMs: 10_000,
    outputDir: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--mode') {
      options.mode = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--base') {
      options.base = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--raw-host') {
      options.rawHost = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--output-dir') {
      options.outputDir = requireValue(argv, index, argument)
      index += 1
    } else if (argument === '--timeout-ms') {
      const raw = requireValue(argv, index, argument)
      index += 1
      if (!/^\d+$/.test(raw)) throw new Error('--timeout-ms must be a positive integer')
      options.timeoutMs = Number(raw)
    } else {
      throw new Error(`unknown postcheck argument: ${argument}`)
    }
  }
  if (!['run', 'check'].includes(options.mode)) throw new Error('--mode must be run or check')
  if (!options.outputDir) throw new Error('--output-dir is required')
  if (options.timeoutMs < 250 || options.timeoutMs > 30_000) {
    throw new Error('--timeout-ms must be between 250 and 30000')
  }
  return options
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(receipt, undefined, 2)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
}

/**
 * @param {{
 *   argv?: string[],
 *   fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>,
 *   output?: { write: (chunk: string) => void },
 *   now?: () => Date,
 * }} [options]
 */
export async function runLaunchPostcheck({
  argv,
  fetch = globalThis.fetch,
  output = process.stdout,
  now = () => new Date(),
} = {}) {
  const options = parsePostcheckArgs(argv)
  const receipt = await verifyLaunchExposure({
    base: options.base,
    expect: 'public',
    rawHost: options.rawHost,
    timeoutMs: options.timeoutMs,
    fetch,
  })
  const rawHostCheck = receipt.checks.find((check) => check.kind === 'raw-host')
  const observed = {
    phase: 'postcheck',
    overall: receipt.overall === true,
    failed: receipt.summary?.failed ?? null,
    rawHost404: rawHostCheck?.status === 404,
  }
  if (options.mode === 'run') {
    await writeReceipt(`${options.outputDir.replace(/\/+$/, '')}/launch-postcheck.json`, {
      schema: 'academy-launch-postcheck/v1',
      checkedAt: now().toISOString(),
      receipt,
    })
    output.write(`${JSON.stringify(observed)}\n`)
    if (receipt.overall !== true) process.exitCode = 1
    return
  }
  output.write(`${JSON.stringify({
    status: observed.overall && observed.rawHost404 ? 'matches_expected' : 'not_applied',
    observed,
  })}\n`)
  if (options.mode === 'run' && receipt.overall !== true) process.exitCode = 1
}

if (process.argv[1] && process.argv[1].endsWith('ops/launch/postcheck.mjs')) {
  runLaunchPostcheck().catch((error) => {
    process.stderr.write(`LAUNCH_POSTCHECK_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}
