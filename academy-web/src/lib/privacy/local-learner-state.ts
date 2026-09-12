import { clearBrowserCheckpointDraftMemory, clearLegacyCheckpointDrafts } from '@/lib/course/checkpoint-draft'
import {
  clearBrowserCourseProgressMemory,
  clearLegacyCourseProgress,
} from '@/lib/course/progress'
import { clearBrowserAttemptMemory, clearLegacyBrowserAttempts } from '@/lib/player/progress'

const CHANNEL_NAME = 'academy.local-learner-clear:v1'
const CLEAR_MESSAGE = { type: 'academy.local-learner-clear', version: 1 } as const

function isValidClearMessage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 2
    && record.type === CLEAR_MESSAGE.type
    && record.version === CLEAR_MESSAGE.version
}

export function clearLegacyPersistentLearnerState(): void {
  clearLegacyCheckpointDrafts()
  clearLegacyCourseProgress()
  clearLegacyBrowserAttempts()
}

export function clearLocalLearnerState(): void {
  clearBrowserCheckpointDraftMemory()
  clearBrowserCourseProgressMemory()
  clearBrowserAttemptMemory()
  clearLegacyPersistentLearnerState()
}

export function notifySiblingTabsOfLocalLearnerClear(): void {
  if (typeof BroadcastChannel === 'undefined') return

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(CLEAR_MESSAGE)
    channel.close()
  } catch {
    // A denied channel cannot be used to elevate cleanup or block sign-out.
  }
}

export function installLocalLearnerStateSync(): () => void {
  if (typeof window === 'undefined') return () => undefined

  clearLegacyPersistentLearnerState()

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent) => {
      if (!isValidClearMessage(event.data)) return
      clearLocalLearnerState()
      window.location.reload()
    }
    return () => {
      channel.onmessage = null
      channel.close()
    }
  } catch {
    return () => undefined
  }
}


