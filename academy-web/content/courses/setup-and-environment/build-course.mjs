// สร้าง course.json จากบทที่มีไฟล์ครบทั้งสองภาษาแล้ว
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const PLAN = [
  ['choose-your-environment', 'lesson', [], 14, { environment: 4 }],
  ['first-terminal-session', 'lesson', ['choose-your-environment'], 15, { environment: 2, terminal: 4 }],
  ['install-the-toolchain', 'lesson', ['first-terminal-session'], 16, { toolchain: 4 }],
  ['github-account-and-first-push', 'lesson', ['install-the-toolchain'], 16, { toolchain: 2, collaboration: 4 }],
  ['when-something-does-not-work', 'capstone', ['install-the-toolchain'], 17, { troubleshooting: 4, terminal: 2 }],
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
  id: 'setup-and-environment',
  slug: 'setup-and-environment',
  version: '1.0.0',
  publicAvailability: complete ? 'syllabus-preview' : 'internal',
  defaultLocale: 'en',
  availableLocales: ['en', 'th'],
  level: 'beginner',
  estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
  coverMotif: 'terminal',
  skills: ['environment', 'terminal', 'toolchain', 'collaboration', 'troubleshooting'].map((id) => ({ id, maxScore: 100 })),
  globalSkillWeights: { foundations: 1.0 },
  nodes,
}

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
console.log(`course.json: ${nodes.length}/${PLAN.length} บท, ${course.estimatedMinutes} นาที, publicAvailability=${course.publicAvailability}`)
