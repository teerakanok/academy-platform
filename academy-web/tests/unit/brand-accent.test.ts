import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * เกตสีประจำ Academy
 *
 * สีประจำ Academy คือ **ฟ้า #38BDF8** และหลักฐานอยู่นอก repo นี้:
 *   · โลโก้ทางการบนเว็บหลัก — cyberskills-website/cyberskills-web/public/redesign/logos/logo-academy.svg
 *     `<g fill="none" stroke="#38BDF8" ...>` และ `<path ... fill="#38BDF8"/>`
 *     (ยืนยันซ้ำกับของจริงที่เสิร์ฟอยู่ https://cyberskills.co.th/redesign/logos/logo-academy.svg)
 *   · token ของเว็บหลัก — cyberskills-web/src/lib/content-v2.js → productBrand.academy
 *     `{ color: '#38BDF8', hover: '#7DD3FC', textLight: '#0A6C9E', ink: '#06121C' }`
 *
 * เคยหลุดมาแล้วสองรอบ ด้วยรูปร่างเดียวกัน คือ "แหล่งหนึ่งขยับ อีกแหล่งไม่ขยับ":
 *   · commit 0beb89a — เปิด packages/tokens/products.js ไม่เจอ key `academy` แล้วสรุปว่า
 *     Academy ยังไม่มีสี ทั้งที่ค่าจริงอยู่ในโลโก้กับ content-v2.js มาตั้งแต่แรก
 *   · commit fdb2028 — ทาสีเขียวทับทั้ง globals.css / โลโก้ / share card / ไดอะแกรม
 *     แต่ **ไม่ได้แตะ scripts/make-lesson-diagrams.py** ไฟล์ SVG ที่ commit ไว้จึงเขียว
 *     ส่วนตัวสร้างมันยังฟ้า — รันสคริปต์เมื่อไหร่ก็เด้งกลับเมื่อนั้น
 *
 * เกตนี้จึงไม่ตรวจแค่ "globals.css ถูกไหม" แต่ตรวจว่า **ทุกที่ที่ถือค่าสีนี้พูดตรงกัน**
 * และค่าที่ได้ยังผ่าน WCAG AA จริงทั้ง light และ dark
 */

const webRoot = process.cwd()
const read = (...p: string[]) => readFileSync(join(webRoot, ...p), 'utf8')

const css = read('src', 'app', 'globals.css')
const logoSvg = read('public', 'brand', 'logo-academy.svg')
const shareImage = read('src', 'lib', 'course-share-image.tsx')
const diagramGenerator = read('scripts', 'make-lesson-diagrams.py')

/** สีประจำ Academy — ค่าเดียวที่ทุกไฟล์ในเกตนี้ต้องอ้างถึง */
const BRAND = '#38BDF8'
const BRAND_RGB = [56, 189, 248] as const
/** เฉดสว่างสำหรับ hover — productBrand.academy.hover */
const BRAND_HOVER = '#7DD3FC'
/** เฉดเข้มสำหรับตัวอักษร/เส้น/ขอบบนพื้นสว่าง — productBrand.academy.textLight */
const BRAND_TEXT_LIGHT = '#0A6C9E'
/** หมึกบนพื้นสีแบรนด์ — productBrand.academy.ink */
const BRAND_INK = '#06121C'

// ---------- WCAG ----------

type Rgb = readonly [number, number, number]

function fromHex(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const ratio = (a: Rgb, b: Rgb) => Math.round(contrast(a, b) * 100) / 100

// ---------- อ่าน token จาก globals.css ----------

/** ตัดคอมเมนต์ทิ้งก่อนเสมอ — ไฟล์นี้อธิบายค่าเก่าไว้ในคอมเมนต์ ถ้าไม่ตัดจะนับคำอธิบายเป็นค่า */
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

function themeBlock(selector: string): string {
  const start = cssNoComments.indexOf(selector)
  expect(start, `ไม่พบบล็อก ${selector} ใน globals.css`).toBeGreaterThanOrEqual(0)
  const open = cssNoComments.indexOf('{', start)
  const close = cssNoComments.indexOf('}', open)
  return cssNoComments.slice(open, close)
}

const lightBlock = themeBlock(':root {')
const darkBlock = themeBlock(":root[data-theme='dark']")

function token(block: string, name: string): Rgb {
  const match = block.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`))
  expect(match, `อ่าน --${name} เป็น rgb triplet ไม่ได้`).not.toBeNull()
  return [Number(match![1]), Number(match![2]), Number(match![3])] as const
}

const theme = (block: string) => ({
  bg: token(block, 'cs-bg'),
  surface: token(block, 'cs-surface'),
  surface2: token(block, 'cs-surface-2'),
  sunken: token(block, 'cs-surface-sunken'),
  accent: token(block, 'cs-accent'),
  accentFill: token(block, 'cs-accent-fill'),
  onAccent: token(block, 'cs-on-accent'),
  accent2: token(block, 'cs-accent-2'),
})

const light = theme(lightBlock)
const dark = theme(darkBlock)

/** เฉดที่ปุ่ม/ลิงก์พื้นแบรนด์ขยับไปตอน hover — ประกาศเป็น hex ตรง ๆ ในกฎ CSS */
const hoverShade = cssNoComments
  .match(/a\.bg-cs-accent-fill:hover[\s\S]*?background-color:\s*(#[0-9a-fA-F]{6})/)?.[1]
  ?.toUpperCase()

describe('สีประจำ Academy มาจากโลโก้ทางการ ไม่ใช่ค่าที่เลือกเอง', () => {
  it('โลโก้ใน repo นี้ถือสีเดียวกับโลโก้ทางการบนเว็บหลัก', () => {
    // ถ้าข้อนี้แดง แปลว่ามีคนทาสีทับโลโก้ — ให้กลับไปอ่าน
    // cyberskills-website/cyberskills-web/public/redesign/logos/logo-academy.svg ก่อนแก้เกต
    const hexes = [...logoSvg.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toUpperCase())
    expect(hexes.length).toBeGreaterThan(0)
    expect([...new Set(hexes)]).toEqual([BRAND])
    // ส่วนโปร่งของโลโก้ก็ต้องเป็นสีเดียวกัน ไม่ใช่ rgba ของสีอื่นที่หลงเหลือ
    const rgbas = [...logoSvg.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) => [+m[1], +m[2], +m[3]])
    expect(rgbas.length).toBeGreaterThan(0)
    for (const c of rgbas) expect(c).toEqual([...BRAND_RGB])
  })

  it('--cs-accent-fill ทั้งสองธีมคือสีแบรนด์ตรงตัว', () => {
    expect(light.accentFill).toEqual([...BRAND_RGB])
    expect(dark.accentFill).toEqual([...BRAND_RGB])
  })

  it('เฉดตัวอักษร/hover/หมึก ใช้ค่าจาก productBrand ของเว็บหลัก', () => {
    expect(light.accent).toEqual([...fromHex(BRAND_TEXT_LIGHT)])
    expect(light.onAccent).toEqual([...fromHex(BRAND_INK)])
    expect(dark.onAccent).toEqual([...fromHex(BRAND_INK)])
    expect(dark.accent2).toEqual([...fromHex(BRAND_HOVER)])
    expect(hoverShade, 'ไม่พบกฎ hover ของปุ่มพื้นแบรนด์').toBe(BRAND_HOVER)
  })

  it('share card ที่คนเห็นตอนแชร์ ใช้สีแบรนด์เหมือนหน้าเว็บ', () => {
    // การ์ดแชร์คือเวอร์ชันที่คนส่วนใหญ่เห็นก่อนเข้าเว็บจริง — หลุดที่นี่คือหลุดที่หน้าร้าน
    expect(shareImage).toMatch(new RegExp(`const FILL = '${BRAND}'`))
    expect(shareImage).toContain(`rgba(${BRAND_RGB.join(',')},0.28)`)
    expect(shareImage).not.toMatch(/rgba\(0,\s*162,\s*128/)
  })

  it('ไดอะแกรมที่ commit ไว้ ตรงกับจานสีของตัวสร้างมันเอง', () => {
    // นี่คือรอยที่ fdb2028 ทำหลุดจริง: ทาสี SVG ทับ แต่ไม่แตะสคริปต์ที่สร้าง SVG
    const palette = Object.fromEntries(
      ['FILL', 'INK', 'MUTE', 'LINE'].map((k) => {
        const v = diagramGenerator.match(new RegExp(`^${k} = '(#[0-9a-fA-F]{6})'`, 'm'))?.[1]
        expect(v, `อ่าน ${k} จาก scripts/make-lesson-diagrams.py ไม่ได้`).toBeDefined()
        return [k, v!.toUpperCase()]
      }),
    )
    expect(palette.FILL).toBe(BRAND)
    expect(palette.INK).toBe(BRAND_INK)

    for (const name of ['os-layers', 'shell-pipeline', 'filesystem-tree']) {
      const svg = read('public', 'media', 'diagrams', `${name}.svg`)
      const used = [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toUpperCase()))]
      expect(used.sort(), `${name}.svg ใช้สีนอกจานของตัวสร้าง`).toEqual(
        [...new Set(Object.values(palette))].sort(),
      )
    }
  })

  it('ไม่มีเขียว teal ของรอบก่อนหลงเหลือในไฟล์ที่ถือสี', () => {
    // ต้องตัดคอมเมนต์ก่อนเสมอ — globals.css จงใจเก็บ #00A280 ไว้ในบันทึกว่า
    // "รอบก่อนพลาดยังไง" การนับคำอธิบายข้อผิดพลาดเป็นตัวข้อผิดพลาดเอง จะทำให้
    // ทางเดียวที่เกตนี้เขียวคือการลบความรู้นั้นทิ้ง
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    const teal = /#(00A280|00CFA3|00795E|F3FAF7|4FD8B5)\b|rgba\(\s*0,\s*(162|207|121)\s*,/i
    for (const [name, body] of [
      ['globals.css', css],
      ['logo-academy.svg', logoSvg],
      ['course-share-image.tsx', shareImage],
    ] as const) {
      expect(strip(body), `${name} ยังมีค่าเขียวของรอบก่อน`).not.toMatch(teal)
    }
  })
})

describe('WCAG AA — วัดจากค่าที่อยู่ในไฟล์จริง ไม่ใช่ค่าที่ตั้งใจไว้', () => {
  const AA_TEXT = 4.5
  const AA_NON_TEXT = 3

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: --cs-accent อ่านเป็นตัวอักษรได้บนทุกพื้นผิว', (_name, t) => {
    for (const [surfaceName, surface] of [
      ['surface', t.surface],
      ['bg', t.bg],
      ['surface-2', t.surface2],
      ['surface-sunken', t.sunken],
    ] as const) {
      expect(ratio(t.accent, surface), `accent บน ${surfaceName}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: หมึกบนพื้นสีแบรนด์ผ่าน AA ทั้งตอนปกติและตอน hover', (_name, t) => {
    expect(ratio(t.onAccent, t.accentFill), 'on-accent บน accent-fill').toBeGreaterThanOrEqual(AA_TEXT)
    expect(ratio(t.onAccent, fromHex(hoverShade!)), 'on-accent บนเฉด hover').toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: ตัวชี้สถานะที่ไม่ใช่ตัวอักษรผ่าน 3:1', (_name, t) => {
    // แถบความคืบหน้า/จุดบนแผนที่บทเรียน สื่อสถานะด้วย "สี" ล้วน ๆ จึงอยู่ใต้ WCAG 1.4.11
    // ตัวที่ใช้ต้องเป็น --cs-accent ไม่ใช่ --cs-accent-fill: ฟ้าสดของแบรนด์บนพื้นสว่าง
    // ได้แค่ 1.79 กับรางของมันเอง — สดเกินกว่าจะเป็นเส้นบาง ๆ บนพื้นขาว
    expect(ratio(t.accent, t.sunken), 'accent บนรางแถบความคืบหน้า').toBeGreaterThanOrEqual(AA_NON_TEXT)
    expect(ratio(t.accent, t.surface), 'accent บนการ์ด').toBeGreaterThanOrEqual(AA_NON_TEXT)
  })

  it('ไม่มี component ไหนใช้ accent-fill เป็นตัวชี้ที่ไม่มีตัวอักษรอยู่ข้างใน', () => {
    // accent-fill คือ "พื้น" ของแบรนด์ — คอนทราสต์ของมันมาจากหมึกเข้มที่วางทับ
    // เอาไปทำแถบ/จุด/เส้นเปล่า ๆ เมื่อไหร่ก็ไม่มีอะไรพาคอนทราสต์ไปด้วย (light = 1.79
    // กับรางของมันเอง) ตัวชี้สถานะต้องใช้ --cs-accent
    const offenders: string[] = []
    for (const file of [
      'src/components/course/CourseDashboard.tsx',
      'src/components/course/LessonView.tsx',
      'src/components/course/CourseOverview.tsx',
      'src/components/course/CheckpointQuiz.tsx',
    ]) {
      let body: string
      try {
        body = read(...file.split('/'))
      } catch {
        continue
      }
      for (const line of body.split('\n')) {
        if (!line.includes('bg-cs-accent-fill')) continue
        if (line.includes('text-cs-on-accent')) continue
        offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders, 'พื้นแบรนด์ถูกใช้เป็นตัวชี้เปล่า — ต้องเป็น bg-cs-accent').toEqual([])
  })

  it('เนื้อความและหัวเรื่องยังผ่าน AA หลังเปลี่ยนโทนพื้นหลัง', () => {
    for (const [name, t] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const body = token(name === 'light' ? lightBlock : darkBlock, 'cs-body')
      const text = token(name === 'light' ? lightBlock : darkBlock, 'cs-text')
      expect(ratio(body, t.bg), `${name}: body บน bg`).toBeGreaterThanOrEqual(AA_TEXT)
      expect(ratio(body, t.surface), `${name}: body บน surface`).toBeGreaterThanOrEqual(AA_TEXT)
      expect(ratio(text, t.bg), `${name}: text บน bg`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })
})

// ---------- favicon (แท็บเบราว์เซอร์) ----------
//
// 2026-09-17 founder ทักว่าแท็บ Academy ยังเป็นกล่องสีเขียว — main ไม่มี favicon เลย
// (`/favicon.ico` → 404) เบราว์เซอร์จึงโชว์ไอคอนเขียวที่ cache ไว้จาก deploy เก่า
// (commit 6ccc024 ที่ไม่เคย merge) · ต้องมี icon ของ App Router และต้องเป็นโลโก้ Academy สีฟ้า
describe('favicon ของแท็บเป็นโลโก้ Academy สีแบรนด์', () => {
  const iconPath = join(webRoot, 'src', 'app', 'icon.svg')

  it('มีไฟล์ icon ของ App Router จริง', () => {
    expect(existsSync(iconPath), 'src/app/icon.svg ไม่มี — แท็บจะโชว์ไอคอนเก่าที่ cache ไว้').toBe(true)
  })

  it('ใช้สีฟ้า #38BDF8 และไม่มีเขียว/teal หลงเหลือ', () => {
    const icon = existsSync(iconPath) ? readFileSync(iconPath, 'utf8') : ''
    expect(icon.toUpperCase()).toContain(BRAND)
    expect(icon).not.toMatch(/#00A280|#00E6B4|#34D399|#00A862|rgba\(0,\s*162,\s*128/i)
  })

  it('เป็นรูปทรงเดียวกับโลโก้ทางการ (ประกายดาวด้านบน)', () => {
    const icon = existsSync(iconPath) ? readFileSync(iconPath, 'utf8') : ''
    const spark = logoSvg.match(/<path d="(M100 22[^"]+)"/)?.[1]
    expect(spark, 'หา path ประกายในโลโก้ทางการไม่เจอ').toBeTruthy()
    expect(icon).toContain(spark!)
  })
})
