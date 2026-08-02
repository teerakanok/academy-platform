import { describe, expect, it } from 'vitest'
import type { CourseStructure } from '@/lib/content/course-types'
import {
  canSkip,
  EMPTY_STATE,
  layoutRoadmap,
  nextNode,
  nodeStatus,
  rankNodes,
  summarise,
} from '@/lib/course/roadmap'
import { loadCourseStructure } from '@/lib/content/course-loader'

const structure: CourseStructure = {
  id: 'c',
  slug: 'c',
  version: '1.0.0',
  defaultLocale: 'en',
  availableLocales: ['en'],
  level: 'beginner',
  estimatedMinutes: 60,
  skills: [{ id: 's', maxScore: 100 }],
  globalSkillWeights: { foundations: 1 },
  nodes: [
    { id: 'a', kind: 'lesson', prerequisites: [], estimatedMinutes: 10, skillWeights: { s: 1 } },
    { id: 'b', kind: 'lesson', prerequisites: ['a'], estimatedMinutes: 10, skillWeights: { s: 1 } },
    { id: 'c', kind: 'lesson', prerequisites: ['a'], estimatedMinutes: 10, skillWeights: { s: 1 } },
    { id: 'gate', kind: 'capstone', prerequisites: ['b', 'c'], estimatedMinutes: 20, skillWeights: { s: 2 } },
  ],
}

const node = (id: string) => structure.nodes.find((n) => n.id === id)!

describe('node status and unlocking', () => {
  it('เริ่มต้น: จุดตั้งต้นเปิดได้ ที่เหลือล็อก', () => {
    expect(nodeStatus(node('a'), EMPTY_STATE)).toBe('available')
    expect(nodeStatus(node('b'), EMPTY_STATE)).toBe('locked')
    expect(nodeStatus(node('gate'), EMPTY_STATE)).toBe('locked')
  })

  it('การข้ามเองก็ปลดล็อกบทถัดไป (ผู้เรียน override ได้เสมอ)', () => {
    const state = { ...EMPTY_STATE, skipped: ['a'] }
    expect(nodeStatus(node('a'), state)).toBe('skipped')
    expect(nodeStatus(node('b'), state)).toBe('available')
  })

  it('capstone ต้องรอ prerequisite ครบทุกตัว ไม่ใช่ตัวใดตัวหนึ่ง', () => {
    expect(nodeStatus(node('gate'), { ...EMPTY_STATE, completed: ['a', 'b'] })).toBe('locked')
    expect(nodeStatus(node('gate'), { ...EMPTY_STATE, completed: ['a', 'b', 'c'] })).toBe('available')
  })

  it('tested-out ถือว่าปลอดภัยและปลดล็อกต่อได้', () => {
    const state = { ...EMPTY_STATE, testedOut: ['a'] }
    expect(nodeStatus(node('a'), state)).toBe('tested-out')
    expect(nodeStatus(node('b'), state)).toBe('available')
  })

  it('capstone ข้ามไม่ได้ บทปกติข้ามได้', () => {
    expect(canSkip(node('gate'))).toBe(false)
    expect(canSkip(node('a'))).toBe(true)
  })
})

describe('การจัดชั้นและตำแหน่ง', () => {
  it('ชั้นคือระยะที่ยาวที่สุดจากจุดเริ่ม — เส้นจึงชี้ลงเสมอ', () => {
    const ranks = new Map(rankNodes(structure).map((r) => [r.node.id, r.rank]))
    expect(ranks.get('a')).toBe(0)
    expect(ranks.get('b')).toBe(1)
    expect(ranks.get('c')).toBe(1)
    expect(ranks.get('gate')).toBe(2)
  })

  it('ทุกเส้นเชื่อมจากชั้นบนลงชั้นล่างเสมอ (ไม่มีเส้นชี้ขึ้น)', () => {
    const layout = layoutRoadmap(structure, EMPTY_STATE)
    expect(layout.edges).toHaveLength(4)
    for (const edge of layout.edges) {
      expect(edge.toY).toBeGreaterThan(edge.fromY)
    }
  })

  it('node ในชั้นเดียวกันอยู่ระดับเดียวกันและไม่ทับกัน', () => {
    const layout = layoutRoadmap(structure, EMPTY_STATE)
    const b = layout.nodes.find((n) => n.node.id === 'b')!
    const c = layout.nodes.find((n) => n.node.id === 'c')!
    expect(b.y).toBe(c.y)
    expect(Math.abs(b.x - c.x)).toBeGreaterThanOrEqual(160)
  })
})

