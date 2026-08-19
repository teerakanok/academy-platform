#!/usr/bin/env node
// เกตอคติของเฉลย checkpoint
//
// ลานตรวจอิสระจับได้ว่าเฉลยเป็นข้อ B 95.3% และเป็นตัวเลือกที่ยาวที่สุด 94.8%
// ผู้เรียนตอบ B ทุกข้อได้ 95% โดยไม่ต้องเข้าใจอะไร เกตนี้ทำให้เกิดซ้ำไม่ได้
//
// ตรวจสองอย่าง:
//   1. การกระจายตำแหน่งเฉลย — ตำแหน่งใดเกิน 35% ถือว่าเดาได้ (สุ่มล้วน = 25%)
//   2. เฉลยเป็นตัวเลือกที่ยาวที่สุดกี่เปอร์เซ็นต์ — สัญญาณที่สองที่เดาได้เหมือนกัน
//      เพดานตอนนี้ตั้งไว้ที่ค่าปัจจุบัน เพื่อกันไม่ให้แย่ลง และต้องไล่ลงเรื่อย ๆ
//      ด้วยการเขียนตัวลวงให้เป็นความเข้าใจผิดที่เฉพาะเจาะจง ไม่ใช่วลีปัดทิ้งสั้น ๆ
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', '..', 'content', 'courses')
const POSITION_LIMIT = 0.35
const LONGEST_LIMIT = 0.85
// ผู้เรียนเรียนทีละคอร์ส เกตจึงต้องดูรายคอร์สด้วย ไม่ใช่แค่ค่าเฉลี่ยรวม
// เพดานรายคอร์สหลวมกว่าเพราะกลุ่มตัวอย่างเล็กกว่า จึงแกว่งมากกว่า
const POSITION_LIMIT_COURSE = 0.40

const pos = {}
let n = 0, longest = 0
const perCourse = {}

for (const slug of readdirSync(coursesDir).sort()) {
  if (!existsSync(join(coursesDir, slug, 'course.json'))) continue
  const course = JSON.parse(readFileSync(join(coursesDir, slug, 'course.json'), 'utf8'))
  perCourse[slug] = { n: 0, longest: 0, pos: {} }
  for (const locale of course.availableLocales) {
    const dir = join(coursesDir, slug, 'locales', locale, 'lessons')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).sort()) {
      const lesson = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const q of lesson.checkpoint ?? []) {
        if (q.kind && q.kind !== 'mcq') continue
        const ch = q.choices, cor = q.correct
        if (!ch || !Array.isArray(cor) || cor.length !== 1) continue
        n++; perCourse[slug].n++
        pos[cor[0]] = (pos[cor[0]] ?? 0) + 1
        perCourse[slug].pos[cor[0]] = (perCourse[slug].pos[cor[0]] ?? 0) + 1
        const others = Object.entries(ch).filter(([k]) => k !== cor[0]).map(([, v]) => v.length)
        if (ch[cor[0]].length > Math.max(...others)) { longest++; perCourse[slug].longest++ }
      }
    }
  }
}

console.log(`คำถาม MCQ ทั้งหมด (ทั้งสองภาษา): ${n}\n`)
console.log('  การกระจายตำแหน่งเฉลย:')
let fail = false
for (const k of Object.keys(pos).sort()) {
  const share = pos[k] / n
  const flag = share > POSITION_LIMIT ? '  <-- เกิน ' + (POSITION_LIMIT * 100) + '%' : ''
  console.log(`    ${k}: ${String(pos[k]).padStart(4)}  ${(share * 100).toFixed(1)}%${flag}`)
  if (share > POSITION_LIMIT) fail = true
}
const ls = longest / n
console.log(`\n  เฉลยเป็นตัวเลือกที่ยาวที่สุด: ${longest}/${n} (${(ls * 100).toFixed(1)}%)  เพดาน ${(LONGEST_LIMIT * 100).toFixed(0)}%`)
if (ls > LONGEST_LIMIT) fail = true

console.log('\n  แยกรายคอร์ส (ยาวที่สุด %):')
for (const [slug, s] of Object.entries(perCourse)) {
  if (!s.n) continue
  const top = Math.max(...Object.values(s.pos)) / s.n
  const over = top > POSITION_LIMIT_COURSE
  if (over) fail = true
  console.log(`    ${slug.padEnd(24)} ${(s.longest / s.n * 100).toFixed(0).padStart(3)}%   ตำแหน่งที่พบมากสุด ${(top * 100).toFixed(0)}%${over ? '  <-- เกินเพดานรายคอร์ส' : ''}`)
}
console.log(fail ? '\ncheckpoint-answer-bias: ไม่ผ่าน' : '\ncheckpoint-answer-bias: ผ่าน')
process.exit(fail ? 1 : 0)
