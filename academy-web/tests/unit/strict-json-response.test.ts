import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasJsonContentType,
  readBoundedResponseText,
  readStrictJsonResponse,
} from '@/lib/http/strict-json-response'

function byteStream(source: UnderlyingByteSource): ReadableStream<Uint8Array> {
  const ByteReadableStream = ReadableStream as unknown as {
    new (underlyingSource: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  return new ByteReadableStream(source)
}

function trackedResponse(
  body: string | Uint8Array,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  const inputBytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const bytes = new Uint8Array(inputBytes.byteLength)
  bytes.set(inputBytes)
  const activity = { cancels: 0, pulls: 0 }
  let sent = false
  const stream = byteStream({
    type: 'bytes',
    pull(controller) {
      activity.pulls += 1
      if (sent || bytes.byteLength === 0) {
        controller.close()
        return
      }
      sent = true
      controller.enqueue(bytes)
      controller.close()
    },
    cancel() {
      activity.cancels += 1
    },
  })
  return {
    activity,
    response: new Response(stream, { headers }),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('shared strict JSON response boundary', () => {
  it('parses one bounded duplicate-safe JSON value', async () => {
    const { response } = trackedResponse(' \r\n {"ok":true,"items":[1,"two",null]} \t ')

    await expect(readStrictJsonResponse(response, { maxBytes: 128, maxDepth: 4 }))
      .resolves.toEqual({
        ok: true,
        value: { ok: true, items: [1, 'two', null] },
      })
  })

  it.each([
    ['top-level duplicate', '{"ok":false,"ok":true}'],
    ['escaped duplicate', '{"ok":true,"\\u006f\\u006b":false}'],
    ['nested duplicate', '{"item":{"id":"old","id":"new"}}'],
    ['trailing value', '{"ok":true} false'],
    ['trailing comma', '{"ok":true,}'],
    ['leading-zero number', '{"value":01}'],
    ['non-finite number', '{"value":1e999}'],
    ['BOM', '\uFEFF{"ok":true}'],
  ])('rejects invalid or ambiguous JSON: %s', async (_label, body) => {
    const { response } = trackedResponse(body)
    await expect(readStrictJsonResponse(response, { maxBytes: 128 }))
      .resolves.toEqual({ ok: false })
  })

  it('rejects invalid UTF-8', async () => {
    const { response } = trackedResponse(new Uint8Array([0xc3, 0x28]))
    await expect(readStrictJsonResponse(response, { maxBytes: 16 }))
      .resolves.toEqual({ ok: false })
  })

  it('accepts only the JSON media type and cancels a mismatched body', async () => {
    const { activity, response } = trackedResponse('{"ok":true}', {
      'content-type': 'text/plain',
    })

    expect(hasJsonContentType(response)).toBe(false)
    await expect(readStrictJsonResponse(response, { maxBytes: 32 }))
      .resolves.toEqual({ ok: false })
    expect(activity).toEqual({ cancels: 1, pulls: 0 })
  })

  it.each(['-1', '01', '1.5', 'not-a-number'])
    ('rejects a noncanonical content length and cancels before reading: %s', async (length) => {
      const { activity, response } = trackedResponse('{"ok":true}', {
        'content-type': 'application/json',
        'content-length': length,
      })

      await expect(readBoundedResponseText(response, { maxBytes: 32 })).resolves.toBeNull()
      expect(activity).toEqual({ cancels: 1, pulls: 0 })
    })

  it('rejects a caller byte limit above the global allocation ceiling', async () => {
    const response = {
      body: null,
      headers: new Headers(),
    } as Response

    await expect(readBoundedResponseText(response, { maxBytes: 1_048_577 }))
      .resolves.toBeNull()
  })

  it('rejects a caller depth above the global recursion ceiling before reading', async () => {
    const { activity, response } = trackedResponse('{"ok":true}')

    await expect(readStrictJsonResponse(response, { maxBytes: 32, maxDepth: 65 }))
      .resolves.toEqual({ ok: false })
    expect(activity).toEqual({ cancels: 1, pulls: 0 })
  })

  it('snapshots public options once before allocation and body access', async () => {
    const activity = { cancels: 0, largestByobRequest: 0 }
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        const request = controller.byobRequest
        if (!request?.view) throw new Error('expected a BYOB request')
        activity.largestByobRequest = Math.max(
          activity.largestByobRequest,
          request.view.byteLength,
        )
        new Uint8Array(
          request.view.buffer,
          request.view.byteOffset,
          request.view.byteLength,
        ).set(new TextEncoder().encode('{}'))
        request.respond(2)
        controller.close()
      },
      cancel() {
        activity.cancels += 1
      },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'application/json' },
    })
    const abortController = new AbortController()
    const reads = { maxBytes: 0, maxDepth: 0, signal: 0, timeoutMs: 0 }
    const options = Object.create(null) as {
      readonly maxBytes: number
      readonly maxDepth: number
      readonly signal: AbortSignal
      readonly timeoutMs: number
    }
    Object.defineProperties(options, {
      maxBytes: {
        enumerable: true,
        get() {
          reads.maxBytes += 1
          return reads.maxBytes <= 2 ? 32 : 2_000_000
        },
      },
      maxDepth: {
        enumerable: true,
        get() {
          reads.maxDepth += 1
          return 4
        },
      },
      signal: {
        enumerable: true,
        get() {
          reads.signal += 1
          return abortController.signal
        },
      },
      timeoutMs: {
        enumerable: true,
        get() {
          reads.timeoutMs += 1
          return 100
        },
      },
    })

    await expect(readStrictJsonResponse(response, options)).resolves.toEqual({
      ok: true,
      value: {},
    })
    expect(reads).toEqual({ maxBytes: 1, maxDepth: 1, signal: 1, timeoutMs: 1 })
    expect(activity).toEqual({ cancels: 0, largestByobRequest: 33 })
    expect(response.body?.locked).toBe(false)
  })

  it('collapses an option snapshot failure before reading and cancels the body', async () => {
    const { activity, response } = trackedResponse('{"ok":true}')
    const options = Object.create(null) as { readonly maxBytes: number }
    Object.defineProperty(options, 'maxBytes', {
      enumerable: true,
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })

    await expect(readStrictJsonResponse(response, options)).resolves.toEqual({ ok: false })
    expect(activity).toEqual({ cancels: 1, pulls: 0 })
    expect(response.body?.locked).toBe(false)
  })

  it.each(['aborted', 'addEventListener', 'removeEventListener'] as const)(
    'rejects a hostile AbortSignal %s trap before either public API reads the body',
    async (failurePoint) => {
      const createSignal = () => new Proxy(new AbortController().signal, {
        get(target, property) {
          if (property === failurePoint) throw new Error('credential=TOP_SECRET')
          return Reflect.get(target, property, target)
        },
      })
      const bounded = trackedResponse('{"ok":true}')
      const strict = trackedResponse('{"ok":true}')

      await expect(readBoundedResponseText(bounded.response, {
        maxBytes: 32,
        signal: createSignal(),
      })).resolves.toBeNull()
      await expect(readStrictJsonResponse(strict.response, {
        maxBytes: 32,
        signal: createSignal(),
      })).resolves.toEqual({ ok: false })

      expect(bounded.activity).toEqual({ cancels: 1, pulls: 0 })
      expect(strict.activity).toEqual({ cancels: 1, pulls: 0 })
      expect(bounded.response.body?.locked).toBe(false)
      expect(strict.response.body?.locked).toBe(false)
    },
  )

  it('removes an abort listener when a hostile add mutates then throws', async () => {
    const nativeAdd = EventTarget.prototype.addEventListener
    const nativeRemove = EventTarget.prototype.removeEventListener
    const createSignal = () => {
      const target = new AbortController().signal
      const activeListeners = new Set<EventListenerOrEventListenerObject>()
      const signal = new Proxy(target, {
        get(innerTarget, property) {
          if (property === 'addEventListener') {
            return (
              type: string,
              listener: EventListenerOrEventListenerObject | null,
              options?: boolean | AddEventListenerOptions,
            ) => {
              Reflect.apply(nativeAdd, innerTarget, [type, listener, options])
              if (listener) activeListeners.add(listener)
              throw new Error('credential=TOP_SECRET')
            }
          }
          if (property === 'removeEventListener') {
            return (
              type: string,
              listener: EventListenerOrEventListenerObject | null,
              options?: boolean | EventListenerOptions,
            ) => {
              Reflect.apply(nativeRemove, innerTarget, [type, listener, options])
              if (listener) activeListeners.delete(listener)
            }
          }
          return Reflect.get(innerTarget, property, innerTarget)
        },
      })
      return { activeListeners, signal }
    }
    const bounded = trackedResponse('{"ok":true}')
    const strict = trackedResponse('{"ok":true}')
    const boundedSignal = createSignal()
    const strictSignal = createSignal()

    await expect(readBoundedResponseText(bounded.response, {
      maxBytes: 32,
      signal: boundedSignal.signal,
    })).resolves.toBeNull()
    await expect(readStrictJsonResponse(strict.response, {
      maxBytes: 32,
      signal: strictSignal.signal,
    })).resolves.toEqual({ ok: false })

    expect(bounded.activity).toEqual({ cancels: 1, pulls: 0 })
    expect(strict.activity).toEqual({ cancels: 1, pulls: 0 })
    expect(bounded.response.body?.locked).toBe(false)
    expect(strict.response.body?.locked).toBe(false)
    expect(boundedSignal.activeListeners.size).toBe(0)
    expect(strictSignal.activeListeners.size).toBe(0)
  })

  it('does not register an internal deadline listener through captured event methods', async () => {
    const addDescriptor = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      'addEventListener',
    )
    const removeDescriptor = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      'removeEventListener',
    )
    if (!addDescriptor || !removeDescriptor) throw new Error('EventTarget methods are unavailable')
    const nativeAdd = EventTarget.prototype.addEventListener
    const nativeRemove = EventTarget.prototype.removeEventListener
    const activeListeners = new Set<EventListenerOrEventListenerObject>()
    const bounded = trackedResponse('{"ok":true}')
    const strict = trackedResponse('{"ok":true}')
    let boundedResult: string | null | undefined
    let strictResult: Awaited<ReturnType<typeof readStrictJsonResponse>> | undefined

    try {
      Object.defineProperty(EventTarget.prototype, 'addEventListener', {
        ...addDescriptor,
        value: function (
          this: EventTarget,
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | AddEventListenerOptions,
        ) {
          Reflect.apply(nativeAdd, this, [type, listener, options])
          if (listener) activeListeners.add(listener)
          throw new Error('credential=TOP_SECRET')
        },
      })
      Object.defineProperty(EventTarget.prototype, 'removeEventListener', {
        ...removeDescriptor,
        value: function (
          this: EventTarget,
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | EventListenerOptions,
        ) {
          Reflect.apply(nativeRemove, this, [type, listener, options])
          if (listener) activeListeners.delete(listener)
          throw new Error('credential=TOP_SECRET')
        },
      })
      vi.resetModules()
      const freshModule = await import('@/lib/http/strict-json-response')

      boundedResult = await freshModule.readBoundedResponseText(bounded.response, {
        maxBytes: 32,
      })
      strictResult = await freshModule.readStrictJsonResponse(strict.response, {
        maxBytes: 32,
      })
    } finally {
      Object.defineProperty(EventTarget.prototype, 'addEventListener', addDescriptor)
      Object.defineProperty(EventTarget.prototype, 'removeEventListener', removeDescriptor)
    }

    expect(boundedResult).toBe('{"ok":true}')
    expect(strictResult).toEqual({ ok: true, value: { ok: true } })
    expect(activeListeners.size).toBe(0)
    expect(bounded.activity).toEqual({ cancels: 0, pulls: 1 })
    expect(strict.activity).toEqual({ cancels: 0, pulls: 1 })
    expect(bounded.response.body?.locked).toBe(false)
    expect(strict.response.body?.locked).toBe(false)
  })

  it('uses a max-plus-one BYOB read and cancels an oversized body', async () => {
    const activity = { cancels: 0, defaultReads: 0, largestByobRequest: 0 }
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        const request = controller.byobRequest
        if (!request?.view) {
          activity.defaultReads += 1
          controller.enqueue(new Uint8Array(1_000_000))
          return
        }
        activity.largestByobRequest = Math.max(
          activity.largestByobRequest,
          request.view.byteLength,
        )
        new Uint8Array(
          request.view.buffer,
          request.view.byteOffset,
          request.view.byteLength,
        ).fill(0x20)
        request.respond(request.view.byteLength)
      },
      cancel() {
        activity.cancels += 1
      },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'application/json' },
    })

    await expect(readStrictJsonResponse(response, { maxBytes: 32 }))
      .resolves.toEqual({ ok: false })
    expect(activity).toEqual({ cancels: 1, defaultReads: 0, largestByobRequest: 33 })
  })

  it('bounds one-byte fragmentation by chunk size and read count', async () => {
    const activity = {
      cancels: 0,
      pulls: 0,
      largestByobRequest: 0,
      requestedBytes: 0,
    }
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        activity.pulls += 1
        const request = controller.byobRequest
        if (!request?.view) throw new Error('expected a BYOB request')
        activity.largestByobRequest = Math.max(
          activity.largestByobRequest,
          request.view.byteLength,
        )
        activity.requestedBytes += request.view.byteLength
        new Uint8Array(request.view.buffer, request.view.byteOffset, 1)[0] = 0x20
        request.respond(1)
        if (activity.pulls === 129) controller.close()
      },
      cancel() {
        activity.cancels += 1
      },
    })
    const response = new Response(stream)

    await expect(readBoundedResponseText(response, {
      maxBytes: 512 * 1024,
      timeoutMs: 5_000,
    })).resolves.toBeNull()
    expect(activity.cancels).toBe(1)
    expect(activity.pulls).toBe(128)
    expect(activity.largestByobRequest).toBeLessThanOrEqual((256 * 1024) + 1)
    expect(activity.requestedBytes).toBeLessThanOrEqual(((256 * 1024) + 1) * 128)
    expect(response.body?.locked).toBe(false)
  })

  it('times out and cancels a stalled response body', async () => {
    vi.useFakeTimers()
    let cancelled = false
    const stream = byteStream({
      type: 'bytes',
      pull() {},
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'application/json' },
    })

    const result = readStrictJsonResponse(response, { maxBytes: 32, timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(51)

    await expect(result).resolves.toEqual({ ok: false })
    expect(cancelled).toBe(true)
  })

  it('honors an external abort and cancels a stalled response body', async () => {
    let cancelled = false
    const stream = byteStream({
      type: 'bytes',
      pull() {},
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'application/json' },
    })
    const abortController = new AbortController()

    const result = readStrictJsonResponse(response, {
      maxBytes: 32,
      signal: abortController.signal,
    })
    abortController.abort(new Error('stop'))

    await expect(result).resolves.toEqual({ ok: false })
    expect(cancelled).toBe(true)
  })
})
