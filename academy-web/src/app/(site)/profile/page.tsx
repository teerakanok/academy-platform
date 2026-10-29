import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AcademyProfileSurface } from '@/components/profile/AcademyProfileSurface'
import { AcademyConnectedProfile } from '@/components/profile/AcademyConnectedProfile'
import { currentUser } from '@/lib/auth/session'
import { createCoreHostClient } from '@/lib/profile/core-host-client'
import { privatePage } from '@/lib/seo'

export const metadata: Metadata = privatePage('Skills profile')
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in?next=%2Fprofile')

  const client = createCoreHostClient()
  if (client) {
    try {
      const profile = await client.profile({ issuer: user.account.issuer, subject: user.account.subject })
      return <AcademyConnectedProfile initialProfile={profile} />
    } catch {
      // A missing registration, identity mismatch, or Core outage is unavailable.
    }
  }
  return <AcademyProfileSurface connection={{ status: 'unavailable' }} />
}
