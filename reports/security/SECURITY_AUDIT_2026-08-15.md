# รายงาน Security Audit — CyberSkills Academy Platform

> **เลข VULN ที่ออกจริงแล้ว: VULN-131 และ VULN-132 (เอกสารนี้เสนอไว้เป็น 119–120)**
> lane สังเคราะห์แต่ละ product ทำงานอิสระจึงเสนอเลขทับกัน (VULN-119 ถูกเสนอ 6 ครั้ง)
> เลขที่ปรากฏด้านล่างในเอกสารนี้เป็น **ข้อเสนอ** — เลขจริงลงทะเบียนแล้วที่
> `ecosystem/SECURITY_REGISTRY.md` (director repo) และสรุปข้ามพอร์ตที่
> `reports/security/PORTFOLIO_SECURITY_AUDIT_2026-08-15.md`


**วันที่ตรวจ:** 2026-08-15
**Baseline commit:** `86e94eb` + working tree ณ 2026-08-15
**ขอบเขต:** `academy-web/src/`, `academy-web/worker/`, `academy-web/worker.ts`, `academy-web/supabase/`, `academy-web/private-media/`, `academy-web/ops/`, config files
**วิธีตรวจ:** static read-only analysis — ไม่รันแอป / ไม่ยิง network / ไม่รัน npm audit (กติกา: มี session อื่นทำงานอยู่ใน repo)
**ผู้ตรวจ:** Security synthesis lane (เฟส 2) — adversarial verify จากรายงาน A1 + ตรวจเพิ่มเอง
**ต้นทาง:** `reports/security/audit-2026-08-15/A1-academy-web.md` (เก็บเป็นหลักฐานต้นทาง ห้ามแก้)

---

## 1. สรุปสำหรับผู้ตัดสินใจ

**สถานะโดยรวม: LOW RISK (ระดับ pre-public behind Zero Trust)**

Academy Platform มีสถาปัตยกรรมด้านความปลอดภัยที่แข็งแกร่งผิดปกติสำหรับ product ที่ยังไม่เปิดสาธารณะ:
ทุกตาราง (18/18) เปิด RLS แบบ default deny, ทุก endpoint ตรวจ CSRF + bounded body + zod validation, ใช้ `getUser()` แทน `getSession()` (ตรวจลายเซ็นจริง ไม่ใช่แค่อ่าน cookie), ระบบสิทธิ์ 4 ชั้น (account → activation → entitlement → resource), ไม่มี SQL injection / XSS / SSRF / open redirect vector ที่เปิดอยู่

**ไม่มี P0** — ไม่พบช่องโหว่ที่ต้องแก้ทันที

| ระดับ | จำนวน |
|---|---|
| P0 (แก้ทันที) | 0 |
| P1 (แก้ก่อน public launch) | 2 |
| P2 (แก้ตามแผน) | 3 |
| P3 (hardening / ข้อสังเกต) | 4 |

**ถ้าจะ deploy สาธารณะพรุ่งนี้ ต้องแก้:**
1. ยืนยันว่า Cloudflare Worker เป็นทางเดียวที่เข้าถึง origin ได้ (ตรวจจาก deployment config ไม่ใช่ code) — ถ้ายืนยันไม่ได้ ต้องเปลี่ยน rate-limit marker จาก static header เป็น HMAC signed marker
2. เปลี่ยน CSP จาก Report-Only เป็น enforce — มี report endpoint เก็บ violation หรือไม่ยังไม่มี

---

## 2. ขอบเขตและวิธีตรวจ

**ตรวจ:**
- HTTP route handlers ทั้ง 16 route files (ครบ: 20 endpoints ตาม inventory)
- Cloudflare Worker entry (`worker.ts`) + edge rate limiter DO
- Middleware (`src/middleware.ts`) — allowlist-based, fail-closed
- Auth seam: Supabase GoTrue (legacy fixture) + Identity Control integration (ยังไม่ release)
- RLS: ทุก migration file (0001-0027) + privileged role bootstrap scripts
- Private media delivery: Worker-level R2 serve + Node-level HMAC grant
- Token verification: `code-exchange-result-envelope.ts`, `lifecycle-envelope-verifier.ts` — ES256 signature verification
- Env vars: `.dev.vars`, `.env.example` vars, `NEXT_PUBLIC_*` audit
- `ops/` retention worker/API boundary

