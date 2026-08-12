'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { trapDialogFocus } from '@/components/course/dialog-focus'
import type { Locale } from '@/lib/content/course-types'
import { learnerCourseUi } from '@/lib/i18n/learner-course'
import type { CourseProgressRecord } from '@/lib/course/progress'
import { reconcileCourseReset, resetCourseProgress, type ResetProgressResult } from '@/lib/course/progress-client'

type ResetPhase = 'confirm' | 'submitting' | 'success' | 'unknown' | 'access-lost' | 'completed-unavailable'

export function ResetCourseProgress({
  slug,
  canReset,
  onRecord,
  onInvalidated,
  returnFocusRef,
  locale,
}: {
  slug: string
  canReset: boolean
  onRecord: (record: CourseProgressRecord) => void
  onInvalidated: (reason: 'access-lost' | 'reset-completed-unavailable') => void
  returnFocusRef: RefObject<HTMLElement | null>
  locale: Locale
}) {
  const text = learnerCourseUi(locale).reset
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const restoreToFallbackRef = useRef(false)
  const operationIdRef = useRef<string | null>(null)
  const [phase, setPhase] = useState<ResetPhase>('confirm')
  const [openRequested, setOpenRequested] = useState(false)

  useEffect(() => {
    if (!openRequested) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    if (phase === 'confirm') cancelRef.current?.focus()
    else resultRef.current?.focus()
  }, [openRequested, phase])

  function open() {
    restoreToFallbackRef.current = false
    setPhase('confirm')
    setOpenRequested(true)
  }

  function close() {
    dialogRef.current?.close()
  }

  function finishClosing() {
    setOpenRequested(false)
    const trigger = triggerRef.current
    const destination = !restoreToFallbackRef.current && trigger?.isConnected ? trigger : returnFocusRef.current
    restoreToFallbackRef.current = false
    destination?.focus()
  }

  function closeAfterInvalidation(reason: 'access-lost' | 'reset-completed-unavailable') {
    restoreToFallbackRef.current = true
    close()
    onInvalidated(reason)
    requestAnimationFrame(() => returnFocusRef.current?.focus())
  }

  function applyResult(result: ResetProgressResult) {
    if (result.ok) {
      onRecord(result.record)
      setPhase('success')
      return
    }
    setPhase(result.reason)
  }

  async function submit() {
    const operationId = crypto.randomUUID()
    operationIdRef.current = operationId
    setPhase('submitting')
    applyResult(await resetCourseProgress(slug, operationId))
  }

  async function checkCurrentProgress() {
    const operationId = operationIdRef.current
    if (!operationId) return
    setPhase('submitting')
    applyResult(await reconcileCourseReset(slug, operationId))
  }

  return (
    <>
      {canReset && (
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
          data-testid="reset-course"
          className="rounded-control border border-cs-border bg-cs-surface px-6 py-3 text-sm text-cs-muted transition-colors duration-200 hover:border-cs-amber hover:text-cs-amber"
        >
          {text.trigger}
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="reset-course-title"
        onKeyDown={trapDialogFocus}
        onClose={finishClosing}
        onCancel={(event) => {
          if (phase === 'submitting') event.preventDefault()
        }}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-[6px] border border-cs-border-2 bg-cs-surface p-0 text-cs-text shadow-modal backdrop:bg-black/70"
      >
        <div className="p-6 sm:p-7">
          <h2 id="reset-course-title" className="font-display text-xl font-semibold">
            {phase === 'success' ? text.successTitle : text.title}
          </h2>

          {phase === 'confirm' && (
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-cs-body">
              <p>{text.warning}</p>
              <p>{text.attempts}</p>
            </div>
          )}
          {phase === 'submitting' && (
            <p
              ref={resultRef}
              tabIndex={-1}
              data-dialog-focus-fallback
              className="mt-3 text-sm text-cs-body outline-none"
              role="status"
              data-testid="reset-result"
            >
              {text.submitting}
            </p>
          )}
          {phase === 'success' && (
            <p
              ref={resultRef}
              tabIndex={-1}
              className="mt-3 text-sm text-cs-body outline-none"
              role="status"
              data-testid="reset-result"
            >
              {text.success}
            </p>
          )}
          {phase === 'unknown' && (
            <p
              ref={resultRef}
              tabIndex={-1}
              className="mt-3 text-sm text-cs-body outline-none"
              role="alert"
              data-testid="reset-result"
            >
              {text.unknown}
            </p>
          )}
          {phase === 'access-lost' && (
            <p
              ref={resultRef}
              tabIndex={-1}
              className="mt-3 text-sm text-cs-body outline-none"
              role="alert"
              data-testid="reset-result"
            >
              {text.accessLost}
            </p>
          )}
          {phase === 'completed-unavailable' && (
            <p
              ref={resultRef}
              tabIndex={-1}
              className="mt-3 text-sm text-cs-body outline-none"
              role="alert"
              data-testid="reset-result"
            >
              {text.completedUnavailable}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {phase === 'confirm' && (
              <>
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={close}
                  data-testid="reset-cancel"
                  className="min-h-11 rounded-control border border-cs-border bg-cs-surface px-5 py-2.5 text-sm hover:border-cs-accent"
                >
                  {text.keep}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  data-testid="reset-confirm"
                  className="min-h-11 rounded-control border border-cs-amber bg-cs-amber-dim px-5 py-2.5 text-sm font-semibold text-cs-amber"
                >
                  {text.confirm}
                </button>
              </>
            )}
            {phase === 'submitting' && (
              <button
                type="button"
                disabled
                className="min-h-11 rounded-control border border-cs-border px-5 py-2.5 text-sm opacity-50"
              >
                {text.submittingButton}
              </button>
            )}
            {phase === 'unknown' && (
              <>
                <button
                  type="button"
                  onClick={close}
                  data-testid="reset-close"
                  className="min-h-11 rounded-control border border-cs-border px-5 py-2.5 text-sm"
                >
                  {text.close}
                </button>
                <button
                  type="button"
                  onClick={checkCurrentProgress}
                  data-testid="reset-check"
                  className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
                >
                  {text.check}
                </button>
              </>
            )}
            {phase === 'success' && (
              <button
                type="button"
                onClick={close}
                data-testid="reset-done"
                className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
              >
                {text.done}
              </button>
            )}
            {phase === 'access-lost' && (
              <button
                type="button"
                onClick={() => closeAfterInvalidation('access-lost')}
                data-testid="reset-done"
                className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
              >
                {text.done}
              </button>
            )}
            {phase === 'completed-unavailable' && (
              <button
                type="button"
                onClick={() => closeAfterInvalidation('reset-completed-unavailable')}
                data-testid="reset-done"
                className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
              >
                {text.close}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
