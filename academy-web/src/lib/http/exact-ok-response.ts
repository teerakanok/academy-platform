import {
  cancelResponseBody,
  hasJsonContentType,
  readBoundedResponseText,
} from './strict-json-response'

const MAX_SUCCESS_RESPONSE_BYTES = 128
const EXACT_SUCCESS_ENVELOPE = /^[\t\n\r ]*\{[\t\n\r ]*"ok"[\t\n\r ]*:[\t\n\r ]*true[\t\n\r ]*\}[\t\n\r ]*$/

interface ExactOkResponseOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export { cancelResponseBody } from './strict-json-response'

export async function hasExactOkJsonResponse(
  response: Response,
  options: ExactOkResponseOptions = {},
): Promise<boolean> {
  if (!response.ok || !hasJsonContentType(response)) {
    cancelResponseBody(response)
    return false
  }
  const body = await readBoundedResponseText(response, {
    maxBytes: MAX_SUCCESS_RESPONSE_BYTES,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
  return body !== null && EXACT_SUCCESS_ENVELOPE.test(body)
}
