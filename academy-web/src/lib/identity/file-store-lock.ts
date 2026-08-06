import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const LOCK_TIMEOUT_MS = 5_000

export class FileStoreLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileStoreLockError'
  }
}

/**
 * Serializes local file-store read/modify/write operations across processes.
 *
 * The local stores are not production persistence, but they must not teach a
 * one-time or revoke operation the wrong concurrency semantics. A crashed
 * holder leaves the lock and the next operation fails closed; the released
 * production store still needs its own transactional crash-recovery primitive.
 */
export function withExclusiveFileStoreLock<T>(filePath: string, operation: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  const lockPath = `${filePath}.lock`
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let descriptor: number | undefined

  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, 'wx', 0o600)
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }), 'utf8')
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor)
        descriptor = undefined
        removeLock(lockPath)
      }
      if (!isAlreadyExists(error)) throw new FileStoreLockError('file store lock สร้างไม่ได้')
      if (Date.now() >= deadline) throw new FileStoreLockError('file store lock ถูกใช้อยู่หรือค้างจาก process ที่หยุดทำงาน')
      sleep(10)
    }
  }

  try {
    return operation()
  } finally {
    closeSync(descriptor)
    removeLock(lockPath)
  }
}

function isAlreadyExists(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EEXIST'
}

function removeLock(lockPath: string): boolean {
  try {
    unlinkSync(lockPath)
    return true
  } catch (error) {
    return !!error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}
