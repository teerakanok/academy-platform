# A1 — Security Audit: Academy Web (`academy-web/`)

**วันที่ตรวจ:** 2026-08-15
**Baseline commit:** `86e94eb` + working tree ณ 2026-08-15
**ขอบเขต:** `academy-web/src/`, `academy-web/worker/`, `academy-web/supabase/`, `academy-web/private-media/`, `academy-web/content/`, `academy-web/fixtures/`, `academy-web/public/`, config files (`.dev.vars`, `wrangler.jsonc`, `.env.local`, `.env.example`, `next.config.ts`)
**ผู้ตรวจ:** Security Reviewer lane (A1) — static analysis เท่านั้น ไม่รันแอป/ไม่ยิง network
**Risk Level รวม:** LOW (pre-public behind Zero Trust; ไม่มี Critical/High ที่ trivially exploitable บน public internet)

---

## 1. สรุปผล

| ระดับ | จำนวน |
|---|---|
| P0 (แก้ทันที) | 0 |
| P1 (แก้ก่อน public launch) | 2 |
| P2 (แก้ตามแผน) | 3 |
| P3 (hardening / ข้อสังเกต) | 4 |

สาม finding ร้ายแรงสุด:
1. **[P1] Edge rate-limit marker header bypassable จากภายใน network** — client ที่ส่ง `x-cyberskills-edge-rate-limit: v1` ข้าม Node-layer rate limit ได้
2. **[P1] CSP ยังเป็น Report-Only** — ไม่ enforce จริง XSS mitigation ที่ browser
3. **[P2] In-memory rate limiter ไม่ shared ข้าม instance** — serverless instance ใหม่นับใหม่

---

## 2. Inventory

### 2.1 Endpoint / Surface Inventory

| # | Method + Path | ไฟล์:บรรทัด | AuthN | AuthZ / Entitlement | Validation | คำตัดสิน |
|---|---|---|---|---|---|---|
| 1 | POST `/api/auth/otp` | `src/app/(site)/api/auth/otp/route.ts:18` | ไม่ต้อง (public) | — | zod-level email regex, boundedJson 2KB, mutation-security, rate-limit | ✅ ปลอดภัย |
| 2 | POST `/api/auth/verify` | `src/app/(site)/api/auth/verify/route.ts:18` | ไม่ต้อง (public) | — | 6-digit regex, boundedJson 4KB, mutation-security, rate-limit, safeNextPath | ✅ ปลอดภัย |
| 3 | POST `/api/auth/sign-out` | `src/app/(site)/api/auth/sign-out/route.ts:11` | cookie session | — | mutation-security | ✅ ปลอดภัย |
| 4 | GET `/api/auth/me` | `src/app/(site)/api/auth/me/route.ts:14` | cookie session | — | — (read-only ตัวเอง) | ✅ ปลอดภัย |
| 5 | POST `/api/auth/identity/start` | `src/app/(site)/api/auth/identity/start/route.ts:15` | ไม่ต้อง (public) | — | mutation-security, formData key count=1, safeNextPath | ✅ ปลอดภัย |
| 6 | GET `/auth/callback` | `src/app/(site)/auth/callback/route.ts:28` | ไม่ต้อง (public) | — | parseIdentityCallback, browser binding cookie, state match | ✅ ปลอดภัย |
| 7 | POST `/api/leads` | `src/app/(site)/api/leads/route.ts:26` | ไม่ต้อง (public) | — | zod schema (email, consent:true), boundedJson 10KB, mutation-security, rate-limit | ✅ ปลอดภัย |
| 8 | POST `/api/leads/unsubscribe` | `src/app/(site)/api/leads/unsubscribe/route.ts:15` | ไม่ต้อง (bearer token UUID) | — | zod UUID, boundedJson 1KB, mutation-security, rate-limit | ✅ ปลอดภัย |
| 9 | POST `/api/progress` | `src/app/(site)/api/progress/route.ts:137` | `currentUser()` | `authorizeCourseResource` (activation + entitlement + node prerequisite) | zod discriminatedUnion, boundedJson 8KB, mutation-security | ✅ ปลอดภัย |
| 10 | GET `/api/progress` | `src/app/(site)/api/progress/route.ts:496` | `currentUser()` | `getServiceAccess` + per-course `getCourseAccess` | query param slug validated | ✅ ปลอดภัย |
| 11 | POST `/api/progress/reset` | `src/app/(site)/api/progress/reset/route.ts:64` | `currentUser()` | `getCourseAccess` | UUID regex operationId, slug from query | ✅ ปลอดภัย |
| 12 | GET `/api/progress/reset` | `src/app/(site)/api/progress/reset/route.ts:24` | `currentUser()` | `getCourseAccess` | UUID regex operationId, slug from query | ✅ ปลอดภัย |
| 13 | POST `/api/attempts` | `src/app/(site)/api/attempts/route.ts:40` | `currentUser()` | `authorizeCourseResource` | zod schema, boundedJson 2KB, mutation-security | ✅ ปลอดภัย |
| 14 | GET `/api/explanations` | `src/app/(site)/api/explanations/route.ts:32` | `currentUser()` | `authorizeCourseResource` + DB progress check (completed/tested-out) | zod schema, query params | ✅ ปลอดภัย |
| 15 | POST `/api/practice/simulation` | `src/app/(site)/api/practice/simulation/route.ts:47` | `currentUser()` | `authorizeCourseResource` | zod schema, boundedJson 8KB, mutation-security | ✅ ปลอดภัย |
| 16 | GET `/api/courses/[slug]/skill-map` | `src/app/(site)/api/courses/[slug]/skill-map/route.ts:21` | `currentUser()` | `authorizeCourseResource` | locale enum, slug from path | ✅ ปลอดภัย |
| 17 | GET+HEAD `/course-media/[assetId]` | `src/app/(site)/course-media/[assetId]/route.ts:106` | HMAC signed cookie grant | grant ตรวจ assetId + courseSlug + nodeId + expiry | path traversal guard (`absoluteRoot` prefix check) | ✅ ปลอดภัย |
| 18 | GET `/courses/[slug]/share/[locale]` | `src/app/(localized)/courses/[slug]/share/[locale]/route.tsx:17` | ไม่ต้อง (public, force-static) | — | locale enum, slug from generateStaticParams | ✅ ปลอดภัย |
| 19 | Worker entry (`worker.ts`) | `academy-web/worker.ts` | — | Edge rate-limit DO + media grant | cf-connecting-ip keyed | ⚠️ ดู finding F-01 |
| 20 | Middleware | `src/middleware.ts:62` | Supabase `getUser()` | allowlist-based (fail-closed) | — | ✅ ปลอดภัย |

