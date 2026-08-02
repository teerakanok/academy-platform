import type { CourseNode, CourseStructure } from '@/lib/content/course-types'
import { isProofBearing } from './assessment-policy'

// แผนที่เส้นทางของคอร์ส: จัดวาง DAG เป็นชั้น แล้วคำนวณสถานะของแต่ละ node ต่อผู้เรียน
// ทั้งหมดเป็นฟังก์ชันบริสุทธิ์ + deterministic → เทสได้ และภาพ screenshot นิ่ง

export type NodeStatus =
  /** ยังเปิดไม่ได้ — prerequisite ยังไม่ผ่าน */
  | 'locked'
  /** เปิดได้แล้ว ยังไม่เริ่ม */
  | 'available'
  /** เริ่มแล้วยังไม่จบ */
  | 'in-progress'
  /** เรียนจบ */
  | 'completed'
  /** ข้ามเอง โดยรับ cheatsheet ไป — ยังไม่ได้พิสูจน์ */
  | 'skipped'
  /** พิสูจน์ผ่านโดยไม่ต้องเรียน = ปลอดภัยแล้ว */
  | 'tested-out'

export interface LearnerCourseState {
  completed: string[]
  skipped: string[]
  testedOut: string[]
  inProgress: string[]
}

export const EMPTY_STATE: LearnerCourseState = { completed: [], skipped: [], testedOut: [], inProgress: [] }

/** ผ่านด่านนี้ไปแล้วในความหมายของการปลดล็อกบทถัดไป */
function isSatisfied(nodeId: string, state: LearnerCourseState): boolean {
  // การข้ามเองก็ปลดล็อกบทถัดไป — หลัก "ผู้เรียน override ได้เสมอ"
  return (
    state.completed.includes(nodeId) ||
    state.testedOut.includes(nodeId) ||
    state.skipped.includes(nodeId)
  )
}

export function nodeStatus(node: CourseNode, state: LearnerCourseState): NodeStatus {
  if (state.completed.includes(node.id)) return 'completed'
  if (state.testedOut.includes(node.id)) return 'tested-out'
  if (state.skipped.includes(node.id)) return 'skipped'
  const unlocked = node.prerequisites.every((p) => isSatisfied(p, state))
  if (!unlocked) return 'locked'
  if (state.inProgress.includes(node.id)) return 'in-progress'
  return 'available'
}

/** capstone ข้ามไม่ได้ — ต้องพิสูจน์เท่านั้น */
export function canSkip(node: CourseNode): boolean {
  return node.kind !== 'capstone'
}

export interface RankedNode {
  node: CourseNode
  /** ชั้นความลึก = ระยะทางที่ยาวที่สุดจากจุดเริ่ม (ทำให้เส้นชี้ลงเสมอ) */
  rank: number
  /** ตำแหน่งภายในชั้น (0-based, ซ้ายไปขวา) */
  indexInRank: number
  rankSize: number
}

export function rankNodes(structure: CourseStructure): RankedNode[] {
  const byId = new Map(structure.nodes.map((n) => [n.id, n]))
  const depthCache = new Map<string, number>()

  function depth(id: string): number {
    const cached = depthCache.get(id)
    if (cached !== undefined) return cached
    const node = byId.get(id)
    if (!node || node.prerequisites.length === 0) {
      depthCache.set(id, 0)
      return 0
    }
    // ตั้ง 0 กันวนซ้ำระหว่างคำนวณ (loader กันกราฟวนไว้แล้ว — นี่คือกันชนชั้นที่สอง)
    depthCache.set(id, 0)
    const value = 1 + Math.max(...node.prerequisites.map((p) => depth(p)))
    depthCache.set(id, value)
    return value
  }

  const withRank = structure.nodes.map((node) => ({ node, rank: depth(node.id) }))
  const byRank = new Map<number, typeof withRank>()
  for (const entry of withRank) {
    const list = byRank.get(entry.rank) ?? []
    list.push(entry)
    byRank.set(entry.rank, list)
  }

  const result: RankedNode[] = []
  for (const [rank, list] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((entry, indexInRank) => {
      result.push({ node: entry.node, rank, indexInRank, rankSize: list.length })
    })
  }
  return result
}

