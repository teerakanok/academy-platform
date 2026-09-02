#!/usr/bin/env node
// เกตกัน regression ของความยุติธรรม checkpoint (Wave 2 · 2026-09-02)
//
// ลานตรวจ content 2026-09-02 เจอว่าแม้จะสลับตำแหน่งเฉลยแล้ว (fix-checkpoint-answer-bias)
// เฉลยยังเป็น "ตัวเลือกที่ยาวที่สุดแบบชัดเจน" 77–85% ทุกคอร์ส — ผู้เรียนที่ไม่อ่านเนื้อหา
// เลยแต่เลือกข้อที่ยาวและมี qualification มากที่สุด ยังได้ ~80%
//
// เกตนี้ตรวจ 4 อย่าง (fail = exit 1):
//   1. อัตรา "เฉลยเป็นตัวยาวสุดแบบชัดเจน" ต่อคอร์สต่อภาษา ต้องไม่เกิน MAX_LONGEST_RATE
//      (ตัวชี้วัดเดียวกับที่ fix-checkpoint-answer-bias.mjs รายงาน)
//   2. ทุกข้อต้องมี explanation ที่ไม่ว่าง
//   3. จำนวนตัวเลือก 3–5 และไม่มีตัวเลือกว่าง
//   4. ไม่มี prompt ซ้ำกันในคอร์สเดียวกัน (ตัดช่องว่าง/บรรทัดก่อนเทียบ)
// เพิ่มเติม (เตือนอย่างเดียว ไม่ fail): ตัวเลือกเฉลยภาษาไทยยาวกว่าของ EN มากผิดสัดส่วน
//   (= คำแปลดูดเนื้อหา explanation เข้าตัวเลือก ทำให้เดาได้ง่ายกว่าต้นฉบับ)
//
// ใช้: node scripts/check-mcq-fairness.mjs [courseSlug] [--max-longest-rate 0.40]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', 'content', 'courses')

const rateIdx = process.argv.indexOf('--max-longest-rate')
const MAX_LONGEST_RATE = rateIdx >= 0 ? Number(process.argv[rateIdx + 1]) : 0.4
const slugArg = process.argv.find((a, i) => i > 1 && !a.startsWith('--') && a !== String(MAX_LONGEST_RATE))

const failures = []
const warnings = []
const rows = []

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

for (const slug of readdirSync(coursesDir).sort()) {
  if (!existsSync(join(coursesDir, slug, 'course.json'))) continue
  if (slugArg && slug !== slugArg) continue
  const course = JSON.parse(readFileSync(join(coursesDir, slug, 'course.json'), 'utf8'))
  for (const locale of course.availableLocales) {
    const dir = join(coursesDir, slug, 'locales', locale, 'lessons')
    if (!existsSync(dir)) continue
    let questions = 0
    let strictlyLongest = 0
    const seenPrompts = new Map()
    for (const fname of readdirSync(dir).sort()) {
      const lesson = JSON.parse(readFileSync(join(dir, fname), 'utf8'))
      for (const q of lesson.checkpoint ?? []) {
        if (q.kind && q.kind !== 'mcq') continue
        questions++
        const where = `${slug}/${locale}/${fname}/${q.id}`
        // 2) explanation
        if (!norm(q.explanation)) failures.push(`${where}: ไม่มี explanation`)
        // 3) จำนวน/ความว่างของตัวเลือก
        const keys = Object.keys(q.choices ?? {})
        if (keys.length < 3 || keys.length > 5) failures.push(`${where}: ตัวเลือก ${keys.length} อัน (ต้อง 3–5)`)
        for (const k of keys) if (!norm(q.choices[k])) failures.push(`${where}: ตัวเลือก ${k} ว่าง`)
        if (!Array.isArray(q.correct) || q.correct.length < 1) {
          failures.push(`${where}: ไม่มีคำตอบที่ถูก`)
          continue
        }
        // 1) เฉลยเป็นตัวยาวสุดแบบชัดเจน — multi-select เทียบ "เฉลยที่ยาวสุด" กับ
        //    "distractor ที่ยาวสุด" (รวมทุกเฉลยเข้าด้วยกันจะลงโทษข้อหลายเฉลยโดยไม่จำเป็น)
        const corrLen = Math.max(...q.correct.map((k) => (q.choices[k] ?? '').length))
        const others = keys.filter((k) => !q.correct.includes(k)).map((k) => q.choices[k].length)
        if (others.length && corrLen > Math.max(...others)) strictlyLongest++
        // 4) prompt ซ้ำ
        const p = norm(q.prompt).slice(0, 80)
        if (seenPrompts.has(p)) failures.push(`${where}: prompt ซ้ำกับ ${seenPrompts.get(p)}`)
        else seenPrompts.set(p, where)
      }
      // คำเตือน EN/TH parity ของความยาวเฉลย
      if (locale === 'th' && existsSync(join(coursesDir, slug, 'locales', 'en', 'lessons', fname))) {
        const en = JSON.parse(readFileSync(join(coursesDir, slug, 'locales', 'en', 'lessons', fname), 'utf8'))
        const enById = new Map((en.checkpoint ?? []).filter((q) => !q.kind || q.kind === 'mcq').map((q) => [q.id, q]))
        for (const q of lesson.checkpoint ?? []) {
          if (q.kind && q.kind !== 'mcq') continue
          const enQ = enById.get(q.id)
          if (!enQ || !enQ.correct?.length || !q.correct?.length) continue
          const enLen = Math.max(...enQ.correct.map((k) => (enQ.choices[k] ?? '').length))
          const thLen = Math.max(...q.correct.map((k) => (q.choices[k] ?? '').length))
          if (enLen > 0 && thLen > enLen * 2.2 && thLen - enLen > 40) {
            warnings.push(`${slug}/${fname}/${q.id}: เฉลย TH ยาว ${thLen} ตัวอักษร vs EN ${enLen} — คำแปลอาจดูด explanation เข้าตัวเลือก`)
          }
        }
      }
    }
    if (questions === 0) continue
    const rate = strictlyLongest / questions
    rows.push({ slug, locale, questions, strictlyLongest, rate })
    if (rate > MAX_LONGEST_RATE) {
      failures.push(`${slug}/${locale}: เฉลยเป็นตัวยาวสุดแบบชัดเจน ${strictlyLongest}/${questions} (${(rate * 100).toFixed(0)}%) เกินเพดาน ${(MAX_LONGEST_RATE * 100).toFixed(0)}%`)
    }
  }
}

console.log('คอร์ส          ภาษา  ข้อ   ยาวสุด  อัตรา')
for (const r of rows) {
  console.log(
    `${r.slug.padEnd(20)} ${r.locale}  ${String(r.questions).padStart(4)}  ${String(r.strictlyLongest).padStart(5)}  ${(r.rate * 100).toFixed(0)}%`,
  )
}
if (warnings.length) {
  console.log('\nคำเตือน (ไม่บล็อก):')
  for (const w of warnings) console.log(`  ⚠ ${w}`)
}
if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nPASS — ทุกคอร์สอยู่ในเกณฑ์')
