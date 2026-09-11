#!/usr/bin/env node
// convert.mjs — Crucible study-guide course → Academy interactive lesson JSON
//
// หลักการต้าน hallucination (สำคัญที่สุดของ tool นี้):
//   · ทุก block, choice, explanation ต้องมาจากข้อความใน study guide ต้นทางเท่านั้น
//   · MCQ สร้างจาก pattern "term: definition" ที่พิมพ์อยู่ใน guide จริง —
//     distractor คือ definition ของ term อื่นในไฟล์เดียวกัน (ไม่มีการเขียนใหม่)
//   · explanation อ้างบรรทัดต้นฉบับโดยตรง
//   · section ที่สั้นเกินจนสร้าง checkpoint อย่างมีความหมายไม่ได้ = ข้าม และรายงาน
//
// ใช้:
//   node convert.mjs <crucible-course-dir> <output-courses-dir> [--config config.json]
//
// input อ่าน markdown จาก study-guides/ (fallback: syllabus/, docs/) เรียงตามชื่อไฟล์
// config (optional) กำหนด metadata ระดับคอร์ส + ผูก study guide แต่ละไฟล์กับ skill
// TH locale ตอนนี้ = สำเนา EN แท็ก locale "th" สำหรับการแปลในอนาคต (งานแปลแยกย่อหน้า)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── deterministic PRNG — ผลลัพธ์ต้อง reproduce ได้จาก source เดิม ─────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// ── text helpers ────────────────────────────────────────────────────────────
function cleanInline(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<sub>(.*?)<\/sub>/g, '$1')
    .replace(/<sup>(.*?)<\/sup>/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(s, max = 58) {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

function countWords(s) {
  return s.split(/\s+/).filter(Boolean).length
}

const isAttributionLine = (s) => /^\*📖/.test(s.trim())
const isHr = (s) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(s.trim())

// ── markdown → blocks ───────────────────────────────────────────────────────
// คืน block ตาม schema ของ Academy (kind: paragraph/heading/list/code/callout/table)
function parseBlocks(lines, opts = {}) {
  const blocks = []
  let i = 0
  const inDetails = opts.inDetails ?? false
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    if (line === '' || isHr(line) || isAttributionLine(raw)) { i++; continue }

    // <details><summary>…</summary> — ส่วนขยายของ guide: แยก summary เป็น heading
    const detailsOpen = line.match(/^<details[^>]*>\s*<summary>(.*?)<\/summary>/)
    if (detailsOpen) {
      const summary = cleanInline(detailsOpen[1])
      const inner = [line.slice(line.indexOf('</summary>') + 10)]
      i++
      while (i < lines.length && !inner[inner.length - 1].includes('</details>')) {
        inner.push(lines[i]); i++
      }
      // ตัด </details> ทิ้งจากบรรทัดสุดท้าย
      const last = inner.length - 1
      inner[last] = inner[last].replace(/<\/details>[\s\S]*$/, '')
      if (summary) blocks.push({ kind: 'heading', text: summary })
      blocks.push(...parseBlocks(inner.filter((l) => l.trim() !== ''), { inDetails: true }))
      continue
    }
    if (/^<\/details>/.test(line)) { i++; continue }

    const h = line.match(/^(#{2,6})\s+(.*)$/)
    if (h) {
      // ใน details ไม่ผลิต heading ซ้อน (aside เท่านั้นที่ห้าม แต่ heading ระดับ 4+ ใน
      // extended notes ทำให้สารบัญรก) — heading ใน details ถูก flatten เป็น paragraph ตัวหนาไม่ได้
      // จึงคง heading ไว้ตามระดับ 3 และลดระดับที่ลึกกว่านั้นเป็น heading เดียวกัน
      blocks.push({ kind: 'heading', text: cleanInline(h[2]) })
      i++
      continue
    }

    // ตาราง
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => cleanInline(c))
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      if (rows.length >= 2) {
        blocks.push({ kind: 'table', headers: rows[0], rows: rows.slice(1) })
        continue
      }
      if (rows.length === 1) {
        blocks.push({ kind: 'paragraph', text: rows[0].filter(Boolean).join(' — ') })
        continue
      }
      continue
    }

    // ลิสต์
    const li = line.match(/^([-*+]|\d+[.)])\s+(.*)$/)
    if (li) {
      const items = []
      const ordered = /\d/.test(li[1])
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.*)$/)
        if (!m) break
        items.push(cleanInline(m[2]))
        i++
      }
      blocks.push({ kind: 'list', items, ...(ordered ? { ordered: true } : {}) })
      continue
    }

    // blockquote → paragraph
    if (line.startsWith('>')) {
      const parts = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        parts.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'paragraph', text: cleanInline(parts.join(' ')) })
      continue
    }

    // ⚠️ Exam Trap ฯลฯ → callout warning
    if (/^\*\*⚠️/.test(line)) {
      const parts = []
      while (i < lines.length && lines[i].trim() !== '' && !isHr(lines[i].trim())) {
        parts.push(lines[i]); i++
      }
      blocks.push({ kind: 'callout', tone: 'warning', title: 'Exam trap', text: cleanInline(parts.join(' ')) })
      continue
    }

    // ย่อหน้าปกติ — กลืนบรรทัดถัดไปที่ไม่ใช่ block ใหม่
    const para = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isHr(lines[i].trim()) &&
      !isAttributionLine(lines[i]) &&
      !/^(#{2,6}\s|[-*+]\s|\d+[.)]\s|\||>|<details|<\/details)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim()); i++
    }
    if (para.length) blocks.push({ kind: 'paragraph', text: cleanInline(para.join(' ')) })
    else i++
  }
  void inDetails
  return blocks
}

