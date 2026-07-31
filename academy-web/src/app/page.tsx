import Link from 'next/link'
import { WaitlistForm } from '@/components/WaitlistForm'
import { getAllCourses } from '@/lib/content/course-source'
import { consentText, CURRENT_CONSENT_VERSION } from '@/lib/consent'

// Landing — Academy ยืนได้ด้วยตัวเอง คนมาถึงหน้านี้โดยไม่เคยรู้จัก CYBERSKILLS ก็ได้
// งานของหน้านี้จึงไม่ใช่การขอ email ก่อน แต่คือให้เขาเริ่มเรียนได้เลย
export default function HomePage() {
  const courses = getAllCourses()
  const consentLabel = consentText(CURRENT_CONSENT_VERSION).trim()

  return (
    <div className="mx-auto max-w-5xl px-6">
      <section className="pt-20 pb-14 sm:pt-28">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-cs-accent">Learn security properly</p>
        <h1 className="mt-4 max-w-3xl font-display text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-cs-text sm:text-6xl">
          Stop relearning what you already know.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-cs-body">
          Every course here is a map, not a queue. Prove what you already have, skip it with a summary in hand, and
          spend your time on the parts that are actually new to you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-cs-accent px-6 py-3 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90"
          >
            Browse courses
          </Link>
          {courses[0] && (
            <Link
              href={`/courses/${courses[0].structure.slug}`}
              className="rounded-xl border border-cs-border px-6 py-3 text-sm font-medium text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
            >
              Start {courses[0].copy.title}
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {[
          {
            title: 'A route you can see',
            body: 'Each course is a map of connected lessons. You always know what is open, what is done, and what is waiting.',
          },
          {
            title: 'Skipping is allowed',
            body: 'Know a topic already? Prove it in a few questions and move on — or take the summary and skip. Your call, every time.',
          },
          {
            title: 'Some gates are real',
            body: 'A few checkpoints have to be earned. Those are the ones that make the rest of your map mean something.',
          },
        ].map((item) => (
          <div key={item.title} className="card p-6">
            <h2 className="font-display text-base font-semibold text-cs-text">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cs-body">{item.body}</p>
          </div>
        ))}
      </section>

      {courses.length > 0 && (
        <section className="pb-16" aria-labelledby="catalog-heading">
          <h2 id="catalog-heading" className="mb-5 font-display text-2xl font-semibold text-cs-text">
            Available now
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.structure.slug}>
                <Link href={`/courses/${course.structure.slug}`} className="card-interactive block h-full p-6">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">
                    {course.structure.level} · {Math.round(course.structure.estimatedMinutes / 60)}h
                  </span>
                  <h3 className="mt-2 font-display text-lg font-semibold text-cs-text">{course.copy.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-cs-body">{course.copy.subtitle}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-24 max-w-2xl" aria-labelledby="waitlist-heading">
        <h2 id="waitlist-heading" className="font-display text-2xl font-semibold text-cs-text">
          Hear when new courses land
        </h2>
        <p className="mt-2 mb-6 text-cs-body">
          We release one course at a time. Leave your email and we will tell you when the next one opens.
        </p>
        <WaitlistForm consentSummary={consentLabel} />
      </section>
    </div>
  )
}
