import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COURSE_REGISTRY, CONSENT_TEXTS } from '@/lib/content/registry.generated'
import { listCourseSlugs } from '@/lib/content/course-source'
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
  })

  it('ข้อความ consent ทุกเวอร์ชันที่ประกาศไว้มีอยู่จริงใน registry', () => {
    for (const v of CONSENT_VERSIONS) {
      expect(CONSENT_TEXTS[v], `ไม่มีข้อความ consent ${v}`).toBeTruthy()
      expect(CONSENT_TEXTS[v].length).toBeGreaterThan(50)
    }
  })
})
