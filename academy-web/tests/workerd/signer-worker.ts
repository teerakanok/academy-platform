/**
 * รัน signer ตัวจริงบน workerd (ไม่ใช่ Node) แล้วรายงานผลเป็น JSON
 *
 * เหตุผลที่ต้องมี lane นี้: contract เดิมตรวจ CryptoKey ผ่าน prototype getter
 * และ structuredClone ซึ่งผ่านบน Node แต่ปฏิเสธ key ที่ถูกต้องบน workerd —
 * สอบผ่านทั้งชุดใน Node แล้วพังทั้งระบบตอน deploy เพราะไม่มีใครรันของจริง
 *
 * เรียกผ่าน `node scripts/workerd-signer-check.mjs`
 */
import {
  createIdentityClientAssertionWebCryptoSigner,
  IdentityClientAssertionWebCryptoSignerFailure,
} from '../../src/lib/identity/client-assertion-webcrypto-signer'
import { CODE_EXCHANGE_FETCH_INIT } from '../../src/lib/identity/code-exchange-response-transport'
import { createIdentityCodeExchangeResultVerifierPort } from '../../src/lib/identity/code-exchange-result-verifier-port'
import { importIdentityResultKeySet } from '../../src/lib/identity/result-key-set-importer'
import { issueMediaGrant } from '../../src/lib/media/grant'
import { MEDIA_DELIVERY_COOKIE } from '../../src/lib/media/cookie'
import { servePrivateMedia } from '../../src/lib/media/worker-delivery'

type Check = { name: string, passed: boolean, detail: string }

// Minimal structural view of the R2 binding used by the media check (no workers-types dependency).
type HarnessBucket = Parameters<typeof servePrivateMedia>[1]['COURSE_MEDIA'] & {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  delete(key: string): Promise<void>
}

const CLIENT_ID = 'academy-web'
const PURPOSE = 'lifecycle_pull' as const
const KEY_ID = 'academy-lifecycle-2026-08'

