#!/usr/bin/env node
// สร้าง registry ของเนื้อหาแบบ static import — แทนการอ่านดิสก์ตอน request
//
// ทำไม: เนื้อหาคอร์สกับข้อความ consent เป็นไฟล์นิ่งใน git อยู่แล้ว การไปอ่านจากดิสก์
// ทุก request เป็นทางเลือกที่เราเลือกเอง ไม่ใช่ข้อบังคับ และมันทำให้
//   1. รันบน runtime ที่ไม่มี filesystem ไม่ได้เลย (Cloudflare Workers — พิสูจน์แล้ว
//      ว่า `fs.readFileSync is not implemented`)
//   2. เนื้อหาที่ผิดรูปไปโผล่ตอนผู้ใช้เปิดหน้า แทนที่จะทำ build แดงตั้งแต่แรก
//   3. มี disk I/O ต่อ request โดยไม่จำเป็น
//
// ไฟล์ผลลัพธ์ถูก commit เข้า git โดยตั้งใจ — จะได้เห็นใน diff ว่าคอร์สไหนถูกเพิ่ม/ลบ
// และ build ไม่ต้องพึ่งลำดับการรันสคริปต์ มี test คุมว่ามันตรงกับโฟลเดอร์จริงเสมอ

import { readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COURSES = join(ROOT, 'content', 'courses')
const CONSENT = join(ROOT, 'src', 'content', 'consent')
const OUT = join(ROOT, 'src', 'lib', 'content', 'registry.generated.ts')

const dirs = (p) =>
  existsSync(p)
    ? readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : []

const jsonFiles = (p) =>
  existsSync(p)
    ? readdirSync(p)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
    : []

/** path สำหรับ import — ต้องเป็น relative จากไฟล์ที่ generate และใช้ / เสมอ */
const importPath = (abs) => {
  const rel = relative(dirname(OUT), abs).split('\\').join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const imports = []
const seen = new Map()
function ref(abs) {
  if (seen.has(abs)) return seen.get(abs)
  const name = `c${seen.size}`
  imports.push(`import ${name} from '${importPath(abs)}'`)
  seen.set(abs, name)
  return name
}

const slugs = dirs(COURSES)
const courseEntries = []

for (const slug of slugs) {
  const base = join(COURSES, slug)
  const structureFile = join(base, 'course.json')
  if (!existsSync(structureFile)) {
    console.warn(`ข้าม ${slug}: ไม่มี course.json`)
    continue
  }
  const locales = dirs(join(base, 'locales'))
  const localeEntries = locales.map((locale) => {
    const copyFile = join(base, 'locales', locale, 'course.json')
    const lessonsDir = join(base, 'locales', locale, 'lessons')
    const lessons = jsonFiles(lessonsDir)
      .map((id) => `      ${JSON.stringify(id)}: ${ref(join(lessonsDir, `${id}.json`))},`)
      .join('\n')
    return [
      `    ${JSON.stringify(locale)}: {`,
      `      __copy: ${existsSync(copyFile) ? ref(copyFile) : 'null'},`,
      lessons,
      `    },`,
    ]
      .filter(Boolean)
      .join('\n')
  })
  courseEntries.push(
    [
      `  ${JSON.stringify(slug)}: {`,
      `    __structure: ${ref(structureFile)},`,
      ...localeEntries,
      `  },`,
    ].join('\n'),
  )
}

const consentVersions = existsSync(CONSENT)
  ? readdirSync(CONSENT)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .sort()
  : []

// consent เป็น .md — bundler import ไม่ได้ตรงๆ จึงฝังเป็นสตริง (ไฟล์เล็กและเป็น
// ข้อความทางกฎหมายที่ต้องเห็นใน diff อยู่แล้ว)
const { readFileSync } = await import('node:fs')
const consentEntries = consentVersions
  .map((v) => `  ${JSON.stringify(v)}: ${JSON.stringify(readFileSync(join(CONSENT, `${v}.md`), 'utf8'))},`)
  .join('\n')

const header = `// ⚠️ ไฟล์นี้ถูก generate — ห้ามแก้ด้วยมือ
// สร้างด้วย: node scripts/generate-content-registry.mjs
// รันใหม่ทุกครั้งที่เพิ่ม/ลบ/เปลี่ยนชื่อไฟล์เนื้อหา (มี test คุมว่าไม่ล้าสมัย)
/* eslint-disable */

`

const body = `${imports.join('\n')}

/** โครง + ข้อความของทุกคอร์ส ผูกเข้ามาตอน build ไม่ใช่ตอน request */
export const COURSE_REGISTRY: Record<
  string,
  { __structure: unknown } & Record<string, { __copy: unknown } & Record<string, unknown>>
> = {
${courseEntries.join('\n')}
} as never

/** ข้อความ consent ต่อเวอร์ชัน — ต้องตรงกับ CONSENT_VERSIONS ใน src/lib/consent.ts */
export const CONSENT_TEXTS: Record<string, string> = {
${consentEntries}
}
`

writeFileSync(OUT, header + body, 'utf8')
console.log(`เขียน ${relative(ROOT, OUT)} — ${slugs.length} คอร์ส, ${seen.size} ไฟล์เนื้อหา, ${consentVersions.length} เวอร์ชัน consent`)