// ── term-definition extraction — วัตถุดิบของ MCQ ทั้งหมด ────────────────────
// รับ pattern ที่พบใน guide จริง:
//   · bullet/numbered "**Term:** definition"
//   · bullet/numbered "**Term** — definition" (em/en dash)
//   · แถวตาราง "| **Term** | definition |" และตารางที่คอลัมน์แรกเป็นหมายเลข
//     เช่น OSI "| **7** | Application | User interface... |" → term อยู่คอลัมน์ 2
function termDefFrom(text) {
  const colon = text.match(/^\*\*(.+?):\*\*\s+(.*)$/)
  const dash = text.match(/^\*\*(.+?)\*\*\s*[—–]\s+(.*)$/)
  const m = colon ?? dash
  if (!m) return null
  const term = cleanInline(m[1])
  const def = cleanInline(m[2])
  if (term.length < 2 || term.length > 80 || def.length < 15 || def.length > 400) return null
  // ข้อความที่ผู้เขียน guide ปักธง [VERIFY …] ไว้ = ยังไม่ผ่านการยืนยัน —
  // ไม่นำมาเป็นเฉลย MCQ (ยังคงอยู่ใน blocks/cheatsheet ตามต้นฉบับ)
  if (/\[VERIFY/i.test(def)) return null
  return { term, def, source: cleanInline(text) }
}

function tablePairFrom(cells) {
  const tryPair = (termC, defC) => {
    const term = termC.replace(/:$/, '').trim()
    const def = defC.trim()
    if (term.length >= 2 && term.length <= 60 && def.length >= 15 && def.length <= 400) {
      return { term, def, source: `${term}: ${def}` }
    }
    return null
  }
  // คอลัมน์แรกเป็นตัวเลข/สั้นเกิน (เช่นลำดับชั้น OSI) → term อยู่คอลัมน์ถัดไป
  if (cells.length >= 3 && cells[0].length < 2) {
    return tryPair(cells[1], cells[2]) ?? tryPair(cells[0], cells[1])
  }
  if (cells.length >= 2) return tryPair(cells[0], cells[1])
  return null
}

function extractPairs(lines, source) {
  const pairs = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const li = line.match(/^([-*+]|\d+[.)])\s+(.*)$/)
    if (li) {
      const pair = termDefFrom(li[2])
      if (pair) pairs.push({ ...pair, where: source })
      i++
      continue
    }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => cleanInline(c))
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      for (const cells of rows.slice(1)) {
        const pair = tablePairFrom(cells)
        if (pair) pairs.push({ ...pair, where: source })
      }
      continue
    }
    i++
  }
  return pairs
}

