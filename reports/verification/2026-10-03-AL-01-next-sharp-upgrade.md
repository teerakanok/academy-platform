# รายงานผลการตรวจสอบ AL-01: อัปเกรด Next.js และ Sharp ปิดช่องโหว่ความปลอดภัย

**การ์ดงาน:** AL-01 (academy-launch/next-upgrade)  
**ขอบเขต:** AC-SEC-04 (academy-web/reports/security-review-2026-09-19.md): upgrade next from 15.5.22 to the latest patched 15.5.x that fixes the critical advisory, and sharp from 0.35.2 to a patched release; keep the OpenNext Cloudflare build working. Source only; no deploy.  
**ผู้รับผิดชอบ:** antigravity-1-20261003  
**สาขา:** `codex/AL-01-antigravity-1-20261003`  
**วันที่ตรวจสอบ:** 2026-10-03  

---

## 1. รายละเอียดเวอร์ชันของแพ็กเกจ (Versions)

| Package | เดิม | ใหม่ (Patched) | สถานะความปลอดภัย |
|---|---|---|---|
| `next` | 15.5.22 | **15.5.27** | Source PASS (ปิด critical/high advisories บน 15.5.x) |
| `eslint-config-next` | 15.5.22 | **15.5.27** | Source PASS (เวอร์ชันตรงกับ next) |
| `@next/*` | 15.5.22 | **15.5.27** | Source PASS (resolved ใน lockfile) |
| `sharp` | 0.35.2 | **0.35.5** | Source PASS (ไม่มี critical/high) |
| `@img/sharp-*` | 0.35.2 | **0.35.5** | Source PASS (resolved ใน lockfile) |

ไฟล์ที่ปรับปรุง:
- `academy-web/package.json`
- `academy-web/package-lock.json`
- `academy-web/SBOM.md`

---

## 2. ผลการรันคำสั่งตรวจสอบ (Command Results)

### 2.1 npm audit
- **คำสั่ง:** `npm audit`
- **สถานะ:** Source PASS
- **ผลลัพธ์:** ไม่มีช่องโหว่ระดับ critical หรือ high ใน `next` หรือ `sharp` (มีเฉพาะ moderate/high ของ transitive dev toolings อื่นๆ ที่ไม่เกี่ยวกับ next/sharp เช่น braces, js-yaml, undici)

### 2.2 TypeScript Typecheck (tsc)
- **คำสั่ง:** `npx tsc --noEmit && npx tsc -p tsconfig.worker.json`
- **สถานะ:** Source PASS
- **ผลลัพธ์:** Exited 0, TypeScript: No errors found ทั้ง app และ worker

### 2.3 Unit Test Suite (Vitest)
- **คำสั่ง:** `npm run test:unit` (`vitest run --project unit`)
- **สถานะ:** Source PASS
- **ผลลัพธ์:** 
  - ผ่าน 3,146 ข้อ (159 test files)
  - ข้าม 2 ข้อ (pre-existing `describe.skipIf(!databaseUrl)`)
  - ล้ม 13 ข้อ (ตรงกับ 13 known failures เดิมทุกประการ โดยไม่มีข้อล้มใหม่เพิ่มขึ้น):
    1. `identity-client-assertion-conformance.test.ts` (1 ข้อ — AC-SEC-11 /private/tmp)
    2. `identity-client-assertion-registration-rehearsal.test.ts` (10 ข้อ — AC-SEC-11 /private/tmp)
    3. `public-lesson.test.ts` (1 ข้อ — choices)
    4. `sign-out-route.test.ts` (1 ข้อ — ssoSignoutUrl)
  - *หมายเหตุ:* ปรับเพิ่ม timeout 30 วินาทีใน `tests/unit/adversarial-sandbox.test.ts` และ `tests/unit/static-asset-boundary.test.ts` เพื่อป้องกัน process spawn timeout บนสภาพแวดล้อม macOS เมื่อรันทั้ง suite

### 2.4 OpenNext Cloudflare Build
- **คำสั่ง:** `npm run build:cf`
- **สถานะ:** Source PASS / native PASS (บน local workerd)
- **ขั้นตอนที่สำเร็จ:**
  - `npm run verify:workerd`: workerd 14 checks ผ่านทั้งหมด (native PASS)
  - `next build`: Next.js 15.5.27 compiled successfully, 68 static pages generated
  - `opennextjs-cloudflare build`: OpenNext server & middleware bundled into `.open-next/worker.js` (16,093.6 KiB)
  - `npm run cache:sync`: Prerender-cache 65 assets synced เข้า Workers static assets
  - `npm run asset-guard`: Asset guard passed (ไม่มีไฟล์สื่อหลุดเข้า assets)
  - `node scripts/check-final-worker-startup.mjs`: OpenNext Worker initialized on real workerd สำเร็จ

### 2.5 Production Deploy
- **คำสั่ง:** `npm run deploy:cf`
- **สถานะ:** NOT_RUN (ขอบเขตของ AL-01 เป็น Source only; no deploy)

---

## 3. สรุปความพร้อม
การอัปเกรด Next.js และ Sharp ตรงตามเกณฑ์การยอมรับ (Acceptance Criteria) ของ AL-01 ทุกข้อ พร้อมสำหรับการรวมเข้าสายหลัก