**ไม่ตรวจ / ตรวจไม่ได้แบบ static:**
- Network-level: TLS config, Cloudflare dashboard settings, Zero Trust rules, DNS
- Runtime behavior: actual request/response, cookie delivery, header delivery
- Dependency CVE verification: ห้าม `npm audit` (ต้องต่อเน็ต)
- Supabase production config: PostgREST signing strength, connection pooling
- Retention Worker runtime (`ops/academy-retention-worker/`) — อยู่นอก scope ของ lane
- Git history scan — ห้ามรัน `git log -p`

---

## 3. Inventory รวม endpoint/surface

| # | Method + Path | ไฟล์ | AuthN | AuthZ | Rate limit | คำตัดสิน |
|---|---|---|---|---|---|---|
| 1 | POST `/api/auth/otp` | `src/app/(site)/api/auth/otp/route.ts` | public | — | edge DO + in-memory | ✅ |
| 2 | POST `/api/auth/verify` | `src/app/(site)/api/auth/verify/route.ts` | public | — | edge DO + in-memory | ✅ |
| 3 | POST `/api/auth/sign-out` | `src/app/(site)/api/auth/sign-out/route.ts` | cookie session | — | — | ✅ |
| 4 | GET `/api/auth/me` | `src/app/(site)/api/auth/me/route.ts` | cookie session | — | — | ✅ |
| 5 | POST `/api/auth/identity/start` | `src/app/(site)/api/auth/identity/start/route.ts` | public | — | mutation-security | ✅ |
| 6 | GET `/auth/callback` | `src/app/(site)/auth/callback/route.ts` | public | — | — | ✅ |
| 7 | POST `/api/leads` | `src/app/(site)/api/leads/route.ts` | public | — | edge DO + in-memory | ✅ |
| 8 | POST `/api/leads/unsubscribe` | `src/app/(site)/api/leads/unsubscribe/route.ts` | bearer UUID | — | edge DO + in-memory | ✅ |
| 9 | POST `/api/progress` | `src/app/(site)/api/progress/route.ts` | `currentUser()` | `authorizeCourseResource` | — | ✅ |
| 10 | GET `/api/progress` | `src/app/(site)/api/progress/route.ts` | `currentUser()` | `getServiceAccess` + per-course | — | ✅ |
| 11 | POST `/api/progress/reset` | `src/app/(site)/api/progress/reset/route.ts` | `currentUser()` | `getCourseAccess` | — | ✅ |
| 12 | GET `/api/progress/reset` | `src/app/(site)/api/progress/reset/route.ts` | `currentUser()` | `getCourseAccess` | — | ✅ |
| 13 | POST `/api/attempts` | `src/app/(site)/api/attempts/route.ts` | `currentUser()` | `authorizeCourseResource` | — | ✅ |
| 14 | GET `/api/explanations` | `src/app/(site)/api/explanations/route.ts` | `currentUser()` | `authorizeCourseResource` + DB progress | — | ✅ |
| 15 | POST `/api/practice/simulation` | `src/app/(site)/api/practice/simulation/route.ts` | `currentUser()` | `authorizeCourseResource` | — | ✅ |
| 16 | GET `/api/courses/[slug]/skill-map` | `src/app/(site)/api/courses/[slug]/skill-map/route.ts` | `currentUser()` | `authorizeCourseResource` | — | ✅ |
| 17 | GET+HEAD `/course-media/[assetId]` | `src/app/(site)/course-media/[assetId]/route.ts` | HMAC signed cookie | assetId + courseSlug + nodeId + expiry | — | ✅ |
| 18 | GET `/courses/[slug]/share/[locale]` | `src/app/(localized)/courses/[slug]/share/[locale]/route.tsx` | public (force-static) | — | — | ✅ |
| 19 | Worker entry | `worker.ts` | — | edge rate-limit DO + media grant | cf-connecting-ip | ⚠️ F-01 |
| 20 | Middleware | `src/middleware.ts` | `getUser()` | allowlist (fail-closed) | — | ✅ |