// ── practice-question extraction — MCQ ที่ guide เขียนไว้เอง (ดีที่สุด) ──────
// รองรับสอง format ที่พบใน guide จริง:
//   D1–D6: "### Q1: prompt" + "A) ..." + <details>**Answer: B** + คำอธิบาย
//   D7–D8: "### Question 1" + บรรทัดคำถาม + "A. ..." + "**Answer: A**" + "> คำอธิบาย"
function extractPracticeQuestions(lines) {
  const qHeadRe = /^#{3,}\s+(?:Q\d+|Question\s+\d+)\b[:]?\s*(.*)$/i
  const choiceRe = /^([A-E])[.)]\s+(.*)$/
  const answerRe = /\*\*Answers?\b[^A-E]*([A-E](?:\s*(?:,|and)\s*[A-E])*)/
  const chunks = []
  let cur = null
  for (const raw of lines) {
    const t = raw.trim()
    if (qHeadRe.test(t)) {
      cur = { head: t.match(qHeadRe)[1].replace(/^[:.]\s*/, '').trim(), body: [] }
      chunks.push(cur)
      continue
    }
    if (cur) cur.body.push(t)
  }
  const questions = []
  for (const { head, body } of chunks) {
    const choices = {}
    const promptLines = []
    const explanationLines = []
    const correct = []
    let phase = 'prompt' // prompt → choices → answer
    for (const t of body) {
      if (t === '' || isHr(t) || /^<\/?details/.test(t) || /^<summary/.test(t)) continue
      const ch = t.match(choiceRe)
      if (phase !== 'answer' && ch) {
        choices[ch[1]] = cleanInline(ch[2])
        phase = 'choices'
        continue
      }
      const am = t.match(answerRe)
      if (phase !== 'answer' && am) {
        correct.push(...[...am[1].matchAll(/[A-E]/g)].map((m) => m[0]))
        phase = 'answer'
        continue
      }
      if (phase === 'answer') explanationLines.push(t.replace(/^>\s?/, ''))
      else if (phase === 'prompt') promptLines.push(t)
    }
    const prompt = cleanInline([head, ...promptLines].filter(Boolean).join(' '))
    const explanation = cleanInline(explanationLines.join(' '))
    if (prompt && Object.keys(choices).length >= 2 && correct.length >= 1 && correct.every((c) => choices[c]) && explanation.length >= 10) {
      questions.push({ prompt, choices, correct, explanation })
    }
  }
  return questions
}

// ── MCQ generation — ทุกตัวอักษรมาจาก source ────────────────────────────────
function pickDistractors(pool, correct, count, rng) {
  // เลือก distractor ที่ความยาวใกล้เคียง correct ก่อน — ลับความเอียง
  // "เฉลยเป็นตัวยาวสุด" โดยไม่ต้องเขียนข้อความใหม่
  const unique = []
  const seen = new Set([correct])
  for (const cand of pool) {
    const key = cand.trim()
    if (!seen.has(key) && key.length >= 8) { unique.push(cand); seen.add(key) }
  }
  const sorted = unique.slice().sort((a, b) => Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length))
  const picked = []
  for (const cand of sorted) {
    if (picked.length >= count) break
    picked.push(cand)
  }
  // สุ่มลำดับเบาๆ ในกลุ่มที่สั้นพอ เพื่อไม่ให้ pattern ตายตัว
  if (picked.length === count && rng() < 0.5) picked.reverse()
  return picked
}

function makeMcq(id, prompt, correctText, distractorTexts, explanation, rng) {
  const slots = ['A', 'B', 'C', 'D'].slice(0, distractorTexts.length + 1)
  const correctIdx = Math.floor(rng() * slots.length)
  const choices = {}
  let di = 0
  for (let s = 0; s < slots.length; s++) {
    if (s === correctIdx) choices[slots[s]] = correctText
    else { choices[slots[s]] = distractorTexts[di++]; }
  }
  return { id, prompt, choices, correct: [slots[correctIdx]], explanation }
}

