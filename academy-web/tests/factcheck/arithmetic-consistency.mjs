#!/usr/bin/env node
// เกตเลขคณิต: ตัวเลขที่ "ได้จากการคำนวณ" ในบทเรียน ต้องคำนวณกลับได้จากตัวเลขที่พิมพ์ไว้ข้าง ๆ
//
// ทำไมต้องมี: ลานตรวจอิสระจับได้ว่ามีสามจุดที่ตัวเลขไม่ reconcile กับตัวเลขในบล็อกเดียวกัน
// (4.00x จาก 0.185/0.048 · 321% จาก 0.014/0.004 · 60.0 GB/s จาก 268435456/0.004)
// ทั้งสามเกิดจากการพิมพ์ตัวเลขที่คำนวณในหัว เกตนี้ทำให้เกิดซ้ำไม่ได้
//
// เกตตรวจสองอย่างต่อหนึ่งข้ออ้าง:
//   1. คำนวณกลับได้ไหม  — ค่าที่อ้างต้องตรงกับผลจากตัวเลขในบล็อกเดียวกัน
//   2. ตัวเลขที่พิมพ์ละเอียดพอไหม — ถ้าช่วงความไม่แน่นอนจากการปัดกว้างเกิน 2%
//      ผู้อ่านตรวจตามไม่ได้ ให้พิมพ์ตัวตั้งตัวหารละเอียดขึ้น
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quotientInterval, printedDecimals } from '../../scripts/calc.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const coursesDir = join(here, '..', '..', 'content', 'courses')
const SPREAD_LIMIT = 0.05   // ค่าที่วัดจริงพิมพ์ 2-3 หลักนัยสำคัญ 2% เข้มเกินไปจนเตือนทุกอัน

const NUM = /(?<![\w.])(\d+(?:,\d{3})*(?:\.\d+)?)(?![\w])/g
const num = (s) => Number(String(s).replace(/,/g, ''))

/**
 * บรรทัดที่ "เป็นอัตราส่วนล้วน ๆ" เท่านั้น เช่น
 *     ratio                :  4.00x
 *     -> 58.93x
 *     อัตราส่วน               :  4.00 เท่า
 *     -> writing 1/128 of the bytes took 321% of the time
 * จับเฉพาะรูปนี้เพื่อเลี่ยงการชนกับ 4*rdi ในภาษาแอสเซมบลีหรือ 8176 x 1024 ที่เป็นการคูณ
 */
// \b ใช้กับอักษรไทยไม่ได้ (ไทยไม่ใช่ \w) ถ้าใช้จะทำให้เกตตาบอดฝั่งไทยทั้งหมด
const RATIO_LINE = /(?:\bratio\b|\bspeedup\b|อัตราส่วน|->|→)/i
function ratioClaim(line) {
  if (!RATIO_LINE.test(line)) return null
  let m = line.match(/(\d+(?:\.\d+)?)\s*(?:x\b|เท่า)/i)
  if (m) return { kind: 'ratio', text: m[1], value: num(m[1]), scale: 1 }
  m = line.match(/(\d+(?:\.\d+)?)\s*%(?!%)/)
  if (m) return { kind: 'percent', text: m[1], value: num(m[1]), scale: 100 }
  m = line.match(/(\d+(?:\.\d+)?)\s*GB\/s/i)
  if (m) return { kind: 'rate', text: m[1], value: num(m[1]), scale: 1 / 1e9 }
  return null
}

/**
 * สมการที่บทเรียนเขียนไว้เอง เช่น "8176 x 1024 / 32  =  261,632"
 * ตรวจตรง ๆ ว่าคำนวณแล้วเท่ากับที่เขียนไหม
 */
function statedEquations(line) {
  const out = []
  const eq = /([-+*/x×^() \d,.]+?)\s*=\s*(\d[\d,]*(?:\.\d+)?)/g
  let m
  while ((m = eq.exec(line))) {
    const lhs = m[1].trim()
    if (!/[-+*/x×^]/.test(lhs)) continue
    if (!/\d/.test(lhs)) continue
    if (/[a-wyzA-WYZ]/.test(lhs)) continue
    out.push({ lhs, rhsText: m[2], rhs: num(m[2]) })
  }
  return out
}

function evalArith(expr) {
  const cleaned = expr.replace(/,/g, '').replace(/[x×]/g, '*').replace(/\^/g, '**')
  if (!/^[-+*/(). 0-9]+$|^[-+*/(). 0-9*]+$/.test(cleaned)) return null
  try {
    const v = Function(`"use strict";return (${cleaned})`)()
    return typeof v === 'number' && isFinite(v) ? v : null
  } catch { return null }
}

const problems = []