### 2.2 RLS Inventory (ต่อตาราง)

| ตาราง | RLS enabled | Policy count | Grant ให้ใคร | คำตัดสิน |
|---|---|---|---|---|
| `academy.leads` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.users` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.node_progress` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.service_activation` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.course_entitlement` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.course_progress_epoch` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.course_progress_reset_operation` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.attempt` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.consent_events` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.staff_role_assignment` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.staff_role_audit` | ✅ | 0 (default deny) | `service_role`, `academy_runtime` | ✅ |
| `academy.attempt_appeal` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.privacy_request` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.identity_lifecycle_consumer_checkpoint` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.identity_lifecycle_projection` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.identity_lifecycle_pull_leases` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.identity_authorization_transaction` | ✅ | 0 (default deny) | `service_role` | ✅ |
| `academy.identity_session` | ✅ | 0 (default deny) | `service_role` | ✅ |

**สรุป RLS:** ทุกตารางเปิด RLS, ไม่มี policy ใด (= default deny ต่อ `anon`/`authenticated`), ไม่มี `USING (true)` หรือ `WITH CHECK (true)`, ไม่มี `GRANT ... TO authenticated`. มี `SECURITY DEFINER` เฉพาะ retention functions ที่ owner เป็น `academy_retention_definer` role แยก (ไม่ grant ให้ authenticated). `academy_runtime` มี `BYPASSRLS` แต่เข้าถึงได้เฉพาะผ่าน dedicated PostgREST ที่ authenticator เป็น role แยก + JWT secret แยก.

---

## 3. ข้อค้นพบ

### [SEV-P1] F-01: Edge rate-limit marker header สามารถ forge ได้จาก client ที่เลี่ยง Worker

- **ที่:** `src/lib/edge-rate-limit-policy.ts:60-62` และทุก route ที่เรียก `hasEdgeRateLimitMarker()`
- **โค้ดจริง:**
  ```typescript
  export function hasEdgeRateLimitMarker(headers: Headers): boolean {
    return headers.get(EDGE_RATE_LIMIT_MARKER_HEADER) === EDGE_RATE_LIMIT_MARKER
  }
  ```
  โดยที่ `EDGE_RATE_LIMIT_MARKER_HEADER = 'x-cyberskills-edge-rate-limit'` และ `EDGE_RATE_LIMIT_MARKER = 'v1'`
- **ทำไมถึงเป็นช่องโหว่:** เมื่อ Node handler เห็น header นี้มีค่า `v1` จะข้าม in-memory rate limit ทั้งหมด (ทั้ง otp, verify, leads, unsubscribe) โดยเชื่อว่า Worker ชั้นนอกตรวจแล้ว. Worker ชั้นนอก (`worker.ts:10`) **strip header เก่าแล้วตั้งใหม่** (`withEdgeRateLimitMarker` ลบก่อนตั้ง) แต่ถ้า request ไม่ผ่าน Worker (เช่น direct access ถึง Next.js origin, หรือ misconfigured reverse proxy) client ก็ส่ง header นี้มาเองได้
- **สถานการณ์โจมตีจริง:** ผู้โจมตีส่ง `POST /api/auth/verify` พร้อม header `x-cyberskills-edge-rate-limit: v1` ตรงไปที่ Next.js origin (ไม่ผ่าน CF Worker) จะข้าม rate limit ทั้ง edge และ in-memory และ brute-force OTP 6 หลัก (~1M ค่า) ได้ไม่จำกัด
- **ผลกระทบ:** account takeover ถ้า origin ถูก expose ตรง
- **Severity:** High
- **Exploitability:** ต้อง access ถึง origin ตรง (ไม่ผ่าน Worker) — ตอนนี้อยู่หลัง Zero Trust จึง unexploitable ในปัจจุบัน
- **Exposure:** ยังไม่ deploy public; อยู่หลัง Cloudflare Zero Trust
- **Priority:** P1 — ต้องแก้ก่อน public launch เพราะ origin exposure เป็นเรื่องของ config ไม่ใช่ code guarantee
- **แก้ยังไง:**
  1. **ทางที่ดีที่สุด:** ให้ Worker ตั้ง signed marker (HMAC ด้วย shared secret + timestamp) แทน static string — Node layer verify signature ก่อนเชื่อ
  2. **ทางที่เร็วที่สุด:** Next.js middleware strip header `x-cyberskills-edge-rate-limit` ออกจากทุก request ก่อนส่งต่อ; ให้ Worker เป็นจุดเดียวที่ตั้ง header นี้ได้ (ใช้ได้เมื่อ architecture guarantee ว่า traffic ผ่าน Worker เสมอ)
  3. เขียน test ยืนยันว่า route `/api/auth/verify` ที่ส่ง header มาเองยังโดน rate limit
- **ความมั่นใจ:** CONFIRMED — อ่านโค้ดครบ path แล้ว; `withEdgeRateLimitMarker` strip + re-set แต่ไม่มีกลไกกัน forge

---

### [SEV-P1] F-02: CSP ยังเป็น Report-Only — XSS mitigation ไม่ enforce จริง

- **ที่:** `academy-web/next.config.ts:31`
- **โค้ดจริง:**
  ```typescript
  { key: 'Content-Security-Policy-Report-Only', value: reportOnlyContentSecurityPolicy },
  ```
- **ทำไมถึงเป็นช่องโหว่:** `Content-Security-Policy-Report-Only` ไม่บล็อก inline script/style จริง — browser แค่รายงาน (และไม่มี report-uri/report-to ด้วย จึงไม่ได้แม้แต่ข้อมูล violation). ถ้ามี XSS จาก user input ที่ inject script ได้ CSP จะไม่ช่วย
- **สถานการณ์โจมตีจริง:** ถ้ามี reflected XSS ที่หลุดผ่าน React escaping (เช่น `dangerouslySetInnerHTML` ที่รับ user input) CSP report-only จะไม่บล็อก execution
- **ผลกระทบ:** ลด defense-in-depth สำหรับ XSS; ตัว XSS vector ปัจจุบันยังไม่พบ (ดู §4)
- **Severity:** Medium
- **Exploitability:** ต้องมี XSS vector อื่นก่อน (ยังไม่พบ)
- **Exposure:** ยังไม่ deploy public
- **Priority:** P1 — ต้อง enforce ก่อน public launch ตามที่รายงานเดิมระบุไว้
- **แก้ยังไง:** เปลี่ยนเป็น `Content-Security-Policy` (ไม่ใช่ Report-Only) หลังมีหลักฐาน browser compatibility จาก deployed topology ตามแผนในรายงานเดิม
- **ความมั่นใจ:** CONFIRMED

---

### [SEV-P2] F-03: In-memory rate limiter reset เมื่อ serverless instance ใหม่ spawn

- **ที่:** `src/lib/rate-limit.ts:11`
- **โค้ดจริง:**
  ```typescript
  const hits = new Map<string, number[]>()
  ```
- **ทำไมถึงเป็นช่องโหว่:** state อยู่ใน process memory — Cloudflare Workers, Vercel, หรือ Node cluster ใหม่จะนับใหม่ทุกครั้ง. ผู้โจมตีที่กระจาย request ไปหลาย instance (ซึ่ง serverless ทำให้เกิดเอง) จะข้าม limit ได้
- **สถานการณ์โจมตีจริง:** ส่ง request ไปเรื่อยๆ ให้ hit instance ใหม่ แต่ละ instance เริ่มนับที่ 0 limit 10/60s ไม่มีผลจริง
- **ผลกระทบ:** rate limit เป็น speed bump ไม่ใช่ wall; OTP brute-force ยังถูกกันโดย edge rate-limit DO (เมื่อ traffic ผ่าน Worker)
- **Severity:** Medium
- **Exploitability:** Trivial (serverless สร้าง instance ใหม่เอง)
- **Exposure:** ยังไม่ deploy public; edge rate-limit DO ใน Worker เป็น guard ชั้นแรกอยู่
- **Priority:** P2 — edge DO ทำงานอยู่; in-memory เป็นชั้นสอง แต่ต้องไม่หลอกว่าเป็น guard จริง
- **แก้ยังไง:** โค้ดมีหมายเหตุรู้ปัญหาอยู่แล้ว ("public release ต้องมี edge rate-limit จริง"). ยืนยันว่า edge DO ครอบคลุมทุก rate-limited path ก่อน public launch + ลบหรือ mark in-memory ว่าเป็น fallback เท่านั้น
- **ความมั่นใจ:** CONFIRMED — โค้ดระบุข้อจำกัดเองในคอมเมนต์

---

### [SEV-P2] F-04: `X-Forwarded-For` ใช้เป็น rate-limit key ได้เมื่อไม่มี `cf-connecting-ip`

- **ที่:** `src/lib/request-ip.ts:6-9`
- **โค้ดจริง:**
  ```typescript
  export function clientKey(request: Request): string {
    const cf = request.headers.get('cf-connecting-ip')?.trim()
    if (cf) return cf
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  }
  ```
- **ทำไมถึงเป็นช่องโหว่:** `x-forwarded-for` ปลอมได้จาก client ถ้า reverse proxy ไม่ overwrite. เมื่อ request ไม่ผ่าน Cloudflare (dev, staging, direct origin access) ผู้โจมตีหมุน XFF ได้ key ต่างกันทุก request rate limit ไม่เห็น
- **สถานการณ์โจมตีจริง:** ส่ง `POST /api/auth/verify` พร้อม XFF ต่างกันทุก request in-memory rate limit เห็นเป็นคนละ IP ทุกครั้ง ไม่จำกัดจำนวนครั้ง
- **ผลกระทบ:** ร่วมกับ F-01 และ F-03 อาจทำให้ OTP brute-force ทำได้ถ้า origin accessible ตรง
- **Severity:** Medium
- **Exploitability:** ต้อง access ถึง origin (ไม่ผ่าน CF Worker) — ตอนนี้อยู่หลัง Zero Trust
- **Exposure:** ยังไม่ deploy public
- **Priority:** P2 — secondary defense; edge DO ใช้ `cf-connecting-ip` อยู่
- **แก้ยังไง:** สำหรับ non-CF environment ให้ trust proxy chain อย่างถูกต้อง (ดูจำนวน hop ที่เชื่อถือได้) หรือ reject request ที่ไม่มี `cf-connecting-ip` ในโหมด production
- **ความมั่นใจ:** CONFIRMED — โค้ดรู้ปัญหาและระบุในคอมเมนต์

---

### [SEV-P2] F-05: HSTS ไม่มี `includeSubDomains` และ `preload`

- **ที่:** `academy-web/next.config.ts:41`
- **โค้ดจริง:**
  ```typescript
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  ```
- **ทำไมถึงเป็นช่องโหว่:** ไม่มี `includeSubDomains` subdomain ของ `academy.cyberskills.co.th` (ถ้ามี) ไม่ถูกบังคับ HTTPS. ไม่มี `preload` ผู้ใช้ที่เข้าครั้งแรกยังเสี่ยง MITM ก่อน HSTS header ถูก cache
- **Severity:** Low
- **Exploitability:** ต้อง MITM first visit
- **Exposure:** ยังไม่ deploy public
- **Priority:** P2 — best practice สำหรับ production
- **แก้ยังไง:** เปลี่ยนเป็น `max-age=31536000; includeSubDomains; preload` เมื่อพร้อม commit ทั้ง subdomain tree เป็น HTTPS-only
- **ความมั่นใจ:** CONFIRMED

---

### [SEV-P3] F-06: `dangerouslySetInnerHTML` สองจุด — ไม่มี user input vector แต่ต้องเฝ้า

- **ที่:**
  1. `src/app/(localized)/courses/[slug]/[locale]/page.tsx:84` — JSON-LD structured data
  2. `src/components/AppShell.tsx:49` — theme detection script literal
- **โค้ดจริง:**
  ```tsx
  // จุดที่ 1: JSON-LD
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
  // จุดที่ 2: theme script
  dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('academy.theme')==='dark')...}" }}
  ```
- **ทำไมเป็นข้อสังเกต:** จุดที่ 1 — `jsonLd` สร้างจาก course metadata ที่ controlled by system + `</` ถูก escape เป็น `<` แล้ว. จุดที่ 2 — hardcoded string literal ไม่มี user input. **ปลอดภัยในปัจจุบัน** แต่ถ้า jsonLd property ในอนาคตรับ user input (เช่น review/rating) ต้องกลับมาตรวจ
- **Priority:** P3 — ข้อสังเกตสำหรับ code review ในอนาคต
- **ความมั่นใจ:** CONFIRMED — ไม่มี attack vector ปัจจุบัน

---

### [SEV-P3] F-07: `sign-out` revocation failure ไม่บังคับล้าง session ทุกกรณี

- **ที่:** `src/app/(site)/api/auth/sign-out/route.ts:36-51`
- **โค้ดจริง:**
  ```typescript
  let revocation: 'confirmed' | 'not-confirmed' = 'confirmed'
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) { revocation = 'not-confirmed' }
  } catch (error) { revocation = 'not-confirmed' }
  await clearRouteAuthCookies()
  return NextResponse.json({ ok: true, scope: 'local', revocation })
  ```
- **ทำไมเป็นข้อสังเกต:** เมื่อ GoTrue revocation ล้มเหลว cookie ถูกลบ (browser ออกจากระบบ) แต่ refresh token ยังอยู่ฝั่ง GoTrue browser อื่นที่ถือ cookie เดิมอาจยังใช้ได้จนหมดอายุ. Response ตอบ `revocation: 'not-confirmed'` ตรง แต่ client ไม่ได้จัดการ
- **Severity:** Low — scope เป็น `local` โดยเจตนา + GoTrue token มี expiry
- **Priority:** P3
- **ความมั่นใจ:** CONFIRMED

---

### [SEV-P3] F-08: Player surface (`/player/*`) ตรวจเฉลยฝั่ง client

- **ที่:** `src/lib/player/scoring.ts`, `src/lib/internal-surface.ts:15-16`
- **โค้ดจริง:**
  ```typescript
  export function internalSurfacesEnabled(): boolean {
    return process.env.INTERNAL_SURFACES?.trim() === 'on'
  }
  ```
- **ทำไมเป็นข้อสังเกต:** `/player/*` path ถูก guard ด้วย env flag (`INTERNAL_SURFACES=on`) + middleware block production ไม่เปิด. แต่เมื่อเปิด: answer key ถูกส่งไปฝั่ง client ทั้งชุด (`ExamPlayer` import `scoreExam`) และ staff role check เกิดที่ `requireInternalContentStaff()` ใน page component ไม่ใช่ middleware. **โค้ดรู้ปัญหาและมี TODO ระบุ** ("W0-1 ล็อกว่าไม่แก้ในเฟสนี้")
- **Severity:** Low (ปิดอยู่ ไม่ deploy)
- **Exposure:** internal-only; env flag fail-closed
- **Priority:** P3 — ต้องแก้ก่อนเปิดให้ user จริง (ถ้ามีแผนจะเปิด)
- **ความมั่นใจ:** CONFIRMED — โค้ด self-documents ปัญหา

---

### [SEV-P3] F-09: `console.error` บาง route log error object ทั้งก้อน

- **ที่:** หลาย route (เช่น `api/auth/sign-out/route.ts:46`, `api/progress/route.ts:478`)
- **โค้ดจริง:**
  ```typescript
  console.error('[auth/sign-out] provider ติดต่อไม่ได้:', error)
  console.error('[api/progress] บันทึกไม่สำเร็จ:', err)
  ```
- **ทำไมเป็นข้อสังเกต:** `error` object จาก Supabase/GoTrue อาจมี connection string, internal URL, หรือ stack trace. ตอน otp route ทำได้ดีกว่า: `error.message` เท่านั้น. ข้อมูลเหล่านี้ไม่ถูกส่งกลับ client (response ปลอดภัย) แต่ log aggregator อาจเก็บ sensitive info
- **Severity:** Low
- **Priority:** P3 — sanitize log output ให้เป็น `.message` เท่านั้น
- **ความมั่นใจ:** PLAUSIBLE — ต้องตรวจว่า Supabase error object มี field อะไรจริง

---

## 4. Hardening / ข้อสังเกตเพิ่มเติม (ไม่ใช่ช่องโหว่)

### 4.1 สิ่งที่ทำได้ดี (ไม่ต้องแก้)

| ด้าน | สิ่งที่ตรวจพบ |
|---|---|
| **Injection** | ใช้ Supabase client (parameterized queries) ทุก DB call — ไม่มี string concatenation ใน query ใดเลย |
| **IDOR/BOLA** | ทุก endpoint ที่แตะ user data ใช้ `currentUser().account.id` จาก session เป็น scope — ไม่รับ userId จาก client |
| **Open redirect** | `safeNextPath()` -> `safeAcademyInternalReturnPath()` ตรวจ: ต้องขึ้นต้น `/`, ห้ามขึ้นต้น `//`, length <= 2048, ไม่มี control char, origin ตรงกับ internal origin |
| **CSRF** | `validateMutationRequest()` ตรวจ `Origin` header match + `Sec-Fetch-Site: same-origin` fallback; ไม่มี Origin = reject (ไม่ใช่ bypass) |
| **Body size** | `readBoundedBody()` streaming reader หยุดทันทีที่เกิน — ไม่ buffer ทั้ง payload ก่อนตรวจ; วัดเป็น byte ไม่ใช่ string length |
| **Cookie security** | HttpOnly, Secure (production), SameSite=Lax, path-scoped สำหรับ media grant |
| **Path traversal** | `course-media` route ตรวจ `resolve()` + prefix check กับ `absoluteRoot` |
| **Media HMAC** | constant-time comparison (byte-by-byte `mismatch |=`), 32-byte minimum secret, expiry check |
| **Answer key protection** | assessed mode ตอบ `{passed}` เท่านั้น ไม่รั่วผลรายข้อ; explanations endpoint ตรวจ DB status ว่าผ่านจริง |
| **Attempt system** | ownership + context + expiry ใน WHERE เดียว; atomic consume; remap keys ต่อ attempt; finalize ปิดเมื่อ validation fail |
| **RLS** | ทุกตารางเปิด RLS + ไม่มี policy = default deny; ไม่มี `GRANT TO authenticated`; ไม่มี `USING (true)` |
| **Dedicated runtime API** | แยก PostgREST instance + แยก role + แยก JWT secret จาก Pool A shared; `academy_runtime` มี explicit object allowlist |
| **Legacy OTP guard** | `legacyDirectOtpFixtureEnabled()` ต้อง flag `=1` + loopback URL + anon key ครบ; production ไม่ตรงเงื่อนไข |
| **Identity Control fixture** | `identityControlLocalFixtureEnabled()` ต้อง `NODE_ENV !== 'production'` + flag + localhost origin |
| **Security headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ปิด camera/geo/mic/payment/usb, `X-DNS-Prefetch-Control: off`, HSTS 1 ปี |
| **`NEXT_PUBLIC_*` audit** | เปิดเผยเฉพาะ `SUPABASE_URL`, `SUPABASE_ANON_KEY` (by design — anon key ออกแบบให้ public), `SITE_URL`, `SEARCH_INDEXING` — ไม่มี secret หลุดเป็น public |
| **Worker architecture** | edge rate-limit ด้วย Durable Object (consistent per-IP state), private media serve จาก R2 ผ่าน signed cookie |

### 4.2 `.dev.vars` / `.env.local` — demo keys ไม่ใช่ secret จริง

ไฟล์ `.dev.vars` และ `.env.local` มีค่า JWT token แต่เป็น **Supabase CLI default demo keys** (issuer: `supabase-demo`, exp: 2032). `.gitignore` exclude ทั้งคู่ (`*.env.*`, `.dev.vars*`). ตรวจว่าไม่ tracked: `git ls-files` คืนค่าว่าง — **ไม่ติด git**.

### 4.3 Public directory

`academy-web/public/` มี: `brand/` (logo SVG), `media/` (ว่างหรือ symlink), `logo-academy.svg`, `diagrams/`, `sample-diagram.svg` — ไม่มี content ที่ไม่ควรเปิดเผย

### 4.4 Fixtures directory

`academy-web/fixtures/cas005/` มี CAS-005 exam bank เป็น JSON fixtures — เป็น **internal development fixture** ตาม AGENTS.md; ไม่ถูก serve โดย Next.js (ไม่อยู่ใน `public/` และ middleware ไม่ route ไปหา). ถ้าจะ deploy ควรยืนยันว่า build output ไม่รวม directory นี้.

### 4.5 Dependency notes

| Package | Version | หมายเหตุ |
|---|---|---|
| `next` | `^15.5.22` | UNVERIFIED — ต้องเช็คกับ advisory DB สำหรับ CVE ล่าสุด |
| `zod` | `^4.4.3` | ไม่มี known security issues |
| `nanoid` | `3.3.17` | รายงานเดิมระบุ High advisory — UNVERIFIED |
| `postcss` | `^8.5.25` | transitive; รายงานเดิมระบุ High advisory — UNVERIFIED |
| `sharp` | `0.35.2` | transitive; รายงานเดิมระบุ High advisory — UNVERIFIED |

**UNVERIFIED:** ห้ามรัน `npm audit` ตามกติกา (ต้องต่อเน็ต); รายงานเดิม (2026-08-09) ระบุ 4 High findings ใน transitive deps. ต้องตรวจซ้ำกับ advisory DB ก่อน public launch.

---

## 5. Search Coverage

| Pattern | ขอบเขต | เครื่องมือ | ผลลัพธ์ |
|---|---|---|---|
| `dangerouslySetInnerHTML / innerHTML / eval( / new Function / __html` | `academy-web/src/**/*.{ts,tsx}` | grep | 2 hits — ทั้งคู่ไม่มี user input (F-06) |
| `SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE` | `academy-web/src/**/*.{ts,tsx}` | grep | 1 hit — คอมเมนต์เท่านั้น (session.ts:16) ไม่มีการใช้ |
| `NEXT_PUBLIC_` | `academy-web/src/**/*.{ts,tsx}` | grep | 12 hits — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `SEARCH_INDEXING` เท่านั้น |
| `exec( / child_process / spawn / execFile / subprocess / os.system` | `academy-web/src/**/*.{ts,tsx}` | grep | 0 hits — ไม่มี command injection vector |
| `SECURITY DEFINER / GRANT.*TO.*authenticated / USING (true) / WITH CHECK (true)` | `academy-web/supabase/**/*.sql` | grep | 1 hit SECURITY DEFINER — retention function owner เท่านั้น; 0 hits for USING/WITH CHECK true; 0 hits for GRANT TO authenticated |
| `cors / Access-Control / CORS` | `academy-web/src/**/*.{ts,tsx}`, `next.config.*` | grep | 0 hits — ไม่มี explicit CORS config (ใช้ same-origin default) |
| `fetch(` (SSRF check) | `academy-web/src/**/*.{ts,tsx}` (excluding tests) | grep | 17 hits — ทั้งหมดเป็น client-side fetch ไปที่ `/api/*` relative path หรือ Supabase SDK; ไม่มี server-side fetch ที่รับ URL จาก user |
| `readFile / writeFile / fs.` | `academy-web/src/**/*.{ts,tsx}` (excluding tests) | grep | 7 hits — `course-media` (มี path traversal guard), `identity/transaction` + `session-store` (local fixture only), `content/source` (build-time), `course-share-image` (font loading) |
| `enable row level security / disable row level security` | `academy-web/supabase/**/*.sql` | grep | 18 hits `enable` / 0 hits `disable` — ทุกตารางเปิด RLS |
| `api[_-]?key / password / secret / token / jwt` (secrets scan) | `.dev.vars`, `wrangler.*`, `.env*` | grep | `.dev.vars` มี demo keys (ไม่ tracked); `.env.local` มี demo keys (ไม่ tracked); `.env.example` เป็น template (ค่าว่าง); `wrangler.jsonc` ไม่มี secret |

---

## 6. Delta จากรายงานเดิม

### เทียบกับ `reports/reviews/academy-security-headers-local-checkpoint-2026-08-09.md`

| ข้อ | สถานะเดิม (2026-08-09) | สถานะปัจจุบัน |
|---|---|---|
| Security headers ไม่มี | **แก้แล้ว** — 7 headers ครบตามรายงาน (CSP report-only, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control) |
| CSP report-only -> enforce | **ยังเปิดอยู่** — รอ browser compatibility evidence จาก deployed topology (F-02) |
| `npm audit` 4 High findings (nanoid, postcss, sharp) | **ยังเปิดอยู่** — ไม่มี dependency change ใน scope นี้; UNVERIFIED offline |
| HSTS ไม่มี includeSubDomains/preload | **ยังเปิดอยู่** — เพิ่มเป็น F-05 |

### ข้อค้นพบใหม่ในรอบนี้

| # | สถานะ |
|---|---|
| F-01 Edge rate-limit marker forge | **เกิดใหม่** — ระบบ edge rate-limit เป็นของใหม่ |
| F-03 In-memory rate limiter limitation | **เกิดใหม่** (โค้ดรู้ปัญหาอยู่) |
| F-04 XFF spoofable as rate-limit key | **เกิดใหม่** (โค้ดรู้ปัญหาอยู่) |
| F-06 dangerouslySetInnerHTML | **เกิดใหม่** (ข้อสังเกต) |
| F-07 sign-out revocation failure | **เกิดใหม่** (ข้อสังเกต) |
| F-08 Player client-side scoring | **เกิดใหม่** (โค้ด self-documents ปัญหาอยู่) |
| F-09 Unsanitized error logging | **เกิดใหม่** (ข้อสังเกต) |

---

## 7. ข้อจำกัดและสิ่งที่ยังไม่ได้ตรวจ

| รายการ | เหตุผล |
|---|---|
| **Runtime behavior** (actual request/response, cookie behavior, header delivery) | กติกา: ห้ามรันแอป |
| **Network-level** (TLS config, DNS, Cloudflare settings, Zero Trust rules) | ไม่มี access; ตรวจได้เฉพาะ code |
| **Dependency CVE verification** | กติกา: ห้าม `npm audit` (ต้องต่อเน็ต); mark UNVERIFIED |
| **Identity Control integration** | ระบบยังไม่ release; code path ที่ตรวจเป็น local fixture เท่านั้น |
| **Supabase production configuration** (PostgREST config, JWT secret strength, connection pooling) | อยู่นอก repo; ต้องตรวจที่ infra |
| **Retention Worker** (`academy-retention-api/`, `academy-retention-worker/`) | อยู่นอกขอบเขต lane A1 (academy-web เท่านั้น) |
| **Git history secret scan** | กติกา: ห้ามรัน `git log -p`; `.gitignore` exclude env files + ตรวจว่าไม่ tracked |
| **`academy-web/supabase/migrations/` 0003-0027** | อ่านตัวอย่างหลัก (0001, 0002, 0004, 0019) + grep ทุกไฟล์สำหรับ pattern อันตราย; ไม่ได้อ่านทุกบรรทัดของทุก migration |
| **`ops/`, `scripts/`** | ตรวจรายชื่อ + อ่าน key scripts; ไม่ใช่ request handler surface |

---

## Security Checklist

- [x] ไม่มี hardcoded secret ใน source code ที่ tracked
- [x] ทุก user input ผ่าน Zod validation + bounded body
- [x] ไม่มี SQL injection (ใช้ Supabase client parameterized)
- [x] Authentication ตรวจด้วย `getUser()` ไม่ใช่ `getSession()` (ตรวจลายเซ็น)
- [x] Authorization แยก 4 ชั้น (account -> activation -> entitlement -> resource)
- [x] CSRF protection ผ่าน Origin/Sec-Fetch-Site check
- [x] ไม่มี open redirect
- [x] RLS เปิดทุกตาราง + default deny
- [x] Path traversal guarded ใน media delivery
- [x] Media grant ใช้ HMAC with constant-time comparison
- [ ] CSP ยังเป็น report-only (F-02)
- [ ] HSTS ยังไม่มี includeSubDomains (F-05)
- [ ] Dependencies ยังไม่ verified offline (UNVERIFIED)
