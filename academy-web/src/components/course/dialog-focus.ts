import type { KeyboardEvent } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return

  const dialog = event.currentTarget
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0,
  )
  if (focusable.length === 0) {
    event.preventDefault()
    const fallback = dialog.querySelector<HTMLElement>('[data-dialog-focus-fallback]')
    if (!dialog.contains(document.activeElement)) fallback?.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const activeIsTabbable = focusable.some((element) => element === active)
  const movingBeforeFirst = event.shiftKey && (active === first || !activeIsTabbable)
  const movingAfterLast = !event.shiftKey && (active === last || !activeIsTabbable)

  if (movingBeforeFirst || movingAfterLast) {
    event.preventDefault()
    const destination = event.shiftKey ? last : first
    destination.focus()
  }
}
