export const MEDIA_AUTHORIZATION_PROBE_HEADER = 'x-academy-media-authorization-probe'

export function isMediaAuthorizationProbe(headers: Headers): boolean {
  return headers.get(MEDIA_AUTHORIZATION_PROBE_HEADER) === '1'
}
