import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const coursesRoot = join(process.cwd(), 'content', 'courses')

export function publicCoursePagePaths() {
  return readdirSync(coursesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const course = JSON.parse(readFileSync(join(coursesRoot, entry.name, 'course.json'), 'utf8'))
      if (course.publicAvailability !== 'syllabus-preview') return []
      return course.availableLocales
        .filter((locale) => locale === 'en' || locale === 'th')
        .map((locale) => `/courses/${entry.name}/${locale}`)
    })
    .sort()
}
