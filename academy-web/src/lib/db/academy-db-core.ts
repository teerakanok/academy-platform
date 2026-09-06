/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

const runtimeTokenEncoder = new TextEncoder()

async function issueWorkerRuntimeToken(secret: string, now: Date): Promise<string> {
  const secretBytes = runtimeTokenEncoder.encode(secret)
  if (secretBytes.byteLength < 32) {
    throw new Error('ACADEMY_DATA_API_JWT_SECRET ต้องมีอย่างน้อย 32 bytes')
  }

  const issuedAt = Math.floor(now.getTime() / 1000)
  const encode = (value: object) => runtimeTokenEncoder.encode(JSON.stringify(value))
  const base64Url = (bytes: Uint8Array) => {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  }
  const header = base64Url(encode({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(encode({
    aud: 'academy-data-api',
    exp: issuedAt + 60,
    iat: issuedAt,
    role: 'academy_runtime',
  }))
  const signed = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, runtimeTokenEncoder.encode(signed))
  return `${signed}.${base64Url(new Uint8Array(signature))}`
}

export type AcademyDbConfig = {
  url: string
  signingSecret: string
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

function validateAcademyDataApiUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น dedicated API URL ที่ถูกต้อง')
  }

  const isSecureOrigin = url.protocol === 'https:'
  const isLocalLoopback = url.protocol === 'http:' && url.hostname === '127.0.0.1'
  if (!isSecureOrigin && !isLocalLoopback) {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น HTTPS หรือ HTTP loopback 127.0.0.1')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น origin ของ dedicated API เท่านั้น')
  }
  return url.origin
}

export function isSafeAcademyDataApiUrl(value: string): boolean {
  try {
    validateAcademyDataApiUrl(value)
    return true
  } catch {
    return false
  }
}

export function academyDataApiFetch(baseFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const inputUrl = input instanceof Request ? input.url : input.toString()
    const url = new URL(inputUrl)
    if (url.pathname === '/rest/v1' || url.pathname.startsWith('/rest/v1/')) {
      url.pathname = url.pathname.slice('/rest/v1'.length) || '/'
    }
    if (input instanceof Request) {
      return baseFetch(new Request(url.toString(), input), init)
    }
    return baseFetch(url.toString(), init)
  }
}

export function createAcademyDb({ url, signingSecret, fetch, now = () => new Date() }: AcademyDbConfig) {
  return createClient(validateAcademyDataApiUrl(url), 'academy-runtime', {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
    accessToken: () => issueWorkerRuntimeToken(signingSecret, now()),
    global: { fetch: academyDataApiFetch(fetch ?? globalThis.fetch) },
  })
}

export function academyDb(environment: Record<string, string | undefined> = process.env) {
  const url = environment.ACADEMY_DATA_API_URL
  const signingSecret = environment.ACADEMY_DATA_API_JWT_SECRET
  if (!url || !signingSecret) {
    throw new Error('ACADEMY_DATA_API_URL / ACADEMY_DATA_API_JWT_SECRET ยังไม่ถูกตั้งค่า (ดู .env.example)')
  }
  return createAcademyDb({ url, signingSecret })
}
