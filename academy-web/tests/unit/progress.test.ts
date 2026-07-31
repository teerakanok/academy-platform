import { describe, expect, it } from 'vitest'
import {
  isExpired,
  latestAttempt,
  loadAttempt,
  newAttempt,
  remainingMs,
  saveAttempt,
  type ProgressStore,
} from '@/lib/player/progress'

function memStore(): ProgressStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

describe('progress store (versioned localStorage)', () => {
  it('save → load round-trip', () => {
    const store = memStore()
    const rec = newAttempt('exam-1', 'exam', { timeLimitMinutes: 165, now: 1_000_000 })
    rec.answers.mcq['Q1'] = ['A']
    saveAttempt(store, rec)
    const { record, corruptReset } = loadAttempt(store, 'exam-1', rec.attemptId)
    expect(corruptReset).toBe(false)
    expect(record!.answers.mcq['Q1']).toEqual(['A'])
    expect(record!.endsAt).toBe(1_000_000 + 165 * 60_000)
  })

  it('corrupt JSON → reset (ลบทิ้ง) + แจ้ง corruptReset', () => {
    const store = memStore()
    const rec = newAttempt('exam-1', 'exam', { now: 5 })
    saveAttempt(store, rec)
    const key = [...store.map.keys()][0]
    store.map.set(key, '{not-json')
    const result = loadAttempt(store, 'exam-1', rec.attemptId)
    expect(result.record).toBeNull()
    expect(result.corruptReset).toBe(true)
    expect(store.map.has(key)).toBe(false)
  })

  it('shape ผิด version → ถือว่า corrupt', () => {
    const store = memStore()
    const rec = newAttempt('exam-1', 'exam', { now: 5 })
    saveAttempt(store, rec)
    const key = [...store.map.keys()][0]
    store.map.set(key, JSON.stringify({ ...rec, version: 'v999' }))
    expect(loadAttempt(store, 'exam-1', rec.attemptId).corruptReset).toBe(true)
  })

  it('retake = attempt ใหม่ ไม่ทับของเก่า + latestAttempt คืนตัวล่าสุด', () => {
    const store = memStore()
    const first = newAttempt('exam-1', 'exam', { now: 1000 })
    first.status = 'submitted'
    saveAttempt(store, first)
    const second = newAttempt('exam-1', 'exam', { now: 2000 })
    saveAttempt(store, second)
    expect(first.attemptId).not.toBe(second.attemptId)
    expect(store.map.size).toBe(2)
    const { record } = latestAttempt(store, 'exam-1')
    expect(record!.attemptId).toBe(second.attemptId)
  })

  it('timer แบบ deadline: reload แล้วเวลาไม่เพี้ยน (fake clock)', () => {
    const rec = newAttempt('exam-1', 'exam', { timeLimitMinutes: 10, now: 100_000 })
    expect(remainingMs(rec, 100_000)).toBe(600_000)
    expect(remainingMs(rec, 400_000)).toBe(300_000) // ผ่านไป 5 นาที — ไม่ขึ้นกับ state ฝั่ง UI
    expect(isExpired(rec, 699_999)).toBe(false)
    expect(isExpired(rec, 700_000)).toBe(true)
    expect(remainingMs(rec, 900_000)).toBe(0)
  })

  it('practice ไม่มี limit → endsAt null, ไม่หมดอายุ', () => {
    const rec = newAttempt('module-1', 'practice', { now: 1 })
    expect(rec.endsAt).toBeNull()
    expect(isExpired(rec, Number.MAX_SAFE_INTEGER)).toBe(false)
    expect(remainingMs(rec, 999)).toBeNull()
  })
})
