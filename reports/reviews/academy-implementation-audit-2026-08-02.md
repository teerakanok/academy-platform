# Academy implementation audit — 2026-08-02

## Verdict

**ยังไม่ควรเปิด production traffic หรือถือว่า implementation เดิมพร้อมออก certificate**

ชุดทดสอบปัจจุบันผ่านทั้งหมด แต่การตรวจ implementation จริงพบ blocker ที่ test suite
ยังไม่ครอบคลุม โดยเฉพาะ auth cookie, CSRF, entitlement, request-body DoS และ race ระหว่าง
การ reclaim/finalize attempt ผลเหล่านี้ต้องถูกปิดก่อนเปิดใช้งานจริง ส่วนงาน Pool A ที่แตะ
production schema/PGRST ยังคงรอ authorization ใหม่ตาม handoff และไม่ได้ถูกแตะในการ audit นี้

### Remediation update — 2026-08-03

Local Security Batch ปิดข้อ 1–4 ของรายงานนี้แล้ว และปิดช่องข้าม prerequisite ระดับบทที่
review รอบ implementation พบเพิ่ม: cookie policy เป็น `HttpOnly`/`SameSite=Lax` และ
fail-secure บน production, auth mutation ที่ไม่ผ่าน HTTPS edge ถูกปฏิเสธ, mutation routes
ใช้ same-origin/JSON boundary, public JSON ใช้ bounded stream parser และ course resource
ต้องผ่าน activation + entitlement + node unlock ก่อนทุก read/write path

Learner surface แยก inactive/unavailable/access-lost ออกจาก progress ว่าง, dashboard แสดง
เฉพาะคอร์สที่มีสิทธิ์, denial ไม่มี CTA วนกลับ และ sign-out failure ไม่ถูกแสดงเป็นสำเร็จ
หลักฐานล่าสุด: lint/typecheck ผ่าน, unit/integration 388 tests ผ่าน, clean build ผ่าน และ
Playwright 121 passed / 10 skipped; denied-path E2E ครบ progress GET/POST/reset, attempts,
explanations, practice, lesson, partial entitlement และ sign-out fallback พร้อมยืนยันว่า
progress/attempt DB ไม่เปลี่ยน; independent Code/Security/UX review = C0/H0/M0 ทุก lane

Verdict รวมยังคง **ห้าม production** เพราะข้อ 6–7 และ launch gates ด้าน private media,
durable abuse control, least-privilege credential, privacy/retention และ dependency advisories
ยังเปิดอยู่ งานถัดไปตามลำดับคือ Learner-Safety Batch; Pool A, R2, deploy และ secrets ไม่ถูกแตะ
ใน remediation นี้

Integrity Batch ปิดข้อ 5 และ debt เรื่อง explanation snapshot แล้ว: claim token + atomic
progress/outcome, access/reset generation fence ครบทุก progress mutation, monotonic activation
revision และ persisted explanation snapshot ผ่าน deterministic concurrency tests หลักฐานล่าสุด
คือ Vitest 413/413, clean build, DB lint, Playwright 122 passed / 10 skipped และ independent
Code/Security/UX review C0/H0/M0 ทุก lane งานถัดไปคือ Learner-Safety Batch; verdict ห้าม
production ยังไม่เปลี่ยนเพราะข้อ 6–7 และ launch gates ข้างต้นยังเปิด

Learner-Safety checkpoint 1 ปิดข้อ 11 แล้ว: readiness แยกตาม mode และมากับ attempt
snapshot, server validate ก่อน consume, legacy attempt/policy ถูก normalize แบบ fail-closed,
Apply state และ mobile form ตรงกับงานจริง และ validation คงคำตอบกับใบเดิม หลักฐานล่าสุดคือ
Vitest 426/426, clean build, Playwright 124 passed / 10 skipped และ independent
Code/Security/UX review C0/H0/M0 ทุก lane; verdict production ยังไม่เปลี่ยน

## Scope และหลักฐาน

ตรวจจาก HEAD `63f2062861118e3b446e14752c3e052645128d56` บน `main` ครอบคลุม:

- implementation และ migrations ที่แผน/บันทึกงานเดิมระบุว่าทำเสร็จแล้ว
- auth, identity, entitlement, attempts, progress, lesson/player, privacy และ public lead API
- code, security และ learner UX ผ่านผู้ตรวจอิสระสามเลน
- runtime verification ด้วย Node `24.18.0` ตาม `.nvmrc`

