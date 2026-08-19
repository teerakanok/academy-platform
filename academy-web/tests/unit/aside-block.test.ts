import { describe, expect, it } from 'vitest'
import { loadCourseCopySchemaForTest } from '@/lib/content/course-loader'

// aside มีไว้ให้เนื้อหาเสริมสำหรับผู้เรียนนอกสาขาไม่ไปขวางเส้นทางหลักของคนในสาขา
// ข้อจำกัดที่ต้องคงไว้: ห้ามมี simulation ซ้อนอยู่ข้างใน เพราะตัวลดรูปสำหรับ
// หน้าเว็บทำงานที่ระดับบนสุดเท่านั้น ถ้าซ้อนได้ กติกาการตรวจจะรั่วออกหน้าเว็บ
describe('บล็อก aside', () => {
  it('รับบล็อกอธิบายที่อยู่ข้างในได้', () => {
    const block = {
      kind: 'aside',
      title: 'Never used a terminal?',
      forWhom: 'for readers coming from outside computing',
      blocks: [{ kind: 'paragraph', text: 'A terminal is a window that runs commands.' }],
    }
    expect(() => loadCourseCopySchemaForTest(block)).not.toThrow()
  })

  it('ปฏิเสธ simulation ที่ซ้อนอยู่ข้างใน', () => {
    const block = {
      kind: 'aside',
      title: 'x',
      forWhom: 'y',
      blocks: [{ kind: 'simulation', challenge: { id: 'a', title: 'b', brief: 'c', requirements: [] } }],
    }
    expect(() => loadCourseCopySchemaForTest(block)).toThrow()
  })

  it('ปฏิเสธ aside ที่ซ้อน aside', () => {
    const block = {
      kind: 'aside',
      title: 'x',
      forWhom: 'y',
      blocks: [{ kind: 'aside', title: 'z', forWhom: 'w', blocks: [{ kind: 'paragraph', text: 'p' }] }],
    }
    expect(() => loadCourseCopySchemaForTest(block)).toThrow()
  })
})