**ครบถ้วน:** ตรวจ `find src/app -name "route.ts" -o -name "route.tsx"` ได้ 16 route files — ตรงกับ inventory ของ A1 ทุกตัว

---

## 4. ข้อค้นพบเรียงตาม priority

### [P1] F-01: Edge rate-limit marker header ปลอมได้ — static `v1` ไม่ใช่ proof of transit

- **ที่:** `src/lib/edge-rate-limit-policy.ts:60-62` + ทุก route ที่เรียก `hasEdgeRateLimitMarker()`
- **โค้ดจริง:**
  ```typescript
  export function hasEdgeRateLimitMarker(headers: Headers): boolean {
    return headers.get(EDGE_RATE_LIMIT_MARKER_HEADER) === EDGE_RATE_LIMIT_MARKER
  }
  ```
  `EDGE_RATE_LIMIT_MARKER = 'v1'` — ค่าคงที่ เดาได้ ส่งเองได้
- **ทำไมถึงเป็นช่องโหว่:** เมื่อ Node handler เห็น header `x-cyberskills-edge-rate-limit: v1` จะข้าม in-memory rate limit ทั้งหมด (otp, verify, leads, unsubscribe). Worker ชั้นนอก strip+re-set header นี้ (`withEdgeRateLimitMarker` ลบก่อนตั้ง) แต่ไม่มีกลไกกัน forge ถ้า request ไม่ผ่าน Worker
- **สถานการณ์โจมตีจริง:** ผู้โจมตีส่ง `POST /api/auth/verify` พร้อม `x-cyberskills-edge-rate-limit: v1` ตรงไปที่ origin → ข้าม rate limit ทุกชั้น → brute-force OTP 6 หลัก (~1M ค่า)
- **ผลกระทบ:** account takeover ถ้า origin ถูก expose ตรง
- **Severity:** High
- **Exploitability:** ต้อง access ถึง origin ตรง — ตอนนี้อยู่หลัง Zero Trust
- **Exposure:** ยังไม่ deploy public
- **Priority:** P1 — ต้องแก้ก่อน public launch; origin exposure เป็นเรื่อง config ไม่ใช่ code guarantee
- **แก้ยังไง:**
  1. **ทางที่ดีที่สุด:** รับ pattern จาก identity-control — ใช้ `z.literal('cf-connecting-ip')` lock `clientIpHeader` + `proxyCidrs` allowlist + boundary-check script ที่ reject `x-forwarded-for` ในโค้ดแอป (ดู `identity-control/scripts/check-boundaries.mjs:299-302`)
  2. **ทางที่เร็ว:** ให้ Worker ตั้ง HMAC signed marker (shared + timestamp) แทน static string — Node layer verify signature
  3. **ทดสอบ:** เขียน test ว่า `/api/auth/verify` ที่ส่ง marker header มาเองยัง rate limited
- **ความมั่นใจ:** CONFIRMED — ยืนยันจาก `edge-rate-limit-policy.ts:1-2` (marker = `'v1'`), `worker.ts:59` (`withEdgeRateLimitMarker`), และ `otp/route.ts:33`, `verify/route.ts:33` (check marker → skip allowRequest)
- **หมายเหตุเรื่อง origin protection:** จาก repo ไม่พบ Cloudflare Access policy, mTLS config, หรือ origin-lock mechanism ในโค้ด; `wrangler.jsonc` ไม่มี `routes` ที่ restrict origin access. **ไม่สามารถยืนยันจาก repo ว่า origin ถูกปิดกั้นจริง** — ต้องตรวจที่ Cloudflare dashboard: (1) มี Access policy บังคับ auth ก่อนถึง origin ไหม, (2) origin DNS เป็น public record ไหม, (3) มี mTLS between Worker↔origin ไหม. ถ้ายืนยันไม่ได้ทุกข้อ → **PLAUSIBLE** ว่า origin อาจถูก access ตรง
- **เสนอ VULN ID:** VULN-119

---

### [P1] F-02: CSP ยังเป็น Report-Only — defense-in-depth สำหรับ XSS ไม่ enforce จริง

