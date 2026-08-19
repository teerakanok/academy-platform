#!/usr/bin/env node
// แก้อคติของเฉลย checkpoint สองชั้น
//
// ลานตรวจอิสระจับได้ว่าเฉลยเป็นข้อ B 549 จาก 576 ข้อ (95.3%) และเป็นตัวเลือก
// ที่ยาวที่สุด 546 จาก 576 (94.8%) ผู้เรียนที่ตอบ B ทุกข้อได้ 95% โดยไม่ต้อง
// เข้าใจอะไรเลย เป็นอคติของผู้เขียน ไม่ใช่ของผู้เรียน
//
// สคริปต์นี้ทำสองอย่าง ทั้งคู่ deterministic เพื่อให้รันซ้ำได้ผลเดิม:
//   1. สลับตำแหน่งตัวเลือกด้วย hash ของ (courseId, lessonId, questionId)
//      ทั้งสองภาษาได้ผลเดียวกัน เพราะ key ไม่มีตัวข้อความ
//   2. ย้าย "เหตุผล" ที่ห้อยท้ายตัวเลือกไปไว้ใน explanation
//      ตัวเลือกควรเป็นข้ออ้าง ไม่ใช่การให้เหตุผล — คำอธิบายคือที่ของเหตุผล
//      ย้ายข้อความเดิมทั้งดุ้น ไม่มีการแต่งข้อความใหม่
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', 'content', 'courses')
const apply = process.argv.includes('--apply')
// ⚠️ สคริปต์นี้ **ไม่ idempotent**: การสลับเป็น deterministic จาก key ก็จริง
// แต่การรันซ้ำคือการสลับทับของที่สลับไปแล้ว ซึ่งได้ลำดับใหม่
// เพราะฉะนั้นเวลามีคอร์สใหม่ ให้จำกัดขอบเขตด้วย --course <slug> เสมอ
const courseArg = process.argv.indexOf('--course')
const onlyCourse = courseArg >= 0 ? process.argv[courseArg + 1] : null

const CONN = {
  en: [' — ', ' -- ', '; ', ', because ', ', so ', ', which ', ': '],
  th: [' — ', ' -- ', '; ', ' เพราะ ', ' จึง ', ' ซึ่ง ', ': '],
}

/** แยกข้ออ้างออกจากเหตุผลที่ห้อยท้าย คืน null ถ้าไม่ปลอดภัยพอจะแยก */
function splitClaim(text, locale, lessonText) {
  let best = null
  for (const c of CONN[locale] ?? CONN.en) {
    const i = text.indexOf(c)
    if (i >= 12 && text.length - i - c.length >= 15) {
      if (best === null || i < best.i) best = { i, c }
    }
  }
  if (!best) return null
  const head = text.slice(0, best.i).replace(/[\s,;:—-]+$/, '')
  const tail = text.slice(best.i + best.c.length).trim()
  if (head.length < 18 || tail.length < 15) return null
  if (lessonText && lessonText.includes(head)) return null   // ไปซ้ำกับเนื้อหาในบท
  return { head, tail }
}

/** ลำดับตัวเลือกที่ deterministic จาก key — ไม่ขึ้นกับข้อความ ภาษาจึงตรงกัน */
function permutationFor(key, n) {
  const h = createHash('sha256').update(key).digest()
  const idx = [...Array(n).keys()]
  // Fisher-Yates ที่ใช้ไบต์จาก hash เป็นแหล่งสุ่ม
  for (let i = n - 1; i > 0; i--) {
    const j = h[(n - 1 - i) % h.length] % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

const stats = { questions: 0, moved: 0, byPos: {}, longest: 0 }
let files = 0

for (const slug of readdirSync(coursesDir).sort()) {
  if (!existsSync(join(coursesDir, slug, 'course.json'))) continue
  if (onlyCourse && slug !== onlyCourse) continue
  const course = JSON.parse(readFileSync(join(coursesDir, slug, 'course.json'), 'utf8'))
  for (const locale of course.availableLocales) {
    const dir = join(coursesDir, slug, 'locales', locale, 'lessons')
    if (!existsSync(dir)) continue
    for (const fname of readdirSync(dir).sort()) {
      const p = join(dir, fname)
      const lesson = JSON.parse(readFileSync(p, 'utf8'))
      if (!lesson.checkpoint?.length) continue
      // ข้อความทั้งหมดของบท ยกเว้น checkpoint — ใช้กันไม่ให้ตัวเลือกไปซ้ำกับเนื้อหา
      const lessonBody = JSON.stringify({ ...lesson, checkpoint: undefined })
      let touched = false
      for (const q of lesson.checkpoint) {
        if (q.kind && q.kind !== 'mcq') continue
        const choices = q.choices
        const correct = q.correct
        if (!choices || !Array.isArray(correct) || correct.length !== 1) continue

        // 1) ย้ายเหตุผลออกจากตัวเลือกที่ถูก
        const cur = choices[correct[0]]
        const s = splitClaim(cur, locale, lessonBody)
        if (s) {
          choices[correct[0]] = s.head
          const already = (q.explanation ?? '').includes(s.tail.slice(0, 25))
          if (!already) q.explanation = `${s.tail.replace(/^./, (m) => m.toUpperCase())} ${q.explanation ?? ''}`.trim()
          stats.moved++
          touched = true
        }

        // 2) สลับตำแหน่ง — key ไม่มีข้อความ ทั้งสองภาษาจึงได้ลำดับเดียวกัน
        const keys = Object.keys(choices).sort()
        const perm = permutationFor(`${slug}|${lesson.nodeId}|${q.id}`, keys.length)
        const values = keys.map((k) => choices[k])
        const newChoices = {}
        let newCorrect = null
        keys.forEach((k, i) => {
          const from = perm[i]
          newChoices[k] = values[from]
          if (keys[from] === correct[0]) newCorrect = k
        })
        if (newCorrect && newCorrect !== correct[0]) touched = true
        q.choices = newChoices
        q.correct = [newCorrect ?? correct[0]]

        stats.questions++
        stats.byPos[q.correct[0]] = (stats.byPos[q.correct[0]] ?? 0) + 1
        const others = Object.entries(q.choices).filter(([k]) => k !== q.correct[0]).map(([, v]) => v.length)
        if (q.choices[q.correct[0]].length > Math.max(...others)) stats.longest++
      }
      if (touched && apply) {
        writeFileSync(p, JSON.stringify(lesson, null, 2) + '\n')
        files++
      }
    }
  }
}

const n = stats.questions
console.log(`คำถาม (ทั้งสองภาษา): ${n}`)
console.log(`  ย้ายเหตุผลออกจากตัวเลือก: ${stats.moved}`)
console.log(`  การกระจายตำแหน่งเฉลย:`)
for (const k of Object.keys(stats.byPos).sort()) {
  const v = stats.byPos[k]
  console.log(`    ${k}: ${String(v).padStart(4)}  (${(v / n * 100).toFixed(1)}%)`)
}
console.log(`  เฉลยเป็นตัวเลือกที่ยาวที่สุด: ${stats.longest}/${n} (${(stats.longest / n * 100).toFixed(1)}%)`)
console.log(apply ? `\nเขียนแล้ว ${files} ไฟล์` : `\n(ยังไม่เขียนไฟล์ — ใส่ --apply เพื่อเขียน)`)
