import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'

import { main, verifyWorker } from './academy-macos-root-preflight.mjs'

test('full remaining preflight has exactly one elevation prompt', async () => {
  const calls = []
  await main({ spawnProcess(executable, args, options) {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal(calls[0].args.filter(value => value.includes('with administrator privileges')).length, 1)
  assert.equal(calls[0].args.join(' ').includes('sudo'), false)
})

test('launcher binds exact worker bytes and repository contains one elevation site', async () => {
  await verifyWorker()
  const launcher = await readFile(new URL('./academy-macos-root-preflight.mjs', import.meta.url), 'utf8')
  assert.equal(launcher.match(/with administrator privileges/g)?.length, 1)
})

test('worker binds executable inputs and preserves foreign root state', async () => {
  const worker = await readFile(new URL('./academy-macos-root-preflight-worker.sh', import.meta.url), 'utf8')
  assert.match(worker, /verify_root_file "\$stage\/source\/node" 500 [a-f0-9]{64}/)
  assert.equal((worker.match(/verify_root_file "\$stage\/tooling\//g) ?? []).length, 5)
  assert.equal(worker.includes('academy-release-*.mjs'), false)
  assert.equal(worker.includes('"$db_source"/migrations/*.sql'), false)
  assert.match(worker, /\.academy-owned/)
  assert.match(worker, /set -o noclobber/)
  assert.match(worker, /whoami_tmp="\$stage\/whoami\.tmp"/)
  assert.match(worker, /trap '\/bin\/rm -f "\$whoami_tmp"' EXIT/)
  assert.match(worker, /if \[\[ -e "\$whoami" \|\| -L "\$whoami" \]\]; then\n  valid_whoami/)
  assert.match(worker, /\/bin\/ln "\$whoami_tmp" "\$whoami"/)
  assert.equal(worker.includes('mv "$whoami_tmp" "$whoami"'), false)
  for (const digest of [
    'add7fb419f608925afe2e87c78d6d6297153a12a4f34be793921abdbeced4805',
    'df3e746d5c3863a626c93993730ffec0c805a9d4b63f32883745592037edd8e0',
    'eff6bf92af29569cfac15201184a17f5cc201d8092a783866a0d973c3087f5c1',
    'f0322b64ab270dec8d73e663f0cc2017c0c91df0a558488bb70aa32232fa7cab',
    '14934b499d3cb1a27751c8e3552577b0aa5c55bd8c649e5f67187cea1155e94d',
    '5739f1257fa5a18419b8296236dc17f04d21e11ee491da1e85cca90d2f4beaf4',
    '48d916aa5ae8cac47c800d116ae1c9780580940788f4804c2208fc9f52583fe0',
  ]) assert.match(worker, new RegExp(digest))
})
