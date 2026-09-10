import { describe, expect, it } from 'vitest'

import {
  CERTIFICATE_ACHIEVEMENT_STATEMENT,
  CERTIFICATE_SCOPE_DISCLAIMER,
  CERTIFICATE_TITLE,
} from '@/lib/course/certificate-claim'
import { certificatePdf } from '@/lib/certificate/pdf'

const latin1 = (buffer: Buffer) => buffer.toString('latin1')

describe('certificatePdf', () => {
  const pdf = certificatePdf({
    courseTitle: 'ICCS227 · Operating Systems',
    learnerLabel: 'dev.test-1@cyberskills.co.th',
    issuedAtIso: '2026-09-10T12:00:00.000Z',
    certificateNumber: 'a'.repeat(32),
    courseVersion: '1.0.0',
  })
  const text = latin1(pdf)

  it('produces a structurally valid one-page PDF', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    // Exactly the six declared objects, xref with byte-accurate offsets.
    const objects = text.match(/\d+ 0 obj/g) ?? []
    expect(objects).toHaveLength(6)
    const xrefStart = Number(text.match(/startxref\n(\d+)\n/)?.[1] ?? NaN)
    expect(text.slice(xrefStart, xrefStart + 4)).toBe('xref')
    for (const line of text.match(/\n(\d{10}) 00000 n /g) ?? []) {
      const offset = Number(line.trim().split(' ')[0])
      expect(Number.isInteger(offset)).toBe(true)
      expect(text.slice(offset).match(/^\d+ 0 obj\n/)).not.toBeNull()
    }
  })

  it('carries the canonical claim text, learner, course, and number', () => {
    expect(text).toContain(`(${CERTIFICATE_TITLE}) Tj`)
    expect(text).toContain('(ICCS227 · Operating Systems) Tj')
    expect(text).toContain('(dev.test-1@cyberskills.co.th) Tj')
    expect(text).toContain(`(${CERTIFICATE_ACHIEVEMENT_STATEMENT}) Tj`)
    expect(text).toContain(`(${CERTIFICATE_SCOPE_DISCLAIMER}) Tj`)
    expect(text).toContain('(Issued 2026-09-10 · course version 1.0.0) Tj')
    expect(text).toContain(`(Certificate ${'a'.repeat(32)}) Tj`)
  })

  it('escapes PDF string syntax and folds non-latin1 characters', () => {
    const tricky = certificatePdf({
      courseTitle: 'คอร์ส (ทดสอบ) \\ backslash',
      learnerLabel: 'learner@example.com',
      issuedAtIso: '2026-09-10T12:00:00.000Z',
      certificateNumber: '0123456789abcdef0123456789abcdef',
      courseVersion: '1',
    })
    const body = latin1(tricky)
    // Thai folds to '?', parentheses are escaped, backslash doubled.
    // "คอร์ส (ทดสอบ) \ backslash" -> "(????? \(?????\) \\ backslash)"
    expect(body).toContain('(????? \\(?????\\) \\\\ backslash) Tj')
  })

  it('is deterministic for identical input', () => {
    const again = certificatePdf({
      courseTitle: 'ICCS227 · Operating Systems',
      learnerLabel: 'dev.test-1@cyberskills.co.th',
      issuedAtIso: '2026-09-10T12:00:00.000Z',
      certificateNumber: 'a'.repeat(32),
      courseVersion: '1.0.0',
    })
    expect(again.equals(pdf)).toBe(true)
  })
})
