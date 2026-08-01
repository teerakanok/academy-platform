// ระบบบัญชีเปิดใช้งานได้จริงหรือยัง
//
// ตัวชี้วัดคือ "ตั้งค่าครบไหม" ไม่ใช่ flag แยกต่างหาก — flag ที่ต้องตั้งเองมักถูกลืม
// แล้วหน้าเข้าสู่ระบบจะโชว์ฟอร์มที่กดแล้ว error ซึ่งแย่กว่าบอกตรงๆ ว่ายังไม่เปิด
export function accountsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
