import Link from 'next/link'
import { getAllCourses } from '@/lib/content/course-source'
import { CourseCover } from '@/components/course/CourseCover'
import { publicPage } from '@/lib/seo'

// หน้าร้านสาธารณะ — แยกจาก /dashboard ("My learning") โดยตั้งใจ
//
// decision 2026-08-01: ต้องสมัครถ้าจะใช้ · ช่องทางเข้าถึงลูกค้าคือ SEO + โซเชียล
// สองข้อนี้อยู่ด้วยกันได้ก็ต่อเมื่อมีหน้าที่ "ค้นเจอและแชร์ได้" ซึ่งมีสาระจริงพอที่
// คนอ่านแล้วอยากสมัคร — หน้าที่มีแต่ชื่อคอร์สกับปุ่ม Sign up ไม่ติดอันดับอะไรเลย
// และผู้ช่วย AI ก็ไม่มีอะไรให้หยิบไปตอบ

export const metadata = publicPage({
  path: '/courses',
  title: 'Courses',
  description:
    'Cybersecurity courses you take at your own pace. Prove what you already know and skip it, and keep a map of what you have earned.',
})

export default function CoursesPage() {
  const courses = getAllCourses()

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="hero-bleed pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">CYBERSKILLS Academy</p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-cs-text text-balance">
          Courses
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-cs-body">
          Each course is a map you can take your own route through. Prove a lesson and move on. Skip one and it
          stays open until you come back for it.
        </p>
      </header>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2">
        {courses.map((course) => (
          // min-w-0: grid item มี min-width:auto เป็นค่าตั้งต้น จึงหดต่ำกว่าขนาด
          // เนื้อหาของตัวเองไม่ได้ — SVG ในปกมีขนาดในตัว การ์ดเลยกว้างเกินจอมือถือ
          <li key={course.structure.slug} className="min-w-0">
            <Link
              href={`/courses/${course.structure.slug}`}
              data-testid={`catalogue-card-${course.structure.slug}`}
              className="card-feature card-interactive block h-full overflow-hidden"
            >
              <CourseCover structure={course.structure} />
              <div className="p-6">
                <p className="font-mono text-[11px] uppercase tracking-wide text-cs-muted">
                  {course.structure.level} · {course.structure.nodes.length} lessons
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold text-cs-text">{course.copy.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-cs-body">{course.copy.subtitle}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-cs-muted">
        Course pages are open to everyone. Taking a course needs a free CYBERSKILLS account, which works across
        everything we run.
      </p>
    </div>
  )
}