export interface NodeLayout extends RankedNode {
  x: number
  y: number
  status: NodeStatus
}

export interface RoadmapLayout {
  width: number
  height: number
  nodes: NodeLayout[]
  edges: Array<{ from: string; to: string; fromX: number; fromY: number; toX: number; toY: number }>
}

// ระยะห่างต้องเผื่อ "ป้ายชื่อบท 2 บรรทัด + บรรทัดสถานะ" ใต้หัว node ไม่งั้นป้าย
// จะไปทับ node ชั้นถัดไป (เจอจริงตอนดูภาพรอบแรก)
const COLUMN_WIDTH = 216
const ROW_HEIGHT = 178
const MARGIN_X = 28
const MARGIN_Y = 44

// กล่องของ node หนึ่งตัวไม่ได้มีแค่วงกลม — มีชื่อบท (สูงสุด 2 บรรทัด) กับบรรทัด
// สถานะห้อยอยู่ข้างใต้ด้วย เส้นโยงจึงต้องออกจาก "ใต้กล่องทั้งใบ" ไม่ใช่ใต้วงกลม
// ไม่งั้นเส้นจะลอดทับตัวหนังสือ (เจอจริงตอนรีวิวภาพ)
// หมายเหตุ: จุดยึดของ node คือ "กึ่งกลางกล่องทั้งใบ" (วงกลม+ชื่อ+สถานะ) ไม่ใช่
// กึ่งกลางวงกลม — วงกลมจึงอยู่สูงกว่าจุดยึดราว 31px ค่าสองตัวนี้วัดจากจุดยึด
/** ขึ้นไปถึงขอบบนของวงกลม (31 + รัศมี 26 + ช่องไฟ) */
export const NODE_TOP_OFFSET = 62
/** ลงไปพ้นบรรทัดสถานะใต้ชื่อบท */
export const NODE_BOTTOM_OFFSET = 76

export function layoutRoadmap(structure: CourseStructure, state: LearnerCourseState): RoadmapLayout {
  const ranked = rankNodes(structure)
  const maxRankSize = Math.max(...ranked.map((r) => r.rankSize))
  const maxRank = Math.max(...ranked.map((r) => r.rank))
  const width = MARGIN_X * 2 + Math.max(1, maxRankSize) * COLUMN_WIDTH
  const height = MARGIN_Y * 2 + (maxRank + 1) * ROW_HEIGHT

  const nodes: NodeLayout[] = ranked.map((entry) => {
    // จัดกึ่งกลางของแต่ละชั้น เพื่อให้กราฟดูสมดุลแทนที่จะชิดซ้าย
    const rowWidth = entry.rankSize * COLUMN_WIDTH
    const startX = (width - rowWidth) / 2 + COLUMN_WIDTH / 2
    return {
      ...entry,
      x: startX + entry.indexInRank * COLUMN_WIDTH,
      y: MARGIN_Y + entry.rank * ROW_HEIGHT + ROW_HEIGHT / 2,
      status: nodeStatus(entry.node, state),
    }
  })

  const position = new Map(nodes.map((n) => [n.node.id, n]))
  const edges: RoadmapLayout['edges'] = []
  for (const node of nodes) {
    for (const prereq of node.node.prerequisites) {
      const from = position.get(prereq)
      if (!from) continue
      edges.push({
        from: prereq,
        to: node.node.id,
        fromX: from.x,
        fromY: from.y,
        toX: node.x,
        toY: node.y,
      })
    }
  }

  return { width, height, nodes, edges }
}

/** บทถัดไปที่ควรทำ — ตัวขับปุ่ม "เรียนต่อ" */
export function nextNode(structure: CourseStructure, state: LearnerCourseState): CourseNode | null {
  const ranked = rankNodes(structure)
  const inProgress = ranked.find((r) => nodeStatus(r.node, state) === 'in-progress')
  if (inProgress) return inProgress.node
  const available = ranked.find((r) => nodeStatus(r.node, state) === 'available')
  return available?.node ?? null
}

