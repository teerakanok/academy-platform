// vi.mock ต้องอยู่ก่อน import ตัว module ที่ถูกทดสอบ (vitest hoist ให้เอง)
// เจตนา: พิสูจน์ว่า share/OG image rendering ไม่ยุ่งกับ filesystem เลย —
// workerd ไม่มี filesystem ให้อ่าน .ttf และ production 2026-09-12 เคย 500
// ทั้ง /courses/<slug>/share/* และ opengraph-image เพราะ node:fs.readFile ฟอนต์
vi.mock('node:fs/promises', () => ({
  readFile: () => {
    throw new Error('share-image fonts must not read the filesystem (workerd has none)')
  },
}))

import { describe, expect, it, vi } from 'vitest'
import { renderPublicCourseShareImage } from '@/lib/course-share-image'
import type { PublicCourse } from '@/lib/content/course-types'

function fixtureCourse(locale: 'en' | 'th'): PublicCourse {
  return {
    structure: {
      slug: 'assembly',
      defaultLocale: 'en',
      availableLocales: ['en', 'th'],
      level: 'beginner',
      estimatedMinutes: 180,
      nodes: [
        { id: 'l1', kind: 'lesson', prerequisites: [], estimatedMinutes: 30 },
        { id: 'l2', kind: 'lesson', prerequisites: ['l1'], estimatedMinutes: 45 },
        { id: 'cap', kind: 'capstone', prerequisites: ['l2'], estimatedMinutes: 60 },
      ],
    },
    copy: {
      title: locale === 'th' ? 'ภาษาแอสเซมบลี: อ่านภาษาเครื่อง' : 'Assembly: Reading Machine Code',
      subtitle: locale === 'th' ? 'อ่านโปรแกรมจากไบต์จริง' : 'Read a program from raw bytes',
      audience: 'beginners',
      outcomes: [],
      nodeTitles: {},
    },
    locale,
    translatedNodeIds: [],
  }
}

describe('renderPublicCourseShareImage', () => {
  it('renders a real PNG in-process for the English share card', async () => {
    const image = await renderPublicCourseShareImage(fixtureCourse('en'))
    expect(image.headers.get('content-type')).toBe('image/png')
    const bytes = await image.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(10_000)
    // PNG magic number — ต้องเป็นภาพจริง ไม่ใช่ error page ที่แอบหลุดมา
    expect(new Uint8Array(bytes.slice(0, 4))).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })

  it('renders the Thai share card with the Thai-capable font inlined, no filesystem', async () => {
    const image = await renderPublicCourseShareImage(fixtureCourse('th'))
    const bytes = await image.arrayBuffer()
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(bytes.byteLength).toBeGreaterThan(10_000)
    expect(new Uint8Array(bytes.slice(0, 4))).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })
})
