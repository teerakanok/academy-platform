// พื้นผิวที่เปิดเฉพาะภายใน — ปิดไว้ก่อนเสมอ (fail-closed)
//
// `/player` เป็นเครื่องข้อสอบที่ยังตรวจคำตอบฝั่ง client และรับเฉลยไปทั้งชุด
// (`src/lib/player/scoring.ts`) · แผน 2026-08-02 §5 W0-1 ล็อกว่า **ไม่แก้ในเฟสนี้**
// โดยให้เหตุผลว่ามันเป็น INTERNAL ONLY ตาม CAS-005 — ข้อยกเว้นนั้นจะจริงก็ต่อเมื่อ
// "ภายในเท่านั้น" ถูกบังคับด้วยโค้ด
//
// RIL cross-model จับว่าเดิมมันไม่จริง: middleware ปล่อยผู้ล็อกอิน **ทุกคน** ผ่าน
// และมีลิงก์จากเมนูกับหน้า dashboard ด้วย แปลว่าผู้เรียนที่สมัครฟรี (D1 เปิดสมัครเสรี)
// เปิดคลังข้อสอบพร้อมเฉลยได้ทันที · เทสที่มีอยู่ตรวจแค่ผู้ไม่ล็อกอิน จึงเขียวทั้งที่รูเปิด
//
// กติกา: ต้องตั้ง `INTERNAL_SURFACES=on` อย่างชัดเจนถึงจะเปิด — ไม่ตั้ง = ปิด
// ค่านี้ไม่ใช่ `NEXT_PUBLIC_` โดยเจตนา: การตัดสินเกิดฝั่งเซิร์ฟเวอร์เท่านั้น

export function internalSurfacesEnabled(): boolean {
  return process.env.INTERNAL_SURFACES?.trim() === 'on'
}

/** เส้นทางที่ถือเป็นพื้นผิวภายใน — ใช้ร่วมกันระหว่าง middleware และหน้าเว็บ */
export function isInternalSurface(pathname: string): boolean {
  return pathname === '/player' || pathname.startsWith('/player/')
}
