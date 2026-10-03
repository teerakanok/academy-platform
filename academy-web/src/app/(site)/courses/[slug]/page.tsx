import { notFound, permanentRedirect } from 'next/navigation'
import { legacyCourseRedirectPath, type LegacyCourseSearchParams } from '@/lib/content/legacy-public-course-route'
import { getVisiblePublicCourse } from '@/lib/course/visibility'

export const dynamic = 'force-dynamic'

// URL เดิมที่ใช้ ?lang= เป็น compatibility boundary เท่านั้น. หน้า canonical อยู่ที่
// /courses/{slug}/{locale}. เช็ก runtime visibility ก่อน redirect เพื่อให้คอร์ส
// ที่ซ่อนภายหลังกลายเป็น 404 โดยไม่ต้อง build ใหม่.
export default async function LegacyCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<LegacyCourseSearchParams>
}) {
  const { slug } = await params
  const course = await getVisiblePublicCourse(slug)
  if (!course) notFound()

  const target = legacyCourseRedirectPath({ slug, searchParams: await searchParams })
  if (!target) notFound()
  permanentRedirect(target)
}
