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

const LEGACY_PREFIX = 'academy.progress.v1'
const K2_PREFIX = 'academy.progress.k2:'

function legacyKey(contentId: string, attemptId: string): string {
  return `${LEGACY_PREFIX}:${contentId}:${attemptId}`
}

function k2Key(contentId: string, attemptId: string): string {
  return `${K2_PREFIX}${contentId.length}:${contentId}${attemptId.length}:${attemptId}`
}

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
    expect([...store.map.keys()]).toEqual([k2Key(rec.contentId, rec.attemptId)])
  })

  it('round-trips delimiter and lone-surrogate segments through the injective k2 key', () => {
    const store = memStore()
    const rec = newAttempt('module:\uD800:lesson', 'practice', { now: 10 })
    rec.attemptId = 'attempt:\uDFFF:one'

    saveAttempt(store, rec)

    expect([...store.map.keys()]).toEqual([k2Key(rec.contentId, rec.attemptId)])
    expect(loadAttempt(store, rec.contentId, rec.attemptId)).toEqual({
      record: rec,
      corruptReset: false,
    })
  })

  it('copies an exact valid legacy record to k2 while preserving the legacy key', () => {
    const store = memStore()
    const rec = newAttempt('exam-legacy', 'exam', { now: 20 })
    rec.attemptId = 'attempt-legacy'
    const oldKey = legacyKey(rec.contentId, rec.attemptId)
    store.map.set(oldKey, JSON.stringify(rec))

    expect(loadAttempt(store, rec.contentId, rec.attemptId)).toEqual({
      record: rec,
      corruptReset: false,
    })
    expect(store.map.get(oldKey)).toBe(JSON.stringify(rec))
    expect(store.map.get(k2Key(rec.contentId, rec.attemptId))).toBe(JSON.stringify(rec))
  })

  it('leaves an invalid legacy candidate untouched because delimiter ownership is ambiguous', () => {
    const store = memStore()
    const oldKey = legacyKey('module', 'lesson:attempt-1')
    store.map.set(oldKey, '{not-json')

    expect(loadAttempt(store, 'module', 'lesson:attempt-1')).toEqual({
      record: null,
      corruptReset: false,
    })
    expect(store.map.get(oldKey)).toBe('{not-json')
  })

  it('preserves a module versus module:lesson legacy collision and migrates only the exact owner', () => {
    const store = memStore()
    const owner = newAttempt('module:lesson', 'practice', { now: 30 })
    owner.attemptId = 'attempt-1'
    const collidingKey = legacyKey(owner.contentId, owner.attemptId)
    expect(collidingKey).toBe(legacyKey('module', 'lesson:attempt-1'))
    store.map.set(collidingKey, JSON.stringify(owner))

    expect(loadAttempt(store, 'module', 'lesson:attempt-1')).toEqual({
      record: null,
      corruptReset: false,
    })
    expect(store.map.get(collidingKey)).toBe(JSON.stringify(owner))
    expect(loadAttempt(store, owner.contentId, owner.attemptId)).toEqual({
      record: owner,
      corruptReset: false,
    })
    expect(store.map.get(collidingKey)).toBe(JSON.stringify(owner))
    expect(store.map.get(k2Key(owner.contentId, owner.attemptId))).toBe(JSON.stringify(owner))
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

  it.each([
    ['contentId', (record: Record<string, unknown>) => { record.contentId = 'exam-foreign' }],
    ['attemptId', (record: Record<string, unknown>) => { record.attemptId = 'attempt-foreign' }],
  ])('record ที่ %s ไม่ตรง storage key → reset แทนการ resume ข้าม scope', (_field, mutate) => {
    const store = memStore()
    const rec = newAttempt('exam-1', 'exam', { now: 5 })
    saveAttempt(store, rec)
    const key = [...store.map.keys()][0]
    const stored = JSON.parse(store.map.get(key)!) as Record<string, unknown>
    mutate(stored)
    store.map.set(key, JSON.stringify(stored))

    expect(loadAttempt(store, 'exam-1', rec.attemptId)).toEqual({
      record: null,
      corruptReset: true,
    })
    expect(store.map.has(key)).toBe(false)
  })

  it('latestAttempt ข้าม record ต่าง content scope และคืน valid fallback', () => {
    const store = memStore()
    const valid = newAttempt('exam-1', 'exam', { now: 1_000 })
    const foreign = newAttempt('exam-1', 'exam', { now: 2_000 })
    saveAttempt(store, valid)
    saveAttempt(store, foreign)
    const foreignKey = [...store.map.keys()].find((key) => key.endsWith(`:${foreign.attemptId}`))!
    const stored = JSON.parse(store.map.get(foreignKey)!) as Record<string, unknown>
    stored.contentId = 'exam-foreign'
    store.map.set(foreignKey, JSON.stringify(stored))

    expect(latestAttempt(store, 'exam-1')).toEqual({
      record: valid,
      corruptReset: true,
    })
    expect(store.map.has(foreignKey)).toBe(false)
  })

  it('latestAttempt deletes only corrupt k2 state attributable to the requested content', () => {
    const store = memStore()
    const requestedKey = k2Key('exam-1', 'attempt-1')
    const foreignKey = k2Key('exam-2', 'attempt-2')
    store.map.set(requestedKey, '{bad-requested')
    store.map.set(foreignKey, '{bad-foreign')

    expect(latestAttempt(store, 'exam-1')).toEqual({
      record: null,
      corruptReset: true,
    })
    expect(store.map.has(requestedKey)).toBe(false)
    expect(store.map.get(foreignKey)).toBe('{bad-foreign')
  })

  it('latestAttempt reads legacy ownership from the record instead of a raw content prefix', () => {
    const store = memStore()
    const owner = newAttempt('module:lesson', 'practice', { now: 40 })
    owner.attemptId = 'attempt-1'
    const collidingKey = legacyKey(owner.contentId, owner.attemptId)
    store.map.set(collidingKey, JSON.stringify(owner))

    expect(latestAttempt(store, 'module')).toEqual({ record: null, corruptReset: false })
    expect(store.map.has(collidingKey)).toBe(true)
    expect(latestAttempt(store, owner.contentId)).toEqual({ record: owner, corruptReset: false })
    expect(store.map.has(collidingKey)).toBe(true)
    expect(store.map.get(k2Key(owner.contentId, owner.attemptId))).toBe(JSON.stringify(owner))
  })

  it('deduplicates a v1/v2 attempt and always prefers the valid k2 record', () => {
    const store = memStore()
    const k2Record = newAttempt('exam-1', 'exam', { now: 100 })
    k2Record.attemptId = 'same-attempt'
    k2Record.status = 'submitted'
    const legacyRecord = { ...k2Record, status: 'in-progress' as const, startedAt: 9_999 }
    store.map.set(legacyKey(legacyRecord.contentId, legacyRecord.attemptId), JSON.stringify(legacyRecord))
    store.map.set(k2Key(k2Record.contentId, k2Record.attemptId), JSON.stringify(k2Record))

    expect(latestAttempt(store, 'exam-1')).toEqual({ record: k2Record, corruptReset: false })
    expect(store.map.get(legacyKey(legacyRecord.contentId, legacyRecord.attemptId))).toBe(JSON.stringify(legacyRecord))
  })

  it('breaks startedAt ties by ascending attemptId code units regardless of key enumeration', () => {
    const store = memStore()
    const second = newAttempt('exam-1', 'exam', { now: 500 })
    second.attemptId = 'attempt-z'
    const first = newAttempt('exam-1', 'exam', { now: 500 })
    first.attemptId = 'attempt-a'
    saveAttempt(store, second)
    saveAttempt(store, first)
    const insertionOrder = [...store.map.keys()]
    const forward = { ...store, keys: () => [...insertionOrder] }
    const reverse = { ...store, keys: () => [...insertionOrder].reverse() }

    expect(latestAttempt(forward, 'exam-1').record?.attemptId).toBe('attempt-a')
    expect(latestAttempt(reverse, 'exam-1').record?.attemptId).toBe('attempt-a')
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
