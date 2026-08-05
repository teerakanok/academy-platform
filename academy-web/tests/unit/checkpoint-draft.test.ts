import { describe, expect, it } from 'vitest'
import {
  checkpointDraftKey,
  clearCheckpointDraft,
  loadCheckpointDraft,
  saveCheckpointDraft,
  type CheckpointDraftStore,
} from '@/lib/course/checkpoint-draft'

function memoryStore(): CheckpointDraftStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

const scope = {
  courseSlug: 'basic-os-linux',
  nodeId: 'capstone-network',
  attemptId: '00000000-0000-4000-8000-000000000001',
}

const questions = [{ id: 'q-1', choices: { A: 'one', B: 'two' } }]
const simulations = [
  {
    id: 'sim-1',
    surface: 'network-interface' as const,
    initial: { addressMode: 'dhcp', applied: false, ipv4: '', subnet: '', gateway: '', dns1: '' },
  },
]

describe('checkpoint draft', () => {
  it('round-trips learner work only within one issued attempt', () => {
    const store = memoryStore()
    saveCheckpointDraft(store, scope, questions, simulations, {
      answers: { 'q-1': ['B'] },
      simulations: { 'sim-1': { addressMode: 'static', applied: true, ipv4: '192.0.2.10', subnet: '255.255.255.0', gateway: '', dns1: '' } },
    })

    expect(loadCheckpointDraft(store, scope, questions, simulations)).toEqual({
      answers: { 'q-1': ['B'] },
      simulations: { 'sim-1': { addressMode: 'static', applied: true, ipv4: '192.0.2.10', subnet: '255.255.255.0', gateway: '', dns1: '' } },
    })
    expect(loadCheckpointDraft(store, { ...scope, attemptId: '00000000-0000-4000-8000-000000000002' }, questions, simulations)).toBeNull()
  })

  it('drops corrupt or out-of-contract browser storage instead of rendering it', () => {
    const store = memoryStore()
    const key = checkpointDraftKey(scope)
    store.setItem(
      key,
      JSON.stringify({
        version: 1,
        answers: { 'q-1': ['Z'], unknown: ['A'] },
        simulations: { 'sim-1': { addressMode: 'static', applied: 'yes', unknown: 'x' } },
      }),
    )

    expect(loadCheckpointDraft(store, scope, questions, simulations)).toEqual({
      answers: {},
      simulations: { 'sim-1': { addressMode: 'static', applied: false, ipv4: '', subnet: '', gateway: '', dns1: '' } },
    })

    store.setItem(key, '{not-json')
    expect(loadCheckpointDraft(store, scope, questions, simulations)).toBeNull()
    expect(store.values.has(key)).toBe(false)
  })

  it('clears only the completed or replaced attempt draft', () => {
    const store = memoryStore()
    saveCheckpointDraft(store, scope, questions, simulations, {
      answers: { 'q-1': ['A'] },
      simulations: { 'sim-1': simulations[0].initial },
    })
    const other = { ...scope, attemptId: '00000000-0000-4000-8000-000000000002' }
    saveCheckpointDraft(store, other, questions, simulations, {
      answers: { 'q-1': ['B'] },
      simulations: { 'sim-1': simulations[0].initial },
    })

    clearCheckpointDraft(store, scope)
    expect(loadCheckpointDraft(store, scope, questions, simulations)).toBeNull()
    expect(loadCheckpointDraft(store, other, questions, simulations)?.answers).toEqual({ 'q-1': ['B'] })
  })

  it('treats denied browser storage as unavailable instead of throwing into the checkpoint', () => {
    const denied: CheckpointDraftStore = {
      getItem: () => {
        throw new Error('storage denied')
      },
      setItem: () => {
        throw new Error('storage denied')
      },
      removeItem: () => {
        throw new Error('storage denied')
      },
    }

    expect(loadCheckpointDraft(denied, scope, questions, simulations)).toBeNull()
    expect(() => saveCheckpointDraft(denied, scope, questions, simulations, { answers: {}, simulations: {} })).not.toThrow()
    expect(() => clearCheckpointDraft(denied, scope)).not.toThrow()

    const malformedButUndeletable: CheckpointDraftStore = {
      getItem: () => '{not-json',
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('storage denied')
      },
    }
    expect(loadCheckpointDraft(malformedButUndeletable, scope, questions, simulations)).toBeNull()
  })
})
