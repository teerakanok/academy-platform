import { readBoundedBody } from '@/lib/http/bounded-body'

const MAX_BODY_BYTES = 2 * 1024
const MEDIA_TYPE = 'application/x-www-form-urlencoded'

export type IdentityStartForm =
  | { ok: true; next: string }
  | { ok: false; status: 400 | 413 | 415; error: string }

export async function readIdentityStartForm(request: Request): Promise<IdentityStartForm> {
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (mediaType !== MEDIA_TYPE) {
    await request.body?.cancel().catch(() => {})
    return { ok: false, status: 415, error: 'content-type ต้องเป็น application/x-www-form-urlencoded' }
  }

  const body = await readBoundedBody(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return { ok: false, status: 413, error: 'คำขอใหญ่เกินไป' }
  }

  const form = new URLSearchParams(body.text)
  if ([...form.keys()].length !== 1 || form.getAll('next').length !== 1) {
    return { ok: false, status: 400, error: 'คำขอเข้าสู่ระบบไม่ถูกต้อง' }
  }
  return { ok: true, next: form.get('next') ?? '' }
}
