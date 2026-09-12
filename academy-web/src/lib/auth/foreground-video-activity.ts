import { recordForegroundActivity } from './session-recovery-client'

// Aggregate across player remounts in this tab; the server additionally limits
// the authenticated account. A monotonic clock avoids wall-clock adjustments.
let lastRequestAt = -Infinity
export function attachForegroundVideoActivity(video: HTMLVideoElement, onSessionEnded: () => void): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let detached = false
  let inFlight = false
  let lastPosition = video.currentTime
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined }
  const eligible = () => !detached && document.visibilityState === 'visible' && !video.paused && !video.ended
  const sample = async () => {
    if (!eligible() || inFlight || video.currentTime === lastPosition || performance.now() - lastRequestAt < 60_000) return
    lastPosition = video.currentTime
    lastRequestAt = performance.now()
    inFlight = true
    try {
      if (await recordForegroundActivity() === 'signed-out' && !detached) { stop(); video.pause(); onSessionEnded() }
    } finally { inFlight = false }
  }
  const reconcile = () => {
    stop()
    if (!eligible()) return
    void sample()
    timer = setInterval(() => void sample(), 60_000)
  }
  video.addEventListener('playing', reconcile)
  video.addEventListener('pause', reconcile)
  video.addEventListener('ended', reconcile)
  video.addEventListener('timeupdate', sample)
  document.addEventListener('visibilitychange', reconcile)
  reconcile()
  return () => { detached = true; stop(); video.removeEventListener('playing', reconcile)
    video.removeEventListener('pause', reconcile); video.removeEventListener('ended', reconcile)
    video.removeEventListener('timeupdate', sample); document.removeEventListener('visibilitychange', reconcile) }
}

