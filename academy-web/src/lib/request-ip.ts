// คีย์สำหรับ rate-limit ต่อผู้เรียกหนึ่งราย
//
// pre-public (หลัง Zero Trust) — XFF พอสำหรับขั้นต่ำ; edge rate-limit จริงเป็นเงื่อนไข
// ของ public release (ดู PENDING_USER_ACTION.md) และถ้าไปอยู่บน Cloudflare จริง
// ให้ใช้ `cf-connecting-ip` ซึ่ง Cloudflare เขียนเองและปลอมจากฝั่งผู้ใช้ไม่ได้
export function clientKey(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
