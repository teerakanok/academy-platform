import type { Metadata } from 'next'
import { AcademyPublicProfile } from '@/components/profile/AcademyPublicProfile'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Shared skills profile', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function SharedProfilePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  return <AcademyPublicProfile shareId={shareId} />
}
