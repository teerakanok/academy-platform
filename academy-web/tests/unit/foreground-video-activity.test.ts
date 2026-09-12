import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ activity: vi.fn() }))
vi.mock('@/lib/auth/session-recovery-client', () => ({ recordForegroundActivity: mocks.activity }))
class Video extends EventTarget {
  currentTime = 0; paused = true; ended = false
  play() { this.paused=false; this.dispatchEvent(new Event('playing')) }
  pause() { this.paused=true; this.dispatchEvent(new Event('pause')) }
  advance() { this.currentTime++; this.dispatchEvent(new Event('timeupdate')) }
}
let doc: EventTarget & {visibilityState:string}
let detach: (()=>void) | undefined
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']})
  doc=Object.assign(new EventTarget(),{visibilityState:'visible'}); vi.stubGlobal('document',doc)
  mocks.activity.mockReset().mockResolvedValue('active')
})
afterEach(() => { detach?.(); detach=undefined; vi.unstubAllGlobals(); vi.useRealTimers() })
async function setup() {
  const { attachForegroundVideoActivity } = await import('@/lib/auth/foreground-video-activity')
  const video = new Video(), ended=vi.fn()
  detach=attachForegroundVideoActivity(video as unknown as HTMLVideoElement,ended)
  return { video, ended, attachForegroundVideoActivity }
}
describe('foreground video authenticated activity', () => {
  it('sends only for visible playing progress, at most once per minute across remounts', async () => {
    const {video,attachForegroundVideoActivity}=await setup()
    video.advance(); expect(mocks.activity).not.toHaveBeenCalled()
    video.play(); await Promise.resolve(); expect(mocks.activity).toHaveBeenCalledOnce()
    video.advance(); await vi.advanceTimersByTimeAsync(59999); expect(mocks.activity).toHaveBeenCalledOnce()
    detach!(); const replacement=new Video(); detach=attachForegroundVideoActivity(replacement as unknown as HTMLVideoElement,vi.fn())
    replacement.play(); replacement.advance(); expect(mocks.activity).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1); replacement.advance(); await Promise.resolve(); expect(mocks.activity).toHaveBeenCalledTimes(2)
  })
  it('stops timers when paused or hidden, and never treats stalled playback as activity', async () => {
    const {video}=await setup(); video.play(); video.advance(); await Promise.resolve()
    video.pause(); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000); video.advance(); expect(mocks.activity).toHaveBeenCalledOnce()
    doc.visibilityState='hidden'; video.play(); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000); video.advance(); expect(mocks.activity).toHaveBeenCalledOnce()
    doc.visibilityState='visible'; doc.dispatchEvent(new Event('visibilitychange')); await Promise.resolve()
    expect(mocks.activity).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120000); expect(mocks.activity).toHaveBeenCalledTimes(2)
  })
  it('pauses and masks only confirmed session expiry, while quota/outage remain unconfirmed', async () => {
    mocks.activity.mockResolvedValueOnce('unconfirmed').mockResolvedValueOnce('signed-out')
    const {video,ended}=await setup();video.play();video.advance();await Promise.resolve()
    expect(ended).not.toHaveBeenCalled(); expect(video.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(60000);video.advance();await Promise.resolve()
    expect(ended).toHaveBeenCalledOnce();expect(video.paused).toBe(true);expect(vi.getTimerCount()).toBe(0)
  })
  it('does not overlap requests or invoke a detached component', async () => {
    let resolve!: (value:string)=>void; mocks.activity.mockReturnValue(new Promise(r=>{resolve=r}))
    const {video,ended}=await setup(); video.play();video.advance();await vi.advanceTimersByTimeAsync(120000);video.advance()
    expect(mocks.activity).toHaveBeenCalledOnce();detach!();resolve('signed-out');await Promise.resolve();expect(ended).not.toHaveBeenCalled()
  })
})

