// In-memory per-IP rate limiter (sliding window) — ขั้นต่ำสำหรับ pre-public phase
// ข้อจำกัดที่รู้: state อยู่ต่อ process (serverless instance ใหม่ = นับใหม่) —
// public release ต้องมี edge rate-limit จริง (บันทึกใน PENDING_USER_ACTION.md)

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10
// กัน state โตไม่จำกัดจาก key ปลอม (XFF หมุนค่า) — เกินเพดานแล้วกวาด key ที่
// หมด window ทิ้งก่อน (finding review lane); เพดานนี้พอสำหรับ pre-public
const MAX_TRACKED_KEYS = 10_000

const hits = new Map<string, number[]>()

function sweepExpired(now: number): void {
  for (const [key, times] of hits) {
    if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key)
  }
}

/** คืน true = อนุญาต, false = เกิน limit (ควรตอบ 429) — `now` inject ได้เพื่อ test */
export function allowRequest(key: string, now: number = Date.now()): boolean {
  if (hits.size >= MAX_TRACKED_KEYS && !hits.has(key)) sweepExpired(now)
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

export function resetRateLimiter(): void {
  hits.clear()
}

export const RATE_LIMIT = { WINDOW_MS, MAX_REQUESTS_PER_WINDOW }