- **ที่:** `academy-web/next.config.ts:51`
- **โค้ดจริง:**
  ```typescript
  { key: 'Content-Security-Policy-Report-Only', value: reportOnlyContentSecurityPolicy },
  ```
- **ทำไมถึงเป็นช่องโหว่:** `Content-Security-Policy-Report-Only` ไม่บล็อก inline script/style จริง; browser แค่รายงาน. **ไม่มี report-uri/report-to** (`next.config.ts:25-40` — directive list ไม่มี report-to/report-uri) จึงไม่มีแม้แต่ข้อมูล violation
- **สถานะ:** รายงานเดิม (2026-08-09) ระบุไว้ตรงกัน: "CSP remains report-only so compatibility evidence can be collected before an enforcement decision"
- **Severity:** Medium — ต้องมี XSS vector อื่นก่อน (ยังไม่พบ)
- **Priority:** P1 — ต้อง enforce ก่อน public launch
- **แก้ยังไง:**
  1. เพิ่ม `report-to` directive + deploy endpoint เก็บ CSP violation reports
  2. ทดสอบ compatibility กับ topology จริง (public pages, authenticated routes, private media)
  3. เปลี่ยน `Content-Security-Policy-Report-Only` เป็น `Content-Security-Policy`
- **ความมั่นใจ:** CONFIRMED
- **เสนอ VULN ID:** VULN-120

---

### [P2] F-03: In-memory rate limiter reset เมื่อ serverless instance ใหม่ spawn

- **ที่:** `src/lib/rate-limit.ts:11`
- **โค้ดจริง:**
  ```typescript
  const hits = new Map<string, number[]>()
  ```
- **ทำไมถึงเป็นช่องโหว่:** state อยู่ใน process memory — instance ใหม่นับใหม่. โค้ดรู้ปัญหา: comment บรรทัด 1-3 ระบุ "public release ต้องมี edge rate-limit จริง"
- **Mitigation ที่มีอยู่:** edge rate-limit DO ใน Worker เป็น guard ชั้นแรก (Durable Object = consistent state)
- **Severity:** Medium
- **Priority:** P2
- **ความมั่นใจ:** CONFIRMED

---

### [P2] F-04: `x-forwarded-for` ปลอมได้เมื่อใช้เป็น rate-limit key

- **ที่:** `src/lib/request-ip.ts:6-9`
- **โค้ดจริง:**
  ```typescript
  export function clientKey(request: Request): string {
    const cf = request.headers.get('cf-connecting-ip')?.trim()
    if (cf) return cf
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  }
  ```
- **Severity:** Medium — secondary defense; ร่วมกับ F-01 + F-03 ถ้า origin accessible ตรง
- **Priority:** P2
- **ความมั่นใจ:** CONFIRMED

---

### [P2] F-05: HSTS ไม่มี `includeSubDomains` และ `preload`

- **ที่:** `next.config.ts:52`
- **โค้ดจริง:**
  ```typescript
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  ```
- **Severity:** Low
- **Priority:** P2
- **ความมั่นใจ:** CONFIRMED

---

### [P3] F-06: `dangerouslySetInnerHTML` 2 จุด — ไม่มี user input vector แต่ต้องเฝ้า

- **ที่:**
  1. `src/app/(localized)/courses/[slug]/[locale]/page.tsx:84` — JSON-LD
  2. `src/components/AppShell.tsx:49` — hardcoded theme script literal
- **ไม่มี attack vector ปัจจุบัน**
- **Priority:** P3
- **ความมั่นใจ:** CONFIRMED

---

### [P3] F-07: `sign-out` revocation failure ไม่บังคับล้าง session ทุกกรณี

- **ที่:** `src/app/(site)/api/auth/sign-out/route.ts:36-51`
- **Severity:** Low — scope เป็น `local` + expiry
- **Priority:** P3
- **ความมั่นใจ:** CONFIRMED

---

### [P3] F-08: Player `/player/*` ส่งเฉลยฝั่ง client

