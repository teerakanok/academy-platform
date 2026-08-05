const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Fragments never reach the server or edge logs. Keep the bearer token there
// rather than in a query string, then send it only in the POST request.
export function unsubscribeTokenFromFragment(fragment: string): string | null {
  const token = fragment.startsWith('#') ? fragment.slice(1) : ''
  return UUID.test(token) ? token : null
}
