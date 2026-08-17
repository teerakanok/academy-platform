import { describe, expect, it } from 'vitest'
import { getCourse } from '@/lib/content/course-source'
import { courseStepCounts } from '@/lib/content/course-step-summary'

describe('course step counts', () => {
  it('does not present required checkpoints as ordinary lessons', () => {
    // นับจากโครงจริงของคอร์ส ไม่ผูกกับจำนวนบท ณ วันที่เขียนเทสต์
    // เกตนี้จึงยังจับการนับผิดประเภทได้ ขณะที่คอร์สยังขยายบทต่อได้
    const linux = getCourse('basic-os-linux')!.structure
    const capstones = linux.nodes.filter((n) => n.kind === 'capstone').length
    const lessons = linux.nodes.filter((n) => n.kind === 'lesson').length
    expect(capstones).toBeGreaterThan(0)
    expect(courseStepCounts(linux)).toEqual({
      lessonCount: lessons,
      checkpointCount: capstones,
      learningStepCount: lessons + capstones,
    })

    // คอร์สตัวอย่างภายในมีโครงคงที่ จึงยังยืนยันด้วยตัวเลขตรง ๆ ได้
    expect(courseStepCounts(getCourse('content-formats-demo')!.structure)).toEqual({
      lessonCount: 3,
      checkpointCount: 1,
      learningStepCount: 4,
    })
  })
})
