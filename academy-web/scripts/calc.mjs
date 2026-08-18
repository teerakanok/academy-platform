#!/usr/bin/env node
// เครื่องคิดเลขกลางสำหรับตัวเลขทุกตัวที่จะไปโผล่ในเนื้อหา
//
// เหตุผลที่มีไฟล์นี้: ตัวเลขที่ "คำนวณในหัว" แล้วพิมพ์ลงบทเรียนพลาดจริงมาแล้ว
// สามครั้ง (4.00x ที่ควรเป็น 3.85 · 321% ที่ควรเป็น 350 · 60.0 GB/s ที่ควรเป็น 67.1)
// ลานตรวจอิสระจับได้ทั้งสามข้อ กฎคือ: ตัวเลขที่ได้จากการคำนวณ ห้ามพิมพ์จากความจำ
// ให้ผ่านสคริปต์นี้เสมอ แล้วคัดลอกผลที่มันพิมพ์
//
// ใช้:  node scripts/calc.mjs '0.185/0.048'
//       node scripts/calc.mjs --ratio 0.185 0.048
//       node scripts/calc.mjs --percent 0.014 0.004
//       node scripts/calc.mjs --rate 268435456 0.004      (ไบต์, วินาที -> GB/s)
//       node scripts/calc.mjs --check-precision 0.185 0.048
//
// ทุกโหมดพิมพ์ค่าเต็มความละเอียด แล้วจึงพิมพ์ค่าที่ปัดตามจำนวนหลักที่สื่อความได้จริง

import { readFileSync } from 'node:fs'

/** จำนวนหลักทศนิยมที่ "พิมพ์ไว้" ของตัวเลขในรูปข้อความ */
export function printedDecimals(s) {
  const m = String(s).match(/\.(\d+)/)
  return m ? m[1].length : 0
}

/** ครึ่งหนึ่งของหลักสุดท้าย = ความไม่แน่นอนสูงสุดจากการปัด */
export function roundingHalfWidth(s) {
  return 0.5 * Math.pow(10, -printedDecimals(s))
}

/**
 * ช่วงที่ผลหาร a/b เป็นไปได้ เมื่อ a และ b ถูกพิมพ์แบบปัดแล้ว
 * ใช้ตอบคำถามว่า "ตัวเลขที่พิมพ์ไว้ละเอียดพอจะรองรับข้ออ้างนี้ไหม"
 */
export function quotientInterval(aStr, bStr) {
  const a = Number(aStr), b = Number(bStr)
  const da = roundingHalfWidth(aStr), db = roundingHalfWidth(bStr)
  const lo = (a - da) / (b + db)
  const hi = (a + da) / (b - db)
  return { value: a / b, lo, hi, spread: (hi - lo) / (a / b) }
}

function evaluate(expr) {
  if (!/^[-+*/(). 0-9eE%]+$/.test(expr)) throw new Error(`นิพจน์มีอักขระที่ไม่อนุญาต: ${expr}`)
  // ไม่ใช้ eval กับอินพุตทั่วไป — จำกัดตัวอักษรไว้แล้วข้างบน
  return Function(`"use strict";return (${expr.replace(/%/g, '/100')})`)()
}

function show(label, value, opts = {}) {
  const { unit = '', suggest = true } = opts
  console.log(`  ${label}`)
  console.log(`    เต็มความละเอียด : ${value}${unit}`)
  if (suggest) {
    for (const d of [0, 1, 2, 3]) console.log(`    ปัด ${d} ตำแหน่ง     : ${value.toFixed(d)}${unit}`)
  }
}

// ส่วน CLI ต้องไม่ทำงานตอนถูก import — ไม่งั้นเกตที่เรียกใช้ฟังก์ชันจะพังทันที
const runningAsScript = process.argv[1] && process.argv[1].endsWith('calc.mjs')
const [mode, ...rest] = runningAsScript ? process.argv.slice(2) : ['--library']
if (mode === '--library') {
  // ถูก import มาใช้เป็นไลบรารี ไม่ต้องทำอะไร
} else if (!mode) {
  console.error('ใช้: calc.mjs <expr> | --ratio a b | --percent a b | --rate bytes seconds | --check-precision a b')
  process.exit(2)
} else if (mode === '--ratio') {
  const [a, b] = rest
  const q = quotientInterval(a, b)
  show(`${a} / ${b}`, q.value, { unit: 'x' })
  console.log(`    ช่วงที่เป็นไปได้จากความละเอียดที่พิมพ์: ${q.lo.toFixed(3)}x .. ${q.hi.toFixed(3)}x  (กว้าง ${(q.spread * 100).toFixed(1)}%)`)
  if (q.spread > 0.02) console.log('    ! ความละเอียดที่พิมพ์ต่ำเกินกว่าจะรองรับอัตราส่วนนี้ ให้พิมพ์ตัวตั้งตัวหารละเอียดขึ้น')
} else if (mode === '--percent') {
  const [a, b] = rest
  const q = quotientInterval(a, b)
  show(`${a} / ${b} เป็นเปอร์เซ็นต์`, q.value * 100, { unit: '%' })
  console.log(`    ช่วงที่เป็นไปได้: ${(q.lo * 100).toFixed(1)}% .. ${(q.hi * 100).toFixed(1)}%`)
  if (q.spread > 0.02) console.log('    ! ความละเอียดที่พิมพ์ต่ำเกินกว่าจะรองรับตัวเลขนี้')
} else if (mode === '--rate') {
  const [bytes, seconds] = rest
  const q = quotientInterval(bytes, seconds)
  show(`${bytes} ไบต์ / ${seconds} วินาที`, q.value / 1e9, { unit: ' GB/s' })
  console.log(`    ช่วงที่เป็นไปได้: ${(q.lo / 1e9).toFixed(1)} .. ${(q.hi / 1e9).toFixed(1)} GB/s`)
  if (q.spread > 0.02) console.log('    ! ความละเอียดที่พิมพ์ต่ำเกินกว่าจะรองรับตัวเลขนี้')
} else if (mode === '--check-precision') {
  const [a, b] = rest
  const q = quotientInterval(a, b)
  console.log(`  ${a} / ${b} = ${q.value}`)
  console.log(`  ช่วง ${q.lo} .. ${q.hi} (กว้าง ${(q.spread * 100).toFixed(1)}% ของค่ากลาง)`)
  process.exit(q.spread > 0.02 ? 1 : 0)
} else {
  const expr = [mode, ...rest].join(' ')
  show(expr, evaluate(expr))
}
