import * as React from 'react'
import Link from 'next/link'
import { CourseCover } from './CourseCover'
import { PublicCourseLocaleLink } from './PublicCourseLocaleLink'
import type { Locale, PublicCourseCopy, PublicCourseStructure } from '@/lib/content/course-types'

type SyllabusLabels = {
  level: Record<PublicCourseStructure['level'], string>
  language: string
  languageName: Record<Locale, string>
  viewInLanguage: (language: string) => string
  preview: string
  outcomes: string
  beforeJoin: string
  roadmap: string
  roadmapIntro: string
  lesson: string
  requiredCheckpoint: string
  buildsOn: string
  englishLesson: string
  accountHeading: string
  accountBody: string
  browse: string
  learningSteps: (steps: number, checkpoints: number) => string
  availability: (translatedSteps: number, totalSteps: number) => string
}

const SYLLABUS_LABELS: Record<Locale, SyllabusLabels> = {
  en: {
    level: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
    language: 'Course language',
    languageName: { en: 'English', th: 'Thai' },
    viewInLanguage: (language) => `View this syllabus in ${language}`,
    preview: 'Course preview',
    outcomes: 'What you will be able to do',
    beforeJoin: 'Before you join',
    roadmap: 'Course roadmap',
    roadmapIntro: 'This is the full learning route. Lessons build on earlier work; required checkpoints are the points where the route asks you to demonstrate it.',
    lesson: 'Lesson',
    requiredCheckpoint: 'Required checkpoint',
    buildsOn: 'Builds on',
    englishLesson: 'English lesson',
    accountHeading: 'Learn with an account when access opens',
    accountBody: 'Your CYBERSKILLS account will keep progress and checkpoint results together. Until then, this syllabus is here to help you choose the route that fits your goal.',
    browse: 'Browse course previews',
    learningSteps: (steps, checkpoints) => `${steps} learning steps · ${checkpoints} required checkpoint${checkpoints === 1 ? '' : 's'}`,
    availability: (translatedSteps, totalSteps) =>
      translatedSteps === totalSteps
        ? 'English is available for every learning step.'
        : `English is available for every learning step. Thai is available for ${translatedSteps} of ${totalSteps} learning steps.`,
  },
  th: {
    level: { beginner: 'เริ่มต้น', intermediate: 'ระดับกลาง', advanced: 'ระดับสูง' },
    language: 'ภาษาของคอร์ส',
    languageName: { en: 'อังกฤษ', th: 'ไทย' },
    viewInLanguage: (language) => `ดูแผนการเรียนนี้เป็นภาษา${language}`,
    preview: 'ตัวอย่างโครงสร้างคอร์ส',
    outcomes: 'เมื่อจบคอร์ส คุณจะทำอะไรได้บ้าง',
    beforeJoin: 'ก่อนเริ่มเรียน',
    roadmap: 'แผนการเรียน',
    roadmapIntro: 'นี่คือเส้นทางการเรียนทั้งหมด แต่ละบทต่อยอดจากบทก่อนหน้า และด่านบังคับคือจุดที่คุณได้แสดงสิ่งที่ทำได้จริง.',
    lesson: 'บทเรียน',
    requiredCheckpoint: 'ด่านบังคับ',
    buildsOn: 'ต่อยอดจาก',
    englishLesson: 'เนื้อหาภาษาอังกฤษ',
    accountHeading: 'เริ่มเรียนด้วยบัญชี CYBERSKILLS เมื่อเปิดให้ใช้งาน',
    accountBody: 'บัญชี CYBERSKILLS จะเก็บความก้าวหน้าและผลจากด่านบังคับไว้ด้วยกัน ระหว่างนี้ คุณใช้แผนการเรียนนี้เลือกเส้นทางที่ตรงกับเป้าหมายได้.',
    browse: 'ดูตัวอย่างคอร์สทั้งหมด',
    learningSteps: (steps, checkpoints) => `${steps} ขั้นการเรียน · ${checkpoints} ด่านบังคับ`,
    availability: (translatedSteps, totalSteps) =>
      translatedSteps === totalSteps
        ? 'ภาษาไทยพร้อมสำหรับทุกขั้นการเรียน.'
        : `ภาษาไทยพร้อมสำหรับ ${translatedSteps} จาก ${totalSteps} ขั้นการเรียน ส่วนที่เหลือเปิดเป็นภาษาอังกฤษ.`,
  },
}

