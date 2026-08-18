// แปลงคอร์สเป็น Markdown ที่คนอ่านได้ — ใช้สองอย่าง:
//   1. เป็นของจริงที่ส่งให้ลานตรวจ "กิน" (ผู้เรียนอ่านบทเรียน ไม่ได้อ่าน JSON)
//   2. เป็น artifact ที่ publish ขึ้น vault
// เอาต์พุตต้อง deterministic เพื่อให้ sha256 ใช้ยืนยัน freeze ได้
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', 'content', 'courses')
const outDir = process.argv[2] ?? join(here, '..', '.export')

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

function renderBlock(b) {
  const out = []
  switch (b.kind) {
    case 'heading':
      out.push(`### ${b.text}`)
      break
    case 'paragraph':
      out.push(b.text)
      break
    case 'list':
      for (const item of b.items) out.push(`- ${item}`)
      break
    case 'code':
      if (b.caption) out.push(`_${b.caption}_`)
      out.push('```', ...b.lines, '```')
      break
    case 'callout':
      out.push(`> **[${b.tone.toUpperCase()}] ${b.title}**`, '>', `> ${b.text}`)
      break
    case 'table': {
      // เซลล์ที่มีอักขระ | ต้อง escape ไม่งั้นตารางแตก — และบทที่สอน pipe คือบทที่โดนพอดี
      const cell = (v) => String(v).replace(/\|/g, '\\|')
      out.push(`| ${b.headers.map(cell).join(' | ')} |`)
      out.push(`| ${b.headers.map(() => '---').join(' | ')} |`)
      for (const row of b.rows) out.push(`| ${row.map(cell).join(' | ')} |`)
      break
    }
    case 'try':
      out.push(`### ${b.title}`)
      b.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`))
      out.push('', `**Expected:** ${b.expected}`)
      break
    case 'image':
      out.push(`![${b.alt ?? ''}](${b.src})`)
      if (b.caption) out.push('', `_${b.caption}_`)
      break
    case 'lab':
      out.push(`### Lab: ${b.title}`, '')
      out.push(b.description)
      out.push('', `_${b.estimatedMinutes} min · scale: ${b.scale} · status: ${b.status}_`)
      break
    case 'attachment':
      out.push(`**Attachment: ${b.title}** (${b.fileType}, ${b.sizeLabel}) — ${b.href}`, '', b.description)
      break
    case 'externalLink':
      out.push(`**Link: [${b.title}](${b.href})** — ${b.sourceLabel}`, '', b.description)
      break
    case 'simulation': {
      const c = b.challenge ?? {}
      out.push(`### Simulation: ${c.title ?? b.kind}`, '', c.brief ?? '')
      if (Array.isArray(c.requirements)) {
        out.push('', '**Requirements:**')
        for (const r of c.requirements) out.push(`- ${r.label ?? r.id ?? JSON.stringify(r)}`)
      }
      break
    }
    default:
      throw new Error(`export ไม่รองรับ block kind: ${b.kind} — เพิ่มก่อน ไม่งั้นเนื้อหาหายเงียบ`)
  }
  return out.join('\n')
}

function renderLesson(lesson, index, node) {
  const out = [`## ${index}. ${lesson.title}`, '']
  out.push(`_${node.kind} · ${node.estimatedMinutes} min · id: ${lesson.nodeId}_`, '')
  out.push(`**Objective:** ${lesson.objective}`, '')
  for (const b of lesson.blocks) out.push(renderBlock(b), '')
  if (lesson.cheatsheet?.length) {
    out.push('### Cheatsheet', '')
    for (const c of lesson.cheatsheet) out.push(`- ${c}`)
    out.push('')
  }
  if (lesson.checkpoint?.length) {
    out.push('### Checkpoint', '')
    for (const q of lesson.checkpoint) {
      out.push(`**${q.id}.** ${q.prompt}`, '')
      for (const [k, v] of Object.entries(q.choices)) {
        out.push(`- ${k}${q.correct.includes(k) ? ' [CORRECT]' : ''}: ${v}`)
      }
      out.push('', `_Explanation:_ ${q.explanation}`, '')
    }
  }
  return out.join('\n')
}

function renderCourse(slug, locale) {
  const course = read(join(coursesDir, slug, 'course.json'))
  const copy = read(join(coursesDir, slug, 'locales', locale, 'course.json'))
  const out = [`# ${copy.title}`, '', `_${copy.subtitle}_`, '']
  out.push(`**Locale:** ${locale} · **Nodes:** ${course.nodes.length} · **Minutes:** ${course.estimatedMinutes} · **Availability:** ${course.publicAvailability}`, '')
  out.push(`**Audience:** ${copy.audience}`, '')
  out.push('**Outcomes:**', '')
  for (const o of copy.outcomes) out.push(`- ${o}`)
  out.push('', '**Skills:** ' + Object.entries(copy.skillLabels).map(([k, v]) => `${v} (${k})`).join(' · '), '')
  out.push('---', '')
  course.nodes.forEach((node, i) => {
    const lesson = read(join(coursesDir, slug, 'locales', locale, 'lessons', `${node.id}.json`))
    out.push(renderLesson(lesson, i + 1, node), '', '---', '')
  })
  return out.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n'
}

const slugs = readdirSync(coursesDir)
  .filter((s) => existsSync(join(coursesDir, s, 'course.json')))
  .filter((s) => read(join(coursesDir, s, 'course.json')).publicAvailability !== 'internal')
  .sort()

mkdirSync(outDir, { recursive: true })
for (const slug of slugs) {
  const course = read(join(coursesDir, slug, 'course.json'))
  for (const locale of course.availableLocales) {
    const text = renderCourse(slug, locale)
    const file = join(outDir, `${slug}.${locale}.md`)
    writeFileSync(file, text)
    console.log(`${slug}.${locale}.md  ${(text.length / 1024).toFixed(0)} KB`)
  }
}
console.log(`\n${slugs.length} คอร์ส -> ${outDir}`)