const handler = {
  // nonce มาทาง binding ไม่ใช่ทาง URL คำขอจากภายนอกจึงไม่มีอะไรให้ลอก
  async fetch(_request: Request, env: { SIGNER_CHECK_NONCE?: string; COURSE_MEDIA?: HarnessBucket }): Promise<Response> {
    const nonce = env?.SIGNER_CHECK_NONCE ?? ''
    const checks: Check[] = []
    const record = async (name: string, run: () => Promise<string>): Promise<void> => {
      try {
        checks.push({ name, passed: true, detail: await run() })
      } catch (error) {
        checks.push({ name, passed: false, detail: String(error) })
      }
    }

    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair
    const exported = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const privateJwk = JSON.stringify({
      kty: exported.kty,
      crv: exported.crv,
      x: exported.x,
      y: exported.y,
      d: exported.d,
    })
    const options = { clientId: CLIENT_ID, purpose: PURPOSE, keyId: KEY_ID, privateJwk }
    const signingInput = new TextEncoder().encode('header.claims')

    await record('runtime-is-workerd', async () => {
      const agent = navigator.userAgent
      if (!agent.includes('Cloudflare-Workers')) throw new Error(`not workerd: ${agent}`)
      return agent
    })

    // หลักฐานตรงๆ ว่าทำไม contract เดิมใช้ไม่ได้ที่นี่ — บันทึกเป็นข้อมูล
    // ไม่ใช่ข้อบังคับ เพราะ runtime อาจเปลี่ยนได้ ผลลัพธ์อยู่ในรายงาน
    await record('cryptokey-introspection-shape', async () => {
      const proto = typeof CryptoKey === 'function' ? CryptoKey.prototype : null
      const hasTypeGetter = Boolean(
        proto && Object.getOwnPropertyDescriptor(proto, 'type')?.get,
      )
      let cloneable: string
      try {
        structuredClone(pair.privateKey)
        cloneable = 'clones'
      } catch (error) {
        cloneable = `throws ${(error as Error).name}`
      }
      return `prototype type getter: ${hasTypeGetter ? 'present' : 'absent'}; structuredClone: ${cloneable}`
    })

    await record('signs-and-verifies', async () => {
      const signer = await createIdentityClientAssertionWebCryptoSigner(options)
      const signature = await signer.sign({
        algorithm: 'ES256',
        clientId: CLIENT_ID,
        purpose: PURPOSE,
        keyId: KEY_ID,
        signingInput,
      })
      if (signature.byteLength !== 64) throw new Error(`length ${signature.byteLength}`)
      // สำเนาลง buffer ใหม่แทนการ cast — signer คืน Uint8Array ที่ผูกกับ
      // ArrayBufferLike ส่วน verify ต้องการ ArrayBuffer จริง
      const bytes = new Uint8Array(signature.byteLength)
      bytes.set(signature)
      const verified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.publicKey,
        bytes,
        signingInput,
      )
      if (!verified) throw new Error('signature did not verify')
      return '64-byte signature verifies against the public key'
    })

    await record('signer-imports-non-extractable-sign-only', async () => {
      // Observe the terms the SIGNER used. Importing a key here with the right
      // arguments would prove only that this check can type them: the earlier
      // version of this check passed unchanged when the source was mutated to
      // `extractable: true`, because it never looked at the signer at all.
      const subtle = crypto.subtle
      const original = subtle.importKey
      const calls: unknown[][] = []
      Object.defineProperty(subtle, 'importKey', {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => {
          calls.push(args)
          return Reflect.apply(original, subtle, args as never)
        },
      })
      try {
        await createIdentityClientAssertionWebCryptoSigner(options)
      } finally {
        Reflect.deleteProperty(subtle, 'importKey')
      }
      if (subtle.importKey !== original) throw new Error('failed to restore importKey')
      if (calls.length !== 1) throw new Error(`importKey calls: ${calls.length}`)
      const [format, keyData, algorithm, extractable, usages] = calls[0]!
      if (format !== 'jwk') throw new Error(`format ${String(format)}`)
      if (extractable !== false) throw new Error(`extractable ${String(extractable)}`)
      if (!Array.isArray(usages) || usages.length !== 1 || usages[0] !== 'sign') {
        throw new Error(`usages ${JSON.stringify(usages)}`)
      }
      const named = (algorithm as { name?: unknown, namedCurve?: unknown } | null)
      if (named?.name !== 'ECDSA' || named?.namedCurve !== 'P-256') {
        throw new Error(`algorithm ${JSON.stringify(algorithm)}`)
      }
      if (Object.keys(keyData as object).sort().join() !== 'crv,d,kty,x,y') {
        throw new Error(`jwk members ${Object.keys(keyData as object).sort().join()}`)
      }

      // And the terms have to mean something on this runtime, not just be typed.
      const importJwk = original as unknown as (
        format: 'jwk',
        keyData: JsonWebKey,
        algorithm: EcKeyImportParams,
        extractable: boolean,
        keyUsages: readonly KeyUsage[],
      ) => Promise<CryptoKey>
      const imported = await importJwk.call(
        subtle,
        'jwk',
        JSON.parse(privateJwk) as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )
      let exportable = true
      try {
        await subtle.exportKey('jwk', imported)
      } catch {
        exportable = false
      }
      if (exportable) throw new Error('workerd exported a non-extractable key')
      return 'signer imported jwk/ECDSA P-256/extractable=false/["sign"], and workerd refuses to export such a key'
    })

    for (const [name, value] of [
      ['rejects-a-cryptokey', pair.privateKey],
      ['rejects-a-parsed-object', JSON.parse(privateJwk)],
      ['rejects-a-surplus-member', JSON.stringify({ ...JSON.parse(privateJwk), ext: true })],
      ['rejects-non-json', '{not json'],
    ] as const) {
      await record(name, async () => {
        try {
          await createIdentityClientAssertionWebCryptoSigner({
            ...options,
            privateJwk: value as string,
          })
        } catch (error) {
          if (error instanceof IdentityClientAssertionWebCryptoSignerFailure) {
            return 'refused with the one fixed failure'
          }
          throw new Error(`wrong failure: ${String(error)}`)
        }
        throw new Error('accepted')
      })
    }

    await record('code-exchange-fetch-init-accepted-by-workerd', async () => {
      // No network: constructing the Request is where workerd validates RequestInit.
      const request = new Request('https://accounts.cyberskills.co.th/v1/code/exchange', {
        ...CODE_EXCHANGE_FETCH_INIT,
        body: '{}',
        signal: new AbortController().signal,
      })
      if (request.method !== 'POST' || request.redirect !== 'manual') {
        throw new Error(`unexpected request shape: ${request.method} ${request.redirect}`)
      }
      return 'workerd accepted the production code exchange RequestInit'
    })

    await record('result-verification-accepts-identity-shape-on-workerd', async () => {
      // Self-signed fixture in Identity release 60920c9's exact envelope/claim/result shape,
      // verified through Academy's real importer + verifier port on workerd (no network).
      const resultPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
      ) as CryptoKeyPair
      const pub = await crypto.subtle.exportKey('jwk', resultPair.publicKey)
      const keySetDocument = JSON.stringify({
        issuer: 'https://accounts.cyberskills.co.th/v1/code/results',
        revision: 1,
        keys: [{
          algorithm: 'ES256',
          keyId: 'identity-result-prod-2026-08',
          publicJwk: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y },
          state: 'active',
        }],
        retiredKeyFingerprints: [],
        retiredKeyIds: [],
      })
      const imported = await importIdentityResultKeySet(keySetDocument)
      const now = new Date()
      const nowSeconds = Math.floor(now.getTime() / 1_000)
      const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const header = encode({ alg: 'ES256', kid: 'identity-result-prod-2026-08', typ: 'identity-code-exchange-result+jwt' })
      const nonceValue = 'n'.repeat(43)
      const claims = encode({
        aud: 'https://academy.cyberskills.co.th',
        clientId: 'academy-web',
        exp: nowSeconds + 60,
        iat: nowSeconds,
        iss: 'https://accounts.cyberskills.co.th/v1/code/results',
        result: {
          activation: { revision: 1, status: 'active' },
          audience: 'https://academy.cyberskills.co.th',
          issuer: 'https://supabase.cyberskills.co.th/auth/v1',
          nonce: nonceValue,
          serviceId: 'academy',
          subject: '00000000-0000-4000-8000-000000000000',
          verifiedEmail: 'canary@example.test',
        },
      })
      const signature = new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, resultPair.privateKey, new TextEncoder().encode(`${header}.${claims}`),
      ))
      const signedResult = `${header}.${claims}.${btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
      const verifier = createIdentityCodeExchangeResultVerifierPort({
        clock: () => now, clockSkewSeconds: 30, keySet: imported.keySet, maximumLifetimeSeconds: 120,
      })
      const verified = await verifier.verify({ signedResult }, {
        expectedAudience: 'https://academy.cyberskills.co.th',
        expectedClientId: 'academy-web',
        expectedNonce: nonceValue,
        expectedPrincipalIssuer: 'https://supabase.cyberskills.co.th/auth/v1',
        expectedServiceId: 'academy',
      })
      if (verified.subject !== '00000000-0000-4000-8000-000000000000' || verified.activation.status !== 'active') {
        throw new Error('verified result did not round-trip')
      }
      return 'importer + verifier accepted a 60 s ES256 result of the Identity shape on workerd'
    })

    await record('private-media-delivery-on-workerd-r2', async () => {
      // Real R2 binding API (local emulation) + real HMAC grant + real streamed Response.
      const bucket = env.COURSE_MEDIA
      if (!bucket) throw new Error('COURSE_MEDIA binding missing from the harness config')
      const key = 'basic-os-linux/os-what-it-does/lesson-demo.mp4' // registry id os-video-en
      const bytes = new Uint8Array(1_000)
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251
      await bucket.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
      try {
        const secret = 'workerd-check-media-secret-0123456789abcdef0123456789abcdef'
        const token = await issueMediaGrant({
          assetId: 'os-video-en',
          courseSlug: 'basic-os-linux',
          nodeId: 'os-what-it-does',
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
        }, secret)
        const mediaEnv = { MEDIA_SIGNING_SECRET: secret, COURSE_MEDIA: bucket }
        const full = await servePrivateMedia(
          new Request('https://academy.cyberskills.co.th/course-media/os-video-en', {
            headers: { cookie: `${MEDIA_DELIVERY_COOKIE}=${token}` },
          }),
          mediaEnv,
        )
        if (!full || full.status !== 200) throw new Error(`full GET status ${full?.status}`)
        const fullBytes = new Uint8Array(await full.arrayBuffer())
        if (fullBytes.byteLength !== 1_000 || fullBytes[999] !== 999 % 251) throw new Error('full body mismatch')
        const ranged = await servePrivateMedia(
          new Request('https://academy.cyberskills.co.th/course-media/os-video-en', {
            headers: { cookie: `${MEDIA_DELIVERY_COOKIE}=${token}`, range: 'bytes=100-199' },
          }),
          mediaEnv,
        )
        if (!ranged || ranged.status !== 206) throw new Error(`range GET status ${ranged?.status}`)
        const contentRange = ranged.headers.get('content-range')
        const rangedBytes = new Uint8Array(await ranged.arrayBuffer())
        if (contentRange !== 'bytes 100-199/1000' || rangedBytes.byteLength !== 100 || rangedBytes[0] !== 100) {
          throw new Error(`range mismatch: ${contentRange} ${rangedBytes.byteLength}`)
        }
        const denied = await servePrivateMedia(
          new Request('https://academy.cyberskills.co.th/course-media/os-video-en', {
            headers: { cookie: `${MEDIA_DELIVERY_COOKIE}=${token}x` },
          }),
          mediaEnv,
        )
        if (denied !== null) throw new Error('tampered grant was not refused')
        return 'R2 get with Headers range, 200 full body, 206 bytes 100-199/1000, tampered grant refused'
      } finally {
        await bucket.delete(key)
      }
    })

    const failed = checks.filter((check) => !check.passed)
    return Response.json({ ok: failed.length === 0, nonce, checks }, {
      status: failed.length === 0 ? 200 : 500,
    })
  },
}

export default handler
