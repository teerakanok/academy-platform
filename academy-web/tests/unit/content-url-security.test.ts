import { describe, expect, it } from 'vitest'
import { loadCourseCopySchemaForTest } from '@/lib/content/course-loader'

const unsafeUrls = [
  'javascript:alert(1)',
  'data:text/html,hi',
  'vbscript:x',
  '//evil.test/payload',
] as const

describe('Academy content URL boundary', () => {
  it('rejects executable and protocol-relative content URLs', () => {
    for (const href of unsafeUrls) {
      const image = () => loadCourseCopySchemaForTest({ kind: 'image', src: href, alt: 'Unsafe source' })
      const attachment = () => loadCourseCopySchemaForTest({ kind: 'attachment', title: 'Unsafe', href, fileType: 'other' })
      const externalLink = () => loadCourseCopySchemaForTest({ kind: 'externalLink', title: 'Unsafe', href, sourceLabel: 'Unsafe' })

      expect(image, href).toThrow()
      expect(attachment, href).toThrow()
      expect(externalLink, href).toThrow()
    }
  })

  it('preserves supported same-origin and HTTPS content URLs', () => {
    const image = loadCourseCopySchemaForTest({ kind: 'image', src: '/media/diagrams/sample.svg', alt: 'Diagram' })
    const attachment = loadCourseCopySchemaForTest({
      kind: 'attachment',
      title: 'Handout',
      href: '/media/sample-handout.pdf',
      fileType: 'pdf',
    })
    const externalLink = loadCourseCopySchemaForTest({
      kind: 'externalLink',
      title: 'Documentation',
      href: 'https://example.test/documentation',
      sourceLabel: 'Example',
    })

    expect(image).toMatchObject({ src: '/media/diagrams/sample.svg' })
    expect(attachment).toMatchObject({ href: '/media/sample-handout.pdf' })
    expect(externalLink).toMatchObject({ href: 'https://example.test/documentation' })
  })
})
