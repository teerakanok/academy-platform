/**
 * ยิงใส่ `scripts/workerd-signer-check.mjs` เพื่อพิสูจน์ว่ามันโกหกไม่ได้
 *
 * รีวิวอิสระเคยหลอกมันสำเร็จสองรอบ ทั้งด้วย `{"ok":true,"checks":[]}` และด้วย
 * nonce ที่ลอกจาก query, check เดียวที่ชื่อเป็นรายการที่ join กัน, และ child ที่
 * ตายด้วยสัญญาณแต่ถูกนับว่ายังมีชีวิต การโจมตีด้านล่างคือชุดนั้น
 *
 *   node scripts/adversarial/workerd-runner-attacks.mjs
 *
 * รหัสออก: 0 = ทุกการโจมตีถูกยิงจริงและได้ผลตามที่ควร · 1 = มีการโจมตีที่รอด
 * · 2 = ยิงไม่ออกบางรายการ จึงพิสูจน์อะไรไม่ได้
 *
 * สองข้อจำกัดที่ต้องอ่านคู่กันเสมอ:
 *
 *   - สคริปต์นี้พิสูจน์ได้เฉพาะการโจมตี "จากนอกโปรเซส" ใครที่ preload โค้ดเข้ามา
 *     ในโปรเซสของ runner ได้ ปลอม `spawn` กับ `fetch` พร้อมกันแล้วผ่านทุกด่านได้อยู่ดี
 *     นั่นปิดในโปรเซสไม่ได้ตามนิยาม
 *   - ถ้าสภาพแวดล้อม bind 127.0.0.1 ไม่ได้ การโจมตีแบบครองพอร์ตจะ **ยิงไม่ออก**
 *     รุ่นก่อนพิมพ์ `KILLED` ให้ทั้งห้ารายการทั้งที่ squatter ไม่เคยขึ้นเลย ซึ่งเป็น
 *     หลักฐานเท็จ ตอนนี้ต้องเห็นว่ามัน listen จริงก่อนถึงจะนับผล
 */
import { execFileSync, spawn } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { restoreOnExit, Sandbox } from './sandbox.mjs'

const PORT = 61987
const root = fileURLToPath(new URL('../..', import.meta.url))
const runner = 'scripts/workerd-signer-check.mjs'
const appConfig = 'wrangler.jsonc'
const harnessConfig = 'tests/workerd/wrangler.jsonc'

const sandbox = new Sandbox(root)
restoreOnExit(sandbox)

const REQUIRED = [
  'cryptokey-introspection-shape',
  'rejects-a-cryptokey',
  'rejects-a-parsed-object',
  'rejects-a-surplus-member',
  'rejects-non-json',
  'runtime-is-workerd',
  'signer-imports-non-extractable-sign-only',
  'signs-and-verifies',
].sort()

let survived = 0
let unproven = 0

function runRunner(timeoutMs = 400_000) {
  try {
    execFileSync(process.execPath, [runner], { cwd: root, stdio: 'pipe', timeout: timeoutMs })
    return 0
  } catch (error) {
    if (error?.code === 'ETIMEDOUT') return 'timeout'
    return error.status ?? 'ไม่ทราบ'
  }
}

/** มีใครสักคน listen อยู่ที่พอร์ตนี้ไหม (ไม่ได้บอกว่าเป็นใคร) */
async function anyoneListening(port) {
  return new Promise((resolveUp) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => { socket.destroy(); resolveUp(true) })
    socket.once('error', () => { socket.destroy(); resolveUp(false) })
  })
}

async function withSquatter(body, run) {
  const source = body === null
    ? `require('node:http').createServer(() => {}).listen(${PORT}, '127.0.0.1')`
    : "const http = require('node:http');http.createServer((q, s) => {"
      + "s.setHeader('content-type', 'application/json');"
      + `s.end(${JSON.stringify(JSON.stringify(body))})}).listen(${PORT}, '127.0.0.1')`
  // squatter บอกเองว่า listen สำเร็จ แทนที่จะให้เราเดาจากการต่อพอร์ตติด —
  // การต่อติดพิสูจน์แค่ว่า "มีใครสักคน" ถือพอร์ตอยู่ ซึ่งอาจไม่ใช่ตัวนี้
  const child = spawn(process.execPath, ['-e', `${source}.on('listening', () => console.log('READY'))`], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    const ready = await new Promise((resolveReady) => {
      const timer = setTimeout(() => resolveReady(false), 8_000)
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('READY')) { clearTimeout(timer); resolveReady(true) }
      })
      child.once('exit', () => { clearTimeout(timer); resolveReady(false) })
    })
    if (!ready) return { fired: false }
    return { fired: true, code: await run() }
  } finally {
    child.kill('SIGTERM')
    await delay(300)
  }
}

