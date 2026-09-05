import * as React from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { privatePage } from '@/lib/seo'
import { CourseDashboard } from '@/components/course/CourseDashboard'
import { internalSurfacesEnabled } from '@/lib/internal-surface'

export const metadata: Metadata = privatePage('My learning')

export default async function DashboardPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in?next=%2Fdashboard')

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseDashboard
        showInternalSurfaces={internalSurfacesEnabled()}
      />
    </div>
  )
}