function generateSectionMcqs(pairs, domainPool, rng, wanted = 4, domainLabel = 'the study guide', usedPromptKeys = new Set()) {
  const questions = []
  const usedForward = new Set()
  const usedReverse = new Set()
  const promptKey = (p) => p.replace(/\s+/g, ' ').trim().slice(0, 80)
  const guideRef = `the study guide for ${domainLabel}`
  // distractor ใช้ของ section เดียวกันก่อน (ผูกเรื่องเดียวกัน) แล้วค่อยเติม
  // จากทั้ง domain — ทุกชิ้นยังเป็นข้อความจาก guide ทั้งหมด
  const sectionDefs = pairs.map((p) => p.def)
  const sectionTerms = pairs.map((p) => p.term)
  const domainDefs = domainPool.filter((p) => !pairs.some((q) => q.term === p.term)).map((p) => p.def)
  const domainTerms = domainPool.filter((p) => !pairs.some((q) => q.term === p.term)).map((p) => p.term)
  const poolWithFallback = (sectionPool, domainPoolTexts, correct) => {
    const near = pickDistractors(sectionPool, correct, 3, rng)
    if (near.length >= 3) return near
    return [...near, ...pickDistractors(domainPoolTexts, correct, 3 - near.length, rng)].slice(0, 3)
  }
  // สลับ forward (term→def) กับ reverse (def→term) จนครบจำนวน
  const order = pairs.slice()
  for (let round = 0; round < 2 && questions.length < wanted; round++) {
    for (const pair of order) {
      if (questions.length >= wanted) break
      const forward = round === 0
      if (forward && usedForward.has(pair.term)) continue
      if (!forward && usedReverse.has(pair.term)) continue
      if (forward) {
        const distractors = poolWithFallback(
          sectionDefs.filter((d) => d !== pair.def),
          domainDefs.filter((d) => d !== pair.def),
          pair.def,
        )
        if (distractors.length < 3) continue
        const prompt = `In ${guideRef}, "${pair.term}" is described as:`
        if (usedPromptKeys.has(promptKey(prompt))) continue
        questions.push(makeMcq(
          `q${questions.length + 1}`,
          prompt,
          pair.def, distractors,
          `The study guide states: ${pair.source}`,
          rng,
        ))
        usedPromptKeys.add(promptKey(prompt))
        usedForward.add(pair.term)
      } else {
        const distractors = poolWithFallback(
          sectionTerms.filter((t) => t !== pair.term),
          domainTerms.filter((t) => t !== pair.term),
          pair.term,
        )
        if (distractors.length < 3) continue
        const prompt = `Which term does ${guideRef} define as: "${pair.def}"?`
        if (usedPromptKeys.has(promptKey(prompt))) continue
        questions.push(makeMcq(
          `q${questions.length + 1}`,
          prompt,
          pair.term, distractors,
          `The study guide states: ${pair.source}`,
          rng,
        ))
        usedPromptKeys.add(promptKey(prompt))
        usedReverse.add(pair.term)
      }
    }
  }
  return questions
}

// ── study-guide file → sections ─────────────────────────────────────────────
function splitSections(text) {
  const lines = text.split(/\r?\n/)
  const header = { lines: [] }
  const sections = []
  let current = header
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/)
    if (m && !/^###/.test(line)) {
      current = { title: cleanInline(m[1]), lines: [] }
      sections.push(current)
    } else {
      current.lines.push(line)
    }
  }
  return { header: header.lines, sections }
}

const SKIP_SECTION_TITLES = /^(table of contents|practice questions?)$/i

function estimateMinutes(blocks, extra = 0) {
  const words = blocks.reduce((n, b) => {
    if (b.kind === 'paragraph' || b.kind === 'callout') return n + countWords(b.text ?? '')
    if (b.kind === 'heading') return n + countWords(b.text)
    if (b.kind === 'list') return n + b.items.reduce((m, x) => m + countWords(x), 0)
    if (b.kind === 'table') return n + b.rows.flat().reduce((m, x) => m + countWords(x), 0)
    return n
  }, 0)
  return Math.max(6, Math.min(35, Math.ceil(words / 120) + extra))
}

