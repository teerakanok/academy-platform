import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

// อ่านหลักฐานที่ถูกบันทึกจริงจากฐานข้อมูล — ไม่ใช่จาก response ของ API
//
// ตั้งแต่ปิดรู oracle (RIL รอบ W1) `GET /api/progress` **ไม่ส่ง** `simulationEvidence`
// กับ `checkpointResults` ของพื้นผิววัดผลกลับมาอีกแล้ว เพราะผลรายข้อแปรตามคำตอบ
// = เครื่องเฉลย · เทสที่ต้องยืนยันว่า route บันทึกหลักฐานถูกจึงต้องอ่านจาก DB
//
// นี่ไม่ใช่การลดคุณภาพของเทส: มันยังเดินเส้นทางจริงทั้งเส้น (HTTP → route → DB)
// เปลี่ยนแค่ "อ่านผลจากที่ไหน" จากช่องที่ผู้ใช้ไม่ควรมี ไปเป็นแหล่งข้อมูลจริง

try {
  process.loadEnvFile(join(__dirname, '..', '..', '.env.local'))
} catch {
  // ปล่อยให้ล้มตอนใช้งานพร้อมข้อความชัดเจน ดีกว่าเงียบแล้วอ่านค่าว่าง
}

/** อีเมลของบัญชีที่ auth.setup สร้างไว้สำหรับรอบนี้ */
export function learnerEmail(): string {
  return readFileSync(
    join(__dirname, '..', '..', 'test-results', '.auth', 'learner-email.txt'),
    'utf8',
  ).trim()
}

export interface SimulationEvidenceRow {
  passed: boolean
  requirements: { id: string; met: boolean }[]
  challengeVersion: string
  at: string
}

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL ยังไม่ถูกตั้งค่า — ดู .env.example')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** หลักฐานด่านจำลองของบทนี้ ตามที่ถูกบันทึกจริง (อ่านด้วยอีเมลของบัญชีที่เทสใช้) */
export async function storedSimulationEvidence(
  email: string,
  slug: string,
  nodeId: string,
): Promise<Record<string, SimulationEvidenceRow>> {
  return withDb(async (db) => {
    const res = await db.query(
      // ⚠️ 0002 ระบุว่า `email` เป็นข้อมูลแสดงผล ห้ามใช้ join ใน production logic
      // ที่นี่คือฝั่งเทส: เป็นทางเดียวที่รู้ว่าแถวไหนเป็นของบัญชีที่ auth.setup สร้าง
      // (subject มาจาก Supabase auth ซึ่งเทสไม่มีทางรู้ผ่าน HTTP) · อีเมลของแต่ละรอบ
      // มี timestamp ต่อท้ายจึงไม่ชนกันเอง
      `select p.simulation_evidence
         from academy.node_progress p
         join academy.users u on u.id = p.user_id
        where u.email = $1 and p.course_slug = $2 and p.node_id = $3`,
      [email, slug, nodeId],
    )
    return (res.rows[0]?.simulation_evidence ?? {}) as Record<string, SimulationEvidenceRow>
  })
}
