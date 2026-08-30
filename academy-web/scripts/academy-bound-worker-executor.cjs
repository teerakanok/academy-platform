const fs = require('fs')
const crypto = require('crypto')
const cp = require('child_process')

const [path, digest, uidText, gidText, modeText] = process.argv.slice(2)
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

;(async () => {
  let fd
  try {
    const before = fs.lstatSync(path, { bigint:true })
    if (!valid(before)) throw new Error('metadata')
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    const inside = fs.fstatSync(fd, { bigint:true })
    if (!same(before, inside) || hash(fd, inside.size) !== digest) throw new Error('binding')
    const child = cp.spawn('/bin/zsh', ['/dev/fd/3'], {
      stdio:['ignore', 'inherit', 'inherit', fd],
      env:{ HOME:'/private/var/root', LANG:'C', LC_ALL:'C', PATH:'/usr/bin:/bin' },
    })
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    const after = fs.fstatSync(fd, { bigint:true }), named = fs.lstatSync(path, { bigint:true })
    if (!same(inside, after) || !same(after, named) || hash(fd, after.size) !== digest) throw new Error('replaced')
    if (result.code !== 0 || result.signal !== null) process.exitCode = 1
  } catch {
    process.exitCode = 1
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
})()
