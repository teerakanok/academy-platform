// สำเนาเฉพาะ interface ที่ client-assertion.ts import แบบ type-only จาก
// identity-control/packages/core/src/index.ts — ไฟล์นี้ไม่ใช่ของ producer ทั้งไฟล์
export interface TrustedClientAuthenticator {
  authenticate(clientId: string, assertion: string): Promise<boolean>
}
