# Academy × Identity Control local playtest

นี่คือ playtest ของ journey จริงที่ผ่าน review แล้ว: ลงชื่อเข้าใช้ Academy ผ่าน Identity Control แล้วกลับมาที่ dashboard การทดลองเป็น **local-only** จึงไม่มี email จริง ไม่มีการส่งออกจากเครื่อง และไม่แตะ production

## เริ่มใช้งาน

เปิด Terminal ที่ `academy-web` แล้วรัน:

```bash
./scripts/playtest-identity-local.sh
```

สคริปต์จะตรวจว่า `identity-control` อยู่ข้าง Academy repo ตรวจพอร์ต `8788`, `5173`, และ `3000` ว่าว่าง จากนั้นเริ่ม service ทั้งสามตามลำดับและเก็บ log ไว้ที่ `.local/playtest-logs/` เมื่อเลิกใช้งานให้กด `Ctrl+C` ใน Terminal เพื่อปิดทุกอย่างโดยไม่ทิ้ง orphan process

ถ้าต้องการรัน self-verifier:

```bash
./scripts/playtest-identity-local.sh check
```

โหมดนี้จะเริ่ม service ครบก่อน รัน Playwright สำหรับ desktop และ mobile แล้วปิดทุกอย่างเสมอ

## ลำดับที่ควรลอง

1. เปิด `http://localhost:3000/sign-in?next=%2Fdashboard`
2. กดปุ่ม Identity Control ที่หน้า sign-in ของ Academy
3. ใส่ email อะไรก็ได้ใน Account Center แล้วกดขอ sign-in code
4. ใส่ code คงที่ `123456` แล้วกลับมาที่ Academy dashboard ในสถานะลงชื่อเข้าใช้

จุดที่อยากให้ลองพัง:

- ใส่ code ผิด แล้วสังเกตข้อความและการกลับมาแก้ไข
- กด `Use a different email` หลังเข้าสู่หน้ากรอก code
- Refresh กลางทางแล้วลองเดิน journey ต่อหรือเริ่มใหม่
- เปิดบนหน้าจอขนาดมือถือเพื่อดู responsive ของทุกหน้าจอ

## ข้อจำกัดของ local playtest

- sign-in code เป็นค่าคงที่ `123456`
- ไม่มี email จริงหรือการส่ง email
- entitlement ว่าง ดังนั้น dashboard จะแสดงสถานะ no-courses อย่างซื่อสัตย์
- ปุ่มและคอร์สจริงขึ้นอยู่กับ content ที่กำลังเขียนอยู่ จึงอาจยังไม่ครบ

## วิธีเก็บ feedback

จดเป็น bullet ต่อหน้าจอ โดยเรียงตามลำดับที่ลอง และระบุให้ชัดว่าอะไรงง อะไรช้า และอะไรอยากได้ แล้วส่งกลับมาใน chat พร้อมบอกว่าทดลองบน desktop หรือมือถือ
