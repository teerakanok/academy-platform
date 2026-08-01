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

export function getCourseStructure(slug: string): CourseStructure | null {
  const cached = structureCache.get(slug)
  if (cached) return cached
  const raw = registry[slug]?.__structure
  if (!raw) return null
  const structure = loadCourseStructure(`${slug}/course.json`, raw)
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
