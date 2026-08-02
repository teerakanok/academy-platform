/**
 * handler ที่ `opennextjs-cloudflare build` สร้างขึ้นตอน build
 *
 * ประกาศไว้เองเพราะไฟล์จริงอยู่ใน `.open-next/` ซึ่งไม่มีในทรีที่สะอาด — ถ้าไม่ประกาศ
 * การ typecheck บนเครื่องที่ยังไม่เคยรัน `build:cf` จะพังทั้งที่โค้ดไม่ผิด
 */
declare module '*/.open-next/worker.js' {
  const handler: { fetch: ExportedHandlerFetchHandler }
  export default handler
}
