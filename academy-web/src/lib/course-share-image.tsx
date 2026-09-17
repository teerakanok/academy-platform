import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { courseStepCounts } from '@/lib/content/course-step-summary'
import type { Locale, PublicCourse } from '@/lib/content/course-types'

export const COURSE_SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

const FILL = '#38BDF8'
const INK = '#06121C'
const BG = '#0B1620'

const levelLabels = {
  en: { beginner: 'BEGINNER', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED' },
  th: { beginner: 'ระดับเริ่มต้น', intermediate: 'ระดับกลาง', advanced: 'ระดับสูง' },
} as const

export function publicCourseShareImagePath(slug: string, locale: Locale): string {
  return `/courses/${slug}/share/${locale}`
}

async function shareImageFonts() {
  const fontRoot = join(process.cwd(), 'assets', 'fonts', 'noto-sans-thai')
  const [regular, bold] = await Promise.all([
    readFile(join(fontRoot, 'NotoSansThai-Regular.ttf')),
    readFile(join(fontRoot, 'NotoSansThai-Bold.ttf')),
  ])
  return [
    { name: 'Noto Sans Thai', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Noto Sans Thai', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

export async function renderPublicCourseShareImage(course: PublicCourse): Promise<ImageResponse> {
  const { lessonCount, checkpointCount } = courseStepCounts(course.structure)
  const isThai = course.locale === 'th'
  const summary = isThai
    ? `${lessonCount} บท · ${checkpointCount} ด่านบังคับ`
    : `${lessonCount} lessons · ${checkpointCount} required checkpoints`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          ...(isThai ? { justifyContent: 'space-between' } : { position: 'relative' }),
          boxSizing: 'border-box',
          background: BG,
          padding: 72,
          fontFamily: 'Noto Sans Thai',
          backgroundImage: `radial-gradient(1000px 460px at 30% -10%, rgba(56,189,248,0.28), rgba(56,189,248,0) 70%)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            ...(isThai ? {} : { position: 'absolute', top: 72, left: 72 }),
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 5, background: FILL, display: 'flex' }} />
          <div style={{ display: 'flex', color: '#93B4C6', fontSize: 26, letterSpacing: 2 }}>CYBERSKILLS ACADEMY</div>
        </div>

        <div
          style={{
            display: 'flex',
            ...(isThai ? {} : { position: 'absolute', top: 210, left: 72, right: 72 }),
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#F2F7FA',
              fontSize: isThai ? 56 : 68,
              lineHeight: 1.15,
              fontWeight: 700,
              maxWidth: 1056,
            }}
          >
            {course.copy.title}
          </div>
          <div
            style={{
              display: 'flex',
              color: '#A9C3D2',
              fontSize: isThai ? 28 : 30,
              lineHeight: 1.4,
              marginTop: 22,
              maxWidth: 940,
            }}
          >
            {course.copy.subtitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            ...(isThai ? {} : { position: 'absolute', bottom: 72, left: 72 }),
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              background: FILL,
              color: INK,
              fontSize: isThai ? 22 : 24,
              fontWeight: 700,
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {levelLabels[course.locale][course.structure.level]}
          </div>
          <div style={{ display: 'flex', color: '#93B4C6', fontSize: isThai ? 24 : 26 }}>{summary}</div>
        </div>
      </div>
    ),
    { ...COURSE_SHARE_IMAGE_SIZE, fonts: await shareImageFonts() },
  )
}
