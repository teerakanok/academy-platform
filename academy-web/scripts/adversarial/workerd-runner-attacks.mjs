/**
 * ยิงใส่ `scripts/workerd-signer-check.mjs` เพื่อพิสูจน์ว่ามันโกหกไม่ได้
 *
 * รีวิวอิสระเคยหลอกมันสำเร็จสองรอบ รอบแรกด้วย `{"ok":true,"checks":[]}`
 * รอบสองด้วย nonce ที่ลอกจาก query, check เดียวที่ชื่อเป็นรายการที่ join กัน,
 * และ child ที่ตายด้วยสัญญาณแต่ถูกนับว่ายังมีชีวิต การโจมตีด้านล่างคือชุดนั้น
 *
 *   node scripts/adversarial/workerd-runner-attacks.mjs
 *
 * ข้อจำกัดที่ต้องรู้: สคริปต์นี้พิสูจน์ได้เฉพาะการโจมตี "จากนอกโปรเซส"
 * ใครที่ preload โค้ดเข้ามาในโปรเซสของ runner ได้ ปลอม `spawn` กับ `fetch`
 * พร้อมกันแล้วผ่านทุกด่านได้อยู่ดี นั่นปิดในโปรเซสไม่ได้ตามนิยาม
 */
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const runner = 'scripts/workerd-signer-check.mjs'
const appConfig = join(root, 'wrangler.jsonc')
const harnessConfig = join(root, 'tests/workerd/wrangler.jsonc')
const appOriginal = readFileSync(appConfig, 'utf8')
const harnessOriginal = readFileSync(harnessConfig, 'utf8')

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

function runRunner(timeoutMs = 400_000) {
  try {
    execFileSync(process.execPath, [runner], { cwd: root, stdio: 'pipe', timeout: timeoutMs })
    return 0
  } catch (error) {
    return error.status ?? 'timeout'
  }
}

async function withSquatter(body, run) {
  const source = body === null
    ? "require('node:http').createServer(() => {}).listen(61987, '127.0.0.1')"
    : "const http = require('node:http');http.createServer((q, s) => {"
      + "s.setHeader('content-type', 'application/json');"
      + `s.end(${JSON.stringify(JSON.stringify(body))})}).listen(61987, '127.0.0.1')`
  const child = spawn(process.execPath, ['-e', source], { stdio: 'ignore' })
  await delay(1_500)
  try {
    return await run()
  } finally {
    child.kill('SIGTERM')
    await delay(300)
  }
}

const checks = (names) => names.map((name) => ({ name, passed: true, detail: 'fabricated' }))
let failures = 0

function report(label, code, shouldFail) {
  const ok = shouldFail ? code !== 0 : code === 0
  console.log(`${ok ? 'KILLED  ' : 'SURVIVED'}  ${label} (exit ${code})`)
  if (!ok) failures += 1
}

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

writeFileSync(appConfig, `${appOriginal}\n/* never closed\n`)
report('config ของแอปที่มีคอมเมนต์บล็อกไม่ปิด (wrangler ก็ปฏิเสธ)', runRunner(), true)
writeFileSync(appConfig, appOriginal)

writeFileSync(harnessConfig, `﻿${harnessOriginal.replace(
  '"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]',
  '"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],',
)}`)
report('BOM และ trailing comma ที่ wrangler ยอมรับ ต้องไม่ทำให้เลนพัง', runRunner(), false)
writeFileSync(harnessConfig, harnessOriginal)

writeFileSync(harnessConfig, harnessOriginal.replace('"compatibility_date": "', '"compatibility_date": "2020-01-01", "unused": "'))
report('compatibility ของ harness เลื่อนออกจากแอป', runRunner(), true)
writeFileSync(harnessConfig, harnessOriginal)

report('เลนปกติที่ไม่ได้แก้อะไร', runRunner(), false)

copyFileSync(appConfig, appConfig)
if (readFileSync(appConfig, 'utf8') !== appOriginal
  || readFileSync(harnessConfig, 'utf8') !== harnessOriginal) {
  console.error('คืนสภาพไฟล์ไม่ครบ')
  process.exit(1)
}

if (failures > 0) {
  console.error(`\nมี ${failures} รายการที่ไม่เป็นไปตามที่ควร`)
  process.exit(1)
}
console.log('\nการโจมตีจากนอกโปรเซสทุกแบบถูกจับ และเลนปกติยังผ่าน')
