// Deterministic in-memory fake fs/promises + process for release tests.
// Supports the exact syscall subset used by the release modules, including
// O_NOFOLLOW/O_EXCL semantics, lstat vs stat, symlinks, rename, and a sync log.

import { constants } from 'node:fs'

const IFREG = 0o100000
const IFDIR = 0o040000
const IFLNK = 0o120000

const codeError = (code, message) => Object.assign(new Error(message ?? code), { code })

const createNode = (type, mode, uid, gid, extra = {}) => ({ type, mode: type | (mode & 0o7777), uid, gid, nlink: 1, ...extra })

function normalize(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0')) throw codeError('EINVAL')
  const stack = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') stack.pop()
    else stack.push(segment)
  }
  return `/${stack.join('/')}`
}

export function createAcademyReleaseFakeFilesystem({ uid = 1000, gid = 1000 } = {}) {
  const root = createNode('dir', 0o755, 0, 0, { entries: new Map() })
  const syncLog = []
  const writeLog = []

  function lookup(path, { followFinal = true, forParent = false } = {}) {
    const absolute = normalize(path)
    const segments = absolute.slice(1).split('/').filter(Boolean)
    let node = root
    for (let index = 0; index < segments.length; index += 1) {
      const final = index === segments.length - 1
      if (node.type !== 'dir') throw codeError('ENOTDIR')
      let next = node.entries.get(segments[index])
      if (!next) {
        if (final && forParent) return { parent: node, name: segments[index], node: undefined }
        throw codeError('ENOENT')
      }
      if (!final || followFinal) {
        let depth = 0
        while (next.type === 'symlink') {
          if (depth++ > 8) throw codeError('ELOOP')
          const target = normalize(next.target.startsWith('/') ? next.target : `${absolute.slice(0, absolute.length - segments[index].length)}${next.target}`)
          next = lookup(target).node
        }
      }
      if (forParent && final) return { parent: node, name: segments[index], node: next }
      node = next
    }
    return { parent: null, name: '', node }
  }

  const realPath = (absolute, depth = 0) => {
    const clean = normalize(absolute)
    if (clean === '/') return '/'
    if (depth > 16) throw codeError('ELOOP')
    const parentReal = realPath(clean.slice(0, clean.lastIndexOf('/')) || '/', depth + 1)
    const name = clean.slice(clean.lastIndexOf('/') + 1)
    const parentNode = lookup(parentReal).node
    if (parentNode.type !== 'dir') throw codeError('ENOTDIR')
    const node = parentNode.entries.get(name)
    if (!node) throw codeError('ENOENT')
    if (node.type === 'symlink') {
      const target = node.target.startsWith('/') ? node.target : `${parentReal}/${node.target}`
      return realPath(target, depth + 1)
    }
    return normalize(`${parentReal}/${name}`)
  }

  const ensureDirectory = path => {
    const node = lookup(path).node
    if (node.type !== 'dir') throw codeError('ENOTDIR')
    return node
  }

  const statsOf = node => ({
    isFile: () => node.type === 'file',
    isDirectory: () => node.type === 'dir',
    isSymbolicLink: () => node.type === 'symlink',
    mode: node.mode, uid: node.uid, gid: node.gid, nlink: node.nlink,
    size: node.type === 'file' ? node.data.length : 0,
  })

  const openHandle = (path, node) => {
    const clean = normalize(path)
    return {
      stat: async () => statsOf(node),
      readFile: async encoding => encoding === 'utf8' ? node.data.toString('utf8') : Buffer.from(node.data),
      writeFile: async data => {
        node.data = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data), 'utf8')
        writeLog.push(clean)
      },
      sync: async () => { syncLog.push(clean) },
      close: async () => {},
    }
  }

  const inheritedGid = parent => (parent.mode & 0o2000) ? parent.gid : gid

  const fs = {
    syncLog, writeLog, uid, gid,
    async open(path, flags = constants.O_RDONLY, mode = 0o666) {
      const writing = Boolean(flags & (constants.O_WRONLY | constants.O_RDWR))
      if (flags & constants.O_CREAT) {
        const { parent, name, node: existing } = lookup(path, { followFinal: false, forParent: true })
        if (existing) {
          if (flags & constants.O_EXCL) throw codeError('EEXIST')
          const node = lookup(path).node
          if (node.type !== 'file') throw codeError('EISDIR')
          if (writing) node.data = Buffer.alloc(0)
          return openHandle(path, node)
        }
        if (!writing) throw codeError('ENOENT')
        const node = createNode('file', mode & 0o777, uid, inheritedGid(parent), { data: Buffer.alloc(0) })
        parent.entries.set(name, node)
        writeLog.push(normalize(path))
        return openHandle(path, node)
      }
      const { node } = lookup(path, { followFinal: !(flags & constants.O_NOFOLLOW), forParent: true })
      if (!node) throw codeError('ENOENT')
      if ((flags & constants.O_NOFOLLOW) && node.type === 'symlink') throw codeError('ELOOP')
      const target = node.type === 'symlink' ? lookup(realPath(normalize(path))).node : node
      if (target.type === 'symlink') throw codeError('ELOOP')
      if (writing) throw codeError('EBADF')
      return openHandle(path, target)
    },
    async stat(path) { return statsOf(lookup(path).node) },
    async lstat(path) { return statsOf(lookup(path, { followFinal: false }).node) },
    async realpath(path) { return realPath(path) },
    async readdir(path) { return [...ensureDirectory(path).entries.keys()] },
    async mkdir(path, { mode: directoryMode = 0o777, recursive = false } = {}) {
      const absolute = normalize(path)
      if (absolute === '/') return
      const segments = absolute.slice(1).split('/')
      let node = root
      let walked = ''
      for (let index = 0; index < segments.length; index += 1) {
        const final = index === segments.length - 1
        walked = `${walked}/${segments[index]}`
        let next = node.entries.get(segments[index])
        if (next) {
          next = lookup(walked).node
          if (next.type !== 'dir') throw codeError('ENOTDIR')
          if (final && !recursive) throw codeError('EEXIST')
        } else {
          if (!final && !recursive) throw codeError('ENOENT')
          // POSIX: a directory created inside a setgid directory inherits both
          // the parent group and the setgid bit itself (Linux semantics).
          const setgidParent = Boolean(node.mode & 0o2000)
          next = createNode('dir', setgidParent ? directoryMode | 0o2000 : directoryMode, uid, inheritedGid(node), { entries: new Map() })
          node.entries.set(segments[index], next)
        }
        node = next
      }
    },
    async rmdir(path) {
      const { parent, name, node } = lookup(path, { followFinal: false, forParent: true })
      if (!node || node.type !== 'dir' || node.entries.size > 0) throw codeError('ENOTEMPTY')
      parent.entries.delete(name)
    },
    async rm(path, { force = false, recursive = false } = {}) {
      let found
      try { found = lookup(path, { followFinal: false, forParent: true }) }
      catch (error) {
        if (error.code === 'ENOENT' && force) return
        throw error
      }
      if (!found.node) {
        if (force) return
        throw codeError('ENOENT')
      }
      if (found.node.type !== 'symlink' && found.node.type === 'dir' && found.node.entries.size > 0 && !recursive) throw codeError('ENOTEMPTY')
      found.parent.entries.delete(found.name)
    },
    async rename(from, to) {
      const source = lookup(from, { followFinal: false, forParent: true })
      if (!source.node) throw codeError('ENOENT')
      const destination = normalize(to)
      const segments = destination.slice(1).split('/')
      const targetName = segments.pop()
      const targetParent = ensureDirectory(`/${segments.join('/')}`)
      const existing = targetParent.entries.get(targetName)
      if (existing) {
        if (source.node.type === 'dir' && (existing.type !== 'dir' || existing.entries.size > 0)) throw codeError('ENOTEMPTY')
        if (source.node.type !== 'dir' && existing.type === 'dir') throw codeError('EISDIR')
      }
      source.parent.entries.delete(source.name)
      targetParent.entries.set(targetName, source.node)
    },
    async chmod(path, permissions) {
      const { node } = lookup(path, { followFinal: false })
      node.mode = (node.mode & ~0o7777) | (permissions & 0o7777)
    },
    async chown(path, uid, gid) {
      const { node } = lookup(path, { followFinal: false })
      if (Number.isSafeInteger(uid)) node.uid = uid
      if (Number.isSafeInteger(gid)) node.gid = gid
    },
    async link(from, to) {
      const node = lookup(from, { followFinal: false }).node
      const destination = normalize(to)
      const segments = destination.slice(1).split('/')
      const targetName = segments.pop()
      const targetParent = ensureDirectory(`/${segments.join('/')}`)
      if (targetParent.entries.has(targetName)) throw codeError('EEXIST')
      targetParent.entries.set(targetName, node)
      node.nlink += 1
    },
    async symlink(target, path) {
      const { parent, name } = lookup(path, { followFinal: false, forParent: true })
      if (parent.entries.has(name)) throw codeError('EEXIST')
      parent.entries.set(name, createNode('symlink', 0o777, uid, gid, { target, data: Buffer.alloc(0) }))
    },
    writeFileDirect: async (path, data, permissions = 0o644) => {
      const { parent, name } = lookup(path, { followFinal: false, forParent: true })
      parent.entries.set(name, createNode('file', permissions, uid, gid, { data: Buffer.from(data) }))
    },
    readNode: path => lookup(path).node,
    digestOf: async path => {
      const { createHash } = await import('node:crypto')
      return createHash('sha256').update(lookup(path).node.data).digest('hex')
    },
  }
  const processLike = { getuid: () => uid, getgid: () => gid, pid: 4242 }
  return { fs, processLike, root }
}