ผล baseline:

| Gate | ผล |
|---|---|
| `npm run lint` | ผ่าน 0 errors; มี warning 1 จุดใน generated registry |
| `npm test` | ผ่าน 34 files / 347 tests |
| `npm run test:e2e` | ผ่าน 111; skipped 10 |
| `npm audit --omit=dev --audit-level=low` | พบ High 3 รายการ |
| worktree หลัง verification ก่อนบันทึกรายงาน | clean; screenshot artifacts ที่ Playwright เขียนทับถูกคืนเฉพาะไฟล์ generated เหล่านั้น |

การ audit นี้วัด implementation ปัจจุบันและ acceptance claims ของงานเดิม ไม่ได้อ้างว่า
ทุก historical commit ปลอด defect หากโค้ดนั้นไม่อยู่ใน HEAD แล้ว

## P0 — ต้องแก้ก่อน production traffic

### 1. Session cookies ไม่ได้บังคับ `HttpOnly` และ `Secure` — ปิดใน local batch

`academy-web/src/lib/auth/session.ts:31`, `academy-web/src/lib/auth/route-client.ts:11` และ
`academy-web/src/middleware.ts:67` สร้าง Supabase server client โดยไม่กำหนด `cookieOptions` ขณะที่
ค่า default ของ `@supabase/ssr` รุ่นที่ติดตั้งตั้ง `httpOnly: false` ไม่มี browser-side
Supabase client ที่จำเป็นต้องอ่าน token อยู่แล้ว จึงเป็น exposure ที่ไม่มีประโยชน์รองรับ

ผลกระทบ: XSS สามารถอ่าน auth token จาก cookie ได้ และ production ไม่ได้บังคับส่ง cookie
เฉพาะ HTTPS ในระดับ application config

ทางแก้: รวม server-client factory ให้ใช้ cookie policy เดียว (`httpOnly`, production
`secure`, `sameSite`, `path`) และเพิ่ม integration/E2E assertion ครบทุก `Set-Cookie` chunk

### 2. Mutation endpoints ไม่มี same-origin/CSRF guard — ปิดใน local batch

`academy-web/src/app/api/progress/route.ts:116`, `academy-web/src/app/api/progress/reset/route.ts:11`,
`academy-web/src/app/api/attempts/route.ts:38` และ `academy-web/src/app/api/auth/sign-out/route.ts:6` เชื่อ session
cookie โดยไม่ตรวจ `Origin`/Fetch Metadata และ progress/attempt routes ไม่บังคับ JSON
content type

ผลกระทบ: subdomain ที่ถูกยึดภายใต้ site เดียวกันสามารถส่งคำขอเปลี่ยน progress, ใช้ quota,
reset ข้อมูล หรือ sign out ผู้เรียนได้; `SameSite=Lax` ไม่ปิด same-site attack นี้

ทางแก้: central mutation guard ที่ตรวจ origin/fetch metadata และ JSON content type พร้อม
integration tests ว่า sibling origin ได้ 403 และ DB ไม่เปลี่ยน

### 3. Entitlement มี helper แต่ไม่มี production path เรียกใช้ — ปิดใน app paths

`academy-web/src/lib/account/access.ts:53` กำหนด contract ว่าทุก content path ต้องเรียก
`hasCourseEntitlement()` แต่ lesson page, `/api/attempts`, `/api/progress`, explanations,
practice และ reset ตรวจเพียงว่าล็อกอินแล้ว

ผลกระทบ: account ที่หมดอายุ ถูก revoke หรือ suspended ยังอ่านบท ขอ attempt และบันทึก
progress ได้ ทำให้ activation/entitlement model ยังไม่ใช่ security boundary จริง

ทางแก้: สร้าง `requireCourseAccess()` จุดเดียวและใช้กับทุก course-data path โดยแยก media
boundary ออกมาตามข้อจำกัด `/media/*` ที่ทราบอยู่แล้ว

### 4. Public request bodies บางเส้นทางถูก buffer ก่อนจำกัดขนาด — ปิดใน local batch

`academy-web/src/app/api/leads/route.ts:44-56` ตรวจ `Content-Length` แล้วเรียก `request.text()` ก่อน
วัด byte จริง ส่วน `academy-web/src/app/api/auth/otp/route.ts:17-20` และ
`academy-web/src/app/api/auth/verify/route.ts:20-24` เรียก `request.json()` โดยไม่มี bounded stream
ทั้งที่ `academy-web/src/lib/http/bounded-body.ts` มี implementation ที่ถูกต้องอยู่แล้ว

