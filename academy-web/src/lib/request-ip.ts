// คีย์สำหรับ rate-limit ต่อผู้เรียกหนึ่งราย
export function clientKey(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  if (process.env.NODE_ENV === 'production') return 'missing-cf-connecting-ip'
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
