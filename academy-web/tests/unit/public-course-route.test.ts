import { describe, expect, it } from 'vitest'
import { generateMetadata, generateStaticParams } from '@/app/(localized)/courses/[slug]/[locale]/page'
import { legacyCourseRedirectPath } from '@/lib/content/legacy-public-course-route'
import { getCourseStructure, listPublicCourseSlugs } from '@/lib/content/course-source'
import { getCourse } from '@/lib/content/course-source'

describe('public course route', () => {
  it('pre-renders each available locale of public courses only', () => {
    // ผูกกับกติกา: ทุกคอร์สที่ประกาศ syllabus-preview คูณทุกภาษาที่มันประกาศไว้
    // เกตจึงยังจับคอร์ส internal ที่หลุดออกสาธารณะได้ แม้ catalog จะโตขึ้น
    const expected = listPublicCourseSlugs().flatMap((slug) =>
      (getCourseStructure(slug)?.availableLocales ?? []).map((locale) => ({ slug, locale })),
    )
    expect(expected.length).toBeGreaterThan(0)
    expect(generateStaticParams()).toEqual(expected)
  })

  it('uses the path locale for canonical, language, and share metadata', async () => {
    const course = getCourse('basic-os-linux', 'th')!
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'basic-os-linux', locale: 'th' }),
    })

    expect(metadata.title).toEqual({ absolute: `${course.copy.title} · CYBERSKILLS Academy` })
    expect(metadata.description).toBe(course.copy.subtitle)
    expect(metadata.alternates?.canonical).toContain('/courses/basic-os-linux/th')
    expect(metadata.alternates?.languages).toMatchObject({
      en: expect.stringContaining('/courses/basic-os-linux/en'),
      th: expect.stringContaining('/courses/basic-os-linux/th'),
      'x-default': expect.stringContaining('/courses/basic-os-linux/en'),
    })
    expect(metadata.openGraph?.title).toBe(course.copy.title)
    expect(metadata.openGraph?.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining('/courses/basic-os-linux/share/th') })]),
    )
  })

  it('canonicalizes legacy locales without retaining lang while keeping other query fields', () => {
    expect(
      legacyCourseRedirectPath({
        slug: 'basic-os-linux',
        searchParams: { lang: 'th', utm_source: 'newsletter', utm_medium: ['email', 'follow-up'] },
      }),
    ).toBe('/courses/basic-os-linux/th?utm_source=newsletter&utm_medium=email&utm_medium=follow-up')
    expect(
      legacyCourseRedirectPath({
        slug: 'basic-os-linux',
        searchParams: { lang: ['th', 'en'] },
      }),
    ).toBe('/courses/basic-os-linux/en')
    expect(
      legacyCourseRedirectPath({
        slug: 'basic-os-linux',
        searchParams: { lang: 'de' },
      }),
    ).toBe('/courses/basic-os-linux/en')
  })

  it('returns null for an internal or unknown legacy course', () => {
    expect(
      legacyCourseRedirectPath({
        slug: 'content-formats-demo',
        searchParams: { lang: 'en' },
      }),
    ).toBeNull()
    expect(
      legacyCourseRedirectPath({
        slug: 'missing-course',
        searchParams: {},
      }),
    ).toBeNull()
  })
})
