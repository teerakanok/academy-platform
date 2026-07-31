import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCourseContent, loadFullLength, loadModuleBank } from './loader'
import type { CourseContent } from './types'

// Server-side content source — อ่านจาก fixture dir (content-agnostic: เปลี่ยน dir
// ได้ผ่าน env โดยไม่แตะ code; ไม่ hardcode course ใดในตัว engine)
// CAS-005 fixture = INTERNAL ONLY (ดู fixtures/cas005/README.md)

const CONTENT_DIR = process.env.ACADEMY_CONTENT_DIR ?? join(process.cwd(), 'fixtures', 'cas005')

let cached: CourseContent | null = null

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function getCourseContent(): CourseContent {
  if (cached) return cached

  const moduleBanksDir = join(CONTENT_DIR, 'module-banks')
  const moduleSlugs = readdirSync(moduleBanksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const modules = moduleSlugs.map((slug) => {
    const dir = join(moduleBanksDir, slug)
    const parts = readdirSync(dir)
      .filter((f) => f.startsWith('part-') && f.endsWith('.json'))
      .sort()
      .map((f) => ({ file: `${slug}/${f}`, data: readJson(join(dir, f)) }))
    return loadModuleBank(slug, parts)
  })

  const fullLengthDir = join(CONTENT_DIR, 'full-length')
  const fullLength = readdirSync(fullLengthDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => loadFullLength(f, readJson(join(fullLengthDir, f))))

  cached = buildCourseContent(modules, fullLength)
  return cached
}