function report(label, result, shouldFail) {
  if (result.fired === false) {
    console.log(`ยิงไม่ได้   ${label} — bind 127.0.0.1:${PORT} ไม่สำเร็จ`)
    unproven += 1
    return
  }
  const ok = shouldFail ? result.code !== 0 : result.code === 0
  console.log(`${ok ? 'KILLED  ' : 'SURVIVED'}  ${label} (exit ${result.code})`)
  if (!ok) survived += 1
}

// ถ้ามีอย่างอื่นครองพอร์ตอยู่ก่อน ทั้งสคริปต์เชื่อถือไม่ได้: squatter ของเราขึ้นไม่ได้
// และ wrangler ตัวจริงในเคส baseline ก็ bind ไม่ได้ ผลทุกบรรทัดจะแปลผิดหมด
if (await anyoneListening(PORT)) {
  console.error(`มีอย่างอื่นครอง 127.0.0.1:${PORT} อยู่แล้ว — สคริปต์นี้รันไม่ได้ ไม่ใช่ว่าผ่านหรือไม่ผ่าน`)
  process.exit(2)
}

const checks = (names) => names.map((name) => ({ name, passed: true, detail: 'fabricated' }))

report('squatter ที่แต่งผลผ่านครบแปดข้อ',
  await withSquatter({ ok: true, nonce: 'guessed', checks: checks(REQUIRED) }, () => runRunner()), true)

report('squatter ที่คืน checks ว่างพร้อม ok:true',
  await withSquatter({ ok: true, nonce: 'guessed', checks: [] }, () => runRunner()), true)

report('check เดียวที่ชื่อเป็นรายการที่ join กัน',
  await withSquatter({ ok: true, nonce: 'guessed', checks: checks([REQUIRED.join(',')]) }, () => runRunner()), true)

report('ชื่อซ้ำเพื่อปั๊มจำนวนให้ครบแปด',
  await withSquatter({ ok: true, nonce: 'guessed', checks: checks(Array(8).fill(REQUIRED[0])) }, () => runRunner()), true)

report('การเชื่อมต่อที่รับแล้วไม่เคยตอบ',
  await withSquatter(null, () => runRunner()), true)

// การโจมตีตัวจริงที่รีวิวอิสระใช้หลอกเลนนี้สำเร็จ: ครองพอร์ตไว้ก่อน อ่าน nonce
// จาก `ps` (มันเป็น argument ของโปรเซส ไม่ใช่ความลับ) แล้วตอบครบทุกข้อพร้อม nonce
// ที่ถูกต้อง ก่อนที่ wrangler จะ bind ไม่สำเร็จ — ทุกด่านที่อาศัย "คำตอบหน้าตาถูก"
// จึงผ่านหมด สิ่งเดียวที่ตัดมันออกได้คือหลักฐานการ bind จากปาก wrangler เอง
{
  const body = { ok: true, checks: checks(REQUIRED) }
  const source = "const http=require('node:http');const {execSync}=require('node:child_process');"
    + "const find=()=>{try{const m=/SIGNER_CHECK_NONCE:([0-9a-f-]{36})/.exec("
    + "execSync('ps -Ao args',{encoding:'utf8'}));return m?m[1]:''}catch{return ''}};"
    + `http.createServer((q,s)=>{s.setHeader('content-type','application/json');`
    + `s.end(JSON.stringify(Object.assign({nonce:find()}, ${JSON.stringify(body)})))})`
    + `.listen(${PORT}, '127.0.0.1')`
  const child = spawn(process.execPath, ['-e', `${source}.on('listening', () => console.log('READY'))`], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    const ready = await new Promise((resolveReady) => {
      const timer = setTimeout(() => resolveReady(false), 8_000)
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('READY')) { clearTimeout(timer); resolveReady(true) }
      })
      child.once('exit', () => { clearTimeout(timer); resolveReady(false) })
    })
    report('squatter ที่อ่าน nonce จาก ps แล้วตอบครบทุกข้อ',
      ready ? { fired: true, code: runRunner() } : { fired: false }, true)
  } finally {
    child.kill('SIGTERM')
    await delay(300)
  }
}