function durationLabel(minutes: number, locale: Locale): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (locale === 'th') {
    if (!hours) return `${remainingMinutes} นาที`
    if (!remainingMinutes) return `${hours} ชม.`
    return `${hours} ชม. ${remainingMinutes} นาที`
  }
  if (!hours) return `${remainingMinutes} min`
  if (!remainingMinutes) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

export function PublicCourseSyllabus({
  structure,
  copy,
  locale,
  translatedNodeIds,
}: {
  structure: PublicCourseStructure
  copy: PublicCourseCopy
  locale: Locale
  translatedNodeIds: string[]
}) {
  const translated = new Set(translatedNodeIds)
  const labels = SYLLABUS_LABELS[locale]
  const checkpointCount = structure.nodes.filter((node) => node.kind === 'capstone').length

  return (
    <div className="space-y-14" lang={locale}>
      <header className="hero-bleed grid gap-8 pt-6 pb-2 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-cs-accent-fill px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-on-accent">
              {labels.level[structure.level]}
            </span>
            <span className="font-mono text-[11px] text-cs-muted">
              {durationLabel(structure.estimatedMinutes, locale)} · {labels.learningSteps(structure.nodes.length, checkpointCount)}
            </span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.08] text-cs-text sm:text-5xl">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-cs-body">{copy.subtitle}</p>
          <p className="mt-3 max-w-2xl text-sm text-cs-muted">{copy.audience}</p>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label={labels.language}>
            {structure.availableLocales.map((code) => (
              <PublicCourseLocaleLink
                key={code}
                slug={structure.slug}
                locale={code}
                aria-current={code === locale ? 'true' : undefined}
                aria-label={labels.viewInLanguage(labels.languageName[code])}
                className={`rounded-control px-3 py-1.5 font-mono text-xs uppercase transition-colors ${
                  code === locale
                    ? 'bg-cs-accent-fill text-cs-on-accent'
                    : 'border border-cs-border text-cs-muted hover:border-cs-accent hover:text-cs-accent'
                }`}
              >
                {labels.languageName[code]}
              </PublicCourseLocaleLink>
            ))}
          </nav>
        </div>
        <CourseCover structure={structure} className="aspect-[4/3] w-full border border-cs-border md:aspect-square" />
      </header>

      <section aria-labelledby="outcomes-heading">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">{labels.preview}</p>
        <h2 id="outcomes-heading" className="mt-2 font-display text-2xl font-semibold text-cs-text">
          {labels.outcomes}
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {copy.outcomes.map((outcome) => (
            <li key={outcome} className="border-l-2 border-cs-accent px-4 py-1 text-sm leading-relaxed text-cs-body">
              {outcome}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="roadmap-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">{labels.beforeJoin}</p>
            <h2 id="roadmap-heading" className="mt-2 font-display text-2xl font-semibold text-cs-text">
              {labels.roadmap}
            </h2>
          </div>
          <p className="max-w-xs text-sm text-cs-muted">{labels.availability(translated.size, structure.nodes.length)}</p>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cs-body">
          {labels.roadmapIntro}
        </p>
        <ol className="mt-7 divide-y divide-cs-border border-y border-cs-border" data-testid="public-course-syllabus">
          {structure.nodes.map((node, index) => {
            const prerequisites = node.prerequisites.map((id) => copy.nodeTitles[id] ?? id)
            const isTranslated = translated.has(node.id)
            return (
              <li key={node.id} className="grid gap-3 py-5 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-start">
                <span className="font-mono text-sm text-cs-accent">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-cs-text">{copy.nodeTitles[node.id] ?? node.id}</h3>
                  <p className="mt-1 text-sm text-cs-body">
                    {node.kind === 'capstone' ? labels.requiredCheckpoint : labels.lesson} · {durationLabel(node.estimatedMinutes, locale)}
                  </p>
                  {prerequisites.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-cs-muted">{labels.buildsOn}: {prerequisites.join(' · ')}</p>
                  )}
                </div>
                {!isTranslated && (
                  <span className="font-mono text-[11px] uppercase tracking-wide text-cs-muted">{labels.englishLesson}</span>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="border-l-2 border-cs-accent px-5 py-1" aria-labelledby="access-heading">
        <h2 id="access-heading" className="font-display text-xl font-semibold text-cs-text">
          {labels.accountHeading}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-body">
          {labels.accountBody}
        </p>
        <Link
          href={`/courses?lang=${locale}`}
          className="mt-5 inline-flex rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent transition-transform hover:-translate-y-0.5"
        >
          {labels.browse}
        </Link>
      </section>
    </div>
  )
}
