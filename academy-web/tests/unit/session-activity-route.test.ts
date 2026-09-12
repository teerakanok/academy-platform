import { beforeEach, describe, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({user:vi.fn(),quota:vi.fn(),marker:vi.fn(),csrf:vi.fn()}))
vi.mock('@/lib/auth/session',()=>({currentUser:m.user}))
vi.mock('@/lib/authenticated-mutation-quota',()=>({checkAuthenticatedMutationQuota:m.quota}))
vi.mock('@/lib/edge-rate-limit-policy',()=>({hasEdgeRateLimitMarker:m.marker}))
vi.mock('@/lib/http/mutation-security',()=>({validateMutationRequest:m.csrf}))
import { POST } from '@/app/(site)/api/auth/activity/route'
const req=(body='{}')=>new Request('https://academy.example/api/auth/activity',{method:'POST',headers:{'content-type':'application/json'},body})
beforeEach(()=>{ vi.clearAllMocks();m.user.mockReset().mockResolvedValue({account:{id:'owner'}});m.quota.mockResolvedValue({allowed:true});m.marker.mockResolvedValue(true);m.csrf.mockReturnValue({ok:true}) })
describe('activity authenticates without touch before account quota',()=>{
  it('orders peek, quota, final validated activity and returns no-store',async()=>{
    const order:string[]=[]
    m.user.mockImplementation(async options=>{order.push(options?.recordActivity===false?'peek':'touch');return {account:{id:'owner'}}})
    m.quota.mockImplementation(async()=>{order.push('quota');return {allowed:true}})
    const response=await POST(req());expect(response.status).toBe(200);expect(order).toEqual(['peek','quota','touch']);expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('does not touch on quota denial',async()=>{
    m.quota.mockResolvedValue({allowed:false,status:429,retryAfterSeconds:60})
    const response=await POST(req());expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('60');expect(m.user).toHaveBeenCalledExactlyOnceWith({recordActivity:false})
  })
  it.each([null,{account:{id:'different'}}])('never confirms expired or changed principal at final validation',async final=>{
    m.user.mockResolvedValueOnce({account:{id:'owner'}}).mockResolvedValueOnce(final)
    expect((await POST(req())).status).toBe(401)
  })
  it('rejects expired peek without consuming quota or touching',async()=>{
    m.user.mockResolvedValue(null);expect((await POST(req())).status).toBe(401);expect(m.quota).not.toHaveBeenCalled()
  })
  it.each(['[]','{"playing":true}','null'])('rejects arbitrary activity payload %s before authentication',async body=>{
    expect((await POST(req(body))).status).toBe(400);expect(m.user).not.toHaveBeenCalled()
  })
  it('rejects unsigned edge admission before authentication',async()=>{
    m.marker.mockResolvedValue(false);expect((await POST(req())).status).toBe(403);expect(m.user).not.toHaveBeenCalled()
  })
})

