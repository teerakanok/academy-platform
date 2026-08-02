import { describe, expectTypeOf, it } from 'vitest'
import type {
  PublicCheckpointQuestion,
  PublicSimulationChallenge,
  PublicVideoCueQuestion,
} from '@/lib/content/public-lesson'
import type { CheckpointQuestion, VideoCueQuestion } from '@/lib/content/course-types'
import type { SimulationChallenge } from '@/lib/simulation/types'

// เส้นแบ่งนี้ต้องถูกบังคับ **ตอน compile** ไม่ใช่ตอนรัน
//
// RIL cross-model จับว่า `Omit<>` เพียงอย่างเดียวกันอะไรไม่ได้เลย เพราะ TypeScript
// เป็น structural typing: object ที่มี field เกินยัง assign ได้ตามปกติ — แปลว่า
// ส่ง `CheckpointQuestion` เต็ม (ที่มี correct/explanation) เป็น `Public*` ได้แบบ
// ไม่มี error สักตัว · เทสชุดนี้คือด่านที่ทำให้คำกล่าวอ้าง "ชนิดเป็นตัวบังคับ" เป็นจริง

describe('ชนิด Public* ต้องปฏิเสธของที่มีเฉลยติดมา', () => {
  it('CheckpointQuestion เต็มไม่ใช่ PublicCheckpointQuestion', () => {
    expectTypeOf<CheckpointQuestion>().not.toMatchTypeOf<PublicCheckpointQuestion>()
  })

  it('VideoCueQuestion เต็มไม่ใช่ PublicVideoCueQuestion', () => {
    expectTypeOf<VideoCueQuestion>().not.toMatchTypeOf<PublicVideoCueQuestion>()
  })

  it('SimulationChallenge เต็มไม่ใช่ PublicSimulationChallenge', () => {
    expectTypeOf<SimulationChallenge>().not.toMatchTypeOf<PublicSimulationChallenge>()
  })

  it('รูป public ที่ถูกต้องยังใช้ได้ตามปกติ', () => {
    expectTypeOf<{
      id: string
      prompt: string
      choices: Record<string, string>
      multiple: boolean
    }>().toMatchTypeOf<PublicCheckpointQuestion>()
  })
})
