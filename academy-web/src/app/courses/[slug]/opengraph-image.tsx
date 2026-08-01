import { ImageResponse } from 'next/og'
import { getCourse, listCourseSlugs } from '@/lib/content/course-source'

// ภาพที่ขึ้นตอนแชร์ลิงก์บน Facebook / X / LinkedIn — ช่องทางที่ founder เลือกไว้
// สามในสี่ทางเป็นการแชร์ลิงก์ และลิงก์ที่ไม่มีภาพได้คลิกน้อยกว่ามาก
//
// สร้างจากข้อมูลคอร์สจริง ไม่ใช่ภาพเดียวใช้ทุกคอร์ส — เพราะโพสต์สองคอร์สที่หน้าตา
// เหมือนกันเป๊ะทำให้ไทม์ไลน์ดูเหมือนสแปม
// วาดด้วย element เปล่าๆ ทั้งหมด ไม่โหลดฟอนต์หรือรูปจากภายนอก (ห้ามมี network
// dependency ในเส้นทางที่ต้องเรนเดอร์ตอนมีคนแชร์)

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return listCourseSlugs().map((slug) => ({ slug }))
}

const FILL = '#38BDF8'
const INK = '#06121C'
const BG = '#0B1620'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = getCourse(slug)
  const title = course?.copy.title ?? 'CYBERSKILLS Academy'
  const subtitle = course?.copy.subtitle ?? ''
  const lessons = course?.structure.nodes.length ?? 0
  const level = course?.structure.level ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: 72,
          // แสงนุ่มหลังหัวเรื่อง — ภาษาเดียวกับหน้าเว็บ ไม่ใช่ธีมใหม่
          backgroundImage: `radial-gradient(1000px 460px at 30% -10%, rgba(56,189,248,0.28), rgba(56,189,248,0) 70%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: FILL, display: 'flex' }} />
          <div style={{ display: 'flex', color: '#93B4C6', fontSize: 26, letterSpacing: 2 }}>CYBERSKILLS ACADEMY</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: '#F2F7FA', fontSize: 68, lineHeight: 1.1, fontWeight: 700 }}>{title}</div>
          {subtitle ? (
            <div style={{ display: 'flex', color: '#A9C3D2', fontSize: 30, lineHeight: 1.35, marginTop: 22, maxWidth: 940 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {level ? (
            <div
              style={{
                display: 'flex',
                background: FILL,
                color: INK,
                fontSize: 24,
                fontWeight: 700,
                padding: '10px 22px',
                borderRadius: 999,
                textTransform: 'uppercase',
              }}
            >
              {level}
            </div>
          ) : null}
          {lessons ? <div style={{ display: 'flex', color: '#93B4C6', fontSize: 26 }}>{lessons} lessons</div> : null}
        </div>
      </div>
    ),
    size,
  )
}
