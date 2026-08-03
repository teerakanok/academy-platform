import { describe, expect, it } from 'vitest'
import { emptyProgress, isEmptyCourseProgress } from '@/lib/course/progress'

describe('course progress emptiness', () => {
  it('record ใหม่เท่านั้นที่ว่าง', () => {
    expect(isEmptyCourseProgress(emptyProgress('course'))).toBe(true)
  })

  it('in-progress อย่างเดียวก็เป็นงานของผู้เรียนที่ reset ได้', () => {
    expect(
      isEmptyCourseProgress({
        ...emptyProgress('course'),
        inProgress: ['lesson-1'],
        lastNodeId: 'lesson-1',
      }),
    ).toBe(false)
  })
})
