// สร้าง course.json จากรายการบททั้งหมด โดยรวมเฉพาะบทที่มีไฟล์ครบทั้งสองภาษาแล้ว
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const PLAN = [
  // M1 ISA คืออะไร
  ['what-is-an-isa', 'lesson', [], 16, { isa: 4 }],
  ['risc-vs-cisc', 'lesson', ['what-is-an-isa'], 17, { isa: 4 }],
  ['instruction-encoding', 'lesson', ['what-is-an-isa'], 18, { isa: 4, 'machine-code': 3 }],
  // M2 RISC-V
  ['instruction-formats', 'lesson', ['instruction-encoding'], 19, { 'machine-code': 4, isa: 2 }],
  ['addressing-modes', 'lesson', ['instruction-formats'], 17, { 'machine-code': 3, isa: 2 }],
  ['load-store-architecture', 'lesson', ['instruction-formats'], 17, { isa: 4 }],
  ['calling-convention', 'capstone', ['load-store-architecture'], 20, { 'machine-code': 4, isa: 3 }],
  // M3 datapath
  ['single-cycle-datapath', 'lesson', ['load-store-architecture'], 19, { datapath: 4 }],
  ['control-signals', 'lesson', ['single-cycle-datapath'], 18, { datapath: 4 }],
  ['multi-cycle-and-cpi', 'lesson', ['single-cycle-datapath'], 18, { datapath: 3, performance: 3 }],
  // M4 pipeline
  ['pipeline-stages', 'lesson', ['multi-cycle-and-cpi'], 19, { pipelining: 4, performance: 2 }],
  ['throughput-vs-latency', 'lesson', ['pipeline-stages'], 17, { performance: 4, pipelining: 2 }],
  // M5 hazard
  ['data-hazards-and-forwarding', 'lesson', ['pipeline-stages'], 19, { pipelining: 4 }],
  ['load-use-stall', 'lesson', ['data-hazards-and-forwarding'], 17, { pipelining: 4, performance: 2 }],
  ['control-hazards-and-prediction', 'capstone', ['data-hazards-and-forwarding'], 21, { pipelining: 4, performance: 3 }],
  // M6 cache
  ['locality', 'lesson', ['throughput-vs-latency'], 18, { memory: 4, performance: 3 }],
  ['cache-mapping', 'lesson', ['locality'], 19, { memory: 4 }],
  ['hit-miss-and-write-policy', 'lesson', ['cache-mapping'], 18, { memory: 4 }],
  ['cache-friendly-code', 'capstone', ['hit-miss-and-write-policy'], 22, { memory: 4, performance: 4 }],
  // M7 DRAM
  ['dram-cells-and-timing', 'lesson', ['hit-miss-and-write-policy'], 17, { memory: 4 }],
  ['ddr-generations', 'lesson', ['dram-cells-and-timing'], 15, { memory: 3, performance: 2 }],
  ['bandwidth-numa-hbm', 'lesson', ['dram-cells-and-timing'], 17, { memory: 3, performance: 3 }],
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
  id: 'computer-architecture',
  slug: 'computer-architecture',
  version: '1.0.0',
  publicAvailability: complete ? 'syllabus-preview' : 'internal',
  defaultLocale: 'en',
  availableLocales: ['en', 'th'],
  level: 'intermediate',
  estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
  coverMotif: 'layers',
  skills: ['isa', 'machine-code', 'datapath', 'pipelining', 'memory', 'performance'].map((id) => ({ id, maxScore: 100 })),
  globalSkillWeights: { foundations: 1.0 },
  nodes,
}

writeFileSync(join(here, 'course.json'), JSON.stringify(course, null, 2) + '\n')
console.log(
  `course.json: ${nodes.length}/${PLAN.length} บท, ${course.estimatedMinutes} นาที, ` +
    `publicAvailability=${course.publicAvailability}`,
)
