# AL-03: การบังคับใช้สถานะการมองเห็นคอร์ส (Course Visibility Enforcement)

บังคับใช้การตรวจสอบสถานะการมองเห็นคอร์สที่ปิด (unpublished หรือ retired) ครบทุกช่องทาง และเปลี่ยนเลข migration เป็น 0042 พร้อมผลทดสอบ unit, typecheck และ linter ครบถ้วน

## สรุปการแก้ไขตามข้อเสนอแนะของ Host Review (r1)

1. **เปลี่ยนเลข Migration และ Rollback เป็น 0042:**
   - เปลี่ยนชื่อจาก `0041_*` เป็น `0042_course_visibility_enforcement.sql` และ `0042_course_visibility_enforcement.rollback.sql` เพื่อแก้ปัญหาเลขลำดับชนกับ AL-05 (`0041_revoke_service_role_core_learner_tables.sql`)
   - อัปเดตการอ้างอิงไฟล์ใน `tests/unit/course-visibility-migration.test.ts` และ `tests/integration/course-visibility-migration.test.ts` ให้เป็น 0042
2. **การบังคับใช้สถานะ Visibility ในทุกระดับ:**
   - **Sitemap (`src/app/sitemap.ts`):** ดึง runtime visibility ต่อคอร์ส และกรองคอร์สที่เป็น `unpublished` หรือ `retired` ออกจาก sitemap ป้องกัน crawler หรือผู้ใช้เข้าถึงผ่าน search index
   - **Course Access (`src/lib/account/course-access.ts`):** `getCourseAccess` และ `authorizeCourseResource` ตรวจสอบสถานะ visibility ปฏิเสธการเข้าถึงบทเรียนทันทีแม้ผู้เรียนจะมี entitlement อยู่เดิมหากคอร์สไม่ใช่ `published`
   - **Start Page (`src/app/(site)/courses/[slug]/start/page.tsx`):** ตรวจสอบ visibility ก่อน redirect หรือแสดงปุ่มเริ่มเรียน และส่งคืน 404 ทันทีหากคอร์สไม่เปิด
   - **RPC Function (`supabase/migrations/0042_course_visibility_enforcement.sql`):** ปรับฟังก์ชัน `academy.enrol_free_course` ให้อ่านและล็อก `course_settings` (FOR SHARE) ตรวจสอบว่าคอร์สต้องเป็น `published` ก่อนอนุญาตให้ลงทะเบียนคอร์สฟรี และ rollback script คืนฟังก์ชันเดิมโดยไม่กระทบต่อ entitlement และ audit log เดิม
3. **ผลการทดสอบและการตรวจสอบ:**
   - ติดตั้ง dependencies ใน worktree ผ่าน `npm ci`
   - รัน unit test เฉพาะจุด, unit test ทั้งระบบ, typecheck และ eslint บนไฟล์ที่แก้ไขผ่านทั้งหมด

## ผลการยืนยัน (Verification)

- **Source PASS:** `git diff --check` ผ่าน (exit 0)
- **Unit (Targeted) PASS:**
  - `npm run test:unit -- tests/unit/course-access.test.ts tests/unit/free-course-journey.test.ts tests/unit/sitemap.test.ts tests/unit/course-visibility-migration.test.ts`
  - ผลลัพธ์: 4 test files passed, 29 tests passed (0 failed)
- **Unit (Full Suite) PASS:**
  - `npm run test:unit -- --testTimeout 15000`
  - ผลลัพธ์: 161 test files passed, 3,156 tests passed, 2 skipped, 13 failed (ตรงกับ baseline 13 known failures เดิม: identity-client-assertion x11, public-lesson x1, sign-out-route x1; ไม่มี failure ใหม่เพิ่มแม้แต่ตัวเดียว)
- **Typecheck PASS:**
  - `npx tsc --noEmit` -> TypeScript: No errors found (exit 0)
  - `npx tsc -p tsconfig.worker.json` -> TypeScript: No errors found (exit 0)
  - `npx tsc -p ops/academy-retention-worker/tsconfig.json` -> TypeScript: No errors found (exit 0)
- **Lint PASS:**
  - `npx eslint` บนไฟล์ที่แก้ไขทั้งหมด -> ESLint: No issues found (exit 0)
- **Native Postgres NOT_RUN:** การทดสอบ transactional rollback บน PostgreSQL จริงไม่สามารถรันใน sandbox ของ worker ได้

## การทดสอบที่ส่งมอบให้ Host (Host Verification)

- **HOST-E2E:** `npm run test:integration -- tests/integration/course-visibility-migration.test.ts` (cwd: `academy-web`)
  - หมายเหตุ: ต้องการ local Postgres ที่ผ่านการ migrate ถึง `0042` และมี `TEST_DATABASE_URL` ชี้ไปที่ loopback database
