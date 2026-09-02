# เปิดเล่น Academy บน Cloudflare runtime

> เขียนไว้สำหรับ founder — 2026-08-01
> นี่คือการรันบน **workerd** ซึ่งเป็น runtime ตัวเดียวกับที่ Cloudflare ใช้จริง
> ไม่ใช่ Node ปกติ สิ่งที่เห็นตรงนี้จึงเป็นตัวแทนของ production ได้

> **ตอนนี้เปิดรออยู่แล้วที่ http://127.0.0.1:8788** — ถ้าเปิดแล้วไม่ขึ้น
> แปลว่า wrangler ถูกปิดไป ให้รันข้อ 3 ใหม่

## เปิดยังไง

ต้องมีสามอย่างรันอยู่ ตามลำดับนี้

```bash
cd products/cyberskills/academy-platform/academy-web

# 1) ฐานข้อมูล + ระบบบัญชี (local Supabase) — ข้ามได้ถ้ารันอยู่แล้ว
./node_modules/.bin/supabase start

# 2) build สำหรับ Cloudflare
./node_modules/.bin/opennextjs-cloudflare build

# 3) รันบน runtime ของ Cloudflare
./node_modules/.bin/wrangler dev --port 8788 --local
```

**บทที่อยากให้ลองที่สุดตอนนี้:** คอร์ส *Content formats* → บท **Set it up yourself**
โจทย์จำลองหน้าจอตั้งค่า IP จริง สองโจทย์บนหน้าจอเดียวกันที่คำตอบตรงข้ามกัน

เปิด **http://127.0.0.1:8788**

## เข้าสู่ระบบ

ใส่อีเมลอะไรก็ได้ (ไม่ต้องมีจริง) แล้วไปอ่านรหัส 6 หลักที่กล่องจดหมายทดสอบ

**http://127.0.0.1:54324** ← อีเมลทุกฉบับจากระบบมาโผล่ที่นี่

## ลองอะไรบ้าง

**หน้าร้านที่เปิดให้ทุกคน** (ไม่ต้องล็อกอิน — คือสิ่งที่ Google กับการแชร์ลิงก์เห็น)
- `/` · `/courses` · `/courses/basic-os-linux`

**สิ่งที่ต้องมีบัญชี** (ลองเปิดตอนยังไม่ล็อกอิน จะถูกเด้งไปหน้าสมัคร แล้วพากลับมาที่เดิม)
- บทเรียน · quiz · lab · `/dashboard`

**เส้นทางการเรียนที่อยากให้ลองจริงๆ**
1. เปิดคอร์ส Basic OS & Linux แล้วดู roadmap — บทไหนล็อก บทไหนเปิด บทไหนเป็นด่านบังคับ
2. เข้าบทหนึ่ง ลองกด **"See what it covers"** แล้วติ๊กข้อที่รู้อยู่แล้ว — ระบบจะบอกว่า
   เหลืออะไรใหม่สำหรับคุณ (ติ๊กครบไม่ได้ปลดล็อกอะไร ตั้งใจให้เป็นเครื่องช่วยคิด)
3. อ่านจนจบ เจอการ์ด **Key ideas to keep** แล้วค่อยเจอ quiz
4. ลอง **"Hide the lesson while I answer"** ก่อนตอบ
5. กลับไปหน้าคอร์ส ดูสถานะใบรับรอง — จะบอกว่าเหลือกี่บทและกดไปทำต่อได้เลย
6. บทที่มี lab: `permissions` (lab สั้นแบบ inline) และคอร์ส demo มีทั้ง inline + เต็มจอ

**พิสูจน์ว่าความคืบหน้าผูกกับบัญชีจริง**
เรียนไปสักสองบท → กด Sign out → ล็อกอินใหม่ด้วยอีเมลเดิม → ความคืบหน้ายังอยู่ครบ
(เปิดหน้าต่าง incognito แล้วล็อกอินอีเมลเดิมก็เห็นเหมือนกัน — คนละเครื่องก็ยังเป็นคนเดียวกัน)

**ย่อหน้าต่างให้แคบกว่า 640px** เพื่อดูฝั่งมือถือ — header จะสลับเป็น "Academy"
และเว็บต้องไม่เลื่อนซ้ายขวาได้

## ที่ยังไม่มี (ตั้งใจ)

- **Google sign-in** — เคาะแล้วว่าจะมี แต่ต้องใช้ OAuth credential จริง ทำตอน deploy
- **lab ของจริง** — ตอนนี้เป็นโครงว่าง ตัว lab plane มาใน M4
- **ใบรับรองที่ออกได้จริง** — กติกาว่าใครมีสิทธิ์ทำแล้ว แต่ยังไม่ได้ออกเป็นเอกสาร
  (ต้องมีชื่อจริง + หน้า verify ก่อน)
- **deploy ขึ้น Cloudflare แล้ว:**
  https://cyberskills-academy.songpon-te.workers.dev
  production sign-in แสดง Account Center handoff แล้ว และ canonical domain
  `https://academy.cyberskills.co.th` อยู่หลัง Cloudflare Access. ห้ามใช้อีเมลสมมติหรือ
  ขอรหัสซ้ำบน production; full journey ต้องใช้ existing Access session และ canary ที่
  owner อนุมัติไว้แล้ว. Account Center ใช้ Turnstile คนละ challenge สำหรับเริ่ม
  authorization และส่งรหัส ห้าม reuse challenge เดิม. ให้ owner กรอก email และรหัสใน
  browser เอง; ส่งรหัสครั้งเดียวเมื่อ owner อยู่หน้าจอ แล้วหยุดตรวจ provider outcome ก่อน
  retry ใดๆ.
  production deploy/rollback ต้องทำตาม `docs/maintenance/academy-operations-runbook.md`
  และใช้ pinned immutable release helper เท่านั้น; `npm run deploy:cf` ไม่ใช่ production
  operator path.

## ถ้าอะไรพัง

```bash
# ดู log ของ worker
tail -50 /tmp/wd4.log

# เริ่มใหม่ทั้งชุด
pkill -f wrangler; ./node_modules/.bin/opennextjs-cloudflare build && ./node_modules/.bin/wrangler dev --port 8788 --local
```

ถ้า Supabase ล่ม หน้าร้านยังเปิดได้ (เป็น static) แต่ล็อกอินกับ progress จะใช้ไม่ได้ —
เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ทั้งเว็บล่มพร้อมกัน
