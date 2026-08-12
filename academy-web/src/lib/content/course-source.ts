import 'server-only'
import { ContentValidationError } from './loader'
import { loadCourseCopy, loadCourseStructure, loadLesson } from './course-loader'
import { COURSE_REGISTRY } from './registry.generated'
import type { Course, CourseStructure, LessonContent, Locale } from './course-types'

// อ่านคอร์สจาก registry ที่ผูกเข้ามาตอน build — ไม่ใช่จากดิสก์ตอน request
//
// เดิมใช้ readFileSync/readdirSync ซึ่ง (ก) รันบน runtime ที่ไม่มี filesystem ไม่ได้
// (พิสูจน์กับ Cloudflare Workers แล้ว: `fs.readFileSync is not implemented`)
// (ข) ทำให้เนื้อหาผิดรูปไปโผล่ตอนผู้ใช้เปิดหน้า แทนที่จะทำ build แดงตั้งแต่แรก
// เนื้อหาเป็นไฟล์นิ่งใน git อยู่แล้ว การอ่านจากดิสก์จึงไม่เคยจำเป็น
//
// โครงเป็นกลางทางภาษา ส่วนข้อความอ่านตาม locale ที่ขอ และถ้าภาษานั้นยังไม่มีบทนั้น
// จะ fallback ไป defaultLocale แบบ "บอกให้รู้" ไม่ใช่แอบสลับเงียบๆ
//
// หมายเหตุที่มา: คอร์สนี้เขียนขึ้นใน repo นี้เพื่อพิสูจน์ประสบการณ์การเรียน —
// ที่ authoring จริงของเนื้อหาคือ Crucible ซึ่งต้องผลิต shape เดียวกันนี้ส่งมา
//
// ⚠️ `import 'server-only'` (W0-1): `getLesson()` คืน `LessonContent` เต็มซึ่งมีเฉลย
// และ registry ที่โมดูลนี้ผูกไว้ก็มีเนื้อหาทั้งคอร์สพร้อมเฉลย — client component ที่
// เผลอ import เข้าไปครั้งเดียวจะลากทั้งก้อนเข้า bundle · RIL cross-model ชี้ว่าการ
// ประกาศให้ `answer-key.ts` เป็น "ทางเข้าเดียว" ไม่จริงจนกว่าโมดูลนี้จะถูกกันด้วย

type LocaleBucket = { __copy: unknown } & Record<string, unknown>
type CourseBucket = { __structure: unknown } & Record<string, LocaleBucket>

const registry = COURSE_REGISTRY as unknown as Record<string, CourseBucket>
const structureCache = new Map<string, CourseStructure>()

function localeBucket(slug: string, locale: string): LocaleBucket | null {
  const course = registry[slug]
  if (!course) return null
  const bucket = course[locale]
  return bucket && typeof bucket === 'object' ? bucket : null
}

export function listCourseSlugs(): string[] {
  return Object.keys(registry).sort()
}

/** รายชื่อคอร์สที่อนุญาตให้มีหน้า syllabus สาธารณะอย่างชัดเจน */
export function listPublicCourseSlugs(): string[] {
  return listCourseSlugs().filter((slug) => getCourseStructure(slug)?.publicAvailability === 'syllabus-preview')
}

/** ทุก locale ที่ประกาศต้องมี course copy เพื่อให้ public catalog สร้างลิงก์ที่เปิดได้จริง */
export function assertDeclaredLocaleCopies(
  slug: string,
  declaredLocales: readonly Locale[],
  copies: Partial<Record<Locale, unknown>>,
): void {
  for (const locale of declaredLocales) {
    if (copies[locale] == null) {
      throw new ContentValidationError(`${slug}/course.json`, `ประกาศ locale "${locale}" แต่ไม่มี locales/${locale}/course.json`)
    }
  }
}

export function getCourseStructure(slug: string): CourseStructure | null {
  const cached = structureCache.get(slug)
  if (cached) return cached
  const raw = registry[slug]?.__structure
  if (!raw) return null
  const structure = loadCourseStructure(`${slug}/course.json`, raw)
  const copies = Object.fromEntries(
    structure.availableLocales.map((locale) => [locale, localeBucket(slug, locale)?.__copy]),
  ) as Partial<Record<Locale, unknown>>
  assertDeclaredLocaleCopies(slug, structure.availableLocales, copies)
  structureCache.set(slug, structure)
  return structure
}

function rawLesson(slug: string, locale: Locale, nodeId: string): unknown {
  return localeBucket(slug, locale)?.[nodeId] ?? null
}

/** node ที่มีเนื้อหาแปลครบในภาษานี้จริง */
export function translatedNodeIds(structure: CourseStructure, locale: Locale): string[] {
  return structure.nodes.filter((node) => rawLesson(structure.slug, locale, node.id)).map((n) => n.id)
}

export function getCourse(slug: string, requested?: Locale): Course | null {
  const structure = getCourseStructure(slug)
  if (!structure) return null
  const locale: Locale =
    requested && structure.availableLocales.includes(requested) ? requested : structure.defaultLocale

  const rawCopy = localeBucket(slug, locale)?.__copy
  if (!rawCopy) return null
  const copy = loadCourseCopy(`${slug}/locales/${locale}/course.json`, rawCopy, structure)

  return { structure, copy, locale, translatedNodeIds: translatedNodeIds(structure, locale) }
}

/**
 * ข้อมูลสำหรับหน้าร้านเท่านั้น. การมีคอร์สใน registry ไม่ได้แปลว่าเผยต่อ public ได้;
 * ทั้ง route, catalog, sitemap และภาพแชร์ต้องผ่าน gate เดียวกันนี้.
 */
export function getPublicCourse(slug: string, requested?: Locale): Course | null {
  const course = getCourse(slug, requested)
  return course?.structure.publicAvailability === 'syllabus-preview' ? course : null
}

export interface ResolvedLesson {
  lesson: LessonContent
  /** ภาษาที่ได้จริง — ต่างจากที่ขอเมื่อบทนั้นยังไม่ถูกแปล */
  servedLocale: Locale
  requestedLocale: Locale
}

export function getLesson(slug: string, nodeId: string, requested?: Locale): ResolvedLesson | null {
  const structure = getCourseStructure(slug)
  if (!structure) return null
  const requestedLocale: Locale =
    requested && structure.availableLocales.includes(requested) ? requested : structure.defaultLocale

  for (const locale of [requestedLocale, structure.defaultLocale]) {
    const raw = rawLesson(slug, locale, nodeId)
    if (!raw) continue
    const lesson = loadLesson(`${slug}/locales/${locale}/lessons/${nodeId}.json`, raw, structure)
    return { lesson, servedLocale: locale, requestedLocale }
  }
  return null
}

export function getAllCourses(locale?: Locale): Course[] {
  return listCourseSlugs()
    .map((slug) => getCourse(slug, locale))
    .filter((course): course is Course => course !== null)
}

export function getAllPublicCourses(locale?: Locale): Course[] {
  return listPublicCourseSlugs()
    .map((slug) => getPublicCourse(slug, locale))
    .filter((course): course is Course => course !== null)
}