// การยึดพอร์ต **หลัง** workerd bind สำเร็จแล้ว — readiness ผ่านไปแล้ว nonce ก็อ่านได้
// จาก `ps` สิ่งเดียวที่เหลือให้ตัดคือตัวตนของ process ที่ listen อยู่ตอนตอบ
{
  const takeover = `
const { spawnSync, spawn } = require('node:child_process')
const http = require('node:http')
const PORT = ${PORT}
const pids = () => {
  const p = spawnSync('lsof', ['-nP', '-iTCP:' + PORT, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  return (p.stdout || '').trim().split('\\n').map(Number).filter(Boolean)
}
const nonce = () => {
  const p = spawnSync('ps', ['-Ao', 'args'], { encoding: 'utf8' })
  const m = /SIGNER_CHECK_NONCE:([0-9a-f-]{36})/.exec(p.stdout || '')
  return m ? m[1] : ''
}
const deadline = Date.now() + 180000
const wait = setInterval(() => {
  const current = pids()
  if (current.length === 0) { if (Date.now() > deadline) process.exit(0); return }
  clearInterval(wait)
  for (const pid of current) { try { process.kill(pid, 'SIGKILL') } catch {} }
  const serve = () => {
    const server = http.createServer((q, s) => {
      s.setHeader('content-type', 'application/json')
      s.end(JSON.stringify({ ok: true, nonce: nonce(), checks: ${JSON.stringify(JSON.stringify(REQUIRED.map((name) => ({ name, passed: true, detail: 'takeover' }))))} && ${JSON.stringify(REQUIRED)}.map(n => ({ name: n, passed: true, detail: 'takeover' })) }))
    })
    server.on('error', () => setTimeout(serve, 20))
    server.listen(PORT, '127.0.0.1')
  }
  serve()
}, 20)
`
  const attacker = spawn(process.execPath, ['-e', takeover], { stdio: 'ignore', detached: true })
  try {
    report('ยึดพอร์ตหลัง workerd bind สำเร็จ แล้วตอบด้วย nonce ที่อ่านจาก ps',
      { fired: true, code: runRunner() }, true)
  } finally {
    try { process.kill(-attacker.pid, 'SIGKILL') } catch { attacker.kill('SIGKILL') }
    await delay(500)
  }
}

// การโจมตีที่เหลือแก้ไฟล์แทนการครองพอร์ต จึงยิงออกเสมอ
sandbox.reopen()
sandbox.modify(appConfig, `${sandbox.original(appConfig)}\n/* never closed\n`)
report('config ของแอปที่มีคอมเมนต์บล็อกไม่ปิด (wrangler ก็ปฏิเสธ)', { fired: true, code: runRunner() }, true)
sandbox.restore()

sandbox.reopen()
sandbox.modify(harnessConfig, `﻿${sandbox.original(harnessConfig).replace(
  '"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]',
  '"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],',
)}`)
report('BOM และ trailing comma ที่ wrangler ยอมรับ ต้องไม่ทำให้เลนพัง', { fired: true, code: runRunner() }, false)
sandbox.restore()

sandbox.reopen()
sandbox.modify(harnessConfig, sandbox.original(harnessConfig)
  .replace('"compatibility_date": "', '"compatibility_date": "2020-01-01", "unused": "'))
report('compatibility ของ harness เลื่อนออกจากแอป', { fired: true, code: runRunner() }, true)
sandbox.restore()

// ค่าจริงซ่อนหลัง \r ในคอมเมนต์ — ตัวอ่านที่จบคอมเมนต์เฉพาะ \n จะอ่านค่าแรก
// ส่วน wrangler อ่านค่าหลัง ทำให้เลนรายงานว่า "ตรงกับแอป" ทั้งที่ deploy ใช้คนละค่า
sandbox.reopen()
sandbox.modify(harnessConfig, sandbox.original(harnessConfig).replace(
  '"compatibility_date": "2025-03-25",',
  '"compatibility_date": "2025-03-25",\n  // ซ่อนไว้\r"compatibility_date": "2026-08-14",',
))
report('compatibility_date ที่ซ่อนไว้หลัง \\r ในคอมเมนต์', { fired: true, code: runRunner() }, true)
sandbox.restore()

report('เลนปกติที่ไม่ได้แก้อะไร', { fired: true, code: runRunner() }, false)

if (survived > 0) {
  console.error(`\nมีการโจมตีที่รอด ${survived} รายการ`)
  process.exit(1)
}
if (unproven > 0) {
  console.error(`\nยิงไม่ออก ${unproven} รายการ — สคริปต์นี้ยังพิสูจน์อะไรไม่ได้`)
  process.exit(2)
}
console.log('\nการโจมตีจากนอกโปรเซสทุกแบบถูกยิงจริงและถูกจับ และเลนปกติยังผ่าน')
