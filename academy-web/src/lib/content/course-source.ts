import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCourseCopy, loadCourseStructure, loadLesson } from './course-loader'
import type { Course, CourseStructure, LessonContent, Locale } from './course-types'

// อ่านคอร์สจากดิสก์ฝั่ง server — โครงเป็นกลางทางภาษา ส่วนข้อความอ่านตาม locale
// ที่ขอ และถ้าภาษานั้นยังไม่มีบทนั้น จะ fallback ไป defaultLocale แบบ "บอกให้รู้"
// ไม่ใช่แอบสลับเงียบๆ (ผู้เรียนต้องรู้ว่ากำลังอ่านภาษาอะไรอยู่)
//
// หมายเหตุที่มา: คอร์สนี้เขียนขึ้นใน repo นี้เพื่อพิสูจน์ประสบการณ์การเรียน —
// ที่ authoring จริงของเนื้อหาคือ Crucible ซึ่งต้องผลิต shape เดียวกันนี้ส่งมา

const CONTENT_ROOT = process.env.ACADEMY_COURSE_DIR ?? join(process.cwd(), 'content', 'courses')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const structureCache = new Map<string, CourseStructure>()

export function listCourseSlugs(): string[] {
  if (!existsSync(CONTENT_ROOT)) return []
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export function getCourseStructure(slug: string): CourseStructure | null {
  const cached = structureCache.get(slug)
  if (cached) return cached
  const file = join(CONTENT_ROOT, slug, 'course.json')
  if (!existsSync(file)) return null
  const structure = loadCourseStructure(`${slug}/course.json`, readJson(file))
  structureCache.set(slug, structure)
  return structure
}

function lessonPath(slug: string, locale: Locale, nodeId: string): string {
  return join(CONTENT_ROOT, slug, 'locales', locale, 'lessons', `${nodeId}.json`)
}

/** node ที่มีเนื้อหาแปลครบในภาษานี้จริง */
export function translatedNodeIds(structure: CourseStructure, locale: Locale): string[] {
  return structure.nodes.filter((node) => existsSync(lessonPath(structure.slug, locale, node.id))).map((n) => n.id)
}

export function getCourse(slug: string, requested?: Locale): Course | null {
  const structure = getCourseStructure(slug)
  if (!structure) return null
  const locale: Locale =
    requested && structure.availableLocales.includes(requested) ? requested : structure.defaultLocale

  const copyFile = join(CONTENT_ROOT, slug, 'locales', locale, 'course.json')
  if (!existsSync(copyFile)) return null
  const copy = loadCourseCopy(`${slug}/locales/${locale}/course.json`, readJson(copyFile), structure)

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
    const file = lessonPath(slug, locale, nodeId)
    if (!existsSync(file)) continue
    const lesson = loadLesson(`${slug}/locales/${locale}/lessons/${nodeId}.json`, readJson(file), structure)
    return { lesson, servedLocale: locale, requestedLocale }
  }
  return null
}

export function getAllCourses(locale?: Locale): Course[] {
  return listCourseSlugs()
    .map((slug) => getCourse(slug, locale))
    .filter((course): course is Course => course !== null)
}
