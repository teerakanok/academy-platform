import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseExperience } from '@/components/course/CourseExperience'
import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import { toPublicCourse } from '@/lib/content/public-course'
import { publicCourseShareImagePath } from '@/lib/course-share-image'
import { isUiLocale } from '@/lib/i18n/ui'
import { absoluteUrl, publicPage } from '@/lib/seo'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return listPublicCourseSlugs().flatMap((slug) => {
    const course = getPublicCourse(slug)
    return course?.structure.availableLocales.map((locale) => ({ slug, locale })) ?? []
  })
}

function publicCourseForPath(slug: string, locale: string) {
  if (!isUiLocale(locale)) return null
  const course = getPublicCourse(slug, locale)
  return course?.locale === locale ? course : null
}

function coursePath(slug: string, locale: string): string {
  return `/courses/${slug}/${locale}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}): Promise<Metadata> {
  const { slug, locale } = await params
  const course = publicCourseForPath(slug, locale)
  if (!course) return { robots: { index: false, follow: false } }

  const languagePaths = Object.fromEntries(course.structure.availableLocales.map((code) => [code, coursePath(slug, code)]))
  languagePaths['x-default'] = coursePath(slug, course.structure.defaultLocale)
  const metadata = publicPage({
    path: coursePath(slug, course.locale),
    title: course.copy.title,
    description: course.copy.subtitle,
    imagePath: publicCourseShareImagePath(slug, course.locale),
    languagePaths,
  })
  return {
    ...metadata,
    title: { absolute: `${course.copy.title} · CYBERSKILLS Academy` },
  }
}

export default async function LocalizedCoursePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}) {
  const { slug, locale } = await params
  const course = publicCourseForPath(slug, locale)
  if (!course) notFound()

  const path = coursePath(slug, course.locale)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.copy.title,
    description: course.copy.subtitle,
    url: absoluteUrl(path),
    inLanguage: course.locale,
    educationalLevel: course.structure.level,
    teaches: course.copy.outcomes,
    provider: {
      '@type': 'Organization',
      name: 'CYBERSKILLS',
      url: absoluteUrl('/'),
    },
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <CourseExperience {...toPublicCourse(course)} requestedLocale={course.locale} localeParameterPresent />
    </div>
  )
}
