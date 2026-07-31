'use client'

import { useState } from 'react'
import type { FullLengthTest } from '@/lib/content/types'
import type { ExamAnswers, ExamScore, GroupScore } from '@/lib/player/scoring'
import { McqCard } from './McqCard'
import { PbqCard } from './PbqCard'

// Results screen ตาม scoring spec §4-M2-3 + ปุ่ม review ข้อผิด (§4-M2-4)
// โครง data = primitive ของ assessment/personalized path ใน M3+

function GroupTable({ title, groups, testIdPrefix }: { title: string; groups: GroupScore[]; testIdPrefix: string }) {
  if (groups.length === 0) return null
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-cs-text mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono text-cs-muted border-b border-cs-border">
              <th className="py-1.5 pr-3 font-medium">กลุ่ม</th>
              <th className="py-1.5 pr-3 font-medium text-right">หน่วยที่ถูก</th>
              <th className="py-1.5 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} data-testid={`${testIdPrefix}-${g.key}`} className="border-b border-cs-border/50">
                <td className="py-1.5 pr-3">{g.label}</td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {g.correctUnits}/{g.totalUnits}
                </td>
                <td className="py-1.5 text-right font-mono">{g.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ResultsScreen({
  test,
  score,
  answers,
  onRetake,
}: {
  test: Pick<FullLengthTest, 'title' | 'questions' | 'pbqs'>
  score: ExamScore
  answers: ExamAnswers
  onRetake: () => void
}) {
  const [reviewing, setReviewing] = useState(false)

  const wrongMcqs = test.questions.filter((q) => !score.mcqResults[q.id])
  const pbqsWithWrongFields = test.pbqs.filter((p) =>
    Object.values(score.pbqResults[p.id] ?? {}).some((ok) => !ok),
  )

  if (reviewing) {
    return (
      <div className="space-y-8" data-testid="review-screen">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-cs-text">ทบทวนข้อที่ผิด</h2>
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="rounded-lg border border-cs-border px-4 py-2 text-sm hover:border-cs-accent hover:text-cs-accent"
          >
            ← กลับหน้าผลคะแนน
          </button>
        </div>
        {wrongMcqs.length === 0 && pbqsWithWrongFields.length === 0 && (
          <p className="text-cs-body">ไม่มีข้อผิด — ทำถูกทุกหน่วย 🎉</p>
        )}
        {wrongMcqs.map((q) => (
          <div key={q.id} className="rounded-lg border border-cs-border bg-cs-surface/50 p-5">
            <McqCard item={q} answer={answers.mcq[q.id]} disabled reveal />
          </div>
        ))}
        {pbqsWithWrongFields.map((p) => (
          <div key={p.id} className="rounded-lg border border-cs-border bg-cs-surface/50 p-5">
            <PbqCard
              item={p}
              answers={answers.pbq[p.id] ?? {}}
              disabled
              reveal
              fieldResults={score.pbqResults[p.id]}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8" data-testid="results-screen">
      <div>
        <p className="font-mono text-sm text-cs-accent mb-1">ผลการทำแบบทดสอบ</p>
        <h2 className="font-display text-2xl font-bold text-cs-text">{test.title}</h2>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="font-display text-5xl font-bold text-cs-text" data-testid="score-percent">
          {score.percent}%
        </p>
        <p className="font-mono text-sm text-cs-muted" data-testid="score-units">
          {score.correctUnits}/{score.totalUnits} หน่วย (MCQ ข้อละ 1 · PBQ ช่องละ 1)
        </p>
      </div>

      <div data-testid="weakest-domain" className="rounded-lg border border-cs-border bg-cs-surface p-4 text-sm">
        <p className="font-mono text-xs text-cs-muted mb-1">จุดที่ควรโฟกัสก่อน</p>
        {score.weakestModules === null ? (
          <p className="text-cs-body">ข้อมูลไม่พอสำหรับสรุปจุดอ่อน (ต้องมีอย่างน้อย 3 หน่วยต่อกลุ่ม)</p>
        ) : (
          <p className="text-cs-text">
            {score.weakestModules.map((g) => `${g.label} (${g.percent}%)`).join(' · ')}
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <GroupTable title="คะแนนตาม Module (เฉพาะ MCQ — PBQ แยกกลุ่มด้านล่าง)" groups={score.moduleBreakdown} testIdPrefix="module-score" />
        <GroupTable title="คะแนนตาม Objective" groups={score.objectiveBreakdown} testIdPrefix="objective-score" />
      </div>

      {score.pbqGroup && (
        <GroupTable title="กลุ่ม PBQ (ให้คะแนนต่อช่อง — ไม่รวมใน module breakdown)" groups={[score.pbqGroup]} testIdPrefix="group" />
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          data-testid="review-wrong-button"
          onClick={() => setReviewing(true)}
          className="rounded-lg bg-cs-accent px-5 py-2.5 text-sm font-semibold text-cs-bg hover:opacity-90"
        >
          ทบทวนข้อที่ผิด ({wrongMcqs.length + pbqsWithWrongFields.length})
        </button>
        <button
          type="button"
          data-testid="retake-button"
          onClick={onRetake}
          className="rounded-lg border border-cs-border px-5 py-2.5 text-sm hover:border-cs-accent hover:text-cs-accent"
        >
          ทำใหม่ (attempt ใหม่)
        </button>
      </div>
    </div>
  )
}