- **ที่:** `src/lib/internal-surface.ts:15-16` (env guard), `src/lib/staff/authorization.ts:19-23` (staff role check)
- **Mitigation:** env flag fail-closed + middleware block before auth + staff role DB check
- **Priority:** P3 — ต้องแก้ก่อนเปิดให้ user จริง
- **ความมั่นใจ:** CONFIRMED

---

### [P3] F-09: `console.error` บาง route log error object ทั้งก้อน

- **ที่:** `api/progress/reset/route.ts:55,109`, `api/progress/route.ts:478,563`, `api/auth/sign-out/route.ts:46`, `api/leads/unsubscribe/route.ts:47`, `api/leads/route.ts:63`, `api/courses/[slug]/skill-map/route.ts:49`, `api/attempts/route.ts:156`
- **Class-of-bug:** 9+ จุดใช้ `console.error(..., error)` ทั้ง object แทน `.message`
- **Severity:** Low
- **Priority:** P3
- **ความมั่นใจ:** PLAUSIBLE — ต้องตรวจ runtime ว่า Supabase error object มี sensitive field จริงไหม

---

## 5. ตาราง Verification — ทุก finding ของเฟส 1

| # | Finding | ผลลัพธ์ | เหตุผล |
|---|---|---|---|
| F-01 | Edge rate-limit marker forge | **CONFIRMED** | ยืนยัน: marker = static `'v1'`; Worker strip+re-set ไม่มี crypto proof; origin protection ยืนยันจาก repo ไม่ได้ |
| F-02 | CSP Report-Only | **CONFIRMED** | ยืนยัน: `next.config.ts:51` = Report-Only; ไม่มี report-to/report-uri |
| F-03 | In-memory rate limiter reset | **CONFIRMED** | ยืนยัน: `rate-limit.ts:11` — module-level Map; self-documented |
| F-04 | XFF spoofable rate-limit key | **CONFIRMED** | ยืนยัน: `request-ip.ts:8-9` — XFF fallback |
| F-05 | HSTS incomplete | **CONFIRMED** | ยืนยัน: `next.config.ts:52` — no includeSubDomains/preload |
| F-06 | dangerouslySetInnerHTML | **CONFIRMED — no vector** | ทั้ง 2 จุดไม่มี user input |
| F-07 | sign-out revocation | **CONFIRMED** | cookie ลบ แต่ GoTrue token อาจยังอยู่ |
| F-08 | Player client-side scoring | **CONFIRMED** | env fail-closed + middleware block + staff DB check |
| F-09 | Unsanitized error logging | **PLAUSIBLE** | 9+ จุดใช้ raw error object; ต้องตรวจ runtime |

**ไม่มี finding ของ A1 ที่ถูกตีตก (REJECTED)**

---

## 6. สิ่งที่ตรวจเพิ่มจาก A1 (adversarial deep-dive)

### 6.1 Private media / entitlement access controls — ปลอดภัย

ตรวจ chain ทั้งหมด:
1. **Grant issuance** (`course-media/[assetId]/route.ts:13-46`): `currentUser()` → `authorizeCourseResource(userId, courseSlug, nodeId)` → 4 ชั้น → `issueMediaGrant()` → HttpOnly/Secure/SameSite=lax/path-scoped/5-min TTL
2. **Worker delivery** (`worker-delivery.ts:28-94`): HMAC SHA-256, 32-byte minimum, constant-time comparison, assetId + courseSlug + nodeId + expiry match
3. **Registry** (`registry.ts`): hardcoded 5-asset enum — ไม่มี IDOR (ไม่ sequential, ไม่ dynamic)
4. **Path traversal** (`route.ts:64-66`): `resolve()` + prefix check

### 6.2 RLS 18 ตาราง + SECURITY DEFINER — ปลอดภัย

- 18 create table = 18 enable RLS → ทุกตาราง
- 0 GRANT TO authenticated/anon, 0 USING (true), 0 WITH CHECK (true)
- SECURITY DEFINER = retention functions only, owner = `academy_retention_definer` (NOLOGIN, ไม่มี authenticated membership)
- Role boundary check raise exception ถ้า membership ผิดคาด

### 6.3 `.dev.vars` / `NEXT_PUBLIC_*` — ไม่มีหลุด

