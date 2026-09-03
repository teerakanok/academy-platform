// สร้าง course.json จากรายการบททั้งหมด โดยรวมเฉพาะบทที่มีไฟล์ครบทั้งสองภาษาแล้ว
// ใช้: node content/courses/computer-networking/build-course.mjs
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const PLAN = [
  // M1 ภาพรวม
  ['how-machines-talk', 'lesson', [], 15, { 'network-model': 4 }],
  ['layers-and-encapsulation', 'lesson', ['how-machines-talk'], 18, { 'network-model': 4, troubleshooting: 2 }],
  // M2 IP และ routing
  ['ip-addressing', 'lesson', ['layers-and-encapsulation'], 18, { addressing: 4 }],
  ['subnetting', 'lesson', ['ip-addressing'], 20, { addressing: 4 }],
  ['routing-basics', 'lesson', ['subnetting'], 19, { addressing: 3, troubleshooting: 3 }],
  ['arp-and-icmp', 'capstone', ['routing-basics'], 20, { addressing: 3, troubleshooting: 4 }],
  // M3 นอก LAN
  ['nat', 'lesson', ['routing-basics'], 17, { addressing: 4 }],
  ['ipv6', 'lesson', ['ip-addressing'], 18, { addressing: 4 }],
  ['bgp-overview', 'lesson', ['routing-basics'], 16, { addressing: 2, 'network-model': 2 }],
  ['vpn-concepts', 'lesson', ['nat'], 16, { 'network-security': 4 }],
  // M4 โมเดล I/O
  ['file-descriptors', 'lesson', ['layers-and-encapsulation'], 16, { 'socket-programming': 3 }],
  ['blocking-vs-nonblocking', 'lesson', ['file-descriptors'], 18, { 'socket-programming': 4 }],
  ['select-poll-epoll', 'lesson', ['blocking-vs-nonblocking'], 20, { 'socket-programming': 4, 'server-design': 3 }],
  // M5 socket
  ['socket-api', 'lesson', ['file-descriptors'], 19, { 'socket-programming': 4 }],
  ['tcp-handshake', 'lesson', ['socket-api'], 19, { 'network-model': 3, troubleshooting: 3 }],
  ['client-and-server', 'capstone', ['tcp-handshake'], 22, { 'socket-programming': 4, 'server-design': 3 }],
  ['error-handling', 'lesson', ['client-and-server'], 18, { 'socket-programming': 4, troubleshooting: 3 }],
  // M6 โปรโตคอลชั้นบน
  ['dns-and-resolution', 'lesson', ['ip-addressing'], 18, { 'network-model': 3, troubleshooting: 3 }],
  ['http-basics', 'lesson', ['tcp-handshake', 'dns-and-resolution'], 19, { 'network-model': 3, 'network-security': 2 }],
  // M7 เซิร์ฟเวอร์รับหลายคน
  ['thread-per-connection', 'lesson', ['client-and-server'], 17, { 'server-design': 4 }],
  ['thread-pool', 'lesson', ['thread-per-connection'], 18, { 'server-design': 4 }],
  ['event-driven-and-c10k', 'capstone', ['select-poll-epoll'], 22, { 'server-design': 4, 'socket-programming': 3 }],
  // M8 RPC
  ['rpc-concepts', 'lesson', ['http-basics'], 16, { 'network-model': 3, 'server-design': 2 }],
  ['grpc-and-protobuf', 'lesson', ['rpc-concepts'], 17, { 'network-model': 3, 'server-design': 2 }],
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
  id: 'computer-networking',
  slug: 'computer-networking',
  version: '1.0.0',
  publicAvailability: complete ? 'syllabus-preview' : 'internal',
  defaultLocale: 'en',
  availableLocales: ['en', 'th'],
  level: 'intermediate',
  estimatedMinutes: nodes.reduce((n, x) => n + x.estimatedMinutes, 0),
  coverMotif: 'cloud',
  skills: ['network-model', 'addressing', 'socket-programming', 'server-design', 'troubleshooting', 'network-security'].map(
    (id) => ({ id, maxScore: 100 }),
  ),
  globalSkillWeights: { foundations: 0.75, 'security-ops': 0.25 },
  nodes,
}

writeFileSync(join(here, 'course.json'), JSON.stringify(course, null, 2) + '\n')
console.log(
  `course.json: ${nodes.length}/${PLAN.length} บท, ${course.estimatedMinutes} นาที, ` +
    `publicAvailability=${course.publicAvailability}`,
)
