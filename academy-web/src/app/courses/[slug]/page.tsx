import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCourse, listCourseSlugs } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { CourseOverview } from '@/components/course/CourseOverview'
import { absoluteUrl, publicPage } from '@/lib/seo'

export function generateStaticParams() {
  return listCourseSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const course = getCourse(slug)
  if (!course) return { robots: { index: false, follow: false } }
  return publicPage({
    path: `/courses/${slug}`,
    title: course.copy.title,
    description: course.copy.subtitle,
    imagePath: `/courses/${slug}/opengraph-image`,
  })
}

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const course = getCourse(slug, lang === 'th' || lang === 'en' ? (lang as Locale) : undefined)
  if (!course) notFound()

  // ข้อมูลโครงสร้างสำหรับ search engine และผู้ช่วย AI — ประกาศเฉพาะสิ่งที่จริง
  // (ไม่ใส่คะแนนรีวิว/ราคาที่ยังไม่มี — structured data ที่โกหกโดนลงโทษหนักกว่าไม่ใส่)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.copy.title,
    description: course.copy.subtitle,
    url: absoluteUrl(`/courses/${slug}`),
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
        // เนื้อหามาจากไฟล์คอร์สของเราเอง ผ่าน JSON.stringify จึงไม่มีทางแทรก markup
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <CourseOverview
        structure={course.structure}
        copy={course.copy}
        locale={course.locale}
        translatedNodeIds={course.translatedNodeIds}
      />
    </div>
  )
}
