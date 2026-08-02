import type { CourseStructure } from '@/lib/content/course-types'
import type { LearnerCourseState } from './roadmap'

// คำนวณข้อมูลสำหรับ spider chart
//
// กติกาที่ตั้งใจ: นับเฉพาะบทที่ **ทำจบแล้ว** (เรียนจบ หรือผ่านแบบวัดผล) การข้ามเอง
// ไม่นับ — เพราะแผนภูมินี้ตอบคำถาม "ฉันเดินผ่านอะไรมาแล้วบ้าง" ถ้านับการข้ามด้วย
// มันจะกลายเป็นแผนภูมิที่โกหกเจ้าของ
//
// ⚠️ นี่คือ **ความครอบคลุม ไม่ใช่หลักฐาน** — คำว่า "พิสูจน์แล้ว" สงวนให้ด่านวัดผล
// ตั้งแต่ W0-3 (ดู assessment-policy) เพราะบทปกติไล่ลองจนผ่านได้ตามธรรมชาติของโหมดสอน

export interface SkillDatum {
  id: string
  label: string
  /** 0–100 */
  value: number
  /** ยังไม่แตะเลย — ต้องสื่อว่า "ยังไม่เริ่ม" ไม่ใช่ "ได้ 0 คะแนน" */
  notStarted: boolean
}

export function courseSkillData(
  structure: CourseStructure,
  labels: Record<string, string>,
  state: LearnerCourseState,
): SkillDatum[] {
  // บทที่ทำจบแล้ว — ใช้คำว่า finished ไม่ใช่ proven เพราะ "พิสูจน์แล้ว"
  // สงวนไว้ให้ด่านวัดผลตั้งแต่ W0-3 (ดู assessment-policy)
  const finished = new Set([...state.completed, ...state.testedOut])

  return structure.skills.map((skill) => {
    let covered = 0
    let total = 0
    for (const node of structure.nodes) {
      const weight = node.skillWeights[skill.id]
      if (!weight) continue
      total += weight
      if (finished.has(node.id)) covered += weight
    }
    return {
      id: skill.id,
      label: labels[skill.id] ?? skill.id,
      value: total === 0 ? 0 : Math.round((covered / total) * 100),
      notStarted: covered === 0,
    }
  })
}

export interface GlobalDomain {
  id: string
  label: string
}

/** แกนระดับ ecosystem — คอร์สแต่ละตัวป้อนเข้าโดมเนนเหล่านี้ตาม globalSkillWeights */
export const GLOBAL_DOMAINS: GlobalDomain[] = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'security-ops', label: 'Security operations' },
  { id: 'governance-risk', label: 'Governance & risk' },
  { id: 'offensive', label: 'Offensive testing' },
  { id: 'cloud-architecture', label: 'Cloud & architecture' },
  { id: 'ai-security', label: 'AI security' },
]

export interface CourseContribution {
  structure: CourseStructure
  state: LearnerCourseState
}

/**
 * แผนที่ทักษะภาพรวมข้ามคอร์ส
 *
 * แกนที่ยังไม่มีคอร์สรองรับเลยจะถูกทำเครื่องหมาย notStarted — ตั้งใจให้อ่านว่า
 * "ยังไม่ได้เริ่มตรงนี้" (ซึ่งเป็นข้อมูลที่มีประโยชน์) ไม่ใช่ "คุณได้ศูนย์"
 */
export function globalSkillData(contributions: CourseContribution[]): SkillDatum[] {
  const coveredByDomain = new Map<string, number>()
  const availableByDomain = new Map<string, number>()

  for (const { structure, state } of contributions) {
    const finished = new Set([...state.completed, ...state.testedOut])
    const finishedRatio = structure.nodes.length === 0 ? 0 : finished.size / structure.nodes.length

    for (const [domainId, weight] of Object.entries(structure.globalSkillWeights)) {
      availableByDomain.set(domainId, (availableByDomain.get(domainId) ?? 0) + weight)
      coveredByDomain.set(domainId, (coveredByDomain.get(domainId) ?? 0) + weight * finishedRatio)
    }
  }

  return GLOBAL_DOMAINS.map((domain) => {
    const available = availableByDomain.get(domain.id) ?? 0
    const covered = coveredByDomain.get(domain.id) ?? 0
    return {
      id: domain.id,
      label: domain.label,
      value: available === 0 ? 0 : Math.round((covered / available) * 100),
      notStarted: covered === 0,
    }
  })
}
