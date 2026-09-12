import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectAttemptRecovery, recordForegroundActivity } from '@/lib/auth/session-recovery-client'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('bounded session recovery transport', () => {
  it.each([[200, {ok:true}, 'active'], [401, {}, 'signed-out'], [429, {}, 'unconfirmed'], [503, {}, 'unconfirmed'], [200, {ok:true,extra:true}, 'unconfirmed']])('maps %s without inventing session confirmation', async (status,body,expected) => {
    const fetcher = vi.fn().mockResolvedValue(json(body, Number(status))); vi.stubGlobal('fetch', fetcher)
    expect(await recordForegroundActivity()).toBe(expected)
    expect(fetcher).toHaveBeenCalledWith('/api/auth/activity', expect.objectContaining({ credentials:'same-origin', cache:'no-store', redirect:'error', body:'{}' }))
  })
  it.each(['active','completed','pending','invalid'])('accepts only exact same-attempt %s evidence', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ok:true,attemptId:'owned',status})))
    expect(await inspectAttemptRecovery('course','lesson','owned')).toBe(status)
  })
  it.each([{ok:true,attemptId:'other',status:'active'}, {ok:true,attemptId:'owned',status:'active',extra:1}, {ok:true,attemptId:'owned',status:'unknown'}])('rejects mismatched recovery response', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)))
    expect(await inspectAttemptRecovery('course','lesson','owned')).toBe('unconfirmed')
  })
  it.each(['headers','body'])('bounds a hanging %s phase to one total deadline', async phase => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return phase === 'headers' ? new Promise(()=>{}) : Promise.resolve(new Response(new ReadableStream({type:'bytes',start(){},cancel(){return new Promise(()=>{})}}), {headers:{'content-type':'application/json'}})) }))
    const pending = inspectAttemptRecovery('course','lesson','owned')
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBe('unconfirmed'); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0)
  })
})
