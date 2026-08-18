// สร้าง course.json จากรายการบททั้งหมดของหลักสูตร โดยรวมเฉพาะบทที่มีไฟล์เนื้อหาครบทั้งสองภาษาแล้ว
// ทำให้ commit ระหว่างเขียนคอร์สได้ โดยที่เกตความครบถ้วนของภาษายังแข็งเหมือนเดิม
// ใช้: node content/courses/operating-systems/build-course.mjs
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const PLAN = [
  // M1 kernel และ syscall
  ['kernel-vs-user-mode', 'lesson', [], 16, { 'kernel-interface': 3, 'os-security': 2 }],
  ['syscall-mechanism', 'lesson', ['kernel-vs-user-mode'], 18, { 'kernel-interface': 4 }],
  ['syscall-lifecycle', 'capstone', ['syscall-mechanism'], 20, { 'kernel-interface': 4, processes: 2 }],
  // M2 โปรเซสและ signal
  ['fork-exec-wait', 'lesson', ['syscall-lifecycle'], 20, { processes: 4, 'kernel-interface': 2 }],
  ['zombie-and-orphan', 'lesson', ['fork-exec-wait'], 16, { processes: 4 }],
  ['signals', 'lesson', ['fork-exec-wait'], 18, { processes: 3, 'kernel-interface': 2 }],
  ['async-signal-safety', 'lesson', ['signals'], 17, { processes: 3, 'os-security': 2 }],
  // M3 thread และการซิงก์
  ['thread-vs-process', 'lesson', ['fork-exec-wait'], 16, { concurrency: 4, processes: 2 }],
  ['pthreads', 'lesson', ['thread-vs-process'], 18, { concurrency: 4 }],
  ['race-conditions', 'lesson', ['pthreads'], 19, { concurrency: 4, synchronisation: 3 }],
  ['mutex', 'lesson', ['race-conditions'], 18, { synchronisation: 4, concurrency: 2 }],
  ['semaphore-and-condvar', 'lesson', ['mutex'], 19, { synchronisation: 4 }],
  ['producer-consumer', 'capstone', ['semaphore-and-condvar'], 22, { synchronisation: 4, concurrency: 4 }],
  // M4 deadlock และ scheduling
  ['deadlock', 'lesson', ['mutex'], 18, { synchronisation: 4, concurrency: 2 }],
  ['cpu-scheduling', 'lesson', ['thread-vs-process'], 18, { processes: 3, concurrency: 2 }],
  // M5 virtual memory
  ['address-space', 'lesson', ['fork-exec-wait'], 18, { 'virtual-memory': 4 }],
  ['page-tables-and-tlb', 'lesson', ['address-space'], 19, { 'virtual-memory': 4 }],
  ['demand-paging', 'lesson', ['page-tables-and-tlb'], 18, { 'virtual-memory': 4 }],
  ['cow-and-mmap', 'capstone', ['demand-paging'], 21, { 'virtual-memory': 4, processes: 3 }],
  // M6 การป้องกัน
  ['privilege-rings', 'lesson', ['kernel-vs-user-mode'], 15, { 'os-security': 4 }],
  ['acl-vs-capability', 'lesson', ['privilege-rings'], 17, { 'os-security': 4 }],
  ['setuid-and-its-risks', 'capstone', ['acl-vs-capability'], 20, { 'os-security': 4, processes: 2 }],
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
  // ตัด prerequisite ที่ยังไม่ถูกเขียน เพื่อไม่ให้ DAG ชี้ไปยัง node ที่ไม่มีอยู่
  prerequisites: prereq.filter((p) => written.has(p)),
  estimatedMinutes: minutes,
  skillWeights: weights,
}))

const complete = nodes.length === PLAN.length

const course = {
  id: 'operating-systems',
  slug: 'operating-systems',
  version: '1.0.0',
  publicAvailability: complete ? 'syllabus-preview' : 'internal',
  defaultLocale: 'en',
  availableLocales: ['en', 'th'],
  level: 'intermediate',
  estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
  coverMotif: 'layers',
  skills: ['kernel-interface', 'processes', 'concurrency', 'synchronisation', 'virtual-memory', 'os-security'].map(
    (id) => ({ id, maxScore: 100 }),
  ),
  globalSkillWeights: { foundations: 0.8, 'security-ops': 0.2 },
  nodes,
}

writeFileSync(join(here, 'course.json'), JSON.stringify(course, null, 2) + '\n')
console.log(
  `course.json: ${nodes.length}/${PLAN.length} บท, ${course.estimatedMinutes} นาที, ` +
    `publicAvailability=${course.publicAvailability}`,
)
