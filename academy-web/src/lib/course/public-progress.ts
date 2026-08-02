import type { CourseStructure } from '@/lib/content/course-types'
import { isAssessedNode } from './assessment-policy'
import type { CourseProgressRecord } from './progress'

// ความคืบหน้าที่ browser ได้เห็น — ตัดผลรายข้อของพื้นผิววัดผลออก
//
// `checkpointResults` คือ questionId → ถูก/ผิด และ `simulationEvidence` มีผลราย
// requirement · ทั้งสองอย่างแปรตามคำตอบ จึงเป็นเครื่องเฉลยถ้าปล่อยให้อ่านได้:
// ส่ง `A,A,A` แล้วอ่านว่าข้อไหนถูก → `B,B,B` → `C,C,C` ครบสามรอบก็รู้เฉลยทั้งชุด
// โดยไม่ต้องรู้เนื้อหาเลย (RIL cross-model รอบ W1)
//
// ทำไมต้องตัดที่นี่ ไม่ใช่ไม่บันทึก: หลักฐานยังต้องอยู่ใน DB เพราะใบรับรอง (W4)
// อ้างอิงมัน — สิ่งที่ห้ามคือ **ส่งกลับไปหา client** ไม่ใช่การเก็บ
//
// fail-closed: ถ้าไม่รู้จักโครงคอร์ส (คอร์สถูกถอด/สะกดผิด) ให้ตัดทั้งหมด
// ดีกว่าเดาว่าบทไหนเป็นพื้นผิววัดผล

export function toPublicProgress(
  record: CourseProgressRecord,
  structure: CourseStructure | null,
): CourseProgressRecord {
  const checkpointResults: CourseProgressRecord['checkpointResults'] = {}
  const simulationEvidence: CourseProgressRecord['simulationEvidence'] = {}

  for (const [nodeId, results] of Object.entries(record.checkpointResults)) {
    if (isSecret(structure, record, nodeId)) continue
    checkpointResults[nodeId] = results
  }
  for (const [nodeId, evidence] of Object.entries(record.simulationEvidence)) {
    if (isSecret(structure, record, nodeId)) continue
    simulationEvidence[nodeId] = evidence
  }

  return { ...record, checkpointResults, simulationEvidence }
}

/**
 * บทนี้ปิดผลรายข้อไหม
 *
 * ปิดเมื่อเป็นพื้นผิววัดผลโดยชนิดของบท **หรือ** เมื่อบทนั้นถูกบันทึกว่า `tested-out`
 * — ข้อหลังสำคัญเพราะ test-out ทำให้บทปกติกลายเป็นพื้นผิววัดผลชั่วคราว (วันนี้ปิด
 * ทั้งแพลตฟอร์มอยู่ แต่กติกาต้องถูกก่อนที่มันจะเปิด ไม่ใช่หลัง)
 */
function isSecret(
  structure: CourseStructure | null,
  record: CourseProgressRecord,
  nodeId: string,
): boolean {
  if (!structure) return true
  if (record.testedOut.includes(nodeId)) return true
  const node = structure.nodes.find((n) => n.id === nodeId)
  if (!node) return true
  return isAssessedNode(node)
}
