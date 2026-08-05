/**
 * handler ที่ `opennextjs-cloudflare build` สร้างขึ้นตอน build
 *
 * ประกาศไว้เองเพราะไฟล์จริงอยู่ใน `.open-next/` ซึ่งไม่มีในทรีที่สะอาด — ถ้าไม่ประกาศ
 * การ typecheck บนเครื่องที่ยังไม่เคยรัน `build:cf` จะพังทั้งที่โค้ดไม่ผิด
 */
declare module '*/.open-next/worker.js' {
  // Wrapper สร้าง Request ใหม่เพื่อลบ marker ที่ผู้เรียกปลอมมาและใส่ marker หลัง
  // edge limit ผ่านแล้ว. Request ที่สร้างใหม่ยังมี CfProperties ได้ แต่ไม่ใช่
  // IncomingRequestCfProperties แบบ immutable ของ request แรกเข้า.
  const handler: {
    fetch: (
      request: Request<unknown, CfProperties<unknown>>,
      env: unknown,
      ctx: ExecutionContext,
    ) => Response | Promise<Response>
  }
  export default handler
}