- `.dev.vars` = Supabase CLI demo values; ไม่ tracked (`git ls-files` = empty)
- `NEXT_PUBLIC_*`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `SEARCH_INDEXING` — ไม่มี sensitive value
- `SERVICE_ROLE` ใน source = 1 hit comment only

### 6.4 Identity Control seam — ออกแบบดี ยังไม่ release

- ES256 signature verify + exact-key validation + clock/lifetime bounds + issuer/audience match
- Local fixture guarded by `NODE_ENV !== 'production'` + flag + localhost
- `currentUser()` ใน production ที่ไม่มี flag = `return null` = ไม่มีใครล็อกอินได้ (ถูกต้องสำหรับ pre-release)

### 6.5 CSRF protection — ถูกต้อง

- `validateMutationRequest()`: Origin → match required; no Origin → `sec-fetch-site: same-origin` required; neither → **reject**

---

## 7. แผนแก้แบบทำต่อได้ทันที

| ลำดับ | งาน | ไฟล์ที่แตะ | ประมาณเวลา (AI-pace) | ทำพร้อมกัน |
|---|---|---|---|---|
| 1 | **F-01:** เปลี่ยน static marker เป็น HMAC signed (หรือรับ pattern `trustedEdge` จาก identity-control) | `edge-rate-limit-policy.ts`, `worker.ts`, 4 route files | 2-4 ชม. | ทำพร้อมข้อ 4 |
| 2 | **F-02:** CSP report endpoint + enforce | `next.config.ts` + worker endpoint | 2-3 ชม. | ทำพร้อมข้อ 1 |
| 3 | **F-05:** HSTS includeSubDomains + preload | `next.config.ts:52` | 5 นาที | ทำพร้อมข้อ 2 |
| 4 | **F-04:** reject no cf-connecting-ip in production | `request-ip.ts` | 30 นาที | ทำพร้อมข้อ 1 |
| 5 | **F-09:** sanitize console.error → `.message` | 9+ route files | 1 ชม. (class-of-bug) | ทำแยก |
| 6 | **F-03:** document in-memory as fallback | `rate-limit.ts` | 10 นาที | ทำพร้อมข้อ 1 |
| 7 | **F-07:** handle revocation not-confirmed client-side | sign-out client code | 30 นาที | ทำแยก |

**test คู่กัน:**
- F-01: test marker forgery still rate-limited; HMAC verify fail on wrong value
- F-02: response header = `Content-Security-Policy` (not Report-Only)
- F-04: production rejects request without cf-connecting-ip

---

## 8. ข้อสังเกต / hardening (ไม่ใช่ช่องโหว่)

### 8.1 สิ่งที่ทำได้ดี (ไม่ต้องแก้)

| ด้าน | สิ่งที่ตรวจพบ |
|---|---|
| **Injection** | ทุก DB call ผ่าน Supabase client (parameterized) + dedicated RPC — ไม่มี string concatenation |
| **IDOR/BOLA** | ทุก endpoint ใช้ `currentUser().account.id` จาก session |
| **Open redirect** | `safeAcademyInternalReturnPath()`: starts `/`, no `//`, ≤2048, no control char, origin match |
| **CSRF** | `validateMutationRequest()` + missing Origin = reject |
| **Body size** | `readBoundedBody()` streaming byte counter |
| **Cookie** | HttpOnly, Secure (prod), SameSite=Lax |
| **Path traversal** | `resolve()` + prefix check |
| **Media HMAC** | constant-time, 32-byte min, 5-min TTL, per-asset scope |
| **RLS** | 18/18 default deny + no GRANT TO authenticated |
| **Runtime API** | dedicated PostgREST + JWT + boundary check |
| **Fixture guards** | triple: NODE_ENV + flag + loopback |
| **Identity verify** | ES256 + structuredClone + clock bounds |
| **Headers** | X-Frame: DENY, nosniff, Referrer-Policy, Permissions-Policy, no poweredBy |

### 8.2 Fixtures directory

`fixtures/cas005/` — internal dev fixture, not served by Next.js. **ยืนยัน build output ไม่รวมก่อน deploy public.**

