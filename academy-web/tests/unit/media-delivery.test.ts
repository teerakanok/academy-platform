import { describe, expect, it, vi } from 'vitest'
import { issueMediaGrant } from '@/lib/media/grant'
import { servePrivateMedia } from '@/lib/media/worker-delivery'

const SECRET = 'test-only-media-signing-secret-32-bytes-minimum'

async function token(overrides: Partial<{ key: string; courseSlug: string; nodeId: string; expiresAt: number }> = {}) {
  return issueMediaGrant(
    {
      assetId: 'formats-handout',
      courseSlug: 'content-formats-demo',
      nodeId: 'formats-references',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    },
    SECRET,
  )
}

function bucket(body = 'PDF', range?: { offset?: number; length?: number; suffix?: number }, size = body.length) {
  return {
    get: vi.fn(async () => ({
      body: new Blob([body]).stream(),
      size,
      range,
      httpEtag: '"etag"',
      writeHttpMetadata() {},
    })),
  }
}

describe('private media Worker delivery', () => {
  it('ignores unrelated paths so OpenNext remains the handler', async () => {
    await expect(servePrivateMedia(new Request('https://academy.test/courses'), {})).resolves.toBeNull()
  })

  it('serves a registered object only with a valid bound grant', async () => {
    const media = bucket()
    const response = await servePrivateMedia(
      new Request(`https://academy.test/course-media/${await token()}`),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
    )
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('application/pdf')
    expect(response?.headers.get('cache-control')).toBe('private, no-store')
    expect(await response?.text()).toBe('PDF')
    expect(media.get).toHaveBeenCalledWith(
      'content-formats-demo/formats-references/sample-handout.pdf',
      expect.anything(),
    )
  })

  it('rejects tampered, ownership-mismatched, and missing grants before R2', async () => {
    const media = bucket()
    const valid = await token()
    const mismatched = await token({ nodeId: 'wrong-node' })
    for (const candidate of [`${valid}x`, mismatched, 'not-a-token']) {
      const response = await servePrivateMedia(new Request(`https://academy.test/course-media/${candidate}`), {
        MEDIA_SIGNING_SECRET: SECRET,
        COURSE_MEDIA: media,
      })
      expect(response?.status).toBe(404)
    }
    expect(media.get).not.toHaveBeenCalled()
  })

  it('sends an expired signed delivery grant through authenticated renewal without reading R2', async () => {
    const media = bucket()
    const expired = await token({ expiresAt: 1 })
    const response = await servePrivateMedia(new Request(`https://academy.test/course-media/${expired}`), {
      MEDIA_SIGNING_SECRET: SECRET,
      COURSE_MEDIA: media,
    })
    expect(response?.status).toBe(307)
    expect(response?.headers.get('location')).toBe(`/api/media/open?token=${encodeURIComponent(expired)}`)
    expect(media.get).not.toHaveBeenCalled()
  })

  it('fails closed when the private binding or signing secret is absent', async () => {
    const response = await servePrivateMedia(new Request(`https://academy.test/course-media/${await token()}`), {})
    expect(response?.status).toBe(503)
  })

  it.each([
    { label: 'closed', header: 'bytes=2-4', range: { offset: 2, length: 3 }, expected: 'bytes 2-4/10' },
    { label: 'open', header: 'bytes=6-', range: { offset: 6 }, expected: 'bytes 6-9/10' },
    { label: 'suffix', header: 'bytes=-3', range: { suffix: 3 }, expected: 'bytes 7-9/10' },
  ])('normalizes $label R2 range responses', async ({ header, range, expected }) => {
    const response = await servePrivateMedia(
      new Request(`https://academy.test/course-media/${await token()}`, { headers: { range: header } }),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: bucket('part', range, 10) },
    )
    expect(response?.status).toBe(206)
    expect(response?.headers.get('content-range')).toBe(expected)
  })

  it('supports HEAD and rejects malformed, multiple, and impossible ranges before R2', async () => {
    const media = bucket('PDF')
    const grant = await token()
    const head = await servePrivateMedia(new Request(`https://academy.test/course-media/${grant}`, { method: 'HEAD' }), {
      MEDIA_SIGNING_SECRET: SECRET,
      COURSE_MEDIA: media,
    })
    expect(head?.status).toBe(200)
    expect(await head?.text()).toBe('')

    for (const range of ['bytes=5-2', 'bytes=0-1,4-5', 'bytes=-0', 'items=0-2']) {
      const response = await servePrivateMedia(
        new Request(`https://academy.test/course-media/${grant}`, { headers: { range } }),
        { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
      )
      expect(response?.status).toBe(416)
    }
  })
})
