import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  EXPECTED_RELEASE_REVISION,
  EXPECTED_RELEASE_SHA256,
  PINNED_ASSETS,
  buildRootCommand,
  isReviewedSourcePath,
  main,
  parseEnvelope,
} from './academy-macos-immutable-release-installer.mjs'

test('reviewed source containment rejects traversal and textual-prefix siblings', () => {
  assert.equal(isReviewedSourcePath('/Users/teerakanok/.local/state/cyberskills/academy-release-930f/sources'), true)
  assert.equal(isReviewedSourcePath('/Users/teerakanok/.local/state/cyberskills/academy-release-930f/sources/application/worker.ts'), true)
  assert.equal(isReviewedSourcePath('/Users/teerakanok/.local/state/cyberskills/academy-release-930f/sources/../outside'), false)
  assert.equal(isReviewedSourcePath('/Users/teerakanok/.local/state/cyberskills/academy-release-930f/sources-foreign/node'), false)
  assert.equal(isReviewedSourcePath('relative/source'), false)
})

test('installer pins the reviewed release and every root executable input', async () => {
  assert.equal(EXPECTED_RELEASE_REVISION, '7de1cbfbd9e3606f44379ad0322b75109f10e583')
  assert.equal(EXPECTED_RELEASE_SHA256, 'fda0394cee9da9b2d1c37d2aa6e6185efc6bc54d072d21bab5e3771c3f7c8f25')
  for (const asset of PINNED_ASSETS) {
    const digest = createHash('sha256').update(await readFile(asset.source)).digest('hex')
    assert.equal(digest, asset.sha256, asset.name)
  }
})

test('root command rehashes copied tooling and performs no DB, Cloudflare, or secret operation', () => {
  const command = buildRootCommand({ packageSha256: 'a'.repeat(64) })
  assert.match(command, /academy-release-cli\.mjs/)
  assert.match(command, /fda0394cee9da9b2d1c37d2aa6e6185efc6bc54d072d21bab5e3771c3f7c8f25/)
  assert.match(command, /ROOT_BOOTSTRAP_REJECTED/)
  assert.doesNotMatch(command, /wrangler|cloudflare|DATABASE|secret|sudo/iu)
})

test('launcher asks once and accepts only one sanitized envelope', async () => {
  const calls = []
  const expected = { schema:'academy-macos-immutable-release-envelope/v1', status:'PASS', reason:'COMPLETE' }
  const result = await main({
    inputs: { packageSha256: 'a'.repeat(64) },
    spawnProcess(executable, args, options) {
      calls.push({ executable, args, options })
      const listeners = new Map()
      return {
        stdout: { setEncoding() {}, on(name, callback) { if (name === 'data') callback(`${JSON.stringify(expected)}\n`) } },
        once(name, callback) { listeners.set(name, callback); if (name === 'close') queueMicrotask(() => callback(0)) },
      }
    },
  })
  assert.deepEqual(result, expected)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal((calls[0].args.at(-1).match(/with administrator privileges/g) ?? []).length, 1)
  assert.equal(parseEnvelope(`${JSON.stringify(expected)}\nforeign\n`), null)
})

test('root worker binds render, diagnosis, install, verify and preserves executable modes', async () => {
  const worker = await readFile(new URL('./academy-macos-immutable-release-worker.sh', import.meta.url), 'utf8')
  assert.ok(worker.indexOf('render "$STAGE/package.json"') < worker.indexOf('diagnose-install'))
  assert.ok(worker.indexOf('diagnose-install') < worker.indexOf('"$CLI" install'))
  assert.ok(worker.indexOf('"$CLI" install') < worker.indexOf('"$CLI" verify'))
  assert.match(worker, /find "\$STAGE\/sources" -type f -exec \/bin\/chmod a-w/)
  assert.match(worker, /FOREIGN_STATE_REJECTED/)
  assert.doesNotMatch(worker, /wrangler|cloudflare|DATABASE|secret/iu)
})
