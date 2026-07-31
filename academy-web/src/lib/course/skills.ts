import type { CourseStructure } from '@/lib/content/course-types'
import type { LearnerCourseState } from './roadmap'

// คำนวณข้อมูลสำหรับ spider chart
//
// กติกาที่ตั้งใจ: นับเฉพาะสิ่งที่ "พิสูจน์แล้ว" (เรียนจบ หรือสอบผ่านโดยไม่ต้องเรียน)
// การข้ามเองไม่นับเป็นทักษะ — เพราะแผนภูมินี้คือคำตอบของคำถาม "ฉันรู้อะไรจริงบ้าง"
// ถ้านับการข้ามด้วย มันจะกลายเป็นแผนภูมิที่โกหกเจ้าของ

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
  const proven = new Set([...state.completed, ...state.testedOut])

  return structure.skills.map((skill) => {
    let earned = 0
    let total = 0
    for (const node of structure.nodes) {
      const weight = node.skillWeights[skill.id]
      if (!weight) continue
      total += weight
      if (proven.has(node.id)) earned += weight
    }
    return {
      id: skill.id,
      label: labels[skill.id] ?? skill.id,
      value: total === 0 ? 0 : Math.round((earned / total) * 100),
      notStarted: earned === 0,
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
  const earnedByDomain = new Map<string, number>()
  const availableByDomain = new Map<string, number>()

  for (const { structure, state } of contributions) {
    const proven = new Set([...state.completed, ...state.testedOut])
    const provenRatio = structure.nodes.length === 0 ? 0 : proven.size / structure.nodes.length

    for (const [domainId, weight] of Object.entries(structure.globalSkillWeights)) {
      availableByDomain.set(domainId, (availableByDomain.get(domainId) ?? 0) + weight)
      earnedByDomain.set(domainId, (earnedByDomain.get(domainId) ?? 0) + weight * provenRatio)
    }
  }

  return GLOBAL_DOMAINS.map((domain) => {
    const available = availableByDomain.get(domain.id) ?? 0
    const earned = earnedByDomain.get(domain.id) ?? 0
    return {
      id: domain.id,
      label: domain.label,
      value: available === 0 ? 0 : Math.round((earned / available) * 100),
      notStarted: earned === 0,
    }
  })
}
