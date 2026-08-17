import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COURSE_REGISTRY, CONSENT_TEXTS } from '@/lib/content/registry.generated'
import {
  assertDeclaredLocaleCopies,
  getAllPublicCourses,
  getPublicCourse,
  getCourseStructure,
  listCourseSlugs,
  listPublicCourseSlugs,
} from '@/lib/content/course-source'
import { CONSENT_VERSIONS } from '@/lib/consent'

// registry ที่ generate แล้วล้าสมัยแบบเงียบๆ คือกับดักคลาสสิก: เพิ่มคอร์สใหม่แล้ว
// มันไม่โผล่บนเว็บ โดยไม่มีอะไรพัง — เทสนี้ทำให้มัน "พังดังๆ" แทน

const ROOT = process.cwd()
const GENERATED = join(ROOT, 'src', 'lib', 'content', 'registry.generated.ts')

describe('registry ของเนื้อหา', () => {
  it('ตรงกับผลรัน generator ปัจจุบัน (ไม่ล้าสมัย)', () => {
    const before = readFileSync(GENERATED, 'utf8')
    execFileSync('node', [join(ROOT, 'scripts', 'generate-content-registry.mjs')], { cwd: ROOT })
    const after = readFileSync(GENERATED, 'utf8')
    expect(after, 'registry.generated.ts ล้าสมัย — รัน node scripts/generate-content-registry.mjs แล้ว commit').toBe(
      before,
    )
  })

  it('ทุกคอร์สใน registry โหลดผ่าน loader ได้จริง', () => {
    const slugs = listCourseSlugs()
    expect(slugs.length).toBeGreaterThan(0)
    expect(slugs).toEqual(Object.keys(COURSE_REGISTRY).sort())
    for (const slug of slugs) {
      expect(getCourseStructure(slug), `${slug} ต้องผ่าน structural และ locale-copy validation`).not.toBeNull()
    }
  })

  it('เผยต่อสาธารณะเฉพาะคอร์สที่ประกาศ syllabus preview ไว้อย่างชัดเจน', () => {
    // ผูกกับกติกา ไม่ผูกกับรายชื่อคอร์ส ณ วันเขียน: คอร์สที่ยังเขียนไม่เสร็จ
    // ประกาศตัวเองเป็น internal และต้องไม่หลุดออกหน้าสาธารณะจนกว่าจะเปลี่ยนเอง
    const declaredPublic = Object.keys(COURSE_REGISTRY)
      .filter((slug) => getCourseStructure(slug)?.publicAvailability === 'syllabus-preview')
      .sort()
    expect(declaredPublic.length).toBeGreaterThan(0)
    expect(listPublicCourseSlugs()).toEqual(declaredPublic)
    expect(getAllPublicCourses().map((course) => course.structure.slug)).toEqual(declaredPublic)

    const internalOnly = Object.keys(COURSE_REGISTRY).filter((slug) => !declaredPublic.includes(slug))
    for (const slug of internalOnly) {
      expect(listPublicCourseSlugs(), `${slug} ไม่ได้ประกาศ syllabus preview จึงห้ามโผล่สาธารณะ`).not.toContain(slug)
    }
    expect(getPublicCourse('basic-os-linux')).not.toBeNull()
    expect(getPublicCourse('content-formats-demo')).toBeNull()
  })

  it('ไม่ยอมรับ locale ที่ประกาศไว้แต่ registry ให้ course copy เป็น null', () => {
    expect(() => assertDeclaredLocaleCopies('missing-th-copy', ['en', 'th'], { en: {}, th: null })).toThrow(
      /locales\/th\/course\.json/,
    )
    expect(() => assertDeclaredLocaleCopies('complete-locales', ['en', 'th'], { en: {}, th: {} })).not.toThrow()
  })

  it('ข้อความ consent ทุกเวอร์ชันที่ประกาศไว้มีอยู่จริงใน registry', () => {
    for (const v of CONSENT_VERSIONS) {
      expect(CONSENT_TEXTS[v], `ไม่มีข้อความ consent ${v}`).toBeTruthy()
      expect(CONSENT_TEXTS[v].length).toBeGreaterThan(50)
    }
  })
})