export interface CourseProgressSummary {
  total: number
  completed: number
  testedOut: number
  skipped: number
  /**
   * สัดส่วนบทที่ทำจบแล้ว (เรียนจบ + test out) — การข้ามไม่นับ
   *
   * ⚠️ ชื่อเดิมคือ `provenPercent` ซึ่งอ่านแล้วเข้าใจว่าเป็นหลักฐาน · ตั้งแต่ W0-3
   * คำว่า "พิสูจน์แล้ว" สงวนไว้ให้ด่านวัดผลเท่านั้น (ดู `certificateEligibility`)
   */
  finishedPercent: number
  /** ความคืบหน้าในเส้นทาง รวมการข้ามด้วย (ใช้บอกว่าเดินไปถึงไหนแล้ว) */
  coveragePercent: number
}

export function summarise(structure: CourseStructure, state: LearnerCourseState): CourseProgressSummary {
  const total = structure.nodes.length
  const ids = new Set(structure.nodes.map((n) => n.id))
  const completed = state.completed.filter((id) => ids.has(id)).length
  const testedOut = state.testedOut.filter((id) => ids.has(id)).length
  const skipped = state.skipped.filter((id) => ids.has(id)).length
  const finished = completed + testedOut
  return {
    total,
    completed,
    testedOut,
    skipped,
    finishedPercent: total === 0 ? 0 : Math.round((finished / total) * 100),
    coveragePercent: total === 0 ? 0 : Math.round(((finished + skipped) / total) * 100),
  }
}

// ── ใบรับรองการเรียนจบ ────────────────────────────────────────────────────────
//
// ใบรับรองบอกว่า "คนนี้ทำเรื่องนี้ได้ในระดับที่เราถือว่าผ่าน" ไม่ได้บอกว่า
// "คนนี้นั่งอ่านครบทุกหน้า" — ดังนั้นเกณฑ์คือหลักฐาน ไม่ใช่การเข้าชั้น
//
// การ test out (เมื่อเปิดใช้) นับเท่ากับการอ่านจบทุกประการ ใครที่รู้อยู่แล้วและ
// พิสูจน์ได้ ต้องได้ใบเท่ากับคนที่อ่านทีละบท — แต่วันนี้ test-out ปิดอยู่ทั้งคอร์ส
// จนกว่าจะมีคลังข้อแยกสำหรับโหมดวัดผล (assessment-policy)
//
// "ข้ามโดยรับสรุปไป" (skipped) ไม่นับเป็นการเดินผ่าน — ไม่ใช่การลงโทษและไม่ใช่
// ประตูที่ปิดตาย: กลับมาทำ checkpoint ของบทนั้นเมื่อไหร่ก็ได้
//
// ถ้าให้ใบทั้งที่มีบทที่ไม่มีหลักฐาน ใบนั้นก็ไม่ได้บอกอะไรกับใคร และเราจะเป็นคนแรก
// ที่รู้ว่ามันไม่มีความหมาย
//
// ── W0-3: `completed` ของบทปกติ **ไม่ใช่หลักฐาน** ─────────────────────────────
// เดิมฟังก์ชันนี้นับ `completed` เป็น proven ตรงๆ (F3) ซึ่งแปลว่าใบรับรองออกให้คน
// ที่ไล่ลองจนผ่านโดยไม่รู้เนื้อหาเลยก็ได้ — โหมด learn บอกผลรายข้อ + คำอธิบาย และ
// retry ไม่จำกัด นั่นคือธรรมชาติของโหมดสอน ไม่ใช่บั๊กที่จะไปปิด
//
// เกณฑ์จึงแยกเป็นสองชั้นที่ต้องผ่าน **ทั้งคู่**:
//   1. ความคืบหน้า — ทุก node ต้อง `completed`/`tested-out` (ไม่มีบทที่ข้ามหรือค้าง)
//   2. หลักฐาน — ทุก capstone ต้องผ่านแบบวัดผลจริง (ดู assessment-policy)
// ชั้นที่ 2 คือสิ่งที่ใบรับรองอ้างถึงจริง · ห้ามเขียนบนหน้าเว็บหรือบนใบว่าบทปกติ
// เป็นการวัดผล

