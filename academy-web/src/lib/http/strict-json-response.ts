const DEFAULT_RESPONSE_TIMEOUT_MS = 5_000
const DEFAULT_MAX_JSON_DEPTH = 16
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_JSON_DEPTH = 64
const MAX_BYOB_READ_BYTES = (256 * 1024) + 1
const MAX_RESPONSE_READS = 128

export interface BoundedResponseOptions {
  maxBytes: number
  maxDepth?: number
  signal?: AbortSignal
  timeoutMs?: number
}

export type StrictJsonResult = { ok: true; value: unknown } | { ok: false }

type BoundedResponsePlan = {
  maxBytes: number
  signal: CapturedAbortSignal | undefined
  timeoutMs: number
}

type StrictJsonResponsePlan = BoundedResponsePlan & {
  maxDepth: number
}

type CapturedAbortSignal = {
  target: AbortSignal
  aborted: boolean
  reason: unknown
}

type ResponseDeadline = {
  signal: AbortSignal
  expiration: Promise<never>
  cleanup(): void
}

const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get
const REASON_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'reason')?.get
const ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener
const REMOVE_EVENT_LISTENER = EventTarget.prototype.removeEventListener

export function cancelResponseBody(response: Response, reason?: unknown): void {
  if (!response.body || response.body.locked) return
  try {
    void response.body.cancel(reason).catch(() => undefined)
  } catch {
    // Cancellation is best-effort and must never delay a fail-closed result.
  }
}

export function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get('content-type')
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_RESPONSE_BYTES
}

function declaredBodyFits(response: Response, maxBytes: number): boolean {
  const contentLength = response.headers.get('content-length')
  if (contentLength === null) return true
  if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) return false
  const bytes = Number(contentLength)
  return Number.isSafeInteger(bytes) && bytes <= maxBytes
}

function cancelReader(reader: ReadableStreamBYOBReader, reason?: unknown): void {
  try {
    void reader.cancel(reason).catch(() => undefined)
  } catch {
    // Cancellation is best-effort and must never delay a fail-closed result.
  }
}

function readWithDeadline(
  reader: ReadableStreamBYOBReader,
  view: Uint8Array,
  expiration: Promise<never>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return Promise.race([reader.read(view), expiration])
}

function responseTimeoutMs(requestedTimeoutMs: unknown): number {
  if (typeof requestedTimeoutMs !== 'number'
    || !Number.isSafeInteger(requestedTimeoutMs)
    || requestedTimeoutMs <= 0) {
    return DEFAULT_RESPONSE_TIMEOUT_MS
  }
  return Math.min(requestedTimeoutMs, DEFAULT_RESPONSE_TIMEOUT_MS)
}

function snapshotBoundedResponseOptions(
  options: BoundedResponseOptions,
): BoundedResponsePlan | null {
  try {
    const maxBytes = options.maxBytes
    const signal = options.signal
    const timeoutMs = options.timeoutMs
    if (!validLimit(maxBytes)) {
      return null
    }
    let capturedSignal: CapturedAbortSignal | undefined
    if (signal !== undefined) {
      if (!(signal instanceof AbortSignal)) return null
      const aborted = signal.aborted
      const addEventListener = signal.addEventListener
      const removeEventListener = signal.removeEventListener
      if (typeof aborted !== 'boolean'
        || addEventListener !== ADD_EVENT_LISTENER
        || removeEventListener !== REMOVE_EVENT_LISTENER
        || aborted !== readNativeAbortSignalState(signal)) {
        return null
      }
      capturedSignal = {
        target: signal,
        aborted,
        reason: aborted ? readNativeAbortSignalReason(signal) : undefined,
      }
    }
    return {
      maxBytes,
      signal: capturedSignal,
      timeoutMs: responseTimeoutMs(timeoutMs),
    }
  } catch {
    return null
  }
}

function snapshotStrictJsonResponseOptions(
  options: BoundedResponseOptions,
): StrictJsonResponsePlan | null {
  const plan = snapshotBoundedResponseOptions(options)
  if (!plan) return null
  try {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_JSON_DEPTH
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_JSON_DEPTH) {
      return null
    }
    return { ...plan, maxDepth }
  } catch {
    return null
  }
}

function readNativeAbortSignalState(signal: AbortSignal): boolean {
  if (!ABORTED_GETTER) throw new Error('AbortSignal state is unavailable')
  const value = Reflect.apply(ABORTED_GETTER, signal, []) as unknown
  if (typeof value !== 'boolean') throw new Error('AbortSignal state is invalid')
  return value
}

function readNativeAbortSignalReason(signal: AbortSignal): unknown {
  if (!REASON_GETTER) return undefined
  try {
    return Reflect.apply(REASON_GETTER, signal, []) as unknown
  } catch {
    return undefined
  }
}

