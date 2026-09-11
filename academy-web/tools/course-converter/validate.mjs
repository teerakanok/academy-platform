#!/usr/bin/env node
// validate.mjs — ตรวจคอร์สที่แปลงแล้วกับเงื่อนไขเดียวกับ Academy (course-loader zod
// + semantic invariants + check-mcq-fairness) ก่อนย้ายเข้า repo จริง
// ใช้: node validate.mjs <course-dir>
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir || !existsSync(join(dir, 'course.json'))) {
  console.error('ใช้: node validate.mjs <course-dir>')
  process.exit(1)
}

const errors = []
const err = (m) => errors.push(m)
const structure = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8'))

// ── structure ───────────────────────────────────────────────────────────────
{
  const enums = {
    publicAvailability: ['internal', 'syllabus-preview'],
    level: ['beginner', 'intermediate', 'advanced'],
  }
  for (const [k, allowed] of Object.entries(enums)) {
    if (!allowed.includes(structure[k])) err(`course.json ${k}="${structure[k]}" ไม่อยู่ใน ${allowed.join('/')}`)
  }
  if (structure.defaultLocale !== 'en' && structure.defaultLocale !== 'th') err('defaultLocale ไม่ใช่ en/th')
  if (!structure.availableLocales?.includes(structure.defaultLocale)) err('defaultLocale ไม่อยู่ใน availableLocales')
  if (typeof structure.estimatedMinutes !== 'number' || structure.estimatedMinutes <= 0) err('estimatedMinutes ต้องเป็นบวก')
  if (!Array.isArray(structure.nodes) || structure.nodes.length === 0) err('nodes ต้องมีอย่างน้อย 1')
  if (!Array.isArray(structure.skills) || structure.skills.length === 0) err('skills ต้องมีอย่างน้อย 1')
  for (const s of structure.skills ?? []) if (!(s.maxScore > 0)) err(`skill ${s.id} maxScore ต้องเป็นบวก`)
  const ids = new Set()
  for (const n of structure.nodes) {
    if (ids.has(n.id)) err(`node id ซ้ำ: ${n.id}`)
    ids.add(n.id)
    if (!['lesson', 'capstone'].includes(n.kind)) err(`node ${n.id} kind ไม่ถูก`)
    if (!(n.estimatedMinutes > 0)) err(`node ${n.id} estimatedMinutes ต้องเป็นบวก`)
    for (const p of n.prerequisites ?? []) {
      if (!ids.has(p) && !structure.nodes.some((x) => x.id === p)) err(`node ${n.id} prerequisite "${p}" ไม่มีอยู่`)
      if (p === n.id) err(`node ${n.id} prerequisite ตัวเอง`)
    }
    for (const k of Object.keys(n.skillWeights ?? {})) {
      if (!structure.skills.some((s) => s.id === k)) err(`node ${n.id} skill "${k}" ไม่ประกาศใน course.skills`)
      if (!(n.skillWeights[k] > 0)) err(`node ${n.id} skillWeight ${k} ต้องเป็นบวก`)
    }
  }
  // cycle check (DFS)
  const prereqMap = new Map(structure.nodes.map((n) => [n.id, n.prerequisites ?? []]))
  const state = new Map()
  const visit = (id, stack) => {
    const st = state.get(id)
    if (st === 'done') return null
    if (st === 'visiting') return [...stack.slice(stack.indexOf(id)), id]
    state.set(id, 'visiting'); stack.push(id)
    for (const p of prereqMap.get(id) ?? []) { const c = visit(p, stack); if (c) return c }
    stack.pop(); state.set(id, 'done')
    return null
  }
  for (const n of structure.nodes) { const c = visit(n.id, []); if (c) { err(`กราฟวน: ${c.join(' → ')}`); break } }
  if (!structure.nodes.some((n) => (n.prerequisites ?? []).length === 0)) err('ไม่มี root node')
  const summed = structure.nodes.reduce((t, n) => t + n.estimatedMinutes, 0)
  if (summed !== structure.estimatedMinutes) err(`estimatedMinutes (${structure.estimatedMinutes}) ≠ ผลรวม nodes (${summed})`)
  for (const [k, v] of Object.entries(structure.globalSkillWeights ?? {})) if (!(v > 0)) err(`globalSkillWeights ${k} ต้องเป็นบวก`)
}