// ── main conversion ─────────────────────────────────────────────────────────
function convert(sourceDir, outDir, configPath) {
  const config = configPath && existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
  const slug = config.slug ?? basename(sourceDir)
  const rng = mulberry32(hashString(slug))
  const usedPromptKeys = new Set() // prompt ต้องไม่ซ้ำกันทั้งคอร์ส (เกต fairness ข้อ 4)

  const guideDir = ['study-guides', 'syllabus', 'docs']
    .map((d) => join(sourceDir, d))
    .find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.md')))
  if (!guideDir) {
    console.error(`ไม่พบ study guide ใน ${sourceDir} (study-guides/ | syllabus/ | docs/)`)
    process.exit(2)
  }

  const guideFiles = config.studyGuides ?? readdirSync(guideDir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => ({ file: f, skillId: slugify(basename(f, '.md')), skillLabel: cleanInline(basename(f, '.md').replace(/[_-]+/g, ' ')) }))

  const skills = []
  const nodes = []
  const lessonsEn = []
  const skipped = []
  const reported = { domains: [] }

  let prevNodeId = null
  for (const guide of guideFiles) {
    const absFile = join(guideDir, guide.file)
    const text = readFileSync(absFile, 'utf8')
    const { header, sections } = splitSections(text)

    const domainTitle = cleanInline((text.match(/^#\s+(.*)$/m) ?? [])[1] ?? guide.skillLabel)
    const skillId = guide.skillId
    skills.push({ id: skillId, maxScore: 100 })
    const skillLabel = guide.skillLabel ?? domainTitle

    const domainPool = extractPairs(text.split(/\r?\n/), domainTitle)
    const domainReport = { file: guide.file, domainTitle, sectionsKept: 0, sectionsSkipped: [] }

    const keptThisDomain = []
    for (const section of sections) {
      if (SKIP_SECTION_TITLES.test(section.title)) continue
      const blocks = parseBlocks(section.lines)
      const pairs = extractPairs(section.lines, section.title)
      const questions = generateSectionMcqs(pairs, domainPool, rng, 4, skillLabel, usedPromptKeys)

      // cheatsheet — เฉพาะข้อความจาก source (bullet/แถวตาราง term-def)
      const cheats = []
      for (const p of pairs) {
        const line = `${p.term}: ${p.def}`
        if (line.length <= 160) cheats.push(line)
      }
      if (cheats.length < 3) {
        for (const b of blocks) {
          if (b.kind === 'list') for (const item of b.items) if (item.length >= 15 && item.length <= 160) cheats.push(item)
        }
      }

      const wordsOk = blocks.filter((b) => b.kind === 'paragraph' || b.kind === 'list' || b.kind === 'table').length >= 2
      if (questions.length < 3 || cheats.length < 3 || !wordsOk || blocks.length < 4) {
        domainReport.sectionsSkipped.push({
          title: section.title,
          reason: questions.length < 3 ? `MCQ ได้เพียง ${questions.length}/3` : cheats.length < 3 ? `cheatsheet ได้เพียง ${cheats.length}/3` : blocks.length < 4 ? `blocks เพียง ${blocks.length}/4` : 'เนื้อหาบางเกินไป',
        })
        continue
      }

      let nodeId = slugify(`${skillId}-${section.title}`)
      if (nodes.some((n) => n.id === nodeId)) nodeId = `${nodeId}-2`
      // attribution = บล็อกquote หัวไฟล์ (v2 Unified Edition / Sources: … / Date: …)
      const headerQuote = header
        .map((x) => x.trim().replace(/^>\s?/, ''))
        .filter((x) => x !== '' && !/^#/.test(x) && !isHr(x))
        .join(' ')
      const attribution = cleanInline(headerQuote).slice(0, 300) || undefined

      keptThisDomain.push({
        nodeId, title: section.title, blocks, cheatsheet: cheats.slice(0, 8), questions,
        objective: `Study-guide review — ${domainTitle}: ${section.title}.`,
        skillId, attribution,
      })
      domainReport.sectionsKept++
    }

    // capstone = บทสุดท้ายของ domain + Practice Questions จาก guide (ถ้ามี)
    const pqSection = sections.find((s) => /^practice questions?$/i.test(s.title))
    const practiceQs = pqSection ? extractPracticeQuestions(pqSection.lines) : []
    let capstone = null
    if (keptThisDomain.length > 0) {
      capstone = keptThisDomain[keptThisDomain.length - 1]
      if (practiceQs.length >= 3) {
        capstone.questions = practiceQs.slice(0, 8).map((q, idx) => ({
          id: `q${idx + 1}`,
          prompt: q.prompt,
          choices: q.choices,
          correct: q.correct,
          explanation: q.explanation,
        }))
        domainReport.practiceQuestionsUsed = Math.min(practiceQs.length, 8)
      }
    }

    for (const lesson of keptThisDomain) {
      const isCapstone = capstone && lesson.nodeId === capstone.nodeId
      nodes.push({
        id: lesson.nodeId,
        kind: isCapstone ? 'capstone' : 'lesson',
        prerequisites: prevNodeId ? [prevNodeId] : [],
        estimatedMinutes: estimateMinutes(lesson.blocks, isCapstone ? 5 : 0),
        skillWeights: { [lesson.skillId]: 4 },
      })
      lessonsEn.push(lesson)
      prevNodeId = lesson.nodeId
    }
    reported.domains.push(domainReport)
  }

  if (nodes.length === 0) {
    console.error('ไม่มี section ใดผ่านเกตความยาว — ไม่สร้างคอร์ส')
    process.exit(3)
  }

  // ── course structure ──────────────────────────────────────────────────────
  const structure = {
    id: config.id ?? slug,
    slug,
    version: config.version ?? '0.1.0',
    publicAvailability: 'internal', // ผู้ก่อตั้งจะ publish ผ่าน course management เอง
    defaultLocale: 'en',
    availableLocales: ['en', 'th'],
    level: config.level ?? 'intermediate',
    estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
    ...(config.coverMotif ? { coverMotif: config.coverMotif } : {}),
    skills,
    globalSkillWeights: config.globalSkillWeights ?? { foundations: 1 },
    nodes,
  }

  const nodeTitles = Object.fromEntries(lessonsEn.map((l) => [l.nodeId, l.title]))
  const copyEn = {
    locale: 'en',
    title: config.title ?? domainTitleFallback(reported),
    subtitle: config.subtitle ?? `Converted from the Crucible study guides in ${basename(guideDir)}/`,
    audience: config.audience ?? 'Learners following the source study guides.',
    outcomes: config.outcomes ?? defaultOutcomes(reported),
    skillLabels: Object.fromEntries(skills.map((s, i) => [s.id, guideFiles[i].skillLabel ?? s.id])),
    nodeTitles,
  }
  const copyTh = { ...copyEn, locale: 'th' } // TODO(translation): สำเนา EN รอการแปล

  // ── เขียนไฟล์ ────────────────────────────────────────────────────────────
  const courseDir = join(outDir, slug)
  mkdirSync(join(courseDir, 'locales/en/lessons'), { recursive: true })
  mkdirSync(join(courseDir, 'locales/th/lessons'), { recursive: true })
  writeFileSync(join(courseDir, 'course.json'), JSON.stringify(structure, null, 2) + '\n')
  writeFileSync(join(courseDir, 'locales/en/course.json'), JSON.stringify(copyEn, null, 2) + '\n')
  writeFileSync(join(courseDir, 'locales/th/course.json'), JSON.stringify(copyTh, null, 2) + '\n')
  for (const l of lessonsEn) {
    for (const locale of ['en', 'th']) {
      const lesson = {
        nodeId: l.nodeId,
        locale,
        title: l.title,
        objective: l.objective,
        blocks: l.blocks,
        ...(l.attribution ? { attribution: l.attribution } : {}),
        cheatsheet: l.cheatsheet,
        checkpoint: l.questions,
      }
      writeFileSync(join(courseDir, `locales/${locale}/lessons/${l.nodeId}.json`), JSON.stringify(lesson, null, 2) + '\n')
    }
  }

  // ── รายงาน ────────────────────────────────────────────────────────────────
  console.log(`✓ ${slug}: ${nodes.length} บท (${nodes.filter((n) => n.kind === 'capstone').length} capstone), ${structure.estimatedMinutes} นาที`)
  for (const d of reported.domains) {
    console.log(`  ${d.file}: เก็บ ${d.sectionsKept} ส่วน${d.practiceQuestionsUsed ? `, practice questions ${d.practiceQuestionsUsed} ข้อใน capstone` : ''}`)
    for (const s of d.sectionsSkipped) console.log(`    ข้าม "${s.title}" — ${s.reason}`)
  }
  return { structure, reported }
}

function domainTitleFallback(reported) {
  return reported.domains[0]?.domainTitle ?? 'Converted course'
}
function defaultOutcomes(reported) {
  return reported.domains.slice(0, 8).map((d) => `Review ${d.domainTitle}`)
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const sourceDir = args[0]
const outDir = args[1]
const configIdx = args.indexOf('--config')
const configPath = configIdx >= 0 ? args[configIdx + 1] : null
if (!sourceDir || !outDir) {
  console.error('ใช้: node convert.mjs <crucible-course-dir> <output-courses-dir> [--config config.json]')
  process.exit(1)
}
convert(sourceDir, outDir, configPath)
