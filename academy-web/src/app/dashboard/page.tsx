import type { Metadata } from 'next'
import { getAllCourses } from '@/lib/content/course-source'
import { CourseDashboard } from '@/components/course/CourseDashboard'

export const metadata: Metadata = {
  title: 'My learning',
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  const courses = getAllCourses()
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseDashboard
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