// ── locale copies + lessons ─────────────────────────────────────────────────
const validBlockKinds = new Set(['paragraph', 'heading', 'list', 'code', 'callout', 'try', 'table', 'aside', 'image', 'attachment', 'externalLink', 'simulation', 'lab'])
const nodeKinds = new Map(structure.nodes.map((n) => [n.id, n.kind]))
for (const locale of structure.availableLocales) {
  const copyPath = join(dir, 'locales', locale, 'course.json')
  if (!existsSync(copyPath)) { err(`ขาด locales/${locale}/course.json`); continue }
  const copy = JSON.parse(readFileSync(copyPath, 'utf8'))
  if (copy.locale !== locale) err(`locales/${locale}/course.json locale field = ${copy.locale}`)
  for (const f of ['title', 'subtitle', 'audience']) if (!copy[f]) err(`locales/${locale}/course.json ขาด ${f}`)
  if (!Array.isArray(copy.outcomes) || copy.outcomes.length < 1) err(`locales/${locale} outcomes ว่าง`)
  for (const s of structure.skills) if (!copy.skillLabels?.[s.id]) err(`locales/${locale} ขาด skillLabel ${s.id}`)
  for (const n of structure.nodes) if (!copy.nodeTitles?.[n.id]) err(`locales/${locale} ขาด nodeTitle ${n.id}`)

  const lessonsDir = join(dir, 'locales', locale, 'lessons')
  if (!existsSync(lessonsDir)) { err(`ขาด locales/${locale}/lessons/`); continue }
  const files = readdirSync(lessonsDir).filter((f) => f.endsWith('.json'))
  const fileIds = new Set(files.map((f) => f.slice(0, -5)))
  for (const n of structure.nodes) if (!fileIds.has(n.id)) err(`locales/${locale} ขาด lesson ${n.id}.json`)
  for (const f of files) if (!nodeKinds.has(f.slice(0, -5))) err(`locales/${locale} มี lesson นอกโครง: ${f}`)

  let questions = 0, strictlyLongest = 0
  const seenPrompts = new Map()
  for (const f of files) {
    const l = JSON.parse(readFileSync(join(lessonsDir, f), 'utf8'))
    const id = f.slice(0, -5)
    if (l.nodeId !== id) err(`${locale}/${f} nodeId "${l.nodeId}" ≠ ชื่อไฟล์`)
    if (l.locale !== locale) err(`${locale}/${f} locale field = ${l.locale}`)
    if (!l.title || !l.objective) err(`${locale}/${f} ขาด title/objective`)
    if (!Array.isArray(l.blocks) || l.blocks.length < 1) err(`${locale}/${f} blocks ว่าง`)
    for (const b of l.blocks ?? []) {
      if (!validBlockKinds.has(b.kind)) err(`${locale}/${f} block kind "${b.kind}" ไม่รู้จัก`)
      if (b.kind === 'paragraph' || b.kind === 'heading') if (!b.text) err(`${locale}/${f} ${b.kind} text ว่าง`)
      if (b.kind === 'list' && (!b.items?.length || b.items.some((x) => !x))) err(`${locale}/${f} list ว่าง`)
      if (b.kind === 'table' && (!b.headers?.length || !b.rows?.length)) err(`${locale}/${f} table ว่าง`)
      if (b.kind === 'callout' && !b.text) err(`${locale}/${f} callout text ว่าง`)
      if (b.kind === 'try' && (!b.steps?.length || !b.title)) err(`${locale}/${f} try ไม่ครบ`)
    }
    if (!Array.isArray(l.cheatsheet) || l.cheatsheet.length < 1 || l.cheatsheet.some((c) => !c)) err(`${locale}/${f} cheatsheet ว่าง`)
    const minCp = nodeKinds.get(id) === 'capstone' ? 3 : 1
    if (!Array.isArray(l.checkpoint) || l.checkpoint.length < minCp) err(`${locale}/${f} checkpoint < ${minCp}`)
    const cpIds = new Set()
    for (const q of l.checkpoint ?? []) {
      questions++
      if (cpIds.has(q.id)) err(`${locale}/${f} checkpoint id ซ้ำ ${q.id}`)
      cpIds.add(q.id)
      const keys = Object.keys(q.choices ?? {})
      if (keys.length < 2) err(`${locale}/${f} ${q.id} ตัวเลือก < 2`)
      if (keys.length < 3 || keys.length > 5) err(`${locale}/${f} ${q.id} ตัวเลือก ${keys.length} (fairness ต้อง 3–5)`)
      for (const k of keys) if (!q.choices[k]?.trim()) err(`${locale}/${f} ${q.id} ตัวเลือก ${k} ว่าง`)
      const unknown = (q.correct ?? []).filter((c) => !keys.includes(c))
      if (unknown.length) err(`${locale}/${f} ${q.id} correct ชี้ตัวเลือกที่ไม่มี: ${unknown}`)
      if (new Set(q.correct ?? []).size !== (q.correct ?? []).length) err(`${locale}/${f} ${q.id} correct ซ้ำ`)
      if (!q.explanation?.trim()) err(`${locale}/${f} ${q.id} ไม่มี explanation`)
      const corrLen = Math.max(...(q.correct ?? []).map((k) => (q.choices[k] ?? '').length))
      const others = keys.filter((k) => !(q.correct ?? []).includes(k)).map((k) => q.choices[k].length)
      if (others.length && corrLen > Math.max(...others)) strictlyLongest++
      const norm = (q.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (seenPrompts.has(norm)) err(`${locale}/${f} ${q.id} prompt ซ้ำกับ ${seenPrompts.get(norm)}`)
      else seenPrompts.set(norm, `${f}/${q.id}`)
    }
  }
  if (questions > 0) {
    const rate = strictlyLongest / questions
    console.log(`fairness ${locale}: ${questions} ข้อ · เฉลยยาวสุดชัดเจน ${strictlyLongest} (${(rate * 100).toFixed(0)}%)`)
    if (rate > 0.4) err(`fairness ${locale}: อัตราเฉลยยาวสุด ${(rate * 100).toFixed(0)}% เกิน 40%`)
  }
}

// ── EN/TH checkpoint id parity ──────────────────────────────────────────────
if (structure.availableLocales.includes('en') && structure.availableLocales.includes('th')) {
  const enDir = join(dir, 'locales/en/lessons')
  const thDir = join(dir, 'locales/th/lessons')
  if (existsSync(enDir) && existsSync(thDir)) {
    for (const f of readdirSync(enDir).filter((x) => x.endsWith('.json'))) {
      const en = JSON.parse(readFileSync(join(enDir, f), 'utf8'))
      const thPath = join(thDir, f)
      if (!existsSync(thPath)) continue
      const th = JSON.parse(readFileSync(thPath, 'utf8'))
      if (JSON.stringify(th.checkpoint.map((q) => q.id)) !== JSON.stringify(en.checkpoint.map((q) => q.id))) {
        err(`${f}: checkpoint id EN/TH ไม่ตรงกัน`)
      }
    }
  }
}

if (errors.length) {
  console.error(`\nFAIL (${errors.length}):`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log('\nPASS — คอร์สผ่านทุกเงื่อนไข')
