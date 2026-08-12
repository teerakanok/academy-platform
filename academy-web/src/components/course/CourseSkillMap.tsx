import * as React from 'react'
import type { Locale } from '@/lib/content/course-types'
import type { SkillDatum } from '@/lib/course/skills'
import { RadarChart, type RadarCopy } from './RadarChart'

export type CourseSkillMapCopy = {
  title: string
  description: string
  loading: string
  unavailable: string
  retry: string
  radar: RadarCopy
}

export function courseSkillMapCopy(locale: Locale): CourseSkillMapCopy {
  if (locale === 'th') {
    return {
      title: 'ความครอบคลุมของการเรียนตามหัวข้อ',
      description: 'แผนที่นี้แสดงบทที่คุณเรียนจบแล้ว ไม่ใช่คะแนน การประเมิน หรือการวัดระดับความสามารถ บทที่ข้ามจะไม่เพิ่มความครอบคลุม',
      loading: 'กำลังโหลดแผนที่หัวข้อที่เรียน',
      unavailable: 'ยังโหลดแผนที่หัวข้อที่เรียนไม่ได้ บันทึกการเรียนของคุณยังไม่เปลี่ยนแปลง',
      retry: 'ลองอีกครั้ง',
      radar: {
        notStarted: 'ยังไม่เริ่ม',
        emptyMarker: 'เริ่มที่นี่',
        numericValues: 'ค่าตัวเลข',
        nothingYet: 'ยังไม่มีข้อมูลที่บันทึกไว้ เรียนจบบทหนึ่งแล้วแผนที่จะเริ่มแสดงผล นี่คือแผนที่เพื่อวางแผนการเรียนต่อ ไม่ใช่คะแนน',
        someNotStarted: (count) => `ยังไม่ได้เริ่ม ${count} หัวข้อ นี่คือแผนที่เพื่อวางแผนการเรียนต่อ ไม่ใช่คะแนน`,
      },
    }
  }

  return {
    title: 'Learning coverage by course topic',
    description: 'This maps lessons you have finished. It is not a score, assessment, or measure of proficiency. Skipped lessons do not add coverage.',
    loading: 'Loading your learning coverage map',
    unavailable: 'We could not load your learning coverage map. Your learning record is unchanged.',
    retry: 'Try again',
    radar: {
      notStarted: 'not started',
      emptyMarker: 'you start here',
      numericValues: 'numeric values',
      nothingYet: 'Nothing recorded yet. Finish a lesson and this fills in — it is a map of where to go next, not a score.',
      someNotStarted: (count) =>
        `${count} ${count === 1 ? 'area has' : 'areas have'} nothing recorded yet — that is a map of where to go next, not a score.`,
    },
  }
}

export function CourseSkillMap({ coverage, locale }: { coverage: SkillDatum[]; locale: Locale }) {
  const copy = courseSkillMapCopy(locale)
  return (
    <section className="card-feature p-6 sm:p-7" aria-labelledby="course-skill-map-heading" data-testid="course-skill-map">
      <h2 id="course-skill-map-heading" className="sr-only">
        {copy.title}
      </h2>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-cs-body">
        {copy.description}
      </p>
      <RadarChart data={coverage} title={copy.title} testId="course-radar" copy={copy.radar} />
    </section>
  )
}