function checkBlock(courseId, locale, lessonId, caption, lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 1) สมการที่เขียนไว้เอง — ตรวจตรง ไม่มีการเดา
    for (const eq of statedEquations(line)) {
      const got = evalArith(eq.lhs)
      if (got === null) continue
      const tol = Math.max(0.5 * Math.pow(10, -printedDecimals(eq.rhsText)), Math.abs(got) * 1e-9)
      if (Math.abs(got - eq.rhs) > tol) {
        problems.push({ courseId, locale, lessonId, caption, line: line.trim().slice(0, 90),
          claim: `${eq.lhs} = ${eq.rhsText}`, from: 'สมการในบทเรียนเอง',
          severity: 'ผิด', detail: `คำนวณจริงได้ ${got} — บทเรียนเขียน ${eq.rhs}` })
      }
    }

    // 2) บรรทัดอัตราส่วน — จับคู่กับ "ตัวเลขทศนิยม" ที่อยู่เหนือมันในบล็อกเดียวกัน
    const claim = ratioClaim(line)
    if (!claim) continue
    // ตัวเลขที่ใช้คำนวณอยู่ได้ทั้งบรรทัดเหนือขึ้นไปและบนบรรทัดเดียวกับข้ออ้างเอง
    const pool = []
    for (let j = Math.max(0, i - 8); j <= i; j++) {
      for (const m of lines[j].matchAll(/(?<![*\w.])(\d+(?:,\d{3})*\.\d+|\d{4,})(?![\w.])/g)) {
        if (j === i && m[1] === claim.text) continue
        pool.push(m[1])
      }
    }
    if (pool.length < 2) continue
    let best = null
    for (let x = 0; x < pool.length; x++) for (let y = 0; y < pool.length; y++) {
      if (x === y) continue
      const a = pool[x], b = pool[y]
      const q = quotientInterval(a, b)
      if (!isFinite(q.value) || q.value <= 0) continue
      const got = q.value * claim.scale
      const tol = Math.max(0.5 * Math.pow(10, -printedDecimals(claim.text)), Math.abs(got) * 1e-9)
      if (Math.abs(got - claim.value) <= tol && (!best || q.spread < best.spread)) best = { a, b, ...q }
    }
    if (!best) {
      // หาคู่ที่ "ใกล้ที่สุด" มาอธิบายให้คนแก้เห็นว่าควรเป็นเท่าไร
      let near = null
      for (let x = 0; x < pool.length; x++) for (let y = 0; y < pool.length; y++) {
        if (x === y) continue
        const a = pool[x], b = pool[y]
        const q = quotientInterval(a, b)
        if (!isFinite(q.value) || q.value <= 0) continue
        const got = q.value * claim.scale
        const d = Math.abs(got - claim.value) / claim.value
        if (d < 0.35 && (!near || d < near.d)) near = { a, b, got, d }
      }
      problems.push({ courseId, locale, lessonId, caption, line: line.trim().slice(0, 90),
        claim: `${claim.text}${claim.kind === 'percent' ? '%' : claim.kind === 'rate' ? ' GB/s' : 'x'}`,
        from: near ? `${near.a} / ${near.b}` : 'ตัวเลขในบล็อกเดียวกัน',
        severity: 'ผิด',
        detail: near
          ? `คำนวณกลับไม่ได้ — จากตัวเลขที่พิมพ์ไว้จะได้ ${near.got.toFixed(3)}`
          : 'คำนวณกลับจากตัวเลขที่พิมพ์ไว้ในบล็อกไม่ได้เลย' })
    } else if (best.spread > SPREAD_LIMIT) {
      problems.push({ courseId, locale, lessonId, caption, line: line.trim().slice(0, 90),
        claim: `${claim.text}${claim.kind === 'percent' ? '%' : claim.kind === 'rate' ? ' GB/s' : 'x'}`,
        from: `${best.a} / ${best.b}`,
        severity: 'เตือน',
        detail: `ตรงกัน แต่ตัวเลขที่พิมพ์ละเอียดไม่พอ (ช่วงกว้าง ${(best.spread * 100).toFixed(1)}%) ผู้อ่านตรวจตามไม่ได้` })
    }
  }
}

let blocks = 0
for (const slug of readdirSync(coursesDir).sort()) {
  const cj = join(coursesDir, slug, 'course.json')
  if (!existsSync(cj)) continue
  for (const locale of JSON.parse(readFileSync(cj, 'utf8')).availableLocales) {
    const dir = join(coursesDir, slug, 'locales', locale, 'lessons')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).sort()) {
      const lesson = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const b of lesson.blocks ?? []) {
        if (b.kind !== 'code') continue
        blocks++
        checkBlock(slug, locale, lesson.nodeId, b.caption ?? '', b.lines)
      }
    }
  }
}

console.log(`ตรวจบล็อกโค้ด ${blocks} บล็อก`)
const errors = problems.filter((p) => p.severity === 'ผิด')
const warns = problems.filter((p) => p.severity === 'เตือน')
for (const [title, list] of [['ผิด — ต้องแก้', errors], ['เตือน — ความละเอียดต่ำ', warns]]) {
  if (!list.length) continue
  console.log(`\n== ${title} (${list.length}) ==\n`)
  for (const p of list) {
    console.log(`  ${p.courseId}/${p.locale}/${p.lessonId}`)
    console.log(`    บล็อก : ${p.caption}`)
    console.log(`    บรรทัด: ${p.line}`)
    console.log(`    อ้าง  : ${p.claim}  (จาก ${p.from})`)
    console.log(`    ปัญหา : ${p.detail}\n`)
  }
}
if (!problems.length) console.log('arithmetic-consistency: ผ่าน')
else console.log(`arithmetic-consistency: ผิด ${errors.length} · เตือน ${warns.length}`)
process.exit(errors.length ? 1 : 0)
