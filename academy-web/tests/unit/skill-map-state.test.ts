import { describe, expect, it } from 'vitest'
import { skillMapPresentation } from '@/lib/course/skill-map-state'

const coverage = [{ id: 'shell', label: 'Shell skills', value: 50, notStarted: false }]

describe('learner skill map presentation state', () => {
  it('shows loading, unavailable, and ready states only for a confirmed learner route', () => {
    expect(skillMapPresentation({ learnerRoute: true, state: 'loading', coverage: null, accessConfirmed: true })).toBe('loading')
    expect(skillMapPresentation({ learnerRoute: true, state: 'unavailable', coverage: null, accessConfirmed: true })).toBe('unavailable')
    expect(skillMapPresentation({ learnerRoute: true, state: 'ready', coverage, accessConfirmed: true })).toBe('ready')
  })

  it('fails closed when the route is public, access is lost, or data is incomplete', () => {
    expect(skillMapPresentation({ learnerRoute: false, state: 'ready', coverage, accessConfirmed: true })).toBe('hidden')
    expect(skillMapPresentation({ learnerRoute: true, state: 'ready', coverage, accessConfirmed: false })).toBe('hidden')
    expect(skillMapPresentation({ learnerRoute: true, state: 'ready', coverage: null, accessConfirmed: true })).toBe('hidden')
  })
})
