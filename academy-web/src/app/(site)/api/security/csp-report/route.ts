import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import {
  CSP_REPORT_MAX_BYTES,
  parseCspReportBody,
} from '@/lib/security/csp-report-parser'

const CSP_REPORT_EVENT = 'csp_report_accepted'

function mediaType(request: Request): string {
  return request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
}

function suppliedOrigin(request: Request): string | null {
  const raw = request.headers.get('origin')
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin
}

function requestHasBrowserOrigin(request: Request): boolean {
  const originHeader = request.headers.get('origin')
  if (originHeader && suppliedOrigin(request) !== requestOrigin(request)) return false

  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  if (fetchSite && fetchSite !== 'same-origin') return false
  const fetchMode = request.headers.get('sec-fetch-mode')?.toLowerCase()
  if (fetchMode && fetchMode !== 'no-cors') return false
  const fetchDestination = request.headers.get('sec-fetch-dest')?.toLowerCase()
  if (fetchDestination && fetchDestination !== 'report') return false
  return true
}

function empty(response: Response): Response {
  response.headers.set('cache-control', 'no-store')
  return response
}

export async function POST(request: Request): Promise<Response> {
  const type = mediaType(request)
  if (type !== 'application/csp-report' && type !== 'application/reports+json') {
    return empty(new Response(null, { status: 415 }))
  }
  if (!requestHasBrowserOrigin(request)) return empty(new Response(null, { status: 403 }))
  if (!(await hasEdgeRateLimitMarker(request, { secret: process.env.RATE_LIMIT_KEY_SECRET }))) {
    return empty(new Response(null, { status: 403 }))
  }

  const body = await readBoundedJson(request, CSP_REPORT_MAX_BYTES)
  if (!body.ok) {
    const status = body.reason === 'too-large' ? 413 : 400
    return empty(new Response(null, { status }))
  }

  const parsed = parseCspReportBody(body.value, type)
  if (!parsed.ok) return empty(new Response(null, { status: parsed.status }))

  console.info(JSON.stringify({
    event: CSP_REPORT_EVENT,
    report_count: parsed.reportCount,
    directive_categories: parsed.directiveCategories,
  }))
  return empty(new Response(null, { status: 204 }))
}


