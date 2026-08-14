/**
 * ยิงทางหลบใส่ด่าน "โมดูล identity ยังไม่ถูกต่อเข้า production" แล้วรายงานว่ากัดจริงไหม
 *
 * มีอยู่เพราะข้ออ้างว่า "mutation ตายครบ" ในรายงานตรวจซ้ำไม่ได้ถ้าไม่มีสคริปต์
 * ทางหลบด้านล่างคือของจริงที่รีวิวอิสระใช้แล้วผ่านด่านรุ่นก่อนมาแล้วทั้งหมด
 *
 *   node scripts/adversarial/not-wired-gate-evasions.mjs
 *
 * รหัสออก: 0 = ทางหลบทุกทางถูกจับและเลนปกติยังผ่าน · 1 = มีทางหลบรอด หรือเลน
 * ปกติพัง · 2 = รันไม่ได้บางรายการ จึงพิสูจน์อะไรไม่ได้ (ไม่ใช่ผ่าน)
 *
 * ความปลอดภัย: ทุกการแก้ไฟล์ผ่าน Sandbox ซึ่งลบได้เฉพาะสิ่งที่รอบนี้สร้างเอง
 * และคืนสภาพแม้ถูกสัญญาณขัดจังหวะ รุ่นก่อนของสคริปต์นี้ลบโฟลเดอร์ `extra/`
 * ทั้งอันโดยไม่สนว่าใครสร้าง ทำงานของคนอื่นหายทั้งที่ออก 0 ตามปกติ
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { restoreOnExit, Sandbox } from './sandbox.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const gate = 'tests/unit/identity-key-distribution-not-wired.test.ts'
const route = 'src/app/(site)/api/auth/me/route.ts'

const sandbox = new Sandbox(root)
restoreOnExit(sandbox)

/** แต่ละทางหลบบอกว่าจะสร้างไฟล์อะไรใหม่ และจะแก้ไฟล์ไหนที่มีอยู่แล้ว */
const EVASIONS = [
  {
    name: 're-export bridge ภายใน src/lib/identity',
    create: {
      'src/lib/identity/session-helpers.ts':
        "export { importIdentityResultKeySet } from './result-key-set-importer'\n",
    },
    modify: {
      [route]: (before) =>
        "import { importIdentityResultKeySet } from '@/lib/identity/session-helpers'\n"
        + `void importIdentityResultKeySet\n${before}`,
    },
  },
  {
    name: 'dynamic import ที่ประกอบ specifier เอง',
    create: {},
    modify: {
      [route]: (before) => `void import('@/lib/identity/' + 'result-key-set-importer')\n${before}`,
    },
  },
  {
    name: 'wrangler entry ตัวใหม่นอกรากที่เคย hardcode ไว้',
    create: {
      'adversarial-probe/alt-worker.ts':
        "import { importIdentityResultKeySet } from '../src/lib/identity/result-key-set-importer'\n"
        + "export default { async fetch() { void importIdentityResultKeySet; return new Response('x') } }\n",
      'wrangler.adversarial-probe.jsonc':
        '{\n  "name": "adversarial-probe",\n  "main": "adversarial-probe/alt-worker.ts",\n'
        + '  "compatibility_date": "2025-03-25"\n}\n',
    },
    modify: {},
  },
  {
    // ทางหลบที่อันตรายที่สุดที่รีวิวอิสระเจอ: build จริงแล้วโค้ดจากโมดูลต้องห้าม
    // ไปโผล่ใน .open-next/middleware/handler.mjs ขณะที่ด่านยังเขียว 10/10
    name: 'src/instrumentation.ts ซึ่ง Next ถือเป็น entrypoint เอง',
    create: {
      'src/instrumentation.ts':
        "import { createIdentityResultKeySetCache } from '@/lib/identity/result-key-set-cache'\n"
        + 'export function register() { void createIdentityResultKeySetCache }\n',
    },
    modify: {},
  },
  {
    name: 'src/pages ซึ่งไม่เคยถูกสแกน',
    create: {
      'src/pages/api/probe.ts':
        "import { importIdentityResultKeySet } from '@/lib/identity/result-key-set-importer'\n"
        + 'export default function handler() { void importIdentityResultKeySet }\n',
    },
    modify: {},
  },
  {
    name: 'alias ตัวใหม่ใน tsconfig ที่ resolver เดิมไม่รู้จัก',
    create: {
      'src/app/(site)/api/auth/alias-probe.ts':
        "export { importIdentityResultKeySet } from '#identity/result-key-set-importer'\n",
    },
    modify: {
      'tsconfig.json': (before) => before.replace(
        '"@/*": ["./src/*"]',
        '"@/*": ["./src/*"], "#identity/*": ["./src/lib/identity/*"]',
      ),
      [route]: (before) => "import '@/app/(site)/api/auth/alias-probe'\n" + before,
    },
  },
  {
    name: 'self-import ผ่านชื่อแพ็กเกจตัวเองใน package.json exports',
    create: {},
    modify: {
      'package.json': (before) => {
        const manifest = JSON.parse(before)
        manifest.exports = { './identity/*': './src/lib/identity/*' }
        return `${JSON.stringify(manifest, null, 2)}\n`
      },
      [route]: (before) =>
        "import { createIdentityResultKeySetCache } from 'academy-web/identity/result-key-set-cache'\n"
        + `void createIdentityResultKeySetCache\n${before}`,
    },
  },
  {
    name: 'wrangler config ที่มี "main" ลวงอยู่ในคอมเมนต์',
    create: {
      'adversarial-probe/decoy.ts': "export default { async fetch() { return new Response('x') } }\n",
      'adversarial-probe/real-worker.ts':
        "import { importIdentityResultKeySet } from '../src/lib/identity/result-key-set-importer'\n"
        + "export default { async fetch() { void importIdentityResultKeySet; return new Response('x') } }\n",
      'wrangler.decoy-probe.jsonc':
        '{\n  "name": "decoy-probe",\n'
        + '  // "main": "adversarial-probe/decoy.ts",\n'
        + '  "main": "adversarial-probe/real-worker.ts",\n'
        + '  "compatibility_date": "2025-03-25"\n}\n',
    },
    modify: {},
  },
  {
    name: 'symlink ที่ชี้ไปโมดูลต้องห้าม',
    create: {},
    symlink: { 'src/lib/identity/mirror.ts': 'src/lib/identity/result-key-set-importer.ts' },
    modify: {
      [route]: (before) =>
        "import { importIdentityResultKeySet } from '@/lib/identity/mirror'\n"
        + `void importIdentityResultKeySet\n${before}`,
    },
  },
  {
    // TypeScript แทนนามสกุลให้เองภายใต้ moduleResolution: bundler
    // ทางนี้เกิดจาก refactor ปกติได้โดยไม่ต้องตั้งใจ จึงต่างจากทางหลบอื่นที่ต้องจงใจ
    name: 'specifier ลงท้าย .js ที่ TypeScript แทนด้วย .ts ให้',
    create: {},
    modify: {
      [route]: (before) =>
        "import { importIdentityResultKeySet } from '@/lib/identity/result-key-set-importer.js'\n"
        + `void importIdentityResultKeySet\n${before}`,
    },
  },
  {
    name: 'static import ตรงๆ จาก route',
    create: {},
    modify: {
      [route]: (before) =>
        "import { createIdentityResultKeySetCache } from '@/lib/identity/result-key-set-cache'\n"
        + `void createIdentityResultKeySetCache\n${before}`,
    },
  },
]

