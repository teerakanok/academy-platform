import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT_ROOT = join('content', 'courses')
const SUPPORTED_LOCALES = new Set(['en', 'th'])

export function publicShareImagePaths() {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const structure = JSON.parse(readFileSync(join(CONTENT_ROOT, entry.name, 'course.json'), 'utf8'))
      if (structure.publicAvailability !== 'syllabus-preview') return []
      if (!Array.isArray(structure.availableLocales) || structure.availableLocales.some((locale) => !SUPPORTED_LOCALES.has(locale))) {
        throw new Error(`invalid public share-image locales: ${entry.name}`)
      }
      return structure.availableLocales.map((locale) => `/courses/${entry.name}/share/${locale}`)
    })
    .sort()
}
