import {
  cancelResponseBody,
  hasJsonContentType,
  readBoundedResponseTextWithOutcome,
} from './strict-json-response'

const MAX_SUCCESS_RESPONSE_BYTES = 128
const EXACT_SUCCESS_ENVELOPE = /^[\t\n\r ]*\{[\t\n\r ]*"ok"[\t\n\r ]*:[\t\n\r ]*true[\t\n\r ]*\}[\t\n\r ]*$/

interface ExactOkResponseOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export type ExactOkResponseOutcome =
  | { status: 'success' }
  | { status: 'invalid-envelope' }
  | { status: 'read-error' }

export { cancelResponseBody } from './strict-json-response'

export async function readExactOkJsonResponse(
  response: Response,
  options: ExactOkResponseOptions = {},
): Promise<ExactOkResponseOutcome> {
  if (!response.ok || !hasJsonContentType(response)) {
    cancelResponseBody(response)
    return { status: 'invalid-envelope' }
  }
  try {
    const body = await readBoundedResponseTextWithOutcome(response, {
      maxBytes: MAX_SUCCESS_RESPONSE_BYTES,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    })
    if (!body.ok) {
      return body.transportFailure
        ? { status: 'read-error' }
        : { status: 'invalid-envelope' }
    }
    return EXACT_SUCCESS_ENVELOPE.test(body.text)
      ? { status: 'success' }
      : { status: 'invalid-envelope' }
  } catch {
    return { status: 'read-error' }
  }
}

export async function hasExactOkJsonResponse(
  response: Response,
  options: ExactOkResponseOptions = {},
): Promise<boolean> {
  return (await readExactOkJsonResponse(response, options)).status === 'success'
}
