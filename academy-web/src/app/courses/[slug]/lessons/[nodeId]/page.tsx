import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import { notFound } from 'next/navigation'
import { getCourse, getLesson } from '@/lib/content/course-source'
import { toPublicLesson } from '@/lib/content/public-lesson'
import type { Locale } from '@/lib/content/course-types'
import { LessonView } from '@/components/course/LessonView'

export const metadata: Metadata = privatePage()

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; nodeId: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug, nodeId } = await params
  const { lang } = await searchParams
  const locale: Locale | undefined = lang === 'th' || lang === 'en' ? lang : undefined

  const course = getCourse(slug, locale)
  const resolved = getLesson(slug, nodeId, locale)
  if (!course || !resolved) notFound()

  const node = course.structure.nodes.find((n) => n.id === nodeId)
  if (!node) notFound()

  return (
    // ~70ch ที่ขนาดตัวอักษรของเนื้อหา — กว้างพอสำหรับตาราง/โค้ด แต่ยังอ่านยาวสบาย
    // และทุกบล็อกใช้ขอบเดียวกันหมด
    //
    // ⚠️ lesson ต้องผ่าน toPublicLesson() เสมอ — ส่ง resolved.lesson ตรงๆ คือ F1
    // (เฉลยทั้งบทอยู่ใน payload ที่ view-source เห็น) · ชนิดของ LessonView บังคับไว้แล้ว
    <div className="mx-auto max-w-[46rem] px-6 py-12">
      <LessonView
        structure={course.structure}
        node={node}
        lesson={toPublicLesson(resolved.lesson)}
        courseTitle={course.copy.title}
        nodeTitles={course.copy.nodeTitles}
        servedLocale={resolved.servedLocale}
        requestedLocale={resolved.requestedLocale}
      />
    </div>
  )
}
