import { describe, expect, it } from 'vitest'
import { getCourse } from '@/lib/content/course-source'
import { courseStepCounts } from '@/lib/content/course-step-summary'

describe('course step counts', () => {
  it('does not present required checkpoints as ordinary lessons', () => {
    expect(courseStepCounts(getCourse('basic-os-linux')!.structure)).toEqual({
      lessonCount: 8,
      checkpointCount: 2,
      learningStepCount: 10,
    })
    expect(courseStepCounts(getCourse('content-formats-demo')!.structure)).toEqual({
      lessonCount: 3,
      checkpointCount: 1,
      learningStepCount: 4,
    })
  })
})