ผลกระทบ: unauthenticated request แบบ chunked หรือไม่ส่ง `Content-Length` สามารถบังคับให้
Worker buffer body ขนาดใหญ่และก่อ resource exhaustion ได้

ทางแก้: ใช้ bounded-body parser เดียวกันทุก public endpoint และเพิ่ม test สำหรับ chunked/
missing/false `Content-Length`

### 5. Attempt lease ยังไม่มี fencing; progress กับ outcome แยกจากกันได้ — ปิดแล้ว 2026-08-03

`academy-web/supabase/migrations/0012_attempt_integrity_fixes.sql:50-53` ยอมให้ reclaim claim ที่เกิน
30 วินาที `academy-web/src/app/api/progress/route.ts:306-321` เขียน progress ก่อน finalize และ
`academy-web/supabase/migrations/0009_attempt_finalize.sql:98-112` คืน `void` แม้ conditional update
จะเขียนได้ศูนย์แถว

กรณีที่ยังเกิดได้:

1. request A claim แล้วค้างเกิน 30 วินาที
2. request B reclaim, บันทึก progress และ finalize สำเร็จ
3. A กลับมาบันทึก progress อีกชุด แล้ว finalize แพ้แบบเงียบ
4. response ของ A, `node_progress` และ `attempt.outcome` อาจไม่ตรงกัน

ทางแก้ที่ยั่งยืน: เพิ่ม claim nonce/version แล้วบังคับ conditional finalize ด้วย nonce หรือ
รวม claim + progress + finalize ใน transactional RPC เดียว เพิ่ม concurrency test แบบ
stalled A / reclaim B / A resumes

**สถานะ remediation:** ปิดด้วย migration 0013: claim token, atomic commit,
access/reset epoch fence และ deterministic stalled/reclaim/reset/suspend concurrency tests

### 6. Privacy notice และ retention ไม่ครอบคลุมข้อมูลที่ระบบเก็บจริง

`academy-web/src/lib/i18n/privacy.ts:42` อธิบายเฉพาะ waitlist แต่ระบบสร้าง account และเก็บ identity,
progress, answers, simulation evidence และ attempts แล้ว Notice ระบุ retention ของ lead
แต่ไม่มี deterministic retention/purge job ที่พิสูจน์คำกล่าวนั้น

ผลกระทบ: ผู้เรียนไม่เห็น data inventory, purpose/legal basis, retention และเส้นทางสิทธิ์
ของข้อมูลหลักที่ Academy ประมวลผล เป็น release/legal blocker ก่อนรับผู้ใช้จริง

ทางแก้: owner/legal decision สำหรับ data inventory + retention schedule จากนั้นปรับ notice,
DSAR path และ automated purge evidence ให้ตรงกัน

### 7. Dependency advisories ระดับ High 3 รายการและยังไม่มี CI gate

`npm audit` พบ advisory ใน `postcss@8.4.31` ที่มากับ Next, และ
`sharp@0.34.5`/libvips รุ่นปัจจุบัน คำสั่ง `npm audit fix --force` เสนอ breaking downgrade
ของ Next จึงใช้ไม่ได้อย่างปลอดภัย

ทางแก้: ทำ dependency-upgrade branch โดยรักษา peer contract ของ OpenNext, rerun full chain
และเพิ่ม audit/SBOM gate ใน CI; ห้ามใช้ force downgrade เป็น hotfix

### ขอบเขตเสี่ยงเดิมที่ยังต้องถือเป็น launch gate

- `/media/*` ยังถูกเสิร์ฟจาก public ASSETS binding จึงข้าม entitlement ได้ ต้องย้ายสื่อที่
  มีสิทธิ์เข้าถึงไป private R2/signed delivery และพิสูจน์ behavior หลัง deploy
- OTP/lead abuse control ยังพึ่ง in-memory state และ forwarded IP ที่เชื่อถือไม่ได้ในทุก
  topology ต้องใช้ durable rate limit และกำหนด trusted proxy contract
- server ใช้ shared `service_role` ซึ่งมี blast radius ข้าม schema ต้องจำกัด credential/
  RPC surface และตรวจ grants ก่อน production