function gatePasses() {
  try {
    execFileSync('npx', ['vitest', 'run', '--project', 'unit', gate], {
      cwd: root, stdio: 'pipe', timeout: 300_000,
    })
    return true
  } catch (error) {
    // แยก "ด่านตัดสินว่าไม่ผ่าน" ออกจาก "รันไม่ได้เลย" — สองอย่างนี้ไม่เหมือนกัน
    if (error?.code === 'ETIMEDOUT' || error?.status === undefined) {
      throw new Error(`รันด่านไม่สำเร็จ: ${error?.message ?? error}`)
    }
    return false
  }
}

let survived = 0
let unproven = 0
let blocked = 0

for (const evasion of EVASIONS) {
  sandbox.reopen()
  let outcome
  try {
    for (const [path, content] of Object.entries(evasion.create)) sandbox.create(path, content)
    for (const [path, target] of Object.entries(evasion.symlink ?? {})) sandbox.symlink(path, target)
    for (const [path, build] of Object.entries(evasion.modify)) {
      sandbox.modify(path, build(sandbox.original(path)))
    }
    outcome = gatePasses() ? 'SURVIVED' : 'KILLED'
  } catch (error) {
    // ยิงไม่ออกไม่ใช่ยิงแล้วไม่โดน ห้ามรายงานเป็น KILLED
    outcome = 'ยิงไม่ได้'
    console.log(`ยิงไม่ได้   ${evasion.name} — ${error.message}`)
    unproven += 1
  } finally {
    sandbox.restore()
    const problems = sandbox.problems()
    if (problems.length > blocked) {
      // คืนสภาพไม่ครบคือปัญหาของข้อมูล ไม่ใช่ผลของการทดสอบ ต้องดังกว่าผลการทดสอบ
      for (const problem of problems.slice(blocked)) console.error(`คืนสภาพไม่ครบ: ${problem}`)
      blocked = problems.length
    }
  }
  if (outcome === 'SURVIVED' || outcome === 'KILLED') {
    console.log(`${outcome === 'SURVIVED' ? 'SURVIVED' : 'KILLED  '}  ${evasion.name}`)
    if (outcome === 'SURVIVED') survived += 1
  }
}

sandbox.reopen()
let baseline
try {
  baseline = gatePasses()
} catch (error) {
  console.log(`ยิงไม่ได้   เลนปกติ — ${error.message}`)
  unproven += 1
  baseline = null
}
if (baseline !== null) {
  console.log(`${baseline ? 'PASS    ' : 'BROKEN  '}  เลนปกติที่ไม่ได้แก้อะไร`)
}

if (blocked > 0) {
  console.error(`\nคืนสภาพไม่ครบ ${blocked} รายการ — ต้องเก็บด้วยมือก่อนเชื่อผลใดๆ`)
  process.exit(1)
}
if (survived > 0 || baseline === false) {
  console.error(`\nมีทางหลบที่รอด ${survived} ทาง${baseline === false ? ' และเลนปกติพัง' : ''}`)
  process.exit(1)
}
if (unproven > 0) {
  console.error(`\nรันไม่ได้ ${unproven} รายการ — สคริปต์นี้ยังพิสูจน์อะไรไม่ได้`)
  process.exit(2)
}
console.log('\nทางหลบทุกทางถูกจับ และเลนปกติยังผ่าน')
