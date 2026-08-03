'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { trapDialogFocus } from '@/components/course/dialog-focus'
import type { CourseProgressRecord } from '@/lib/course/progress'
import { reconcileCourseReset, resetCourseProgress, type ResetProgressResult } from '@/lib/course/progress-client'

type ResetPhase = 'confirm' | 'submitting' | 'success' | 'unknown' | 'access-lost' | 'completed-unavailable'

export function ResetCourseProgress({
  slug,
  canReset,
  onRecord,
  onInvalidated,
  returnFocusRef,
}: {
  slug: string
  canReset: boolean
  onRecord: (record: CourseProgressRecord) => void
  onInvalidated: (reason: 'access-lost' | 'reset-completed-unavailable') => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
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
          Reset my progress
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
            {phase === 'success' ? 'Progress reset' : 'Reset course progress?'}
          </h2>

          {phase === 'confirm' && (
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-cs-body">
              <p>
                This permanently removes your lesson progress, checkpoint results, and certificate evidence for this
                course.
              </p>
              <p>Checkpoint attempts already issued and retry limits are not restored.</p>
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
              Resetting your course progress…
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
              Progress reset. This course is ready to start again.
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
              We could not confirm whether the reset completed. Check the reset status again, or close and review your
              current progress before deciding what to do next.
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
              Your Academy access changed before the reset. Your progress was not reset.
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
              The reset completed, but we could not load your current learning record. Close this message and try
              loading the course again.
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
                  Keep my progress
                </button>
                <button
                  type="button"
                  onClick={submit}
                  data-testid="reset-confirm"
                  className="min-h-11 rounded-control border border-cs-amber bg-cs-amber-dim px-5 py-2.5 text-sm font-semibold text-cs-amber"
                >
                  Reset course progress
                </button>
              </>
            )}
            {phase === 'submitting' && (
              <button
                type="button"
                disabled
                className="min-h-11 rounded-control border border-cs-border px-5 py-2.5 text-sm opacity-50"
              >
                Resetting…
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
                  Close
                </button>
                <button
                  type="button"
                  onClick={checkCurrentProgress}
                  data-testid="reset-check"
                  className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
                >
                  Check reset status
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
                Done
              </button>
            )}
            {phase === 'access-lost' && (
              <button
                type="button"
                onClick={() => closeAfterInvalidation('access-lost')}
                data-testid="reset-done"
                className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
              >
                Done
              </button>
            )}
            {phase === 'completed-unavailable' && (
              <button
                type="button"
                onClick={() => closeAfterInvalidation('reset-completed-unavailable')}
                data-testid="reset-done"
                className="min-h-11 rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
