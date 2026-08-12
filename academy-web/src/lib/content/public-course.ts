import type {
  Course,
  LearnerDashboardCourse,
  Locale,
  PublicCourse,
  PublicCourseCatalogItem,
  PublicCourseStructure,
} from './course-types'

function toPublicCourseStructure(course: Course): PublicCourseStructure {
  return {
    slug: course.structure.slug,
    defaultLocale: course.structure.defaultLocale,
    availableLocales: [...course.structure.availableLocales],
    level: course.structure.level,
    estimatedMinutes: course.structure.estimatedMinutes,
    ...(course.structure.coverMotif ? { coverMotif: course.structure.coverMotif } : {}),
    nodes: course.structure.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      prerequisites: [...node.prerequisites],
      estimatedMinutes: node.estimatedMinutes,
    })),
  }
}

/**
 * Allowlist เดียวสำหรับข้อมูลที่ข้ามจาก Server Component ไปยัง public client
 * component. ห้ามขยายด้วยการ spread เพราะ CourseStructure มี video URL, cue และ
 * skill metadata ที่เป็นของเส้นทางเรียน ไม่ใช่ของ syllabus preview.
 */
export function toPublicCourse(course: Course): PublicCourse {
  return {
    structure: toPublicCourseStructure(course),
    copy: {
      title: course.copy.title,
      subtitle: course.copy.subtitle,
      audience: course.copy.audience,
      outcomes: [...course.copy.outcomes],
      nodeTitles: { ...course.copy.nodeTitles },
    },
    locale: course.locale,
    translatedNodeIds: [...course.translatedNodeIds],
  }
}

/** Allowlist สำหรับ catalog client: title/subtitle ตามภาษาและ roadmap สำหรับปกเท่านั้น. */
export function toPublicCourseCatalogItem(
  course: Course,
  copies: Partial<Record<Locale, Pick<PublicCourse['copy'], 'title' | 'subtitle'>>>,
): PublicCourseCatalogItem {
  return { structure: toPublicCourseStructure(course), copies }
}

/**
 * Allowlist สำหรับ dashboard ของผู้เรียนหลังยืนยันสิทธิ์แล้วเท่านั้น. global weights
 * จำเป็นต่อ radar ข้ามคอร์ส แต่ข้อมูล media, cue, skill รายบท และ version ไม่ใช่
 * ข้อมูลที่ dashboard ต้องใช้ จึงไม่ข้าม API boundary.
 */
export function toLearnerDashboardCourse(course: Course): LearnerDashboardCourse {
  return {
    structure: {
      ...toPublicCourseStructure(course),
      globalSkillWeights: { ...course.structure.globalSkillWeights },
    },
    title: course.copy.title,
    subtitle: course.copy.subtitle,
    level: course.structure.level,
    nodeTitles: { ...course.copy.nodeTitles },
  }
}
