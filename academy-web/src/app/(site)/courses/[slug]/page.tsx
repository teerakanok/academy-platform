import { notFound, permanentRedirect } from 'next/navigation'
import { legacyCourseRedirectPath, type LegacyCourseSearchParams } from '@/lib/content/legacy-public-course-route'

// URL เดิมที่ใช้ ?lang= เป็น compatibility boundary เท่านั้น. หน้า canonical อยู่ที่
// /courses/{slug}/{locale} และเป็น static output ต่อ locale; redirect นี้ไม่ render
// content/metadata ซ้ำภายใต้ URL เก่า.
export default async function LegacyCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<LegacyCourseSearchParams>
}) {
  const { slug } = await params
  const target = legacyCourseRedirectPath({ slug, searchParams: await searchParams })
  if (!target) notFound()
  permanentRedirect(target)
}
