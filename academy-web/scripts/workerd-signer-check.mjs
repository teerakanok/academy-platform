/**
 * รัน tests/workerd/signer-worker.ts บน workerd จริงผ่าน `wrangler dev`
 *
 * ชุด vitest รันบน Node ซึ่งพิสูจน์ workerd ไม่ได้ — ที่นั่น CryptoKey เป็นคนละ
 * implementation และ contract ที่เขียวใน Node เคยปฏิเสธ key ที่ถูกต้องบน workerd
 * มาแล้ว lane นี้จึงต้องกิน runtime ตัวจริงด้วย compatibility ชุดเดียวกับแอป
 *
 * ## ขอบเขตที่สคริปต์นี้ให้ และไม่ให้
 *
 * ให้: ยืนยันว่า child ยังมีชีวิตและไม่ได้ตายด้วยสัญญาณ, ว่า HTTP เป็น 200,
 * ว่า nonce ที่ worker สะท้อนกลับตรงกับที่ส่งเข้าไป, ว่าชื่อ check ตรงรายการที่
 * ประกาศไว้ครบถ้วนและไม่ซ้ำ, และว่าทุก check ผ่าน
 *
 * **nonce ไม่ใช่ความลับ** — มันเดินทางเป็น argument ของโปรเซส โปรเซสสิทธิ์เดียวกัน
 * อ่านจาก `ps` ได้ตามปกติ รุ่นก่อนเขียนว่า "สิ่งที่ตัดผู้ครองพอร์ตออกคือ liveness"
 * ซึ่ง **ไม่จริง**: รีวิวอิสระครองพอร์ตไว้ อ่าน nonce จาก `ps` แล้วตอบครบแปดข้อ
 * **ก่อน** ที่ wrangler จะ bind ไม่สำเร็จ — `alive()` ตรวจแค่ "ยังไม่ตาย ณ วินาทีนั้น"
 * ช่องว่างระหว่าง spawn กับ bind fail คือสิ่งที่ถูกใช้
 *
 * ชั้นแรกคือ **หลักฐานการ bind จากปาก wrangler เอง**: มันพิมพ์ `Ready on http://…:<port>`
 * ต่อเมื่อ bind สำเร็จ และเมื่อพอร์ตถูกครองอยู่ มันตายด้วย `Address already in use`
 * โดยไม่ fallback ไปพอร์ตอื่น (ยิงพิสูจน์แล้วทั้งสองทาง)
 *
 * แต่ readiness พิสูจน์แค่ว่า **เคย** ถือพอร์ตไว้ ณ ขณะหนึ่ง ไม่ได้ผูกคำตอบที่ได้
 * ทีหลังเข้ากับ process นั้น รีวิวอิสระใช้ช่องนี้: รอ bind สำเร็จ → ฆ่าเฉพาะ process
 * ที่ listen → ยึดพอร์ตต่อทันที → อ่าน nonce จาก `ps` แล้วตอบครบแปดข้อ ผลคือ runner
 * ออก 0 พร้อม "8 checks ผ่านทั้งหมด"
 *
 * ชั้นที่ปิดช่องนั้นคือ **ผูกคำตอบเข้ากับตัว process**: ก่อนยิงและหลังได้คำตอบ ตรวจว่า
 * PID ที่ listen พอร์ตนี้เป็นลูกหลานของ child ที่เราสตาร์ทเอง และเป็นชุดเดียวกันทั้งสองครั้ง
 * ผู้ยึดพอร์ตไม่ใช่ลูกหลานของเรา จึงตกด่านนี้ไม่ว่าจะรู้ nonce หรือไม่
 *
 * **ไม่ให้:** ความคุ้มกันจากโค้ดที่รันอยู่ในโปรเซสนี้แล้ว ใครที่ preload โค้ดเข้ามาได้
 * จะปลอม `spawn` และ `fetch` พร้อมกัน แล้วป้อนคำตอบที่ผ่านทุกด่านข้างบนได้ทั้งหมด
 * นั่นไม่ใช่ช่องโหว่ที่ปิดในโปรเซสได้ — ผู้ที่รันโค้ดในโปรเซสได้คือเจ้าของโปรเซส
 * ความน่าเชื่อถือของหลักฐานชุดนี้จึงอยู่ที่ "ใครเป็นคนสั่งรัน" ไม่ใช่ที่สคริปต์
 * (เหตุผลเดียวกับที่ archive-transfer CLI ฝั่ง director บันทึกไว้เรื่อง preload)
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { unstable_readConfig } from 'wrangler'

// โซน ephemeral ตาม ecosystem/PORT_REGISTRY.md — ไม่จองเลขถาวร
const PORT = 61987
const INSPECTOR_PORT = 61988
const BOOT_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000

/**
 * ชื่อ check ที่ต้องมีครบและตรงเป๊ะ ถ้า worker ลบ check ทิ้งแล้วยังคืน ok:true
 * รายการนี้คือสิ่งเดียวที่จับได้ — "ผ่านหมด" ที่ไม่มีอะไรรันเลยก็ "ผ่านหมด" เหมือนกัน
 * ต้องแก้ด้วยมือเมื่อเพิ่ม check ใหม่ ซึ่งตั้งใจให้เป็นแบบนั้น: ลืมแล้ว fail ดีกว่า
 * ลืมแล้วเงียบ
 */
