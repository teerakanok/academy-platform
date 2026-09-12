import { notFound } from 'next/navigation'
import { renderPublicCourseShareImage } from '@/lib/course-share-image'
import { toPublicCourse } from '@/lib/content/public-course'
import { getVisiblePublicCourse } from '@/lib/course/visibility'

// ภาพที่ขึ้นตอนแชร์ลิงก์บน Facebook / X / LinkedIn — ช่องทางที่ founder เลือกไว้
// สามในสี่ทางเป็นการแชร์ลิงก์ และลิงก์ที่ไม่มีภาพได้คลิกน้อยกว่ามาก
//
// สร้างจากข้อมูลคอร์สจริง ไม่ใช่ภาพเดียวใช้ทุกคอร์ส — เพราะโพสต์สองคอร์สที่หน้าตา
// เหมือนกันเป๊ะทำให้ไทม์ไลน์ดูเหมือนสแปม
// วาดด้วย element เปล่าๆ ทั้งหมด ไม่โหลดฟอนต์หรือรูปจากภายนอก (ห้ามมี network
// dependency ในเส้นทางที่ต้องเรนเดอร์ตอนมีคนแชร์)

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getVisiblePublicCourse(slug)
  if (!course) notFound()
  const image = await renderPublicCourseShareImage(toPublicCourse(course))
  image.headers.set('cache-control', 'no-store')
  return image
}
