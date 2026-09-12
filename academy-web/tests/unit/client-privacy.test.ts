import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  browserCheckpointDraftStore,
  checkpointDraftKey,
  clearBrowserCheckpointDraftMemory,
  loadCheckpointDraft,
  saveCheckpointDraft,
  type CheckpointDraftScope,
} from '@/lib/course/checkpoint-draft'
import {
  browserStore,
  clearBrowserAttemptMemory,
  newAttempt,
  saveAttempt,
} from '@/lib/player/progress'
import {
  browserCourseStore,
  clearBrowserCourseProgressMemory,
} from '@/lib/course/progress'
import {
  clearLocalLearnerState,
  installLocalLearnerStateSync,
} from '@/lib/privacy/local-learner-state'
import { signOutCurrentBrowser } from '@/lib/auth/sign-out-client'

const scope: CheckpointDraftScope = {
  courseSlug: 'security-core',
  nodeId: 'network-node',
  attemptId: 'attempt-1',
}

function persistentStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storageObject = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
      Object.defineProperty(storage, key, { value, enumerable: true, writable: true, configurable: true })
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
      delete storage[key]
    }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
  }
  const storage = storageObject as unknown as Storage & Record<string, unknown>
  Object.defineProperty(storage, 'length', { get: () => values.size })
  for (const [key, value] of values) {
    Object.defineProperty(storage, key, { value, enumerable: true, writable: true, configurable: true })
  }
  return { storage, values }
}

function stubBrowser(initial: Record<string, string> = {}) {
  const local = persistentStorage(initial)
  const session = persistentStorage()
  const indexedDB = { open: vi.fn() }
  const document = { cookie: '' }
  const cookieSetter = vi.fn()
  Object.defineProperty(document, 'cookie', { set: cookieSetter, get: () => '' })
  const reload = vi.fn()
  vi.stubGlobal('window', { localStorage: local.storage, sessionStorage: session.storage, location: { reload } })
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('document', document)
  return { local, session, indexedDB, reload }
}

describe('client learner privacy', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    clearLocalLearnerState()
  })

  it('keeps browser checkpoint drafts in memory and writes no sensitive browser store', () => {
    const browser = stubBrowser({ 'academy.theme': 'dark' })
    const store = browserCheckpointDraftStore()
    expect(store).not.toBeNull()

    saveCheckpointDraft(store!, scope, [{ id: 'q1', choices: { A: 'A', B: 'B' } }], [], {
      answers: { q1: ['A'] },
      simulations: {},
    })

    expect(loadCheckpointDraft(store!, scope, [{ id: 'q1', choices: { A: 'A', B: 'B' } }], [])?.answers)
      .toEqual({ q1: ['A'] })
    expect(browser.local.storage.setItem).not.toHaveBeenCalled()
    expect(browser.session.storage.setItem).not.toHaveBeenCalled()
    expect(browser.indexedDB.open).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
    expect(browser.local.values.get('academy.theme')).toBe('dark')
  })

  it('removes only exact Academy learner prefixes and keeps unrelated values', () => {
    const draftKey = checkpointDraftKey(scope)
    const browser = stubBrowser({
      [draftKey]: '{"version":1,"answers":{},"simulations":{}}',
      'academy.checkpoint-draft:v1-lookalike': 'unrelated',
      'academy.progress.v1:demo:old': '{}',
      'academy.progress.k2:4:demo3:old': '{}',
      'academy.course.v1:security-core': '{}',
      'academy.locale': 'en',
      'theme': 'dark',
    })

    browserCheckpointDraftStore()
    browserStore()
    browserCourseStore()

    expect(browser.local.values.has(draftKey)).toBe(false)
    expect(browser.local.values.has('academy.progress.v1:demo:old')).toBe(false)
    expect(browser.local.values.has('academy.progress.k2:4:demo3:old')).toBe(false)
    expect(browser.local.values.has('academy.course.v1:security-core')).toBe(false)
    expect([...browser.local.values.entries()]).toEqual([
      ['academy.checkpoint-draft:v1-lookalike', 'unrelated'],
      ['academy.locale', 'en'],
      ['theme', 'dark'],
    ])
  })

  it('keeps learner work usable when persistent storage access is denied', () => {
    const denied = {
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('denied', 'SecurityError') },
      removeItem: () => { throw new DOMException('denied', 'SecurityError') },
    }
    vi.stubGlobal('window', { localStorage: denied })
    clearBrowserAttemptMemory()
    clearBrowserCheckpointDraftMemory()
    clearBrowserCourseProgressMemory()

    const draftStore = browserCheckpointDraftStore()
    expect(() => saveCheckpointDraft(draftStore!, scope, [], [], { answers: {}, simulations: {} })).not.toThrow()
    expect(loadCheckpointDraft(draftStore!, scope, [], [])).toEqual({ answers: {}, simulations: {} })

    const progressStore = browserStore()
    const record = newAttempt('demo', 'practice', { now: 1 })
    expect(() => saveAttempt(progressStore, record)).not.toThrow()
  })

  it('clears local learner state on logout intent but preserves failure navigation behavior', async () => {
    const browser = stubBrowser({
      [checkpointDraftKey(scope)]: '{"version":1,"answers":{"q1":["A"]},"simulations":{}}',
      'academy.locale': 'th',
    })
    const channels: Array<{ posted: unknown[] }> = []
    vi.stubGlobal('BroadcastChannel', class {
      posted: unknown[] = []
      onmessage = null
      constructor() { channels.push(this) }
      postMessage(message: unknown) { this.posted.push(message) }
      close() {}
    })
    const fetcher = vi.fn().mockRejectedValue(new Error('network unavailable'))
    vi.stubGlobal('fetch', fetcher)

    await expect(signOutCurrentBrowser()).rejects.toThrow('network unavailable')
    expect(browser.local.values.has(checkpointDraftKey(scope))).toBe(false)
    expect(browser.local.values.get('academy.locale')).toBe('th')
    expect(channels).toHaveLength(0)
  })

  it('signals siblings only with a bounded local-clear message and revalidates locally', async () => {
    const browser = stubBrowser()
    const channels: Array<{
      posted: unknown[]
      onmessage: ((event: { data: unknown }) => void) | null
    }> = []
    vi.stubGlobal('BroadcastChannel', class {
      posted: unknown[] = []
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor() { channels.push(this) }
      postMessage(message: unknown) { this.posted.push(message) }
      close() {}
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      ok: true,
      scope: 'local',
      revocation: 'confirmed',
    })))

    await expect(signOutCurrentBrowser()).resolves.toBe('/')
    expect(channels).toHaveLength(1)
    expect(channels[0].posted).toEqual([{ type: 'academy.local-learner-clear', version: 1 }])
    expect(JSON.stringify(channels[0].posted[0])).not.toMatch(/email|token|answer|simulation|session/i)

    const draftStore = browserCheckpointDraftStore()!
    saveCheckpointDraft(draftStore, scope, [{ id: 'q1', choices: { A: 'A' } }], [], {
      answers: { q1: ['A'] },
      simulations: {},
    })
    const cleanup = installLocalLearnerStateSync()
    channels[1].onmessage?.({ data: { type: 'academy.local-learner-clear', version: 1, answers: ['A'] } })
    expect(browser.reload).not.toHaveBeenCalled()

    channels[1].onmessage?.({ data: { type: 'academy.local-learner-clear', version: 1 } })
    expect(loadCheckpointDraft(draftStore, scope, [{ id: 'q1', choices: { A: 'A' } }], [])).toBeNull()
    expect(browser.reload).toHaveBeenCalledOnce()
    cleanup()
  })
})


