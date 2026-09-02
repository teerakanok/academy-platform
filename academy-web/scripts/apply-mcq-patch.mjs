#!/usr/bin/env node
// ปรับ choices/explanation ของ checkpoint ตาม patch file (JSON) — ใช้ตอน normalize ความยาวด้วยมือ
//   node scripts/apply-mcq-patch.mjs <patch.json>
// รูปแบบ patch: { "<slug>": { "<locale>": { "<lesson-file>": { "<cp-id>": {
//   "choices": { "A": "ข้อความใหม่", ... },            // เฉพาะ key ที่ระบุเท่านั้นถูกแทน
//   "appendExplanation": "ประโยคเสริมท้าย explanation"   // ไม่บังคับ
// } } } } }
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', 'content', 'courses')
const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let touched = 0
for (const [slug, locales] of Object.entries(patch)) {
  for (const [locale, files] of Object.entries(locales)) {
    for (const [fname, questions] of Object.entries(files)) {
      const p = join(coursesDir, slug, 'locales', locale, 'lessons', fname)
      const lesson = JSON.parse(readFileSync(p, 'utf8'))
      for (const [cpId, ops] of Object.entries(questions)) {
        const q = (lesson.checkpoint ?? []).find((x) => x.id === cpId)
        if (!q) throw new Error(`not found: ${slug}/${locale}/${fname}/${cpId}`)
        if (ops.choices) for (const [k, v] of Object.entries(ops.choices)) q.choices[k] = v
        if (ops.appendExplanation) q.explanation = `${q.explanation ?? ''} ${ops.appendExplanation}`.trim()
        touched++
      }
      writeFileSync(p, JSON.stringify(lesson, null, 2) + '\n')
    }
  }
}
console.log(`patched ${touched} questions`)
