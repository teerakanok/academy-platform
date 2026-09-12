export function safeErrorMessage(error: unknown): string {
  // Upstream messages can contain SQL values, URLs, cookies or provider payloads.
  // Context is supplied by the caller's fixed log label, never by raw messages.
  try {
    if (error instanceof TypeError) return 'type_error'
    if (error instanceof RangeError) return 'range_error'
    if (error instanceof SyntaxError) return 'syntax_error'
    if (error instanceof Error || typeof error === 'string') return 'operation_failed'
  } catch { /* hostile object/proxy: retain the generic category */ }
  return 'unknown_error'
}
