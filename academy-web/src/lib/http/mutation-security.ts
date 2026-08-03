export type MutationValidation =
  | { ok: true }
  | { ok: false; status: 403 | 415; error: string }

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  // Host มาจาก request destination; ไม่เชื่อ X-Forwarded-Host ซึ่ง client/proxy
  // topology บางแบบปลอมได้ ถ้า edge ไม่ได้ overwrite ให้
  const host = request.headers.get('host')?.trim()
  if (!host) return url.origin

  try {
    return new URL(`${forwardedProto || url.protocol.replace(':', '')}://${host}`).origin
  } catch {
    return url.origin
  }
}

function suppliedOrigin(request: Request): string | null {
  const raw = request.headers.get('origin')
  if (!raw || raw === 'null') return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * Session cookies alone do not prove who initiated a browser mutation.
 *
 * Origin is authoritative when present. Fetch Metadata is the fallback when
 * Origin is omitted. Missing both is rejected instead of becoming a bypass.
 */
export function validateMutationRequest(
  request: Request,
  options: { requireJson?: boolean } = {},
): MutationValidation {
  const originHeader = request.headers.get('origin')
  const origin = suppliedOrigin(request)
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()

  if (originHeader) {
    if (!origin || origin !== requestOrigin(request)) {
      return { ok: false, status: 403, error: 'คำขอนี้ไม่ได้มาจาก Academy' }
    }
  } else if (fetchSite !== 'same-origin') {
    return { ok: false, status: 403, error: 'ยืนยันต้นทางของคำขอไม่ได้' }
  }

  if (options.requireJson) {
    const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      return { ok: false, status: 415, error: 'content-type ต้องเป็น application/json' }
    }
  }

  return { ok: true }
}
