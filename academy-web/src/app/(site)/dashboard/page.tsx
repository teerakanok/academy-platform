import * as React from 'react'
import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import { CourseDashboard } from '@/components/course/CourseDashboard'
import { internalSurfacesEnabled } from '@/lib/internal-surface'

export const metadata: Metadata = privatePage('My learning')

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseDashboard
        showInternalSurfaces={internalSurfacesEnabled()}
      />
    </div>
  )
}