function createResponseDeadline(plan: BoundedResponsePlan): ResponseDeadline | null {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let listenerAttached = false
  let closed = false
  let rejectExpiration: (reason?: unknown) => void = () => undefined
  const expiration = new Promise<never>((_resolve, reject) => {
    rejectExpiration = reject
  })
  void expiration.catch(() => undefined)
  const abortDeadline = (reason?: unknown) => {
    if (closed || controller.signal.aborted) return
    try {
      controller.abort(reason)
    } finally {
      rejectExpiration(reason)
    }
  }
  const forwardAbort = () => abortDeadline(
    plan.signal?.aborted
      ? plan.signal.reason
      : plan.signal ? readNativeAbortSignalReason(plan.signal.target) : undefined,
  )
  const cleanup = () => {
    closed = true
    if (timeout !== undefined) clearTimeout(timeout)
    if (listenerAttached && plan.signal) {
      try {
        Reflect.apply(REMOVE_EVENT_LISTENER, plan.signal.target, ['abort', forwardAbort])
      } catch {
        // Reader cleanup must continue even if the native target rejects removal.
      }
    }
  }

  try {
    if (plan.signal) {
      Reflect.apply(REMOVE_EVENT_LISTENER, plan.signal.target, ['abort', forwardAbort])
      if (plan.signal.aborted) {
        forwardAbort()
      } else {
        listenerAttached = true
        Reflect.apply(ADD_EVENT_LISTENER, plan.signal.target, [
          'abort',
          forwardAbort,
          { once: true },
        ])
        if (readNativeAbortSignalState(plan.signal.target)) forwardAbort()
      }
    }
    timeout = setTimeout(
      () => abortDeadline(new DOMException('Response body deadline exceeded', 'TimeoutError')),
      plan.timeoutMs,
    )
    return { signal: controller.signal, expiration, cleanup }
  } catch {
    cleanup()
    return null
  }
}

export async function readBoundedResponseText(
  response: Response,
  options: BoundedResponseOptions,
): Promise<string | null> {
  const plan = snapshotBoundedResponseOptions(options)
  if (!plan) {
    cancelResponseBody(response)
    return null
  }
  return readBoundedResponseTextWithPlan(response, plan)
}

async function readBoundedResponseTextWithPlan(
  response: Response,
  plan: BoundedResponsePlan,
): Promise<string | null> {
  const deadline = createResponseDeadline(plan)
  if (!deadline) {
    cancelResponseBody(response)
    return null
  }
  try {
    if (deadline.signal.aborted || !declaredBodyFits(response, plan.maxBytes)) {
      cancelResponseBody(response, deadline.signal.reason)
      return null
    }
    if (!response.body) return ''

    let bytes: Uint8Array
    let readBuffer: Uint8Array
    try {
      bytes = new Uint8Array(plan.maxBytes + 1)
      readBuffer = new Uint8Array(Math.min(bytes.byteLength, MAX_BYOB_READ_BYTES))
    } catch {
      cancelResponseBody(response)
      return null
    }

    let reader: ReadableStreamBYOBReader
    try {
      reader = response.body.getReader({ mode: 'byob' })
    } catch {
      cancelResponseBody(response)
      return null
    }

    let byteLength = 0
    let readCount = 0
    try {
      while (true) {
        if (readCount >= MAX_RESPONSE_READS) {
          cancelReader(reader, new RangeError('Response body was too fragmented'))
          return null
        }
        readCount += 1
        const remaining = bytes.byteLength - byteLength
        const requestedLength = Math.min(remaining, readBuffer.byteLength)
        const readView = requestedLength === readBuffer.byteLength
          ? readBuffer
          : readBuffer.subarray(0, requestedLength)
        const { done, value } = await readWithDeadline(
          reader,
          readView,
          deadline.expiration,
        )
        if (value?.byteLength) {
          if (value.byteLength > remaining) {
            cancelReader(reader, new RangeError('Response body exceeded the read bound'))
            return null
          }
          bytes.set(value, byteLength)
          byteLength += value.byteLength
        }
        if (byteLength > plan.maxBytes) {
          cancelReader(reader, new RangeError('Response body exceeded the read bound'))
          return null
        }
        if (done) break
        if (!value?.byteLength) {
          cancelReader(reader, new RangeError('Response body made no progress'))
          return null
        }
        try {
          readBuffer = new Uint8Array(
            value.buffer,
            0,
            Math.min(value.buffer.byteLength, MAX_BYOB_READ_BYTES),
          )
        } catch {
          cancelReader(reader, new RangeError('Response read buffer was invalid'))
          return null
        }
      }
    } catch (error) {
      cancelReader(reader, error)
      return null
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // A failed release does not change the fail-closed validation result.
      }
    }

    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes.subarray(0, byteLength),
      )
    } catch {
      return null
    }
  } finally {
    deadline.cleanup()
  }
}

