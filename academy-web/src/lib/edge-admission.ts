import { withEdgeSecurityHeaders } from './edge-security-headers'

export interface AdmissionEnv {
  ACADEMY_ADMISSION_MODE?: string
}

/** A release must declare an explicit mode. Absence, malformed values, and failed
 * binding reads close admission rather than silently reopening the application. */
export function admissionResponse(env: AdmissionEnv): Response | null {
  try {
    const mode = env.ACADEMY_ADMISSION_MODE
    if (mode === 'open') return null
  } catch {
    // Fall through to the same fail-closed response.
  }
  return withEdgeSecurityHeaders(new Response('Academy is temporarily unavailable. Please retry shortly.', {
    status: 503,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '60',
    },
  }))
}