const REQUIRED_CHECKS = [
  'code-exchange-fetch-init-accepted-by-workerd',
  'cryptokey-introspection-shape',
  'rejects-a-cryptokey',
  'rejects-a-parsed-object',
  'rejects-a-surplus-member',
  'rejects-non-json',
  'result-verification-accepts-identity-shape-on-workerd',
  'runtime-is-workerd',
  'signer-imports-non-extractable-sign-only',
  'signs-and-verifies',
]

const root = fileURLToPath(new URL('..', import.meta.url))
const appConfig = `${root}wrangler.jsonc`
const harnessConfig = `${root}tests/workerd/wrangler.jsonc`

/**
 * อ่าน config ด้วย **ตัวอ่านของ wrangler เอง** ไม่ใช่ parser ที่เขียนขึ้นมาเทียบเคียง
 *
 * รุ่นก่อนเขียน parser เองแล้วต่างจาก wrangler อย่างน้อยสามจุด รีวิวอิสระยิงให้ดู
 * ทีละอัน จุดที่ร้ายที่สุดคือคอมเมนต์บรรทัด: ของเราจบที่ `\n` อย่างเดียว ส่วน
 * wrangler จบที่ `\r` ด้วย ทำให้ config ที่ซ่อน `compatibility_date` อีกค่าไว้หลัง
 * `\r` ในคอมเมนต์ อ่านได้คนละค่ากับที่ deploy ใช้จริง — เลนนี้จะรายงานว่า "ตรงกับแอป"
 * ทั้งที่ไม่ตรง
 *
 * ตราบใดที่เราอ่านด้วยตัวอ่านตัวเดียวกับที่ deploy ใช้ ปัญหาทั้งชั้นนี้หายไป
 * และพฤติกรรมที่เลนนี้พึ่งพาก็เป็นของ wrangler โดยตรง (ยืนยันด้วยการยิงจริง):
 * คอมเมนต์บล็อกไม่ปิด -> โยน UnexpectedEndOfComment · BOM และ trailing comma -> ยอมรับ
 */
function compatibilityOf(path) {
  const config = unstable_readConfig({ config: path })
  const { compatibility_date: date, compatibility_flags: flags } = config
  if (typeof date !== 'string' || !Array.isArray(flags)) {
    throw new Error(`ไม่พบ compatibility ใน ${path}`)
  }
  return { date, flags: [...flags].sort() }
}

function sameNames(observed, required) {
  const left = [...observed].sort()
  const right = [...required].sort()
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((name, position) => name === right[position])
}

function fail(message, detail = '') {
  console.error(message)
  if (detail) console.error(detail)
  process.exitCode = 1
}

const app = compatibilityOf(appConfig)
const harness = compatibilityOf(harnessConfig)
if (app.date !== harness.date || app.flags.join() !== harness.flags.join()) {
  console.error('compatibility ของ harness ไม่ตรงกับแอป — แก้ tests/workerd/wrangler.jsonc ให้ตรง')
  console.error(`  แอป:     ${app.date} ${JSON.stringify(app.flags)}`)
  console.error(`  harness: ${harness.date} ${JSON.stringify(harness.flags)}`)
  process.exit(1)
}
console.log(`compatibility ตรงกับแอป: ${app.date} ${JSON.stringify(app.flags)}`)

// nonce เดินทางเข้าไปทาง `--var` ไม่ใช่ทาง URL ผู้ที่ครองพอร์ตอยู่จึงเห็นแต่คำขอ
// ที่ไม่มีอะไรให้ลอก และเดาค่าที่ต้องสะท้อนกลับไม่ได้
const nonce = randomUUID()
const child = spawn('npx', [
  'wrangler', 'dev',
  '--config', harnessConfig,
  '--port', String(PORT),
  '--inspector-port', String(INSPECTOR_PORT),
  '--var', `SIGNER_CHECK_NONCE:${nonce}`,
  // ต้องเป็น info จึงจะได้บรรทัด `Ready on …` ซึ่งเป็นหลักฐานการ bind
  '--log-level', 'info',
  '--show-interactive-dev-session', 'false',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })

let log = ''
child.stdout.on('data', (chunk) => { log += chunk })
child.stderr.on('data', (chunk) => { log += chunk })

const alive = () => child.exitCode === null && child.signalCode === null

/** PID ที่ listen พอร์ตนี้อยู่จริง ณ วินาทีนี้ */
function listeningPids(port) {
  const probe = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8', timeout: 10_000,
  })
  if (probe.status !== 0 || typeof probe.stdout !== 'string') return []
  return probe.stdout.trim().split('\n').map(Number).filter((pid) => Number.isInteger(pid) && pid > 1)
}

function parentOf(pid) {
  const probe = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8', timeout: 10_000 })
  const value = Number((probe.stdout ?? '').trim())
  return Number.isInteger(value) && value > 1 ? value : null
}

