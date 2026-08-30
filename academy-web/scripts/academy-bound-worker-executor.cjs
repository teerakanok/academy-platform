const fs = require('fs')
const crypto = require('crypto')
const cp = require('child_process')

const [path, digest, uidText, gidText, modeText, terminal] = process.argv.slice(2)
const uid = BigInt(uidText), gid = BigInt(gidText), mode = BigInt(modeText)
const keys = ['dev', 'ino', 'size', 'uid', 'gid', 'mode', 'nlink', 'mtimeMs', 'ctimeMs']
const same = (a, b) => keys.every(key => a[key] === b[key])
const valid = value => value.isFile() && !value.isSymbolicLink() && value.uid === uid && value.gid === gid
  && value.nlink === 1n && (value.mode & 0o777n) === mode
const hash = (fd, size) => {
  const digest = crypto.createHash('sha256'), buffer = Buffer.alloc(65536)
  let position = 0
  while (position < Number(size)) {
    const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, Number(size) - position), position)
    if (count < 1) throw new Error('read')
    digest.update(buffer.subarray(0, count)); position += count
  }
  return digest.digest('hex')
}

const phases = new Set(['BOOTSTRAP','OBSERVE_RELEASE','CLEANUP_STAGE','PREPARE_PACKAGE','RENDER_RELEASE',
  'INSTALL_RELEASE','VERIFY_RELEASE','REOBSERVE_RELEASE','STAGE_DATABASE','AUTHENTICATE_CLOUDFLARE','COMPLETE'])
const publications = new Set(['UNKNOWN','CANDIDATE'])
const reasons = new Set(['UNCLASSIFIED','DIAGNOSTIC_FAILED','EXACT_CANDIDATE','CRASH_WINDOW_0700',
  'FOREIGN_TARGET','FOREIGN_STAGE','OWNED_STAGE_RECOVERABLE','TARGET_ABSENT'])
const result = reason => `ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=${reason}`
const fingerprint = path => {
  try {
    const metadata = fs.lstatSync(path, { bigint:true })
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== uid || metadata.gid !== gid
      || metadata.nlink !== 1n || (metadata.mode & 0o777n) !== 0o600n || metadata.size > 512n) return null
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      const inside = fs.fstatSync(fd, { bigint:true })
      if (!same(metadata, inside)) return null
      return { identity:keys.map(key => String(inside[key])).join(':'), digest:hash(fd,inside.size) }
    } finally { fs.closeSync(fd) }
  } catch { return null }
}
const freshReceipt = (before, path) => {
  const after=fingerprint(path)
  if (after === null || (before !== null && before.identity === after.identity && before.digest === after.digest)) return null
  try {
    const value=JSON.parse(fs.readFileSync(path,'utf8'))
    if (Object.keys(value).sort().join(',') !== 'phase,publication,reason,schema,status'
      || value.schema !== 'academy-macos-root-preflight-terminal/v1' || value.status !== 'FAILED'
      || !phases.has(value.phase) || !publications.has(value.publication) || !reasons.has(value.reason)) return null
    return value
  } catch { return null }
}
const boundedWorkerLine = stderr => {
  const matches=String(stderr).split('\n').filter(Boolean).filter(line =>
    /^ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=[A-Z0-9_]+ publication=[A-Z0-9_]+ reason=[A-Z0-9_]+$/.test(line))
  if (matches.length !== 1) return null
  const [,phase,publication,reason]=matches[0].match(/phase=([A-Z0-9_]+) publication=([A-Z0-9_]+) reason=([A-Z0-9_]+)/) ?? []
  return phases.has(phase) && publications.has(publication) && reasons.has(reason) ? {phase,publication,reason} : null
}
const workerResult = value => `ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=WORKER_REJECTED phase=${value.phase} publication=${value.publication} worker_reason=${value.reason}`

;(async () => {
  let fd, boundary='EXECUTOR_BINDING_REJECTED', before=null
  try {
    const workerBefore = fs.lstatSync(path, { bigint:true })
    if (!valid(workerBefore)) throw new Error('metadata')
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    const inside = fs.fstatSync(fd, { bigint:true })
    if (!same(workerBefore, inside) || hash(fd, inside.size) !== digest) throw new Error('binding')
    before=fingerprint(terminal)
    boundary='EXECUTOR_SPAWN_REJECTED'
    const child = cp.spawn('/bin/zsh', ['/dev/fd/3'], {
      stdio:['ignore', 'pipe', 'pipe', fd],
      env:{ HOME:'/private/var/root', LANG:'C', LC_ALL:'C', PATH:'/usr/bin:/bin' },
    })
    let stdout='', stderr=''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const childResult = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    boundary='EXECUTOR_POSTCHECK_REJECTED'
    const after = fs.fstatSync(fd, { bigint:true }), named = fs.lstatSync(path, { bigint:true })
    if (!same(inside, after) || !same(after, named) || hash(fd, after.size) !== digest) throw new Error('replaced')
    if (childResult.code === 0 && childResult.signal === null
      && stdout.split('\n').filter(Boolean).at(-1) === 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_PASS') {
      process.stdout.write('ACADEMY_ROOT_PREFLIGHT_RESULT status=PASS\n'); return
    }
    const bounded=boundedWorkerLine(stderr), receipt=freshReceipt(before,terminal)
    if (bounded && (!receipt || (bounded.phase === receipt.phase && bounded.publication === receipt.publication
      && bounded.reason === receipt.reason))) process.stdout.write(`${workerResult(bounded)}\n`)
    else if (receipt) process.stdout.write(`${workerResult(receipt)}\n`)
    else process.stdout.write(`${result(boundary)}\n`)
  } catch {
    process.stdout.write(`${result(boundary)}\n`)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
})()
