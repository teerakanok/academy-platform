import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import { getAllCourses } from '@/lib/content/course-source'
import { CourseDashboard } from '@/components/course/CourseDashboard'
import { internalSurfacesEnabled } from '@/lib/internal-surface'

export const metadata: Metadata = privatePage('My learning')

export default function DashboardPage() {
  const courses = getAllCourses()
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseDashboard
        showInternalSurfaces={internalSurfacesEnabled()}
        courses={courses.map((course) => ({
          structure: course.structure,
          title: course.copy.title,
          subtitle: course.copy.subtitle,
          level: course.structure.level,
          nodeTitles: course.copy.nodeTitles,
        }))}
      />
    </div>
  )
}
