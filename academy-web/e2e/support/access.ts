import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function serviceDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('E2E ต้องมี local Supabase env ตาม .env.example')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
}

let learnerId: string | null = null

/** สร้างเฉพาะ prerequisite fixture; node เป้าหมายยังไม่เริ่มและต้องผ่าน runtime guard จริง */
export async function prepareNodeAccess(courseSlug: string, nodeId: string): Promise<void> {
  const db = serviceDb()
  if (!learnerId) {
    const email = readFileSync(join(__dirname, '..', '..', 'test-results', '.auth', 'learner-email.txt'), 'utf8').trim()
    const account = await db.from('users').select('id').eq('email', email).single()
    if (account.error || !account.data) throw new Error('ไม่พบบัญชี E2E learner')
    learnerId = account.data.id as string
  }

  const structure = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'content', 'courses', courseSlug, 'course.json'), 'utf8'),
  ) as { nodes: { id: string; prerequisites: string[] }[] }
  const byId = new Map(structure.nodes.map((node) => [node.id, node]))
  const ancestors = new Set<string>()
  function visit(id: string) {
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
      if (ancestors.has(prerequisite)) continue
      ancestors.add(prerequisite)
      visit(prerequisite)
    }
  }
  visit(nodeId)

  const cleared = await db.rpc('reset_course_progress', {
    p_user_id: learnerId,
    p_course_slug: courseSlug,
  })
  if (cleared.error) throw new Error('ล้าง progress fixture ไม่สำเร็จ')
  if (ancestors.size === 0) return
  const inserted = await db.from('node_progress').insert(
    [...ancestors].map((ancestorId) => ({
      user_id: learnerId,
      course_slug: courseSlug,
      node_id: ancestorId,
      status: 'skipped',
    })),
  )
  if (inserted.error) throw new Error('เตรียม prerequisite fixture ไม่สำเร็จ')
}