describe('บทถัดไปและสรุปความคืบหน้า', () => {
  it('บทที่ค้างอยู่มาก่อนบทที่ยังไม่เริ่ม', () => {
    expect(nextNode(structure, EMPTY_STATE)?.id).toBe('a')
    expect(nextNode(structure, { ...EMPTY_STATE, completed: ['a'], inProgress: ['c'] })?.id).toBe('c')
  })

  it('เดินจบทั้งเส้นแล้วไม่มีบทถัดไป', () => {
    const done = { ...EMPTY_STATE, completed: ['a', 'b', 'c', 'gate'] }
    expect(nextNode(structure, done)).toBeNull()
  })

  it('การข้ามนับเป็นความคืบหน้าในเส้นทาง แต่ไม่นับเป็นบทที่ทำจบ', () => {
    const s = summarise(structure, { ...EMPTY_STATE, completed: ['a'], skipped: ['b'], testedOut: ['c'] })
    expect(s.finishedPercent).toBe(50) // a + c จาก 4
    expect(s.coveragePercent).toBe(75) // รวม b ที่ข้าม
  })
})

describe('loader กันกราฟที่ทำให้ผู้เรียนติดตาย', () => {
  const base = { ...structure, nodes: structure.nodes.map((n) => ({ ...n })) }

  it('prerequisite ชี้ node ที่ไม่มี → error', () => {
    const bad = { ...base, nodes: [...base.nodes, { ...node('a'), id: 'x', prerequisites: ['ghost'] }] }
    expect(() => loadCourseStructure('c.json', bad)).toThrow(/ไม่มีอยู่จริง/)
  })

  it('กราฟวนเป็นวง → error พร้อมบอกวงที่วน', () => {
    const bad = {
      ...base,
      nodes: [
        { ...node('a'), prerequisites: ['b'] },
        { ...node('b'), prerequisites: ['a'] },
      ],
    }
    expect(() => loadCourseStructure('c.json', bad)).toThrow(/วนเป็นวง/)
  })

  it('กราฟที่ทุก node มี prerequisite เปิดไม่ได้เลย จึงต้องถูกปฏิเสธ', () => {
    // หมายเหตุ: ถ้าทุก node มี prerequisite ที่มีอยู่จริง กราฟย่อมวนเป็นวงเสมอ
    // (ไล่ย้อนกลับไปในเซ็ตจำกัดต้องซ้ำสักจุด) จึงถูกดักด้วย error เรื่องวงก่อน —
    // ส่วนการเช็ค "ไม่มีจุดเริ่ม" ใน loader เป็นกันชนชั้นสุดท้ายที่เผื่อไว้เฉยๆ
    const bad = {
      ...base,
      nodes: [
        { ...node('b'), prerequisites: ['gate'] },
        { ...node('gate'), prerequisites: ['b'] },
      ],
    }
    expect(() => loadCourseStructure('c.json', bad)).toThrow(/วนเป็นวง|ไม่มี node ที่เริ่มได้/)
  })

  it('skill ที่ node อ้างต้องประกาศไว้ในคอร์ส', () => {
    const bad = { ...base, nodes: [{ ...node('a'), skillWeights: { ghost: 1 } }] }
    expect(() => loadCourseStructure('c.json', bad)).toThrow(/ไม่ได้ประกาศ/)
  })
})
