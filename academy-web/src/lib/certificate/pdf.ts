import 'server-only'

import {
  CERTIFICATE_ACHIEVEMENT_STATEMENT,
  CERTIFICATE_SCOPE_DISCLAIMER,
  CERTIFICATE_TITLE,
} from '@/lib/course/certificate-claim'

/**
 * Deterministic one-page PDF for an issued certificate — no external
 * dependencies (Workers-compatible, no fonts to bundle). The document is a
 * fixed layout of standard-font (Helvetica/Helvetica-Bold) text runs; every
 * string is escaped for the PDF WinAnsi string syntax.
 */
export interface CertificatePdfInput {
  courseTitle: string
  learnerLabel: string
  issuedAtIso: string
  certificateNumber: string
  courseVersion: string
}

const PAGE_WIDTH = 842 // A4 landscape, points
const PAGE_HEIGHT = 595

function pdfEscape(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0x20
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`
    else if (code === 0xa0) out += ' '
    // WinAnsiEncoding covers the Latin-1 upper range (·, é, — as bytes), so keep
    // it; everything beyond folds to '?' rather than risking mojibake.
    else if (code >= 0x20 && code <= 0xff && code !== 0xad) out += ch
    else out += '?'
  }
  return out
}

interface TextRun {
  text: string
  x: number
  y: number
  size: number
  bold?: boolean
  align?: 'center' | 'left'
}

function contentStream(runs: TextRun[]): string {
  const parts: string[] = []
  for (const run of runs) {
    const font = run.bold ? '/F2' : '/F1'
    const escaped = pdfEscape(run.text)
    if (run.align === 'center') {
      // Rough Helvetica centering: average glyph width ~0.5em for mixed text.
      const width = run.text.length * run.size * 0.5
      const x = Math.round((PAGE_WIDTH - width) / 2)
      parts.push(`BT ${font} ${run.size} Tf 1 0 0 1 ${x} ${run.y} Tm (${escaped}) Tj ET`)
    } else {
      parts.push(`BT ${font} ${run.size} Tf 1 0 0 1 ${run.x} ${run.y} Tm (${escaped}) Tj ET`)
    }
  }
  return parts.join('\n')
}

function buildPdf(objects: string[]): Buffer {
  const chunks: string[] = []
  const offsets: number[] = []
  chunks.push('%PDF-1.4\n')
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(chunks.join(''), 'latin1'))
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`)
  })
  const xrefStart = Buffer.byteLength(chunks.join(''), 'latin1')
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  chunks.push(xref)
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)
  return Buffer.from(chunks.join(''), 'latin1')
}

export function certificatePdf(input: CertificatePdfInput): Buffer {
  const issued = new Date(input.issuedAtIso)
  const issuedLabel = Number.isNaN(issued.getTime())
    ? input.issuedAtIso
    : issued.toISOString().slice(0, 10)
  const runs: TextRun[] = [
    { text: 'CYBERSKILLS Academy', x: 0, y: PAGE_HEIGHT - 60, size: 14, bold: true, align: 'center' },
    { text: CERTIFICATE_TITLE, x: 0, y: PAGE_HEIGHT - 130, size: 30, bold: true, align: 'center' },
    { text: input.courseTitle, x: 0, y: PAGE_HEIGHT - 180, size: 20, align: 'center' },
    { text: 'This certifies that', x: 0, y: PAGE_HEIGHT - 240, size: 12, align: 'center' },
    { text: input.learnerLabel, x: 0, y: PAGE_HEIGHT - 280, size: 22, bold: true, align: 'center' },
    { text: CERTIFICATE_ACHIEVEMENT_STATEMENT, x: 0, y: PAGE_HEIGHT - 330, size: 12, align: 'center' },
    { text: `Issued ${issuedLabel} · course version ${input.courseVersion}`, x: 0, y: 120, size: 10, align: 'center' },
    { text: `Certificate ${input.certificateNumber}`, x: 0, y: 100, size: 10, align: 'center' },
    { text: CERTIFICATE_SCOPE_DISCLAIMER, x: 0, y: 70, size: 9, align: 'center' },
  ]
  const content = contentStream(runs)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  return buildPdf(objects)
}
