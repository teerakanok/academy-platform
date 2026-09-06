export type AssessmentIntegrityReason = 'rate-window' | 'daily-cap' | 'repeat-failure' | 'dwell-time'
const ALLOWED_REASONS = new Set<AssessmentIntegrityReason>(['rate-window', 'daily-cap', 'repeat-failure', 'dwell-time'])

function retryWaitBucket(retryAt: Date): string {
  const seconds = Math.max(0, Math.ceil((retryAt.getTime() - Date.now()) / 1000))
  if (seconds < 60) return '<1m'
  if (seconds < 900) return '1m-15m'
  if (seconds < 3_600) return '15m-1h'
  return '1h+'
}

export function recordAssessmentIntegrityEvent(reason: AssessmentIntegrityReason, retryAt: Date): void {
  if (!ALLOWED_REASONS.has(reason)) return
  const evidence = JSON.stringify({
    event: 'assessment-integrity',
    reason,
    retry_wait: retryWaitBucket(retryAt),
  })
  if (evidence.length <= 192) console.warn(evidence)
}
