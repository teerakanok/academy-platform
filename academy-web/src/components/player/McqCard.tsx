'use client'

import type { McqItem } from '@/lib/content/types'
import type { McqAnswer } from '@/lib/player/scoring'

// MCQ card — single = radio semantics, multi = checkbox (all-or-nothing ตอน grade)
// `reveal` = โหมด practice หลังตอบ / หน้า review: โชว์เฉลย + why

export function McqCard({
  item,
  answer,
  onChange,
  disabled = false,
  reveal = false,
}: {
  item: McqItem
  answer: McqAnswer
  onChange?: (answer: string[]) => void
  disabled?: boolean
  reveal?: boolean
}) {
  const selected = new Set(answer ?? [])
  const isMulti = item.type === 'multi'
  const correctSet = new Set(item.correct)

  function toggle(letter: string) {
    if (disabled || !onChange) return
    if (isMulti) {
      const next = new Set(selected)
      if (next.has(letter)) next.delete(letter)
      else next.add(letter)
      onChange([...next].sort())
    } else {
      onChange([letter])
    }
  }

  return (
    <div data-testid={`mcq-${item.id}`} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cs-muted">
        <span className="rounded border border-cs-border px-2 py-0.5">{item.id}</span>
        <span>Objective {item.objective}</span>
        {isMulti && <span className="text-cs-amber">เลือกได้หลายข้อ (ต้องถูกครบชุด)</span>}
      </div>
      <p className="text-cs-text leading-relaxed">{item.stem}</p>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="sr-only">ตัวเลือกของข้อ {item.id}</legend>
        {Object.entries(item.choices).map(([letter, text]) => {
          const isSelected = selected.has(letter)
          const isCorrect = correctSet.has(letter)
          const revealClass = reveal
            ? isCorrect
              ? 'border-cs-accent bg-cs-accent-dim'
              : isSelected
                ? 'border-cs-amber bg-cs-amber/10'
                : 'border-cs-border'
            : isSelected
              ? 'border-cs-accent bg-cs-accent-dim'
              : 'border-cs-border hover:border-cs-border-2'
          return (
            <label
              key={letter}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-cs-surface px-4 py-3 transition-colors ${revealClass} ${disabled ? 'cursor-default' : ''}`}
            >
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`mcq-${item.id}`}
                value={letter}
                checked={isSelected}
                onChange={() => toggle(letter)}
                className="mt-1 h-4 w-4 accent-cs-accent"
              />
              <span className="text-sm leading-relaxed">
                <span className="font-mono text-cs-muted mr-2">{letter}.</span>
                {text}
              </span>
            </label>
          )
        })}
      </fieldset>

      {reveal && (
        <div data-testid={`mcq-explanation-${item.id}`} className="space-y-3 rounded-lg border border-cs-border bg-cs-surface-2 p-4 text-sm leading-relaxed">
          <p className="font-mono text-xs text-cs-accent">
            เฉลย: {item.correct.join(', ')}
          </p>
          {item.explanation && <p>{item.explanation}</p>}
          {item.whyCorrect && Object.keys(item.whyCorrect).length > 0 && (
            <div>
              <p className="text-cs-accent font-medium mb-1">ทำไมคำตอบนี้ถูก:</p>
              <ul className="space-y-1 pl-4 list-disc">
                {Object.entries(item.whyCorrect).map(([letter, why]) => (
                  <li key={letter}>
                    <span className="font-mono">{letter}.</span> {why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.whyWrong && Object.keys(item.whyWrong).length > 0 && (
            <div>
              <p className="text-cs-amber font-medium mb-1">ทำไมตัวเลือกอื่นผิด:</p>
              <ul className="space-y-1 pl-4 list-disc">
                {Object.entries(item.whyWrong).map(([letter, why]) => (
                  <li key={letter}>
                    <span className="font-mono">{letter}.</span> {why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.sources && item.sources.length > 0 && (
            <p className="text-xs text-cs-muted">แหล่งอ้างอิง: {item.sources.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  )
}