class DuplicateSafeJsonParser {
  private position = 0

  constructor(
    private readonly text: string,
    private readonly maxDepth: number,
  ) {}

  parse(): StrictJsonResult {
    try {
      this.skipWhitespace()
      const value = this.parseValue(0)
      this.skipWhitespace()
      if (this.position !== this.text.length) return { ok: false }
      return { ok: true, value }
    } catch {
      return { ok: false }
    }
  }

  private parseValue(depth: number): unknown {
    if (depth > this.maxDepth) throw new Error('JSON is too deeply nested')
    this.skipWhitespace()
    switch (this.text[this.position]) {
      case '{': return this.parseObject(depth)
      case '[': return this.parseArray(depth)
      case '"': return this.parseString()
      case 't': return this.parseLiteral('true', true)
      case 'f': return this.parseLiteral('false', false)
      case 'n': return this.parseLiteral('null', null)
      default: return this.parseNumber()
    }
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.position += 1
    this.skipWhitespace()
    if (this.text[this.position] === '}') {
      this.position += 1
      return {}
    }

    const seen = new Set<string>()
    const entries: [string, unknown][] = []
    while (true) {
      if (this.text[this.position] !== '"') throw new Error('Expected an object key')
      const key = this.parseString()
      if (seen.has(key)) throw new Error('Duplicate object key')
      seen.add(key)
      this.skipWhitespace()
      if (this.text[this.position] !== ':') throw new Error('Expected a colon')
      this.position += 1
      entries.push([key, this.parseValue(depth + 1)])
      this.skipWhitespace()
      if (this.text[this.position] === '}') {
        this.position += 1
        return Object.fromEntries(entries)
      }
      if (this.text[this.position] !== ',') throw new Error('Expected an object separator')
      this.position += 1
      this.skipWhitespace()
    }
  }

  private parseArray(depth: number): unknown[] {
    this.position += 1
    this.skipWhitespace()
    if (this.text[this.position] === ']') {
      this.position += 1
      return []
    }

    const values: unknown[] = []
    while (true) {
      values.push(this.parseValue(depth + 1))
      this.skipWhitespace()
      if (this.text[this.position] === ']') {
        this.position += 1
        return values
      }
      if (this.text[this.position] !== ',') throw new Error('Expected an array separator')
      this.position += 1
      this.skipWhitespace()
    }
  }

  private parseString(): string {
    const start = this.position
    this.position += 1
    while (this.position < this.text.length) {
      const character = this.text[this.position]
      if (character === '"') {
        this.position += 1
        const parsed = JSON.parse(this.text.slice(start, this.position)) as unknown
        if (typeof parsed !== 'string') throw new Error('Expected a string')
        return parsed
      }
      if (character.charCodeAt(0) < 0x20) throw new Error('Unescaped control character')
      if (character === '\\') {
        const escape = this.text[this.position + 1]
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.position + 2, this.position + 6))) {
            throw new Error('Invalid unicode escape')
          }
          this.position += 6
          continue
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) throw new Error('Invalid string escape')
        this.position += 2
        continue
      }
      this.position += 1
    }
    throw new Error('Unterminated string')
  }

  private parseLiteral(token: string, value: boolean | null): boolean | null {
    if (!this.text.startsWith(token, this.position)) throw new Error('Invalid literal')
    this.position += token.length
    return value
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.position))
    if (!match) throw new Error('Invalid JSON value')
    const value = Number(match[0])
    if (!Number.isFinite(value)) throw new Error('Non-finite JSON number')
    this.position += match[0].length
    return value
  }

  private skipWhitespace() {
    while (/^[\t\n\r ]$/.test(this.text[this.position] ?? '')) this.position += 1
  }
}

export function parseStrictJsonText(
  text: string,
  maximumCharacters: number,
  maxDepth: number,
): StrictJsonResult {
  if (typeof text !== 'string'
    || !validLimit(maximumCharacters)
    || text.length > maximumCharacters
    || !Number.isSafeInteger(maxDepth)
    || maxDepth < 0
    || maxDepth > MAX_JSON_DEPTH) {
    return { ok: false }
  }
  return new DuplicateSafeJsonParser(text, maxDepth).parse()
}

export async function readStrictJsonResponse(
  response: Response,
  options: BoundedResponseOptions,
): Promise<StrictJsonResult> {
  const plan = snapshotStrictJsonResponseOptions(options)
  if (!plan) {
    cancelResponseBody(response)
    return { ok: false }
  }
  if (!hasJsonContentType(response)) {
    cancelResponseBody(response)
    return { ok: false }
  }
  const text = await readBoundedResponseTextWithPlan(response, plan)
  return text === null ? { ok: false } : parseStrictJsonText(text, plan.maxBytes, plan.maxDepth)
}