- answer sharing ยังปิดด้วยการ disable test-out ชั่วคราว ต้องคง fail-closed จน W-content
  มีคลังข้อและ policy เปิดกลับพร้อมกัน
- waitlist re-consent ยังติด unique-email behavior ต้องกำหนด semantics ให้ผู้ใช้เดิมยืนยัน
  consent รุ่นใหม่ได้โดยไม่สร้างข้อมูลซ้ำ

## P1 — ต้องแก้ก่อน learner beta

### 8. Progress outage ถูกแสดงเป็น progress ว่าง

`academy-web/src/lib/course/progress-client.ts:24-32` แปลงทุก error เป็น `emptyProgress()` และ
`academy-web/src/components/course/CourseDashboard.tsx:123-140` ไม่ตรวจ `res.ok/body.ok`

ผลกระทบ: เมื่อ backend ล้ม ผู้เรียนเห็นความคืบหน้าหายและอาจตัดสินใจทำซ้ำ โดยไม่รู้ว่าเป็น
ปัญหาชั่วคราว

ทางแก้: แยก loading/loaded/error state, เก็บข้อมูลล่าสุดบนจอ และมี retry ที่ชัดเจน

### 9. Reset ไม่มี confirmation และล้าง UI แม้ server ปฏิเสธ

`academy-web/src/components/course/CourseOverview.tsx:108-119` ส่ง destructive reset โดยไม่ยืนยัน
และตั้ง local state เป็นว่างโดยไม่ตรวจ response

ทางแก้: confirmation ที่ระบุผลกระทบ, pending state, ตรวจ response และอัปเดต UI หลังสำเร็จ
เท่านั้น

### 10. Lock/prerequisite เป็นเพียง presentation ไม่ใช่ server rule

`academy-web/src/components/course/RoadmapGraph.tsx:121-179` แสดง locked node แต่ direct lesson links,
lesson route, progress และ attempts ไม่บังคับ prerequisite ผู้ใช้จึง deep-link หรือ skip
node ที่ล็อกเพื่อขยับ graph ได้ เหตุผล lock ใช้ `title` จึงเข้าถึงยากบน touch/keyboard

ทางแก้: policy เดียวบน server สำหรับ lesson/attempt/progress และแสดงเหตุผล lock เป็นข้อความ
ที่ keyboard/screen reader อ่านได้

### 11. Simulation ส่งได้ทั้งที่ผู้เรียนยังไม่ได้แตะ และกิน attempt quota — ปิดแล้ว 2026-08-03

`academy-web/src/components/course/CheckpointQuiz.tsx:52-62` นิยาม `allAnswered` เฉพาะ MCQ ขณะที่
simulation มี initial state เสมอ ผู้เรียนจึงกดส่งโดยลืมทำ simulation และเสียหนึ่งในสาม
attempt ได้

ทางแก้: เพิ่ม structurally-complete/dirty readiness ทั้ง client และ server ก่อน consume
attempt พร้อม test ว่า incomplete submission ไม่กิน quota

ผล remediation: client/server ใช้ per-mode structural readiness จาก attempt snapshot เดียวกัน,
server inspect ก่อน claim, incomplete response คง attempt/คำตอบเดิม และ complete-but-wrong
ยัง consume/grade ตามปกติ; regression ครอบคลุม legacy reuse, deploy drift, DHCP/static,
Apply/edit และ mobile layout

### 12. Mandatory video cue ใช้ dialog semantics แต่ไม่มี focus management

`academy-web/src/components/course/InteractiveVideo.tsx:233-246` หยุดวิดีโอและแสดง
`role="dialog" aria-modal="true"` แบบ inline แต่ไม่ย้าย focus, trap focus หรือประกาศ cue

ทางแก้: ใช้ accessible dialog behavior ครบ หรือเปลี่ยนเป็น non-modal region พร้อม live
announcement ที่ตรงกับ interaction จริง

### 13. Landing/course copy สัญญา test-out ที่ระบบปิดอยู่

`academy-web/src/app/page.tsx:20-30,49-50` และ `academy-web/src/app/courses/page.tsx:13-17,30-33` บอกว่า
ผู้เรียนพิสูจน์แล้วข้ามได้ แต่ `academy-web/src/lib/course/assessment-policy.ts:18-24` ปิด test-out
ทุก node และ CTA “Browse courses” ไป `/dashboard` ซึ่งบังคับ login แทน public `/courses`

