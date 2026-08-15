/**
 * รันสคริปต์ adversarial ทุกตัวเรียงลำดับเดียว แทน `node scripts/adversarial/*.mjs`
 *
 * เหตุ: shell ขยาย `*.mjs` แล้ว node ถือว่าไฟล์แรกคือสคริปต์ ที่เหลือกลายเป็น argv —
 * คนคิดว่ารันครบทุกด่านแต่จริงๆ รันตัวเดียวมาตลอด (debt ที่ handoff ระบุชื่อ)
 *
 *   node scripts/adversarial/run-all.mjs            # ชุดมาตรฐานสามตัว
 *   node scripts/adversarial/run-all.mjs a.mjs b.mjs # เจาะจงเอง (พาธรายสคริปต์)
 *
 * รันเรียงลำดับเท่านั้น ห้ามขนาน: ทุกตัวแก้ไฟล์จริงในรีโปเดียวกันผ่าน Sandbox
 * การขนานคือการชนกันเอง
 *
 * รหัสออก: 0 = ทุกตัวผ่าน · 1 = มีตัวจับได้ว่ามีทางรอด (หรือเลนปกติพัง) ·
 * 2 = ไม่มีตัวไหนตกหล่นแต่มีตัวที่รันไม่ได้ จึงพิสูจน์ไม่ครบ — ทั้งคู่ไม่ใช่ผ่าน
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const CANONICAL = [
  'not-wired-gate-evasions.mjs',
  'workerd-runner-attacks.mjs',
  'sandbox-exit-path-poc.mjs',
]

/** ตัดสินจากรหัสออกของแต่ละตัว — 1 (มีทางรอด) ร้ายกว่า 2 (รันไม่ได้) */
export function composeVerdict(codes) {
  if (codes.includes(1)) return 1
  if (codes.includes(2)) return 2
  return codes.every((code) => code === 0) ? 0 : 2
}

/**
 * กันรันชนกันข้ามเครื่องมือ: สคริปต์ adversarial แก้ไฟล์จริงในรีโป การรัน
 * ขนานกับมัน (รวมถึง suite ที่อ่านไฟล์เดียวกัน เช่น vitest เดินกราฟ import)
 * เกิด fail ปลอมมาแล้วจริง — mkdir atomic คือ lock ที่ไม่ผ่าน race และ
 * stale lock ลบได้ด้วย rmdir ธรรมดา
 */
export function acquireAdversarialLock(repoRoot) {
  const identity = createHash('sha256').update(repoRoot).digest('hex').slice(0, 16)
  const lockPath = join(tmpdir(), `academy-adversarial-${identity}.lock`)
  try {
    mkdirSync(lockPath)
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `มีการรัน adversarial อยู่แล้ว (หรือ lock ค้าง): ${lockPath} — ห้ามขนานกับ suite ที่อ่านไฟล์ในรีโปนี้ ถ้าแน่ใจว่าค้างให้ rmdir เอง`,
      )
    }
    throw error
  }
  return () => {
    try { rmdirSync(lockPath) } catch { /* ใครลบไปก่อน — ไม่มีอะไรต้องทำ */ }
  }
}

/** รันทีละตัว คืน { name, code } เรียงตามลำดับที่ให้มา */
export function runSequentially(scripts, launch = spawnChild) {
  return scripts.reduce((chain, script) => chain.then(async (results) => {
    const code = await launch(script)
    return [...results, { name: script, code }]
  }), Promise.resolve([]))
}

function spawnChild(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' })
    child.once('close', (code) => resolve(code ?? 2))
    child.once('error', () => resolve(2))
  })
}

async function main(argv) {
  const requested = argv.length > 0 ? argv : CANONICAL
  const names = requested.map((entry) => basename(entry))
  if (new Set(names).size !== names.length) {
    console.error('ซ้ำ: ระบุสคริปต์เดิมมากกว่าหนึ่งครั้ง')
    return 2
  }
  const unknown = names.filter((name) => !CANONICAL.includes(name) && !requested.some(
    (entry) => entry !== name,
  ))
  if (unknown.length > 0) {
    console.error(`ไม่รู้จัก: ${unknown.join(', ')} — ใช้ชื่อไฟล์ใน scripts/adversarial หรือพาธเต็ม`)
    return 2
  }
  const scripts = requested.map((entry) => (
    entry.endsWith('.mjs') && !entry.includes('/') ? join(HERE, entry) : entry
  ))
  let release
  try {
    release = acquireAdversarialLock(join(HERE, '../..'))
  } catch (error) {
    console.error(error.message)
    return 2
  }
  try {
    const results = await runSequentially(scripts)
    for (const { name, code } of results) {
      console.log(`${code === 0 ? 'ผ่าน   ' : 'ไม่ผ่าน'} ${basename(name)} (exit ${code})`)
    }
    const verdict = composeVerdict(results.map(({ code }) => code))
    if (verdict !== 0) console.error(`\nรวม: ${verdict === 1 ? 'มีด่านที่มีทางรอด' : 'มีด่านที่รันไม่ได้'} — ไม่ใช่ผ่าน`)
    else console.log('\nรวม: ทุกด่านผ่าน')
    return verdict
  } finally {
    release()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2))
}
