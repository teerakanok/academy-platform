'use client'

import type { PbqField, PbqItem } from '@/lib/content/types'
import { isGradableField } from '@/lib/player/scoring'
import type { PbqFieldAnswer } from '@/lib/player/scoring'

// PBQ card — grade ได้ทุก kind ใน fixture: checks / select / order
// order ต้องมีปุ่มเลื่อนขึ้น/ลง (keyboard ได้) ไม่ใช่ drag อย่างเดียว (แผน §4-M2-2)
// kind นอก fixture (เช่น text) → banner "ยังไม่รองรับ" — ใช้กับ kind นอก fixture เท่านั้น

export function PbqCard({
  item,
  answers,
  onFieldChange,
  disabled = false,
  reveal = false,
  fieldResults,
}: {
  item: PbqItem
  answers: Record<string, PbqFieldAnswer>
  onFieldChange?: (fieldId: string, answer: PbqFieldAnswer) => void
  disabled?: boolean
  reveal?: boolean
  fieldResults?: Record<string, boolean>
}) {
  return (
    <div data-testid={`pbq-${item.id}`} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cs-muted">
        <span className="rounded border border-cs-border px-2 py-0.5">{item.id}</span>
        <span>Objective {item.objective}</span>
        <span className="text-cs-accent">PBQ — ให้คะแนนต่อช่อง</span>
      </div>
      <h3 className="font-display text-lg font-semibold text-cs-text">{item.title}</h3>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.scenario}</p>

      {item.exhibit && item.exhibit.length > 0 && (
        <div data-testid={`pbq-exhibit-${item.id}`} className="rounded-lg border border-cs-border bg-cs-bg p-4">
          <p className="font-mono text-xs text-cs-accent mb-2">EXHIBIT</p>
          <ul className="space-y-1 font-mono text-xs text-cs-body leading-relaxed">
            {item.exhibit.map((line, i) => (
              <li key={i} className="border-l-2 border-cs-border pl-3">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {item.fields.map((field) => (
          <PbqFieldControl
            key={field.id}
            pbqId={item.id}
            field={field}
            answer={answers[field.id]}
            onChange={onFieldChange ? (a) => onFieldChange(field.id, a) : undefined}
            disabled={disabled}
            reveal={reveal}
            result={fieldResults?.[field.id]}
          />
        ))}
      </div>
    </div>
  )
}

function PbqFieldControl({
  pbqId,
  field,
  answer,
  onChange,
  disabled,
  reveal,
  result,
}: {
  pbqId: string
  field: PbqField
  answer: PbqFieldAnswer
  onChange?: (answer: PbqFieldAnswer) => void
  disabled: boolean
  reveal: boolean
  result?: boolean
}) {
  if (!isGradableField(field)) {
    return (
      <div
        data-testid={`pbq-field-unsupported-${pbqId}-${field.id}`}
        className="rounded-lg border border-cs-amber/40 bg-cs-amber/10 px-4 py-3 text-sm text-cs-amber"
      >
        ช่อง &ldquo;{field.label}&rdquo; (ชนิด {field.kind}) ยังไม่รองรับใน player รุ่นนี้
      </div>
    )
  }

  const badge =
    reveal && result !== undefined ? (
      <span
        data-testid={`pbq-field-result-${pbqId}-${field.id}`}
        className={`ml-2 rounded px-2 py-0.5 font-mono text-xs ${result ? 'bg-cs-accent-dim text-cs-accent' : 'bg-cs-amber/15 text-cs-amber'}`}
      >
        {result ? 'ถูก' : 'ผิด'}
      </span>
    ) : null

  return (
    <fieldset disabled={disabled} data-testid={`pbq-field-${pbqId}-${field.id}`}>
      <legend className="mb-2 text-sm font-medium text-cs-text">
        {field.label}
        {badge}
      </legend>
      {field.kind === 'checks' && (
        <ChecksControl field={field} answer={answer} onChange={onChange} />
      )}
      {field.kind === 'select' && (
        <SelectControl pbqId={pbqId} field={field} answer={answer} onChange={onChange} />
      )}
      {field.kind === 'order' && (
        <OrderControl field={field} answer={answer} onChange={onChange} disabled={disabled} />
      )}
      {reveal && (
        <div className="mt-2 rounded border border-cs-border bg-cs-surface-2 px-3 py-2 text-xs leading-relaxed">
          <p className="font-mono text-cs-accent">
            เฉลย: {Array.isArray(field.correct) ? field.correct.join(field.kind === 'order' ? ' → ' : ', ') : field.correct}
          </p>
          {field.explanation && <p className="mt-1">{field.explanation}</p>}
        </div>
      )}
    </fieldset>
  )
}

function ChecksControl({
  field,
  answer,
  onChange,
}: {
  field: PbqField
  answer: PbqFieldAnswer
  onChange?: (answer: PbqFieldAnswer) => void
}) {
  const selected = new Set(Array.isArray(answer) ? answer : [])
  return (
    <div className="space-y-1.5">
      {(field.options ?? []).map((option) => (
        <label
          key={option}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-cs-surface px-3 py-2 text-sm transition-colors ${selected.has(option) ? 'border-cs-accent bg-cs-accent-dim' : 'border-cs-border hover:border-cs-border-2'}`}
        >
          <input
            type="checkbox"
            checked={selected.has(option)}
            onChange={() => {
              if (!onChange) return
              const next = new Set(selected)
              if (next.has(option)) next.delete(option)
              else next.add(option)
              onChange([...next])
            }}
            className="mt-0.5 h-4 w-4 accent-cs-accent"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  )
}

function SelectControl({
  pbqId,
  field,
  answer,
  onChange,
}: {
  pbqId: string
  field: PbqField
  answer: PbqFieldAnswer
  onChange?: (answer: PbqFieldAnswer) => void
}) {
  const id = `pbq-select-${pbqId}-${field.id}`
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {field.label}
      </label>
      <select
        id={id}
        value={typeof answer === 'string' ? answer : ''}
        onChange={(e) => onChange?.(e.target.value || undefined)}
        className="w-full rounded-lg border border-cs-border bg-cs-surface px-3 py-2 text-sm text-cs-text focus:border-cs-accent focus:outline-none"
      >
        <option value="">— เลือกคำตอบ —</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

function OrderControl({
  field,
  answer,
  onChange,
  disabled,
}: {
  field: PbqField
  answer: PbqFieldAnswer
  onChange?: (answer: PbqFieldAnswer) => void
  disabled: boolean
}) {
  // ลำดับปัจจุบัน: ใช้คำตอบถ้ามี ไม่งั้นเริ่มจากลำดับ options ตามไฟล์
  const current = Array.isArray(answer) && answer.length > 0 ? answer : (field.options ?? [])
  const untouched = !Array.isArray(answer) || answer.length === 0

  function move(index: number, delta: -1 | 1) {
    if (!onChange) return
    const next = [...current]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <>
      {untouched && !disabled && (
        <p className="mb-1.5 text-xs text-cs-muted">
          ใช้ปุ่ม ↑/↓ จัดลำดับ — ลำดับจะถูกบันทึกเป็นคำตอบเมื่อปรับอย่างน้อยหนึ่งครั้ง
        </p>
      )}
      <ol className="space-y-1.5" aria-label={`จัดลำดับ: ${field.label}`}>
      {current.map((option, index) => (
        <li
          key={option}
          className="flex items-center gap-2 rounded-lg border border-cs-border bg-cs-surface px-3 py-2 text-sm"
        >
          <span className="font-mono text-xs text-cs-muted w-5">{index + 1}.</span>
          <span className="flex-1">{option}</span>
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => move(index, -1)}
            aria-label={`เลื่อน "${option}" ขึ้น`}
            className="rounded border border-cs-border px-2 py-1 font-mono text-xs text-cs-body hover:border-cs-accent hover:text-cs-accent disabled:opacity-30 disabled:hover:border-cs-border disabled:hover:text-cs-body"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={disabled || index === current.length - 1}
            onClick={() => move(index, 1)}
            aria-label={`เลื่อน "${option}" ลง`}
            className="rounded border border-cs-border px-2 py-1 font-mono text-xs text-cs-body hover:border-cs-accent hover:text-cs-accent disabled:opacity-30 disabled:hover:border-cs-border disabled:hover:text-cs-body"
          >
            ↓
          </button>
        </li>
      ))}
      </ol>
    </>
  )
}