function descendsFrom(pid, ancestor) {
  let current = pid
  for (let depth = 0; depth < 32; depth += 1) {
    if (current === ancestor) return true
    const parent = parentOf(current)
    if (parent === null || parent === current) return false
    current = parent
  }
  return false
}

/**
 * พอร์ตนี้ถูกถือโดย process ในสายของเราเท่านั้นหรือไม่
 *
 * ผู้ที่ยึดพอร์ตต่อจาก workerd ที่ถูกฆ่า จะไม่ได้เป็นลูกหลานของ child ที่เราสตาร์ท
 * ต่อให้มันอ่าน nonce จาก `ps` ได้ก็ตาม — ตัวตนของ process ปลอมไม่ได้ด้วยการรู้ค่า
 */
function ownedByUs() {
  const pids = listeningPids(PORT)
  if (pids.length === 0) return null
  return pids.every((pid) => descendsFrom(pid, child.pid)) ? pids.sort().join(',') : null
}
const shutdown = () => { if (child.exitCode === null) child.kill('SIGTERM') }
process.on('exit', shutdown)
process.on('SIGINT', () => { shutdown(); process.exit(130) })

// wrangler พิมพ์บรรทัดนี้ต่อเมื่อ bind พอร์ตสำเร็จ ถ้ามีอย่างอื่นครองอยู่มันจะตาย
// ด้วย "Address already in use" แทน — บรรทัดนี้จึงเป็นหลักฐานว่าใครถือพอร์ตอยู่
const READY = new RegExp(String.raw`Ready on https?://\S*:${PORT}(?:\D|$)`)
const deadline = Date.now() + BOOT_TIMEOUT_MS
let bound = false
while (Date.now() < deadline) {
  if (READY.test(log)) { bound = true; break }
  if (!alive()) break
  await delay(250)
}

if (!bound) {
  shutdown()
  fail(
    `wrangler dev ไม่ได้รายงานว่า bind 127.0.0.1:${PORT} สำเร็จภายใน ${BOOT_TIMEOUT_MS / 1000}s`,
    log.slice(-4_000),
  )
  process.exit(1)
}

const ownerBefore = ownedByUs()
if (ownerBefore === null) {
  shutdown()
  fail(`พอร์ต ${PORT} ไม่ได้ถูกถือโดย process ในสายของเรา — คำตอบใดๆ ก็ไม่ใช่ของ worker นี้`)
  process.exit(1)
}

let response = null
try {
  // ต้องมี deadline ของตัวเอง มิฉะนั้นคำตอบที่ไม่มีวันมาถึงจะแขวนไว้ตลอดกาล
  response = await fetch(`http://127.0.0.1:${PORT}/`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
} catch (error) {
  shutdown()
  fail(`ยิงไม่ถึง worker ที่ bind แล้ว: ${error?.message ?? error}`, log.slice(-2_000))
  process.exit(1)
}

// ตรวจซ้ำหลังได้คำตอบ — การยึดพอร์ตที่แทรกระหว่างสองจังหวะจะทำให้ชุด PID เปลี่ยน
const ownerAfter = ownedByUs()
// worker ต้องยังมีชีวิตตอนตอบ ไม่ใช่ตายไปแล้วและมีอย่างอื่นมารับแทน
// ตายด้วยสัญญาณก็คือตาย: exitCode ยังเป็น null อยู่ในกรณีนั้น
const aliveAtResponse = alive()
const status = response.status
const body = await response.json().catch(() => null)
shutdown()

if (ownerAfter === null || ownerAfter !== ownerBefore) {
  fail(`พอร์ต ${PORT} เปลี่ยนเจ้าของระหว่างการร้องขอ — คำตอบนี้ไม่ใช่ของ worker ที่เราสตาร์ท`, log.slice(-2_000))
}
if (!aliveAtResponse) fail('worker ตายก่อนที่คำตอบจะมาถึง — คำตอบนี้ไม่ใช่ของมัน', log.slice(-2_000))
if (status !== 200) fail(`HTTP ${status} ไม่ใช่ 200`)
if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('คำตอบไม่ใช่ JSON object')
if (body?.nonce !== nonce) fail('nonce ไม่ตรง — คำตอบไม่ได้มาจาก worker ที่สคริปต์นี้สตาร์ท')

const checks = Array.isArray(body?.checks) ? body.checks : []
for (const check of checks) {
  console.log(`${check?.passed ? 'PASS' : 'FAIL'}  ${check?.name}: ${check?.detail}`)
}

const names = checks.map((check) => check?.name)
if (!sameNames(names, REQUIRED_CHECKS)) {
  fail('รายการ check ไม่ตรงกับที่ต้องมี', `  ได้: ${names.join(', ') || '(ว่าง)'}\n  ต้องมี: ${REQUIRED_CHECKS.join(', ')}`)
}
if (checks.some((check) => check?.passed !== true)) fail('มี check ที่ไม่ผ่าน')
if (body?.ok !== true) fail('worker รายงานว่าไม่ผ่าน')

if (process.exitCode) {
  console.error('signer ใช้ไม่ได้บน workerd')
  process.exit(1)
}
console.log(`\nworkerd: ${checks.length} checks ผ่านทั้งหมด`)
