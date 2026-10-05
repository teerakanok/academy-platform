#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  FAKE_ACCOUNT_KEY,
  FAKE_API_TOKEN,
  startFakeCloudflareAccessServer,
} from './fake-cloudflare-access-server.mjs'

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: resolve(process.cwd(), 'academy-web'),
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: FAKE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_KEY: FAKE_ACCOUNT_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
  })
}

async function main(argv) {
  const outputDir = argv[0]
  if (!outputDir || argv.some((argument) => argument.startsWith('-'))) {
    throw new Error('usage: rehearse-cloudflare-access.mjs <output-dir>')
  }
  const fake = await startFakeCloudflareAccessServer()
  const script = 'ops/launch/cloudflare-access.mjs'
  const common = ['--api-base', fake.origin, '--origin', fake.origin, '--output-dir', outputDir, '--timeout-ms', '1500']
  const commands = [
    ['snapshot', ['node', script, '--mode', 'snapshot', ...common]],
    ['apply', ['node', script, '--mode', 'apply', ...common]],
    ['check-launch', ['node', script, '--mode', 'check', '--phase', 'launch', ...common]],
    ['rollback', ['node', script, '--mode', 'rollback', ...common]],
    ['check-rollback', ['node', script, '--mode', 'check', '--phase', 'rollback', ...common]],
  ]
  const results = []
  try {
    for (const [name, args] of commands) {
      const result = await run(args[0], args.slice(1))
      results.push({
        name,
        exitCode: result.code,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim().replace(FAKE_API_TOKEN, '<redacted>'),
      })
      if (result.code !== 0) throw new Error(`${name} failed with exit ${result.code}`)
    }
  } finally {
    await new Promise((resolvePromise) => fake.server.close(resolvePromise))
  }
  const receipt = {
    schema: 'academy-launch-cloudflare-rehearsal/v1',
    fakeServer: '127.0.0.1',
    productionCall: false,
    results,
  }
  await mkdir(dirname(outputDir), { recursive: true, mode: 0o700 })
  const path = `${outputDir.replace(/\/+$/, '')}/cloudflare-rehearsal.json`
  const handle = await open(path, 'wx', 0o600)
  await handle.writeFile(`${JSON.stringify(receipt, undefined, 2)}\n`, 'utf8')
  await handle.close()
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

if (process.argv[1] && process.argv[1].endsWith('ops/launch/rehearse-cloudflare-access.mjs')) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`CLOUDFLARE_REHEARSAL_REJECTED: ${error.message}\n`)
    process.exitCode = 1
  })
}
