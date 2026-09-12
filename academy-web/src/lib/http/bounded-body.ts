export type BoundedBody = { ok: true; text: string } | { ok: false; reason: 'too-large' }

export type BoundedJson =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too-large' | 'invalid-json' | 'read-error' }

export interface BoundedBodyOptions {
  timeoutMs?: number
}

interface BoundedBodyPlan {
  maxBytes: number
  timeoutMs: number
}

type BodyDeadline = {
  at: number
  expiration: Promise<never>
  cleanup(): void
}

const DEFAULT_BODY_TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 1024 * 1024
const MAX_BODY_READS = 4_096

function validBytes(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_BODY_BYTES
}

function invalidBounds(): RangeError {
  return new RangeError('Invalid bounded body bounds')
}

function timeoutError(): DOMException {
  return new DOMException('Request body deadline exceeded', 'TimeoutError')
}

function planBoundedBody(
  maxBytes: number,
  options: BoundedBodyOptions = {},
): BoundedBodyPlan {
  if (!validBytes(maxBytes)) throw invalidBounds()
  const requestedTimeoutMs = options.timeoutMs ?? DEFAULT_BODY_TIMEOUT_MS
  if (typeof requestedTimeoutMs !== 'number'
    || !Number.isSafeInteger(requestedTimeoutMs)
    || requestedTimeoutMs <= 0
    || requestedTimeoutMs > DEFAULT_BODY_TIMEOUT_MS) {
    throw invalidBounds()
  }
  return {
    maxBytes,
    timeoutMs: requestedTimeoutMs,
  }
}

function createBodyDeadline(
  signal: AbortSignal,
  timeoutMs: number,
): BodyDeadline {
  let rejectExpiration: (reason?: unknown) => void = () => undefined
  let closed = false
  const expiration = new Promise<never>((_resolve, reject) => {
    rejectExpiration = reject
  })
  void expiration.catch(() => undefined)

  const timeout = setTimeout(() => {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', onAbort)
    rejectExpiration(timeoutError())
  }, timeoutMs)

  function onAbort() {
    if (closed) return
    closed = true
    if (timeout !== undefined) clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
    rejectExpiration(signal.reason)
  }

  if (signal.aborted) {
    onAbort()
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    at: Date.now() + timeoutMs,
    expiration,
    cleanup() {
      settle()
    },
  }

  function settle() {
    if (closed) return
    closed = true
    clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
  }
}

async function cancelBody(
  body: ReadableStream<Uint8Array>,
  deadline: BodyDeadline,
  reason: unknown,
): Promise<boolean> {
  let cancellation: Promise<void>
  try {
    cancellation = body.cancel(reason)
    void cancellation.catch(() => undefined)
  } catch {
    return false
  }
  return await raceCancellation(cancellation, deadline)
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: BodyDeadline,
  reason: unknown,
): Promise<boolean> {
  let cancellation: Promise<void>
  try {
    cancellation = reader.cancel(reason)
    void cancellation.catch(() => undefined)
  } catch {
    return false
  }
  return await raceCancellation(cancellation, deadline)
}

async function raceCancellation(
  cancellation: Promise<void>,
  deadline: BodyDeadline,
): Promise<boolean> {
  const remainingMs = deadline.at - Date.now()
  if (remainingMs <= 0) return false
  let cancellationTimeout: ReturnType<typeof setTimeout> | undefined
  const wall = new Promise<never>((_resolve, reject) => {
    cancellationTimeout = setTimeout(
      () => reject(timeoutError()),
      remainingMs,
    )
  })
  void wall.catch(() => undefined)
  try {
    await Promise.race([cancellation.catch(() => undefined), wall])
    return Date.now() < deadline.at
  } catch {
    return false
  } finally {
    if (cancellationTimeout !== undefined) clearTimeout(cancellationTimeout)
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
  options: BoundedBodyOptions = {},
): Promise<BoundedBody> {
  const plan = planBoundedBody(maxBytes, options)
  const body = request.body
  const deadline = createBodyDeadline(request.signal, plan.timeoutMs)

  try {
    if (request.signal.aborted) {
      if (body) await cancelBody(body, deadline, request.signal.reason)
      throw request.signal.reason
    }

    const declared = Number(request.headers.get('content-length'))
    if (body && Number.isFinite(declared) && declared > plan.maxBytes) {
      await cancelBody(
        body,
        deadline,
        new RangeError('Request body exceeded the byte bound'),
      )
      return { ok: false, reason: 'too-large' }
    }

    if (!body) return { ok: true, text: '' }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(plan.maxBytes + 1)
    } catch {
      throw invalidBounds()
    }

    const reader = body.getReader()
    let total = 0
    let reads = 0

    try {
      while (true) {
        if (reads >= MAX_BODY_READS) {
          await cancelReader(
            reader,
            deadline,
            new RangeError('Request body was too fragmented'),
          )
          throw new RangeError('Request body was too fragmented')
        }
        reads += 1

        let read: ReadableStreamReadResult<Uint8Array>
        try {
          read = await Promise.race([reader.read(), deadline.expiration])
        } catch (error) {
          await cancelReader(reader, deadline, error)
          throw error
        }

        const { done, value } = read
        if (done) break
        if (!value?.byteLength) {
          await cancelReader(
            reader,
            deadline,
            new RangeError('Request body made no progress'),
          )
          throw new RangeError('Request body made no progress')
        }
        if (value.byteLength > bytes.byteLength - total
          || total + value.byteLength > plan.maxBytes) {
          await cancelReader(
            reader,
            deadline,
            new RangeError('Request body exceeded the byte bound'),
          )
          return { ok: false, reason: 'too-large' }
        }
        bytes.set(value, total)
        total += value.byteLength
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // Cancellation was already bounded; a hostile stream may retain its read request.
      }
    }

    return { ok: true, text: new TextDecoder().decode(bytes.subarray(0, total)) }
  } finally {
    deadline.cleanup()
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
  options: BoundedBodyOptions = {},
): Promise<BoundedJson> {
  let body: BoundedBody
  try {
    body = await readBoundedBody(request, maxBytes, options)
  } catch {
    return { ok: false, reason: 'read-error' }
  }
  if (!body.ok) return body

  try {
    return { ok: true, value: JSON.parse(body.text) as unknown }
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
}
