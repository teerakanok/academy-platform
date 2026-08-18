// สร้าง course.json จากรายการบททั้งหมด โดยรวมเฉพาะบทที่มีไฟล์ครบทั้งสองภาษาแล้ว
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const PLAN = [
  // M1 พื้นฐาน x86-64
  ['why-read-assembly', 'lesson', [], 17, { 'reading-disassembly': 4 }],
  ['registers', 'lesson', ['why-read-assembly'], 18, { 'x86-registers': 4 }],
  ['mov-and-lea', 'lesson', ['registers'], 18, { 'x86-registers': 3, 'instruction-semantics': 4 }],
  ['arithmetic-and-flags', 'lesson', ['mov-and-lea'], 18, { 'instruction-semantics': 4 }],
  ['att-vs-intel-syntax', 'lesson', ['mov-and-lea'], 14, { 'reading-disassembly': 4 }],
  // M2 การควบคุมการไหล
  ['cmp-test-jcc', 'lesson', ['arithmetic-and-flags'], 18, { 'control-flow': 4, 'instruction-semantics': 2 }],
  ['loops-in-assembly', 'lesson', ['cmp-test-jcc'], 18, { 'control-flow': 4 }],
  ['arrays-in-assembly', 'lesson', ['loops-in-assembly'], 18, { 'control-flow': 3, 'instruction-semantics': 3 }],
  // M3 ฟังก์ชันและ stack
  ['call-and-ret', 'lesson', ['cmp-test-jcc'], 17, { 'stack-and-abi': 4 }],
  ['stack-frames', 'lesson', ['call-and-ret'], 19, { 'stack-and-abi': 4 }],
  ['abi-and-calling-convention', 'lesson', ['stack-frames'], 19, { 'stack-and-abi': 4 }],
  ['recursion-in-assembly', 'capstone', ['abi-and-calling-convention'], 20, { 'stack-and-abi': 4, 'control-flow': 3 }],
  // M4 เครื่องมือ
  ['objdump-and-gdb', 'lesson', ['stack-frames'], 19, { tooling: 4, 'reading-disassembly': 3 }],
  ['reading-real-disassembly', 'capstone', ['objdump-and-gdb', 'arrays-in-assembly'], 22, { 'reading-disassembly': 4, tooling: 3 }],
]

const written = new Set(
  readdirSync(join(here, 'locales/en/lessons'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((id) => existsSync(join(here, `locales/th/lessons/${id}.json`))),
)

const nodes = PLAN.filter(([id]) => written.has(id)).map(([id, kind, prereq, minutes, weights]) => ({
  id,
  kind,
  prerequisites: prereq.filter((p) => written.has(p)),
  estimatedMinutes: minutes,
  skillWeights: weights,
}))

const complete = nodes.length === PLAN.length

const course = {
  id: 'assembly',
  slug: 'assembly',
  version: '1.0.0',
  publicAvailability: complete ? 'syllabus-preview' : 'internal',
  defaultLocale: 'en',
  availableLocales: ['en', 'th'],
  level: 'intermediate',
  estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
  coverMotif: 'terminal',
  skills: ['reading-disassembly', 'x86-registers', 'instruction-semantics', 'control-flow', 'stack-and-abi', 'tooling'].map(
    (id) => ({ id, maxScore: 100 }),
  ),
  globalSkillWeights: { foundations: 0.7, 'security-ops': 0.3 },
  nodes,
}

// nodeTitles ของแต่ละภาษาต้องตรงกับบทที่มีอยู่จริงเสมอ — ให้สคริปต์ซิงค์ให้
// แทนการแก้มือ เพราะการลืมแก้ไฟล์ภาษาคือทางที่คอร์สจะพังแบบเงียบ ๆ
for (const locale of course.availableLocales) {
  const copyPath = join(here, `locales/${locale}/course.json`)
  const copy = JSON.parse(readFileSync(copyPath, 'utf8'))
  copy.nodeTitles = Object.fromEntries(
    nodes.map(({ id }) => [
      id,
      JSON.parse(readFileSync(join(here, `locales/${locale}/lessons/${id}.json`), 'utf8')).title,
    ]),
  )
  writeFileSync(copyPath, JSON.stringify(copy, null, 2) + '\n')
}

writeFileSync(join(here, 'course.json'), JSON.stringify(course, null, 2) + '\n')
console.log(
  `course.json: ${nodes.length}/${PLAN.length} บท, ${course.estimatedMinutes} นาที, ` +
    `publicAvailability=${course.publicAvailability}`,
)
