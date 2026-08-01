import { createHash, randomBytes } from 'node:crypto'
import {
  IdentityAdapterError,
  type AuthorizationRequest,
  type ExchangeResult,
  type IdentityAdapter,
} from './adapter'

// Adapter ปลอมสำหรับ dev และเทส
//
// มีไว้เพื่อให้ Academy สร้าง flow ทั้งเส้นได้ตั้งแต่ Identity Control ยังไม่ deploy
// (ทิศทางระบุชัดว่า "อย่ารอ Identity Control ยกเว้นงานที่ต้องใช้ issuer จริง")
//
// ตัวนี้บังคับกฎเดียวกับของจริงทุกข้อ ไม่ใช่ stub ที่ตอบ ok เสมอ — ถ้าเทสผ่านกับตัวนี้
// แล้วไปพังกับของจริง แปลว่า fake หลวมเกินไปและไม่ได้ทำหน้าที่ของมัน:
//   · code ใช้ได้ครั้งเดียว
//   · ต้องมาพร้อม PKCE verifier ที่ hash แล้วตรงกับ challenge ตอน start
//   · redirect_uri ตอนแลกต้องตรงเป๊ะกับตอน start
//   · หมดอายุ

interface PendingTransaction {
  clientId: string
  redirectUri: string
  codeChallenge: string
  nonce: string
  serviceId: string
  expiresAt: number
  principal: { issuer: string; subject: string; verifiedEmail: string }
  activation: ExchangeResult['activation']
}

const CODE_TTL_MS = 60_000

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export class FakeIdentityAdapter implements IdentityAdapter {
  readonly name = 'fake'
  // ห้ามใช้บน production เด็ดขาด — ตัวนี้เชื่อ email ที่ส่งเข้ามาโดยไม่ยืนยันอะไรเลย
  readonly productionSafe = false

  private readonly codes = new Map<string, PendingTransaction>()
  private readonly issuer: string

  constructor(issuer = 'https://accounts.cyberskills.co.th') {
    this.issuer = issuer
  }

  async startAuthorization(request: AuthorizationRequest): Promise<{ authorizeUrl: string }> {
    // ของจริง Account Center จะเป็นคนถาม email + OTP; ตัวปลอมรับ email ผ่าน query
    // เพื่อให้เทสระบุตัวผู้ใช้ได้ — จุดนี้คือสิ่งที่ทำให้มัน production-unsafe
    const url = new URL('/__fake-account-center/authorize', 'http://localhost')
    url.searchParams.set('state', request.stateRef)
    url.searchParams.set('client_id', request.clientId)
    return { authorizeUrl: url.toString() }
  }

  /** ใช้ในเทสแทนขั้นตอนที่ผู้ใช้ยืนยัน OTP ที่ Account Center */
  issueCodeForTest(
    request: AuthorizationRequest,
    principal: { subject: string; verifiedEmail: string },
    activation: ExchangeResult['activation'] = { status: 'active', revision: 1 },
  ): string {
    const code = randomBytes(24).toString('base64url')
    this.codes.set(code, {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      nonce: request.nonce,
      serviceId: request.serviceId,
      expiresAt: Date.now() + CODE_TTL_MS,
      principal: { issuer: this.issuer, ...principal },
      activation,
    })
    return code
  }

  async exchangeCode(input: {
    clientId: string
    redirectUri: string
    code: string
    codeVerifier: string
  }): Promise<ExchangeResult> {
    const tx = this.codes.get(input.code)
    if (!tx) throw new IdentityAdapterError('ไม่พบ code หรือถูกใช้ไปแล้ว', 'invalid_code')
    // ใช้ครั้งเดียว — ลบทันทีที่หยิบมาได้ ไม่ว่าผลจะผ่านหรือไม่
    this.codes.delete(input.code)

    if (Date.now() > tx.expiresAt) throw new IdentityAdapterError('code หมดอายุ', 'expired')
    if (tx.clientId !== input.clientId) throw new IdentityAdapterError('client ไม่ตรง', 'audience_mismatch')
    if (tx.redirectUri !== input.redirectUri) {
      throw new IdentityAdapterError('redirect_uri ไม่ตรงกับตอนเริ่ม', 'audience_mismatch')
    }
    if (s256(input.codeVerifier) !== tx.codeChallenge) {
      throw new IdentityAdapterError('PKCE verifier ไม่ตรงกับ challenge', 'invalid_code')
    }

    return {
      issuer: tx.principal.issuer,
      subject: tx.principal.subject,
      verifiedEmail: tx.principal.verifiedEmail,
      audience: tx.clientId,
      serviceId: tx.serviceId,
      nonce: tx.nonce,
      activation: tx.activation,
    }
  }
}
