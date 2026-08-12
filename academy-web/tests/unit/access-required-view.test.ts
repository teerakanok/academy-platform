import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccessRequiredView } from '@/components/course/AccessRequiredView'

describe('AccessRequiredView', () => {
  it('renders an honest Thai recovery path without falling back to English', () => {
    const page = renderToStaticMarkup(createElement(AccessRequiredView, {
      courseTitle: 'พื้นฐานระบบปฏิบัติการและ Linux',
      locale: 'th',
      reason: 'not-enrolled',
      slug: 'basic-os-linux',
    }))

    expect(page).toContain('lang="th"')
    expect(page).toContain('คอร์สนี้ยังไม่อยู่ในสิทธิ์การเรียนของคุณ')
    expect(page).toContain('กลับไปที่คอร์สของฉัน')
    expect(page).toContain('ดูคอร์สทั้งหมด')
    expect(page).toContain('/courses?lang=th')
    expect(page).not.toContain('Course access')
  })

  it('keeps a locked learner on the same localized course roadmap', () => {
    const page = renderToStaticMarkup(createElement(AccessRequiredView, {
      courseTitle: 'Basic OS & Linux',
      locale: 'en',
      reason: 'locked',
      slug: 'basic-os-linux',
    }))

    expect(page).toContain('This lesson is not unlocked yet')
    expect(page).toContain('/courses/basic-os-linux/learn?lang=en')
  })
})
