#!/usr/bin/env node
// พิมพ์รายการ MCQ ที่ "เฉลยเป็นตัวยาวสุดแบบชัดเจน" ของคอร์ส+ภาษาที่ระบุ
// เพื่อใช้เป็น worklist ตอน normalize ด้วยมือ: node scripts/dump-biased-mcqs.mjs <slug> <locale> [--min-over 1.2]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', 'content', 'courses')
const slug = process.argv[2]
const locale = process.argv[3]
const minOverIdx = process.argv.indexOf('--min-over')
const MIN_OVER = minOverIdx >= 0 ? Number(process.argv[minOverIdx + 1]) : 1.2
const dir = join(coursesDir, slug, 'locales', locale, 'lessons')
for (const fname of readdirSync(dir).sort()) {
  const lesson = JSON.parse(readFileSync(join(dir, fname), 'utf8'))
  for (const q of lesson.checkpoint ?? []) {
    if (q.kind && q.kind !== 'mcq') continue
    const keys = Object.keys(q.choices)
    const corr = q.correct ?? []
    const corrLen = Math.max(...corr.map((k) => (q.choices[k] ?? '').length))
    const others = keys.filter((k) => !corr.includes(k)).map((k) => q.choices[k].length)
    if (!others.length) continue
    const avg = others.reduce((a, b) => a + b, 0) / others.length
    if (corrLen > Math.max(...others) && corrLen > MIN_OVER * avg) {
      console.log(`### ${fname} :: ${q.id}  correct=${JSON.stringify(corr)} corrLen=${corrLen} maxOther=${Math.max(...others)}`)
      for (const k of keys) console.log(`  ${k}${corr.includes(k) ? '*' : ' '} (${q.choices[k].length}) ${q.choices[k]}`)
      console.log(`  EXPL: ${q.explanation ?? ''}`)
    }
  }
}
