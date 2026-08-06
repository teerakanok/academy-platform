// ขอบเขตระหว่าง Academy กับ Identity Control
//
// ทิศทางที่ล็อกแล้ว (founder 2026-08-01): Identity Control เป็นทางเข้ากลางที่
// accounts.cyberskills.co.th ทั้งการสมัครและเข้าสู่ระบบ — Academy จะ redirect ไปที่นั่น
// แล้วรับ one-time code กลับมาแลกที่ backend ของตัวเอง
//
// contract ตัวจริงอยู่ที่ products/cyberskills/identity-control/packages/contracts
// (`AuthorizationStart`, `CodeExchange`, `ExchangeResult`) — ชนิดข้างล่างสะท้อนส่วน
// interface ที่ Academy ต้องใช้ รวมถึง client assertion ของ backend
// โดยไม่ import ข้ามรีโป เพราะ Academy ยังไม่ควรผูก build กับรีโปที่ยัง bootstrap อยู่
// เมื่อ Identity Control publish package แล้วให้เปลี่ยนมา import ของจริงและลบชนิดซ้ำนี้
//
// กฎที่ห้ามผิด และเป็นเหตุผลที่ต้องมี boundary นี้ตั้งแต่ยังไม่ต่อจริง:
//   1. **ห้าม product ค้นหา/รวม/สร้าง identity ด้วย email เอง** — Identity Control
//      เท่านั้นที่ตัดสินว่า email นี้คือ principal เดิมหรือคนใหม่
//   2. map ผู้ใช้ด้วย (canonical issuer, subject) เท่านั้น · email เป็น attribute
//      ที่ยืนยันแล้วและเปลี่ยนได้ ไม่ใช่กุญแจความเป็นเจ้าของ
//   3. callback ผ่าน browser ได้แค่ one-time code + state — ห้ามมี subject, email,
//      token, OTP หรือ invite code วิ่งผ่าน URL
//   4. session ของ product เป็น host-scoped ไม่มี cookie ระดับโดเมนแม่

export type ActivationStatus = 'pending' | 'active' | 'suspended' | 'deactivated'

/** ผลจากการแลก one-time code — ผูกกับ audience ของ product ที่ขอ */
export interface ExchangeResult {
  /** issuer ตามรูปแบบ canonical ของ ecosystem ไม่ใช่ URL ที่ product เดาเอง */
  issuer: string
  subject: string
  verifiedEmail: string
  audience: string
  serviceId: string
  nonce: string
  activation: {
    status: ActivationStatus
    revision: number
  }
}

export interface AuthorizationRequest {
  clientId: string
  redirectUri: string
  stateRef: string
  nonce: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  serviceId: string
}

/**
 * Obtains a code-exchange assertion from Academy's server-side key boundary.
 * The browser never supplies this value. The real provider cannot be written
 * until Identity Control releases the registered key/rotation contract.
 */
export interface IdentityClientAssertionProvider {
  createClientAssertion(input: { audience: string }): Promise<string>
}

export interface IdentityAdapter {
  /** ชื่อสำหรับ log และสำหรับกันไม่ให้ adapter ที่ใช้ได้เฉพาะ dev หลุดขึ้น production */
  readonly name: string
  /** ปลอดภัยพอจะใช้บน production ไหม — ตัวที่ไม่ผ่านต้องถูกปฏิเสธตั้งแต่ตอน boot */
  readonly productionSafe: boolean
  /** เริ่ม transaction แล้วคืน URL ที่จะพา browser ไป Account Center */
  startAuthorization(request: AuthorizationRequest): Promise<{ authorizeUrl: string }>
  /** แลก code ที่ backend เท่านั้น — ต้องส่ง PKCE verifier ที่ไม่เคยออกไปฝั่ง browser */
  exchangeCode(input: {
    clientId: string
    /** ES256 compact JWS from Academy's server-held signer; never browser input. */
    clientAssertion: string
    redirectUri: string
    code: string
    codeVerifier: string
  }): Promise<ExchangeResult>
}

export class IdentityAdapterError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid_code' | 'expired' | 'audience_mismatch' | 'unavailable',
  ) {
    super(message)
    this.name = 'IdentityAdapterError'
  }
}
