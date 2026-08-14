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

type Check = { name: string, passed: boolean, detail: string }

const CLIENT_ID = 'academy-web'
const PURPOSE = 'lifecycle_pull' as const
const KEY_ID = 'academy-lifecycle-2026-08'

export default {
  async fetch(): Promise<Response> {
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
      const verified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.publicKey,
        signature,
        signingInput,
      )
      if (!verified) throw new Error('signature did not verify')
      return '64-byte signature verifies against the public key'
    })

    await record('imports-non-extractable-sign-only', async () => {
      const imported = await crypto.subtle.importKey(
        'jwk',
        JSON.parse(privateJwk) as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )
      if (imported.usages.length !== 1 || imported.usages[0] !== 'sign') {
        throw new Error(`usages ${JSON.stringify(imported.usages)}`)
      }
      let exportable = true
      try {
        await crypto.subtle.exportKey('jwk', imported)
      } catch {
        exportable = false
      }
      if (exportable) throw new Error('workerd exported a non-extractable key')
      return 'sign-only and refused export'
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

    const failed = checks.filter((check) => !check.passed)
    return Response.json({ ok: failed.length === 0, checks }, {
      status: failed.length === 0 ? 200 : 500,
    })
  },
}
