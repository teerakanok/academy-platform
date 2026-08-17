import { getCourseStructure, listPublicCourseSlugs } from '@/lib/content/course-source'
import { describe, expect, it } from 'vitest'
import { generateStaticParams } from '@/app/(site)/courses/[slug]/share/[locale]/route'

describe('public course share-image route', () => {
  it('pre-renders each available locale of public courses only', () => {
    // ผูกกับกติกา: ทุกคอร์สที่ประกาศ syllabus-preview คูณทุกภาษาที่มันประกาศไว้
    // เกตจึงยังจับคอร์ส internal ที่หลุดออกสาธารณะได้ แม้ catalog จะโตขึ้น
    const expected = listPublicCourseSlugs().flatMap((slug) =>
      (getCourseStructure(slug)?.availableLocales ?? []).map((locale) => ({ slug, locale })),
    )
    expect(expected.length).toBeGreaterThan(0)
    expect(generateStaticParams()).toEqual(expected)
  })
})