### 8.3 Dependencies (UNVERIFIED)

| Package | Version | Note |
|---|---|---|
| `next` | `^15.5.22` | Check advisory DB |
| `nanoid` | `3.3.17` | Prior report: High advisory |
| `postcss` | `^8.5.25` | Prior report: High advisory |
| `sharp` | `0.35.2` | Prior report: High advisory |

---

## 9. Search coverage รวม

| Pattern | ขอบเขต | ผลลัพธ์ | สนับสนุนข้ออ้าง |
|---|---|---|---|
| `dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|__html` | `src/**/*.{ts,tsx}` | 2 hits | ไม่มี XSS from user input |
| `SERVICE_ROLE` | `src/**/*.{ts,tsx}` | 1 hit = comment | ไม่ใช้ service_role ใน app |
| `NEXT_PUBLIC_` | `src/**/*.{ts,tsx}` | 12 hits, 4 vars | ไม่มี sensitive value |
| `exec(\|child_process\|spawn` | `src/**/*.{ts,tsx}` | 0 | ไม่มี command injection |
| `SECURITY DEFINER\|GRANT.*TO.*authenticated\|USING (true)\|WITH CHECK (true)` | `supabase/**/*.sql` | DEFINER = retention only; rest = 0 | RLS safe |
| `cors\|Access-Control` | `src/**`, `next.config.*` | 0 | same-origin default |
| `fetch(` (SSRF) | `src/**/*.{ts,tsx}` (no tests) | 17 = relative/SDK only | no SSRF |
| `readFile\|writeFile\|fs\.` | `src/**/*.{ts,tsx}` (no tests) | 7 = all guarded | no arbitrary file |
| `enable row level security` vs `create table` | `supabase/migrations/` | 18 / 18 | all tables RLS |
| `console\.error.*error[^.]` | `src/app/**/*.ts` | 9+ | log sanitization incomplete |
| `x-forwarded-for` | `src/**/*.ts` | 1 = request-ip.ts fallback | XFF is fallback only |
| `git ls-files -- .dev.vars .env.local .env` | repo root | empty | env files not tracked |

---

## 10. Delta จากรายงานเดิม + ข้อเสนอ VULN ID

### เทียบกับ `reports/reviews/academy-security-headers-local-checkpoint-2026-08-09.md`

| ข้อเดิม | สถานะ |
|---|---|
| Security headers ไม่มี | **แก้แล้ว** — 7 headers ครบ |
| CSP report-only → enforce | **ยังเปิดอยู่** (F-02) |
| npm audit 4 High | **ยังเปิดอยู่** — UNVERIFIED offline |
| HSTS incomplete | **ยังเปิดอยู่** (F-05) |

### ข้อเสนอ VULN ID ใหม่

| VULN ID | Finding | Product | Severity/Priority |
|---|---|---|---|
| VULN-119 | F-01: Edge rate-limit marker forgeable | Academy | High/P1 |
| VULN-120 | F-02: CSP Report-Only | Academy | Medium/P1 |

---

## 11. สิ่งที่ยังไม่ได้ตรวจ / ต้องตรวจแบบ dynamic

| รายการ | ทำไม | ต้องทำ |
|---|---|---|
| **Origin protection** | ไม่มี CF dashboard access | Check Access policy, origin DNS, mTLS |
| **Runtime behavior** | ห้ามรัน | Test actual headers, cookies, CSP enforcement |
| **Dependency CVE** | ห้าม npm audit | `npm audit --omit=dev` with network |
| **Supabase production config** | นอก repo | Check PostgREST config, pg_hba |
| **Identity Control seam (prod)** | ยังไม่ release | Re-audit when wired |
| **Retention Worker** | นอก scope | Separate audit |
| **Git history scan** | ห้ามรัน | `git log -p --diff-filter=D -- "*.env*"` |
| **Build output** | ห้ามรัน build | Verify `fixtures/` excluded |

---

*รายงานนี้ตรวจที่ commit `86e94eb` + working tree ณ 2026-08-15 — มี session อื่นกำลังทำงานอยู่ใน repo; ไฟล์บางส่วนอาจเปลี่ยนระหว่างตรวจ*