export type CertificateBlocker = 'skipped' | 'unstarted'

export interface CertificateEligibility {
  eligible: boolean
  /** จำนวนบทที่เดินผ่านแล้ว — ตัวชี้ **ความคืบหน้า** ไม่ใช่หลักฐาน */
  lessonsFinished: number
  total: number
  /** ด่านวัดผล (capstone) ที่ผ่านแล้ว / ทั้งหมด — นี่คือสิ่งที่ใบรับรองอ้างถึง */
  assessedPassed: number
  assessedTotal: number
  /**
   * node ที่ยังกั้นใบอยู่ พร้อมเหตุผล — ต้องบอกให้ผู้เรียนรู้ว่าต้องทำอะไรต่อ
   *
   * ⚠️ ทุกรายการต้องเป็น **node จริงที่เปิดได้** เพราะ UI ทำเป็นลิงก์ไปหน้าบทเรียน ·
   * ปัญหาระดับคอร์ส (เช่น คอร์สไม่มีด่านวัดผลเลย) ห้ามใส่ที่นี่ — ใช้ `courseIssue`
   */
  blocking: { id: string; reason: CertificateBlocker }[]
  /** ปัญหาที่ไม่ได้อยู่ที่ node ใด node หนึ่ง — UI ต้องแสดงเป็นข้อความ ไม่ใช่ลิงก์ */
  courseIssue: 'no-assessment' | null
}

/**
 * ⚠️ ข้อจำกัดที่รู้อยู่และต้องปิดใน W4 (RIL รอบ 2 ของ W1 ชี้)
 *
 * ฟังก์ชันนี้ตัดสินจาก **สถานะ** อย่างเดียว ยังไม่อ่าน `simulationEvidence` ·
 * ผลคือถ้าเนื้อหาเพิ่มด่านจำลองใหม่เข้า capstone ที่ผู้เรียนผ่านไปแล้ว สถานะจะยัง
 * `completed` (ถูกตามกติกากันถอยหลัง) ทั้งที่ยังไม่มีหลักฐานของด่านใหม่
 *
 * W4 (ใบรับรองที่ตรวจสอบได้) ต้องอ่านหลักฐานจริงประกอบ ไม่ใช่เชื่อสถานะอย่างเดียว —
 * เพราะใบรับรอง snapshot หลักฐาน ณ วันออก ไม่ใช่สถานะปัจจุบัน
 */
export function certificateEligibility(
  structure: CourseStructure,
  state: LearnerCourseState,
): CertificateEligibility {
  const blocking: { id: string; reason: CertificateBlocker }[] = []
  let lessonsFinished = 0
  let assessedPassed = 0
  let assessedTotal = 0

  for (const node of structure.nodes) {
    const status = nodeStatus(node, state)
    const walked = status === 'completed' || status === 'tested-out'
    if (walked) lessonsFinished += 1
    else blocking.push({ id: node.id, reason: status === 'skipped' ? 'skipped' : 'unstarted' })

    if (!isProofBearing(node)) continue
    assessedTotal += 1
    if (walked) assessedPassed += 1
    // ด่านวัดผลที่ยังไม่ผ่านถูกบันทึกไว้แล้วในลูปด้านบน — ไม่ต้องซ้ำ
  }

  // ต้องมีด่านวัดผลอย่างน้อยหนึ่งจุด ไม่งั้นใบรับรองไม่ได้อ้างถึงหลักฐานใดเลย
  const courseIssue = assessedTotal === 0 ? ('no-assessment' as const) : null
  const hasProof = assessedTotal > 0 && assessedPassed === assessedTotal

  return {
    eligible: blocking.length === 0 && hasProof && structure.nodes.length > 0,
    lessonsFinished,
    total: structure.nodes.length,
    assessedPassed,
    assessedTotal,
    blocking,
    courseIssue,
  }
}
