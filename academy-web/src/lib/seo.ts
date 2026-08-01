import type { Metadata } from 'next'

// นโยบายว่าหน้าไหนให้ค้นเจอได้ — รวมไว้ที่เดียว
//
// บริบท (founder 2026-08-01): ช่องทางเข้าถึงลูกค้าคือ Google SEO · AI SEO ·
// Facebook / X / LinkedIn — ทั้งหมดอ่านจากหน้าเว็บสาธารณะ ไม่มีช่องทางไหนเห็น
// หน้าที่ต้อง login
//
// ซึ่งชนกับอีก decision ที่เคาะพร้อมกันว่า "ต้องสมัครถ้าจะใช้" โดยตรง ทางออกคือ
// แบ่งพื้นผิวให้ชัด:
//   สาธารณะ = หน้าร้าน (landing, รายการคอร์ส, หน้าแนะนำคอร์ส) — สิ่งที่ทำให้คน
//             อยากสมัคร ต้นทุนส่วนเพิ่มเกือบศูนย์ และเป็นสิ่งเดียวที่ค้นเจอ/แชร์ได้
//   ต้องมี account = ตัวบทเรียน quiz lab progress — สิ่งที่คนมา "ใช้"
//
// ค่าตั้งต้นคือ fail-closed: ทุกหน้า noindex จนกว่าจะประกาศเป็นสาธารณะอย่างตั้งใจ
// และแม้ประกาศแล้วก็ยัง noindex อยู่ดีจนกว่าจะเปิดสวิตช์ตอน launch — หน้าเว็บที่ยัง
// ไม่พร้อมแล้วถูก index ไว้ ลบออกจากผลค้นหาย้อนหลังยากกว่าที่คิด

const FALLBACK_ORIGIN = 'https://academy.cyberskills.co.th'

export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return FALLBACK_ORIGIN
  return raw.replace(/\/+$/, '')
}

/** เปิดให้ search engine เก็บ index ได้แล้วหรือยัง — ตั้งใจให้ปิดเป็นค่าตั้งต้น */
export function searchIndexingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SEARCH_INDEXING === 'on'
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}

/** หน้าที่ต้องมี account ถึงจะใช้ได้ — ไม่มีเหตุผลให้ค้นเจอ และไม่ควรให้ค้นเจอ */
export function privatePage(title?: string): Metadata {
  return {
    ...(title ? { title } : {}),
    robots: { index: false, follow: false },
  }
}

/**
 * หน้าร้านที่ตั้งใจให้ค้นเจอและแชร์ได้
 *
 * canonical สำคัญเป็นพิเศษเพราะเนื้อหาคอร์สอาจอยู่ทั้งบนเว็บหลักและบน Academy —
 * การมีสองที่ไม่ผิด แต่ต้องบอก search engine ว่าฉบับไหนคือฉบับจริง
 */
export function publicPage({
  path,
  title,
  description,
  imagePath,
}: {
  path: string
  title: string
  description: string
  imagePath?: string
}): Metadata {
  const url = absoluteUrl(path)
  const indexable = searchIndexingEnabled()
  const images = imagePath ? [{ url: absoluteUrl(imagePath) }] : undefined
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'CYBERSKILLS Academy',
      url,
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  }
}