ทางแก้: แก้ CTA และ copy ให้ตรง capability ปัจจุบันจนกว่า W-content จะเปิด test-out จริง

### 14. Internal player ใช้ environment toggle เป็น authorization ชั้นเดียว

`academy-web/src/lib/internal-surface.ts:15` เปิด answer-bearing player ให้ผู้เรียนที่ล็อกอินทุกคนทันที
เมื่อ `INTERNAL_SURFACES=on`

ทางแก้: ให้ environment เป็นเพียง prerequisite และบังคับ staff/Zero Trust claim ใน app

### 15. Activation revision สามารถถอยหลังได้

`academy-web/src/lib/account/access.ts:21-31` upsert revision โดยไม่มี monotonic condition event เก่าที่มา
ช้าสามารถทับ suspended/revoked revision ใหม่ได้

ทางแก้: atomic update เฉพาะ revision ที่สูงกว่า พร้อมกำหนด conflict rule เมื่อ revision เท่ากัน

### 16. Security headers ยังไม่มี

`academy-web/next.config.ts:3` ปิดเพียง `poweredByHeader` แต่ยังไม่มี CSP/frame-ancestors, nosniff,
referrer policy, permissions policy และ HSTS policy สำหรับ production

ทางแก้: เพิ่ม header baseline พร้อม report-only CSP pass ก่อน enforce

## P2 — debt ที่ควรปิดในรอบ polish

- [ปิด 2026-08-03] `/api/explanations` อ่าน persisted snapshot จาก passing attempt และ
  fail closed เมื่อ assessed completion ไม่มี pointer/snapshot
- `rowsToRecord()` เลือก resume node แบบไม่ deterministic เมื่อ timestamp เท่ากัน
- dashboard ยังบอกว่า progress เก็บใน browser ทั้งที่ persistence ย้ายไป server แล้ว
- roadmap mobile ใช้ fixed-width horizontal canvas โดยไม่มี affordance ว่ายังมี node ด้านขวา
- `ImageBlock`/`LabBlock` dialogs ไม่มี focus trap และคืน focus ให้ opener
- i18n ยังไม่ครอบคลุม UI หลายพื้นผิว; waitlist ไม่มี client-side email validation
- certificate card ใช้คำว่า “Earned” ทั้งที่ issuance/verification ยังไม่ implement (known W4)
- default shell ใช้ Node `25.5.0` ไม่ตรง `.nvmrc` `24.18.0`
- ก่อน cleanup disk เหลือต่ำกว่า 1 GiB ทำให้ clean build มีความเสี่ยง; cleanup วันที่
  2026-08-03 ลบเฉพาะ generated build/test output และ Playwright revisions เก่า คืนพื้นที่
  ว่างเป็นประมาณ 2.7 GiB แต่ยังไม่ได้ rerun fresh build

## ลำดับ remediation ที่แนะนำ

1. **Local security batch:** cookie policy, mutation guard, bounded body, entitlement enforcement,
   internal-player authorization และ regression tests
2. **Integrity batch — ปิด 2026-08-03:** activation monotonic revision, attempt
   fencing/transaction, access/reset generation fence, explanation snapshot และ tests
3. **Learner-safety batch:** progress error state, reset confirmation, server prerequisite,
   simulation completeness, video/dialog accessibility และ truthful copy
4. **Owner decisions:** privacy/retention/DSAR, media boundary, staff authorization model และ
   certificate evidence claim
5. **Pool A / production:** ทำหลัง explicit authorization ใหม่ โดยรวม migration ที่ผ่าน review
   แล้วและ verify schema/PGRST/cookie domain ตาม shared-infra gate
6. **Release gate:** dependency upgrade, clean build, full test/E2E, security-header validation,
   accessibility/visual review และ production smoke test ตามขอบเขตที่อนุมัติ

## Reader-first check

ผู้อ่านคือเจ้าของ Academy ที่ต้องตัดสินใจว่าจะเดินงานต่ออย่างไรโดยไม่รับความเสี่ยงที่ซ่อนอยู่
รายงานแยกข้อเท็จจริง ผลกระทบ และทางแก้ ไม่โยนความผิดให้ผู้ implement เดิม และไม่ลดทอน
ข้อจำกัดจริง Verdict จึงเป็น **PASS สำหรับการใช้เป็น remediation gate**
