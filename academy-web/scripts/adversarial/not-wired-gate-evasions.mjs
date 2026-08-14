/**
 * ยิงทางหลบใส่ด่าน "โมดูล identity ยังไม่ถูกต่อเข้า production" แล้วรายงานว่ากัดจริงไหม
 *
 * มีอยู่เพราะข้ออ้างว่า "mutation ตายครบ" ในรายงานตรวจซ้ำไม่ได้ถ้าไม่มีสคริปต์
 * รีวิวอิสระชี้จุดนี้ตรงๆ ทางหลบทั้งสี่ด้านล่างคือของจริงที่รีวิวใช้แล้วผ่านด่านรุ่นก่อน
 *
 *   node scripts/adversarial/not-wired-gate-evasions.mjs
 *
 * ออก 0 เมื่อทุกทางหลบถูกจับ และเลนปกติยังผ่าน มิฉะนั้นออก 1
 * แก้ไฟล์จริงชั่วคราวแล้วคืนสภาพเสมอ รวมถึงตอนถูกขัดจังหวะ
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const gate = 'tests/unit/identity-key-distribution-not-wired.test.ts'
const route = 'src/app/(site)/api/auth/me/route.ts'
const original = readFileSync(join(root, route), 'utf8')

const EVASIONS = [
  {
    name: 're-export bridge ภายใน src/lib/identity',
    files: {
      'src/lib/identity/session-helpers.ts':
        "export { importIdentityResultKeySet } from './result-key-set-importer'\n",
      [route]:
        "import { importIdentityResultKeySet } from '@/lib/identity/session-helpers'\n"
        + `void importIdentityResultKeySet\n${original}`,
    },
  },
  {
    name: 'dynamic import ที่ประกอบ specifier เอง',
    files: {
      [route]: `void import('@/lib/identity/' + 'result-key-set-importer')\n${original}`,
    },
  },
  {
    name: 'wrangler entry ตัวใหม่นอกรากที่เคย hardcode ไว้',
    files: {
      'extra/alt-worker.ts':
        "import { importIdentityResultKeySet } from '../src/lib/identity/result-key-set-importer'\n"
        + "export default { async fetch() { void importIdentityResultKeySet; return new Response('x') } }\n",
      'wrangler.alt.jsonc':
        '{\n  "name": "alt",\n  "main": "extra/alt-worker.ts",\n'
        + '  "compatibility_date": "2025-03-25"\n}\n',
    },
  },
  {
    name: 'static import ตรงๆ จาก route',
    files: {
      [route]:
        "import { createIdentityResultKeySetCache } from '@/lib/identity/result-key-set-cache'\n"
        + `void createIdentityResultKeySetCache\n${original}`,
    },
  },
]

function gatePasses() {
  try {
    execFileSync('npx', ['vitest', 'run', '--project', 'unit', gate], {
      cwd: root, stdio: 'pipe', timeout: 300_000,
    })
    return true
  } catch {
    return false
  }
}

function restore(files) {
  for (const path of Object.keys(files)) {
    if (path === route) writeFileSync(join(root, route), original)
    else rmSync(join(root, path), { force: true })
  }
  rmSync(join(root, 'extra'), { recursive: true, force: true })
}

let failures = 0
process.on('exit', () => writeFileSync(join(root, route), original))

for (const evasion of EVASIONS) {
  for (const [path, content] of Object.entries(evasion.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const survived = gatePasses()
  restore(evasion.files)
  console.log(`${survived ? 'SURVIVED' : 'KILLED  '}  ${evasion.name}`)
  if (survived) failures += 1
}

const baseline = gatePasses()
console.log(`${baseline ? 'PASS    ' : 'BROKEN  '}  เลนปกติที่ไม่ได้แก้อะไร`)
if (!baseline) failures += 1

if (failures > 0) {
  console.error(`\nมี ${failures} รายการที่ไม่เป็นไปตามที่ควร`)
  process.exit(1)
}
console.log('\nทางหลบทุกทางถูกจับ และเลนปกติยังผ่าน')
