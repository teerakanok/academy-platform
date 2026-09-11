# Academy — handoff ปิด session 2026-09-11 (รอบ "ทำให้ identity solid สุดๆ")

สำหรับ session ถัดไปที่จะทำงานต่อบน Academy — อ่านฉบับนี้ก่อน

## สถานะ production ณ ปิด session

| ส่วน | รุ่นที่ LIVE | เนื้อใน |
|---|---|---|
| Worker | `509c93a8` (deploy 2026-09-11 ค่ำ) | เปิดสาธารณะ + SEO index on + **F-1 ssoSignoutUrl** |
| origin/main | `0fecdba` | ทุกอย่าง push แล้ว |
| สถานะเว็บ | **สาธารณะเต็มตัว** — CF Access ถูกถอด (founder ลบ 2026-09-11) | robots allow + sitemap + meta index,follow |

Deploy: `cd academy-web && npm run build:cf && npx wrangler deploy --autoconfig=false --keep-vars`
(ระวัง: `node_modules` เคยเป็น symlink ค้างชี้ /tmp — ถ้า build fail ERR_MODULE_NOT_FOUND
ให้ `rm node_modules && npm ci` ก่อน)

## สิ่งที่ session นี้ทำ

1. **เปิดตัวสาธารณะ** — หลัง founder ลบ CF Access: flip `NEXT_PUBLIC_SEARCH_INDEXING=on`
   (c1f614a) rebuild + deploy — **ห้าม set กลับ off โดยไม่บอก founder** เพราะ robots/sitemap/
   meta index ทั้งหมด bind กับค่านี้ตอน build (static routes ต้อง rebuild ไม่ใช่แค่แก้ var)
2. **F-1 ปิดจริง** — `/api/auth/sign-out` (branch production) ตอบ `ssoSignoutUrl`
   จาก `APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.accountCenter.origin`;
   client `AccountMenu` ยิง same-site no-cors keepalive POST ก่อน reload
   projection (`account-response-client.ts`) accept ทั้งรูป fixture (3 branch เดิม)
   และรูป production ที่มี URL — bound https + 256 ตัวอักษร + strict key set
   test: `tests/unit/auth-sign-out-sso.test.ts` 5 เขียว; verify live: sign-out response
   มี `ssoSignoutUrl` จริงบน production
3. คอร์สใน repo รวม 361 บท — 3 คอร์สใหม่ (comptia-securityx, iccs423,
   agentic-ai-secure-implementation-banking) เป็น **internal รอ founder กด publish**
   ที่ `/admin/courses`

## สิ่งที่แนะนำให้ทำต่อ (เรียงตามคุ้มค่า)

1. **เล่น F-1 จริง** — sign-in Academy → เปิด crux (ไม่ต้อง login ซ้ำ) → sign-out จาก
   Academy → กลับมา crux (ต้องขอ OTP ใหม่) — ยังไม่เคยผ่านมือคนบน production
2. **F-2 lifecycle pull (~2 ชม.)** — โค้ด+test มีแล้ว เปิดด้วย wrangler config
   (flag ใน `consumer-policy.ts` คือ `enabled: false` + kill-switch owner)
   ทำให้การระงับ account มีผลทันที — ประสานกับ Identity ก่อนเปิด
   (ต้อง publish lifecycle materialization ฝั่ง IdP)
3. **F-4 (MEDIUM)** — data API ใช้ symmetric secret เดี่ยว (HS256 `academy_runtime`)
   ย้ายเป็น ES256 pattern เหมือน client assertion ~2 วัน — คุรมี rotation path
4. **Publish 3 คอร์สใหม่** — รอ founder เลือกเวลาเปิด (เทอมเริ่ม) ผ่าน `/admin/courses`
   แล้วตรวจว่า sitemap จับหน้าคอร์สใหม่ด้วย (ปัจจุบัน sitemap รวมเฉพาะ public courses)
5. **Certificate verify noindex** — `/api/certificate/verify` ใส่ x-robots-tag noindex
   ถูกแล้ว (เป็น API) แต่ควรมีหน้า `/verify` UI สาธารณะสำหรับพิมพ์์โค้ด
   (ตอนนี้คนต้องรู้ URL pattern) — งาน UX เล็ก
6. **Onboarding name** — design doc ใน director รอ founder ตัดสินใจ
   (ผูกกับทั้ง Crux/Academy — ทำพร้อมกัน)

## ข้อควรระวัง

- `NEXT_PUBLIC_SEARCH_INDEXING` มีผล **ตอน build** (robots.ts/sitemap.ts prerender) —
  เปลี่ยนค่าแล้วต้อง rebuild ไม่ใช่แค้ deploy var
- `NEXT_PUBLIC_SEARCH_INDEXING=on` อยู่ใน `wrangler.jsonc` ด้วย (สำหรับ runtime reads)
  สองที่ต้องตรงกัน
- mutation API ทั้งหมดผ่าน `validateMutationRequest` (origin gate) — ทดสอบด้วย curl
  ต้องใส่ `Origin: https://academy.cyberskills.co.th`
- อย่าเพิ่มไฟล์ mp4/vtt/pdf/zip ใน `.open-next/assets` (asset-guard จะ fail build)
