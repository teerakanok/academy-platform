# Security Review & Hardening Checklist — academy-platform @ 02c712e
_Reviewed 2026-09-05 by Claude Fable 5.1 (max) finders + GLM-5.3 (max) lanes, triaged against the frozen tree._

Frozen tree: `/private/tmp/secrev-academy` (HEAD `02c712e`, read-only). Inputs: Fable finders 44 รายการที่ scope `academy*` (จาก 149) + GLM-5.3 lane `run-35698d52df05cf02c1c6be206d8df6ed` 6 รายการ → merge/de-dup เหลือ **27 items** (Fable ซ้ำกันเองหลายชุด เช่น middleware ×5, session-at-rest ×3, media grant ×3, lifecycle ×3). ทุก item เปิดโค้ดที่อ้างจริงก่อนตัดสิน; ไม่ได้ยิง request ไปยัง host จริงใด ๆ.

## สรุปผู้บริหาร

- ผลตัดสิน: **CONFIRMED 25 · UNCERTAIN 1 · FIXED 1 (pending deploy) · REFUTED 0** — severity หลังปรับ: HIGH 1 open (+1 fixed), MEDIUM 5, LOW 14 (+1 uncertain), INFO 6. ทั้งสอง reviewer แม่นในข้อเท็จจริง แต่ปรับ severity ลง 3 จุด (GLM MEDIUM→LOW ×2, Fable LOW→INFO ×1) และรวม HIGH/MEDIUM/LOW ที่ Fable ให้เรื่องเดียวกันเป็นข้อเดียว.
- ต้องแก้ก่อน (ลำดับนี้): **(1)** SEC-ACADEMY-001+005 — ทางเข้า sign-in ที่ไม่ต้อง auth (`/api/auth/identity/start`, `/auth/callback`) ไม่มี rate limit ทุกชั้นและ buffer body ไม่จำกัด → write amplification เข้า Pool A + บังคับให้ Academy ยิง code exchange ด้วย client assertion จริงไป Identity Control ได้ไม่จำกัด; **(2)** SEC-ACADEMY-002 — `middleware.ts:105-113` ใน production redirect ทุก path ที่ไม่ public ไป `/sign-in` โดยไม่ดู `academy_session` เลย → owner-present journey ข้อ 1 ใน `PENDING_USER_ACTION.md` จะวนที่ `/dashboard`; ตัวแก้ต้องคง `currentUser()` เป็นผู้ตัดสินและมี unit test ที่ `NODE_ENV=production`; **(3)** SEC-ACADEMY-003+004 — suspend/deactivate/erase ที่ Identity Control ไม่ถึง Academy จนกว่า session (24 h) หมดอายุ, ไม่มี revoke-by-principal, และ `findOrCreateUser` บน request path จะ insert โปรไฟล์ที่ถูกลบกลับมา/ย้อน email เก่า.
- ความเสี่ยงต่อลูกค้า: วันนี้ canonical host อยู่หลัง Cloudflare Access และ raw `workers.dev` route ถูกปิดแล้วใน production version `6c2e3881` เมื่อ 2026-09-05 → exposure ต่อสาธารณะต่ำ; แต่ทุกข้อข้างบนกลายเป็น live ทันทีที่เปิด public. ความน่าเชื่อถือของใบรับรอง: SEC-ACADEMY-006 — capstone 4–5 ข้อ ×4 ตัวเลือก, โจทย์ชุดเดิมทุก attempt, oracle ตอบแค่ pass/fail, quota 3/30 นาที → script ผ่าน capstone ได้ใน ~0.9–3.6 วันโดยไม่มี alert.
- ของที่แข็งแรงและยืนยันแล้ว: opaque server-side session (32-byte CSPRNG), PKCE + state + browser-binding digest + client-assertion, ทุก learner route/page เรียก `currentUser()` + `authorizeCourseResource()`, bounded JSON body ทุก JSON route, Origin/Sec-Fetch mutation gate, RLS default-deny + dedicated PostgREST role ไม่มี service_role membership, HMAC-SHA256 media grant เทียบแบบ constant-time, `npm audit --omit=dev` = 0.

## Findings

### SEC-ACADEMY-001 · ทางเข้า Identity sign-in (`/api/auth/identity/start`, `/auth/callback`) ไม่มี rate limit หรือ quota ชั้นใดเลย
- **Severity:** HIGH (pre-launch: ถูกบัง Access; ต้องปิดก่อนเปิด public) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/edge-rate-limit-policy.ts:17-27` · `academy-web/src/app/(site)/api/auth/identity/start/route.ts:17-32,49-60` · `academy-web/src/lib/identity/runtime-browser-flow.ts:103-123,178-204` · `academy-web/src/lib/identity/transaction.ts:698-722` · `academy-web/supabase/migrations/0025_identity_authorization_transaction.sql:100-146` · `0028_identity_authorization_completion_lease.sql:177,200-202`
- **Attack path:** client ไม่ต้อง auth ส่ง `GET /api/auth/identity/start?next=/` พร้อม header `sec-fetch-site: same-origin, sec-fetch-mode: navigate, sec-fetch-dest: document` (curl ใส่ได้) หรือ `POST` พร้อม `Origin: https://<host>` → `authorize()` → `beginIdentityAuthorization` → RPC `create_identity_authorization_transaction` (2 DELETE + INSERT + UPDATE, row อยู่ 300 s) ทุกครั้ง. จาก 303 Location ได้ `state` และจาก Set-Cookie ได้ `academy_identity_binding_<state>` → เรียก `GET /auth/callback?code=<opaque 16+ ตัว>&state=<state>` พร้อม cookie นั้น → `claim_identity_authorization_transaction` (lease 30 s, cap 3 ครั้ง/state) → สร้าง ES256 client assertion → `adapter.exchangeCode` ยิง fetch ไป `accounts.cyberskills.co.th/v1/code/exchange` (timeout ≤5 s) **ก่อน** verify ผล; code ปลอมถูกตรวจแค่ regex. state ออกได้ไม่จำกัด → exchange ไม่จำกัด.
- **Impact:** DoS ราคาถูกต่อ sign-in ทั้งระบบ + load บน dedicated PostgREST/Pool A (shared กับ Crux/STAR/Forge) + Academy กลายเป็นตัวยิง Identity Control ด้วย credential จริงของตัวเอง → เสี่ยงโดน throttle/flag client `academy-web` = ผู้เรียนจริง sign-in ไม่ได้. ไม่มี data exposure. หมายเหตุ: growth ของตาราง **มีขอบ** (ทุก create ลบ expired ≤100 แถว, `0025:106-115`) — steady state ≈ rate × 300 s ไม่ใช่ unbounded.
- **Evidence:**
  ```
  edge-rate-limit-policy.ts:25-26  if (request.method !== 'POST') return null; return rules[pathname] ?? null   // rules = leads, unsubscribe, otp, verify เท่านั้น
  start/route.ts:24 / :54          browserFlow.startNavigation(request) / browserFlow.start(request)   // ไม่มี hasEdgeRateLimitMarker/allowRequest
  runtime-browser-flow.ts:152-158  ตรวจแค่ Sec-Fetch-* headers (client ปลอมได้)
  transaction.ts:715-722           const exchangeValue = await adapter.exchangeCode({... code: callback.code ...}); const verified = await verifyResult(...)
  production-runtime.ts:216-229    startAuthorization สร้าง authorize URL ในเครื่อง (ไม่ยิงออก) — outbound เกิดเฉพาะ callback
  ```
- **Remediation:** เพิ่ม rule ใน `edge-rate-limit-policy.ts` สำหรับ `GET|POST /api/auth/identity/start` และ `GET /auth/callback` (ขยาย `edgeRateLimitRule` ให้รับ method ต่อ path; key = `cf-connecting-ip`; callback เข้มกว่า 10/min); ใน route ให้ fail closed เมื่อไม่มี marker ใน production แทน silent pass; ใน `create_identity_authorization_transaction` ปฏิเสธเมื่อ pending row ที่ยังไม่หมดอายุเกิน global ceiling; พิจารณา Turnstile บนปุ่ม sign-in start และ WAF rate-limit rule ที่ Cloudflare ก่อน public launch.
- **Sources:** both (Fable #12/#16/#36a, GLM medium) · **Status:** OPEN

### SEC-ACADEMY-002 · middleware ฝั่ง production ไม่รู้จัก Identity session: ทุก path ที่ไม่ public (รวม `/api/*`) ถูก 307 ไป `/sign-in` โดยไม่ดู cookie
- **Severity:** MEDIUM (fail-closed; blocker ของ customer-critical flow + ไม่มี defense-in-depth) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/middleware.ts:87-113` · `academy-web/src/lib/identity/local-fixture.ts:31-33` · `academy-web/src/lib/auth/legacy-direct-otp.ts:21-26` · `academy-web/src/app/(site)/api/auth/me/route.ts:21-23` · `academy-web/tests/unit/identity-local-recovery.test.ts:7-14`
- **Attack path:** ไม่ใช่ attacker path. ใน Worker จริง (`NODE_ENV=production`, ไม่มี `ACADEMY_*_LOCAL_FIXTURE`, `build:cf` ล้าง `NEXT_PUBLIC_SUPABASE_*`) predicate ทั้งสองเป็น false → `url`/`anonKey` undefined → บรรทัด 110-112 redirect ทุก path ที่ `isPublic()` ไม่ผ่าน. ลำดับจริง: `/auth/callback` สำเร็จ → Set-Cookie `academy_session` → 303 `/dashboard` → middleware 307 `/sign-in` (ไม่มี `next=`) → หน้า sign-in อีกครั้ง; `fetch('/api/progress')` ได้ 307 HTML แทน 401 JSON; `/api/auth/me` ตอบ `signedIn:false` เสมอ. branch เดียวที่อ่าน cookie คือ local fixture (87-103) ซึ่งเป็น syntactic prefilter. unit test เดียวของ middleware รันที่ `NODE_ENV:'test'` + fixture.
- **Impact:** owner-present acceptance ข้อ 1 (`PENDING_USER_ACTION.md` "redirect ไป dashboard") จะล้มที่ขั้นถัดจาก callback; ผู้เรียนใช้ product ไม่ได้เลย. เชิง security: fail-closed วันนี้ แต่ patch ที่เขียนใต้แรงกดดัน launch มีความเสี่ยงทำให้ middleware กลายเป็นผู้ตัดสินจาก cookie syntax; ไม่มีชั้นที่สองถ้า route ใหม่ลืม `currentUser()`.
- **Evidence:**
  ```
  middleware.ts:105-112  const allowLegacyFixture = legacyDirectOtpFixtureAllowedForRequest(request); const url = allowLegacyFixture ? ... : undefined
                         if (!url || !anonKey) { return isPublic(pathname) ? response : NextResponse.redirect(new URL('/sign-in', request.url)) }
  local-fixture.ts:31    environment.NODE_ENV !== 'production' && ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE === '1' && ...
  me/route.ts:21-23      if (!legacyDirectOtpFixtureAllowedForRequest(request)) return NextResponse.json({ signedIn: false })
  readiness-2026-09-03.md:43  "the bogus-cookie 307 could not distinguish that from an unknown session"
  ```
- **Remediation:** เพิ่ม production branch ก่อนบรรทัด 105: ถ้า `productionIdentityControlAvailable()` และ `parseAcademySessionCookie(cookie) !== null` → pass-through (prefilter เท่านั้น); ไม่มี cookie → `/api/*` ตอบ 401 JSON, page redirect พร้อม `next=`; `/api/auth/me` resolve ผ่าน `createAcademyIdentityProductionSessionStore()`; เพิ่ม unit test `NODE_ENV='production'` + `IDENTITY_*` ครบ ยืนยัน `/dashboard` ผ่านเมื่อมี cookie และ 307 เมื่อไม่มี; ขยาย production smoke ให้ GET `/dashboard` ด้วย cookie ที่ออกจริง; เพิ่ม lint/test ที่ fail ถ้าไฟล์ใต้ `src/app/(site)` นอก public allowlist ไม่ import `currentUser`/staff guard.
- **Sources:** Fable (#2/#10/#26/#29/#41) · **Status:** DEPLOYED (independent review PASS; real-session smoke pending)

### SEC-ACADEMY-003 · Identity lifecycle (suspend/deactivate/delete) ไม่ถึง Academy; ไม่มี revoke-by-principal; session อยู่ 24 h
- **Severity:** MEDIUM · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/auth/session.ts:67-74` · `academy-web/src/lib/identity/postgres-session-store.ts:21,136-143` · `academy-web/src/lib/identity/production-runtime.ts:95,143` · `academy-web/supabase/migrations/0027_identity_session_store.sql:146-176,178-192` · `0024_identity_profile_activation.sql:43` · `academy-web/src/lib/identity/consumer-policy.ts:39-53`
- **Attack path:** ผู้เรียนที่ถูก suspend/deactivate ที่ Identity Control (abuse, chargeback, offboarding) หรือใครที่ถือ `academy_session` cookie ที่ขโมยมา ใช้ `/api/progress`, `/api/attempts`, `/course-media/*`, lesson pages ต่อได้จนกว่า `expires_at` (24 h). `currentUser()` อ่าน claims ที่ freeze ตอน sign-in และไม่ดู `claims.activation`; `getCourseAccess()` อ่าน `academy.service_activation` ซึ่งเขียนโดย `sync_service_activation` ที่ถูกเรียกจาก `commit_identity_profile_activation` ตอน sign-in เท่านั้น (grep: ไม่มี caller อื่นใน `src/`, `ops/`, `worker/`, `scripts/`). ไลบรารี lifecycle-pull/reducer มีครบแต่ import เฉพาะจาก `scripts/generate-identity-control-conformance.mjs`; `scheduled()` เดียวคือ retention worker. RPC revoke มีแค่ `revoke_identity_session(p_session_id)`; ตาราง `identity_session` ไม่มี FK/index ไป principal.
- **Impact:** ไม่มี kill switch รายบัญชี — ทางเดียวคือถอน `IDENTITY_*` ทั้งระบบ (logout ทุกคน) หรือ operator แก้ DB ตรง. ขัดกับเจตนาของ Identity Control integration บน paid platform.
- **Evidence:**
  ```
  session.ts:67-74       const claims = await sessionStore.get(sessionId); ... resolveAccount({ issuer, subject, email: claims.verifiedEmail })   // activation ไม่ถูกใช้
  0027:161-174           read_identity_session คืน status 'active' ให้ทุกแถวที่ยังไม่หมดอายุ ไม่ว่า activation_status จะเป็นอะไร
  0027:178-192           revoke_identity_session(p_session_id) — ลบทีละ id เท่านั้น
  0024:43                perform academy.sync_service_activation(v_account_id, p_status, p_revision);   // ผู้เขียน service_activation รายเดียวใน runtime
  consumer-policy.ts:39-44  lifecycle publisherEndpoint/clientAssertionAudience/eventAudience = null; releaseBlockers มี 'lifecycle-publisher-endpoint-and-audience'
  ```
- **Remediation:** เพิ่ม RPC `academy.revoke_identity_sessions_for_principal(p_issuer, p_subject_key)` + index `(issuer, subject_key)` และ grant ให้ `academy_runtime`; ต่อ lifecycle pull cycle (0022/0023) เข้า scheduled Worker ให้ map projection `disabled/deleted` → `sync_service_activation(suspended/deactivated)` + revoke sessions; ระหว่างยังไม่ wire ให้เขียน manual kill-switch (update `service_activation` / delete `identity_session`) ลง runbook — `e2e/security-boundaries.spec.ts:134-168` พิสูจน์แล้วว่า suspended ปิดทุก path ทันที; พิจารณาลด TTL หรือ re-check activation revision ตอน read.
- **Sources:** both (Fable #0/#9/#31, GLM medium) · **Status:** OPEN

### SEC-ACADEMY-004 · `currentUser()` เขียนโปรไฟล์จาก claims ที่ freeze ใน session: ฟื้นบัญชีที่ถูกลบ (erasure ไม่ durable) และย้อน email ที่เปลี่ยนแล้ว
- **Severity:** MEDIUM (PDPA erasure + มติ founder 2026-09-04 "ลบ = ล้างทุกอย่าง") · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/auth/session.ts:57-74` · `academy-web/src/lib/account/users.ts:63-74,86-90` · `academy-web/supabase/migrations/0027_identity_session_store.sql:4-13` · `academy-web/docs/privacy/request-runbook.md:42`
- **Attack path:** (a) operator ลบแถว `academy.users` ตาม runbook สำหรับ PDPA erasure หรือ principal ถูกลบที่ Identity Control → browser ใดที่ยังถือ `academy_session` (≤24 h) ยิง request เดียวไป page/API ใดก็ได้ → `resolveIdentitySessionUser` → `findOrCreateUser` → `users.ts:86-88` insert `{issuer, subject, email}` กลับมาพร้อม `last_seen_at` ใหม่. (b) ผู้ใช้เปลี่ยน verified email ที่ Identity Control แล้ว sign-in บนเครื่อง B (email ใหม่) → request จาก session เก่าบนเครื่อง A → `users.ts:66-74` update email กลับเป็นค่าเก่า; สอง session สลับค่ากันไปมา; ผู้ที่เคยถือ session ทำให้โปรไฟล์ชี้ mailbox เก่าได้จนหมดอายุ.
- **Impact:** PII ที่ลบแล้วกลับมาโดยเงียบ; email ที่ใช้ออกใบรับรอง/แจ้งเตือนไม่ตรงกับ issuer; audit trail สับสน. runbook map เรื่องลบไม่มี "sessions".
- **Evidence:**
  ```
  session.ts:60           resolveAccount = findOrCreateUser
  users.ts:66-69          if (existing.data.email !== email) { await db.from('users').update({ email, last_seen_at: seenAt }) ... }
  users.ts:86-88          const created = await db.from('users').insert({ issuer: claims.issuer, subject: claims.subject, email })
  0027:4-13               identity_session(id, issuer, subject_key, verified_email, ...) — ไม่มี FK ไป academy.users
  request-runbook.md:42   "map the subject across account, learning, entitlement, waitlist, consent, appeal, and case records"  // ไม่มี sessions
  ```
- **Remediation:** บน request path ใช้ resolver แบบ find-only `(issuer, subject)` ที่ไม่เขียน email และถือว่า account หาย = session ไม่ valid (revoke แล้วตอบ 401); อัปเดต email เฉพาะจาก exchange result ใน `commit_identity_profile_activation` หรือ lifecycle event; เพิ่ม "revoke sessions ของ principal ก่อนลบ users" ใน runbook และพิจารณาเก็บ `account_id` ใน `identity_session` แบบ `on delete cascade`.
- **Sources:** Fable (#14/#21) · **Status:** OPEN

### SEC-ACADEMY-005 · `POST /api/auth/identity/start` อ่าน body ทั้งก้อนด้วย `request.formData()` โดยไม่มีเพดาน (ไม่ต้อง auth)
- **Severity:** MEDIUM · **Verdict:** CONFIRMED (code path ตรวจแล้ว; ผล memory/CPU exhaustion อนุมานจาก platform limit ไม่ได้ reproduce)
- **File:line:** `academy-web/src/lib/identity/runtime-browser-flow.ts:129-135` · `academy-web/src/app/(site)/api/auth/identity/start/route.ts:77` · เทียบ `academy-web/src/lib/http/bounded-body.ts:17-29` · `academy-web/wrangler.jsonc:10`
- **Attack path:** client ส่ง `POST /api/auth/identity/start` พร้อม `Origin: https://<host>` และ body multipart/urlencoded หลายสิบ MB (Cloudflare รับได้ถึง 100 MB ต่อ request บน plan ทั่วไป) หรือ multipart หลายแสน part เล็ก ๆ; `validateMutationRequest` ผ่านทันที (Origin = Host) แล้ว `await request.formData()` buffer ทั้งหมดก่อนเช็คว่ามี key เดียว. ทุก JSON route ในระบบใช้ `readBoundedJson` แต่ route นี้ (และ fixture branch บรรทัด 77) ไม่ได้ใช้.
- **Impact:** ต่อ request: ชน isolate memory (128 MB) หรือ `cpu_ms: 500` → error/evict isolate ซ้ำ ๆ → sign-in entry degrade สำหรับทุกคน. `bounded-body.ts` เองอธิบาย hazard นี้ไว้ในหัวไฟล์.
- **Evidence:**
  ```
  runtime-browser-flow.ts:129-133  const mutation = validateMutationRequest(request); if (!mutation.ok) ...; const form = await request.formData()
  start/route.ts:77                const form = await request.formData()   // local-fixture branch
  bounded-body.ts:1-6              "อ่าน request body แบบมีเพดาน — หยุดอ่านทันทีที่เกิน" (ใช้ใน leads/progress/practice/otp/verify แต่ไม่ใช่ที่นี่)
  wrangler.jsonc:10                "limits": { "cpu_ms": 500 }
  ```
- **Remediation:** ก่อน `formData()` ปฏิเสธถ้า `content-type` ไม่ใช่ `application/x-www-form-urlencoded` หรือ `content-length` หาย/เกิน ~2 KB; ดีกว่านั้นคือ `readBoundedBody(request, 2048)` แล้ว parse ด้วย `URLSearchParams` (ปฏิเสธ multipart ทั้งหมด); ทำเหมือนกันที่ route.ts:77; unit test ว่า body 1 MB ได้ 413 โดยไม่ถูกอ่านจนจบ.
- **Sources:** Fable (#17) · **Status:** OPEN

### SEC-ACADEMY-006 · capstone (certificate-bearing) brute-force ได้: answer space 256–1024 state, โจทย์ชุดเดิมทุก attempt, oracle ตอบแค่ pass/fail, quota 3/30 นาที; override `ATTEMPT_MAX_PER_WINDOW` ไม่มี production guard
- **Severity:** MEDIUM · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/app/(site)/api/attempts/route.ts:94-97` · `academy-web/src/lib/course/attempt-db.ts:11-13,23-28` · `academy-web/src/app/(site)/api/progress/route.ts:428-434,472` · `academy-web/supabase/migrations/0013_integrity_batch.sql:37-38,90-91` · `academy-web/src/lib/course/roadmap.ts:31-38,300-303` · `academy-web/playwright.config.ts:62`
- **Attack path:** ผู้เรียนที่มี entitlement เขียน script: loop { `POST /api/attempts {slug,nodeId:<capstone>}` → ได้ MCQ ชุดเดิม (remap key ต่อ attempt แต่ enumerate ฝั่ง client ได้) → `POST /api/progress {action:'checkpoint', attemptId, answers:<permutation ถัดไป>}` → `{ok, passed}` }. วัดจาก content จริง: capstone lesson 47 ไฟล์ (en/th) ทุกข้อ `correct.length = 1`, 4 ตัวเลือก; ส่วนใหญ่ 4 ข้อ = 256 state, `basic-os-linux` 5 ข้อ = 1024, demo 3 ข้อ + 1 sim. quota `issue_attempt` 3 ต่อ 30 นาที ต่อ (user,node) = 144/วัน → คาดหวัง ~0.9 วัน (256) หรือ ~3.6 วัน (1024) ต่อ capstone. บทปกติ skip ได้ทั้งหมด (`roadmap.ts:31-38`) จึงมีแต่ capstone ที่กั้น `recordComplete`. บวก: quota อ่านจาก env โดยไม่ clamp — e2e config ตั้ง 500; `wrangler deploy --keep-vars` ทำให้ค่าที่หลงเข้ามาคงอยู่.
- **Impact:** "Certificate of Course Completion" ได้ด้วย automation ในหลักวันโดยไม่มี lockout/alert — บน security-training brand คือ credential-credibility attack ที่มีคนลองแน่. ตรวจย้อนหลังได้จาก `academy.attempt` แต่ไม่มีอะไรกัน.
- **Evidence:**
  ```
  attempts/route.ts:97      const params = buildAttemptParams(bank, bank.length, isAssessedNode(node))   // เสิร์ฟ = ทั้งคลัง
  attempt-db.ts:12-13       ATTEMPT_MAX_PER_WINDOW = 3 / ATTEMPT_WINDOW_MINUTES = 30;  :23-28 attemptQuota() รับ env ใด ๆ > 0
  progress/route.ts:434,472 passed = answeredAll && (assessed ? correctCount === totalTasks : ...);  if (assessed) return NextResponse.json({ ok: true, passed })
  0013:90-91                ... created_at > now() - make_interval(mins => p_window_minutes)) >= p_max_per_window
  content/courses/assembly/locales/en/lessons/recursion-in-assembly.json  checkpoint: 4 ข้อ, choices A-D, "correct": ["B"]
  ```
- **Remediation:** (1) ขยายคลัง ≥3× แล้วสุ่มต่อ attempt + สลับ distractor (แผน W-content); (2) escalating cost ใน `issue_attempt` เอง: backoff ต่อ (user,node) หลัง fail ติดกัน + daily hard cap; (3) alert เมื่อ fail capstone > N/วัน หรือ issue→submit เร็วผิดปกติ; (4) `attemptQuota()` ignore override เมื่อ `NODE_ENV==='production'` (หรือ clamp ≤3) + production smoke ยืนยันครั้งที่ 4 ใน 30 นาทีถูกปฏิเสธ; (5) minimum dwell time สำหรับ assessed node.
- **Sources:** Fable (#30/#34) · **Status:** OPEN

### SEC-ACADEMY-007 · edge rate limiter ใช้ raw pathname แบบ exact match และ inner fallback เป็น per-isolate Map (fail-open): `/api/auth/<route>/` ข้าม Durable Object
- **Severity:** LOW (latent — otp/verify ตอบ 503 ใน production, `/api/leads/` ถูก middleware กัน) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/edge-rate-limit-policy.ts:24-27` · `academy-web/src/middleware.ts:51,54` · `academy-web/src/app/(site)/api/leads/route.ts:33-34` (otp/verify เหมือนกัน) · `academy-web/src/lib/rate-limit.ts:11` · `@opennextjs/aws/dist/core/routing/matcher.js:203-207` · `next/dist/server/next-server.js:336` (Next 15.5.22)
- **Attack path:** `POST /api/auth/otp/` (trailing slash) → `rules['/api/auth/otp/']` undefined → ไม่เช็ค DO, ไม่ใส่ marker → OpenNext ข้าม trailing-slash redirect สำหรับ `/api/` โดยเจตนา → middleware ปล่อยเพราะ `startsWith('/api/auth/')` → Next `removeTrailingSlash(pathname)` ก่อน match → handler รัน → `hasEdgeRateLimitMarker` false → ตกไป `allowRequest()` ใน `Map` ต่อ isolate/colo. วันนี้ inert เพราะ otp/verify ตอบ 503 (fixture ปิด) และ `/api/leads/` ไม่ผ่าน `pathname === '/api/leads'` ของ middleware — คือถูกกันโดยบังเอิญ ไม่ใช่โดยการออกแบบของ limiter.
- **Impact:** DO limiter ถูกข้ามได้สำหรับ `/api/auth/*` mutation ใด ๆ ที่จะถูกเพิ่ม rule ในอนาคต (รวม SEC-ACADEMY-001) เหลือแค่ limiter ในหน่วยความจำที่ reset เมื่อ isolate ถูก evict.
- **Evidence:**
  ```
  edge-rate-limit-policy.ts:26  return rules[new URL(request.url).pathname] ?? null
  leads/route.ts:33-34          if (!await hasEdgeRateLimitMarker(request, {...}) && !allowRequest(`leads:${clientKey(request)}`))
  matcher.js:203-207            // We should not apply trailing slash redirect to API routes  event.rawPath.startsWith("/api/")) return false;
  next-server.js:336            pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
  ```
- **Remediation:** normalise ก่อน lookup (ตัด trailing slash, ปฏิเสธ `%`, `//`, `\`, dot-segment ด้วย 404); ใน production ถ้า route ที่ควรมี rule ไม่มี marker ให้ตอบ 503/429 แทน fallback; unit test สำหรับ `/api/leads/`, `/api/auth/verify/` และ encoded variant.
- **Sources:** Fable (#19/#36b) · **Status:** OPEN

### SEC-ACADEMY-008 · rate-limit key เป็น per-IP ล้วน (IPv6 /128, ไม่มี dimension ต่อ target) สำหรับ otp/verify/leads/unsubscribe
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/edge-rate-limit-policy.ts:58` · `academy-web/src/lib/request-ip.ts:3-4` · `academy-web/worker/edge-rate-limiter-do.ts:19-33`
- **Attack path:** ผู้โจมตีที่มี IPv6 /64 หรือ proxy pool หมุน address → ทุก address ได้ budget 10/min ใหม่บน `/api/leads` (lead spam เข้า Pool A) และถ้า OTP fixture เคยเปิดจริง OTP guessing ถูกจำกัดต่อ IP ไม่ใช่ต่อ email เป้าหมาย.
- **Impact:** aggregate rate โตเชิงเส้นตามจำนวน address; ไม่มี global ceiling ต่อ route.
- **Evidence:**
  ```
  edge-rate-limit-policy.ts:58  crypto.subtle.sign('HMAC', key, encoder.encode(`academy:${operation}:${clientAddress}`))
  request-ip.ts:3-4             const cf = request.headers.get('cf-connecting-ip')?.trim(); if (cf) return cf
  edge-rate-limiter-do.ts:19-33 fixed window ต่อ (actor, route) object
  ```
- **Remediation:** รวม IPv6 เป็น /64 ก่อน hash; เพิ่ม DO key ที่สองต่อ target (hash ของ email) สำหรับ otp/verify/leads ด้วย limit ต่ำกว่า; global per-route circuit breaker.
- **Sources:** Fable (#20) · **Status:** OPEN

### SEC-ACADEMY-009 · session identifier เก็บ plaintext at rest (`identity_session.id`, `identity_authorization_transaction.session_id`) ขณะที่ claim token/browser binding ถูก digest — dump/backup มี session ที่ replay ได้
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/supabase/migrations/0027_identity_session_store.sql:5,13-14,115-121,159-160` · `academy-web/src/lib/identity/postgres-session-store.ts:101-103,159` · `0028_identity_authorization_completion_lease.sql:9` · `academy-web/scripts/academy-poola-production-producer.mjs:227`
- **Attack path:** ใครที่อ่าน schema `academy` นอก RPC ได้ (Pool A superuser, `pg_dump --schema=academy` ใต้ `/root/academy-db-backups`, scratch DB ของ restore rehearsal, off-host copy) copy `id` แล้วตั้ง `Cookie: academy_session=<id>` → เป็นผู้เรียนคนนั้นจน `expires_at` (≤24 h) โดยไม่แตะ callback path.
- **Impact:** backup กลายเป็น credential store; ยิ่งสำคัญเพราะ docs ระบุว่ายังไม่มี restore rehearsal/backup custody ที่ชัด.
- **Evidence:**
  ```
  0027:13-14              primary key (id), constraint identity_session_id_format check (id ~ '^[A-Za-z0-9_-]{43}$')
  0027:119                insert into academy.identity_session (id, ...) values (p_session_id, ...)
  postgres-session-store.ts:101-102  const sessionId = stableIdValue ?? randomBytes(32).toString('base64url'); callRpc('create_identity_session', { p_session_id: sessionId,
  producer.mjs:227        ['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc','--schema=academy']
  ```
- **Remediation:** เก็บ `sha256(sessionId)` (base64url 43 ตัว พอดี constraint เดิม) เป็น key และ digest ใน adapter ก่อนทุก RPC (create/read/revoke/finalize) แบบเดียวกับ `digestClaimToken`; cookie ยังถือค่าดิบ; migrate ด้วยการ expire แถวเดิม; ระบุ TTL 300–600 s ของ `code_verifier` ใน threat model.
- **Sources:** Fable (#13/#22/#37) · **Status:** OPEN

### SEC-ACADEMY-010 · private media grant เป็น pure bearer: ไม่ผูก learner/session และอยู่ต่อหลัง sign-out/revoke entitlement ≤5 นาที
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/media/grant.ts:3-8` · `academy-web/src/app/(site)/course-media/[assetId]/route.ts:24-27,36-44` · `academy-web/src/lib/media/worker-delivery.ts:40-44` · `academy-web/src/app/(site)/api/auth/sign-out/route.ts:44-46` · `academy-web/src/lib/media/cookie.ts:2`
- **Attack path:** ผู้เรียนที่มีสิทธิ์ copy ค่า `academy_media_grant` จาก devtools (HttpOnly กัน script ไม่ได้กันเจ้าของ) ส่งให้คนอื่น → outer Worker ส่ง MP4/PDF จาก R2 ให้ใครก็ได้ที่มี cookie นั้น + path ภายใน 5 นาที (รองรับ Range); sign-out ล้างเฉพาะ `academy_session`; revoke entitlement/session ไม่หยุด delivery จนกว่า grant หมดอายุ.
- **Impact:** ต่ำ — คนเดิม download แล้วแจกได้อยู่แล้ว; ที่เพิ่มคือ third party ดึงจาก origin ตรงช่วงสั้น ๆ และ revocation lag ≤5 นาที; ไม่มี per-user accountability ใน delivery log.
- **Evidence:**
  ```
  grant.ts:3-8            interface MediaGrant { assetId; courseSlug; nodeId; expiresAt }   // ไม่มี account/session
  worker-delivery.ts:42-44  const grant = await verifyMediaGrantSignature(token, env.MEDIA_SIGNING_SECRET); if (!grant || grant.assetId !== asset.id || ...) return null; if (grant.expiresAt <= now) return null
  sign-out/route.ts:45    response.headers.append('set-cookie', expireAcademySessionCookie())   // ไม่แตะ academy_media_grant
  ```
- **Remediation:** ใส่ `sid = sha256(sessionId)` (หรือ accountId) ใน payload ที่ sign และให้ `servePrivateMedia` เทียบกับ `academy_session` cookie ที่มากับ request เดียวกัน; คง TTL 5 นาที; log delivery พร้อม account id.
- **Sources:** Fable (#1/#15/#23) · **Status:** OPEN

### SEC-ACADEMY-011 · cookie `academy_session` / `academy_identity_binding_<state>` ไม่มี `__Host-` prefix — sibling `*.cyberskills.co.th` โยน `Domain=` cookie ทับได้ (login CSRF / forced logout)
- **Severity:** LOW (ต้องยึด sibling host ก่อน) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/identity/session-store.ts:55-57,65-74,84-112` · `academy-web/src/lib/identity/runtime-browser-flow.ts:211-223`
- **Attack path:** script บน sibling host (XSS บน www/accounts/crux/star หรือ dangling subdomain) ตั้ง `academy_session=<session ของ attacker>; Domain=cyberskills.co.th; Path=/; Secure`. เหยื่อที่ยังไม่ login ถูก authenticate เป็น attacker เงียบ ๆ (progress/attempt/purchase ในอนาคตลงบัญชี attacker); เหยื่อที่ login อยู่มี cookie ชื่อซ้ำสองตัว → parser คืน null → logout ถาวร. ทำแบบเดียวกับ `academy_identity_binding_<state>` + พาเหยื่อไป `/auth/callback?code&state` ของ attacker ได้ผลเดียวกันผ่าน flow ปกติ.
- **Impact:** account confusion / denial of access ในระบบ multi-product; ข้อมูลผู้เรียนลงผิดบัญชี = PDPA-relevant.
- **Evidence:**
  ```
  session-store.ts:56-57  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax']; if (secure) parts.push('Secure')
  session-store.ts:71     `${ACADEMY_SESSION_COOKIE_NAME}=${sessionId}`   // 'academy_session', ไม่มี prefix/Domain
  session-store.ts:111    return occurrences === 1 && !malformed ? candidate : null
  runtime-browser-flow.ts:216-221  `${browserBindingCookieName(state)}=${binding}`, 'Path=/auth/callback', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=300'
  ```
- **Remediation:** เปลี่ยนชื่อเป็น `__Host-academy_session` (Secure, ไม่มี Domain, Path=/) และ `__Secure-academy_identity_binding_<state>` (คง Path=/auth/callback) หรือ `__Host-` ทั้งคู่; อัปเดต parser/fixture (secure:false path) ให้ตรง; คง exact-one parser.
- **Sources:** Fable (#11) · **Status:** OPEN

### SEC-ACADEMY-012 · URL field ใน lesson content รับทุก scheme (`javascript:`/`data:`/`vbscript:`) และไปถึง `<a href>`/`<img src>`; CSP มี `'unsafe-inline'`
- **Severity:** LOW (ต้องมี write access ใน content pipeline/repo) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/content/course-loader.ts:318-320,326-330,334-338` · `academy-web/src/components/course/LessonBody.tsx:143,173` · `academy-web/src/components/course/blocks/ImageBlock.tsx:51,86` · `academy-web/src/lib/media/resolve.ts:13-20` · `academy-web/next.config.ts:32`
- **Attack path:** ใครที่วาง JSON ใต้ `content/courses/**` ได้ (Crucible export ingestion, contributor PR, เครื่อง author ที่ถูกยึด) ตั้ง `externalLink.href = "javascript:..."` — zod 4.4.3 `z.string().url()` รับ (ทดสอบด้วย node: `javascript:alert(1)`, `data:text/html,hi`, `vbscript:x` → success ทั้งหมด) — หรือ `image.src`/`attachment.href` ที่เป็นแค่ `min(1)`; build ผ่าน, ship เป็น static content; ผู้เรียนคลิก → script รันบน origin `academy.cyberskills.co.th` (CSP ไม่บล็อกเพราะ `'unsafe-inline'`) → เรียก `/api/progress`, `/api/attempts` ด้วย session ของเหยื่อ.
- **Impact:** stored XSS ผ่านช่องทางที่เชื่อถือต่อผู้เรียนที่จ่ายเงิน; content ปัจจุบันสะอาด (scan: href/src ทั้งหมดเป็น `/media/...` หรือ `https://`).
- **Evidence:**
  ```
  course-loader.ts:320   src: z.string().min(1)        // image
  course-loader.ts:330   href: z.string().min(1)       // attachment
  course-loader.ts:338   href: z.string().url()        // externalLink — WHATWG URL parse ผ่านทุก scheme
  LessonBody.tsx:173     href={block.href} target="_blank" rel="noopener noreferrer"
  node (zod 4.4.3):      z.string().url().safeParse('javascript:alert(1)').success === true
  ```
- **Remediation:** `.refine()` allowlist scheme ใน course-loader (root-relative หรือ `https:` เท่านั้น; ปฏิเสธ `javascript:`, `data:`, `vbscript:`, `//`); content-gate test ที่ fail build เมื่อเจอ scheme อื่น; ทำ SEC-ACADEMY-013 ควบคู่.
- **Sources:** Fable (#4) · **Status:** OPEN

### SEC-ACADEMY-013 · CSP `script-src 'self' 'unsafe-inline'` ใน production; unit test pin ค่านี้ไว้
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/next.config.ts:32` · `academy-web/src/components/AppShell.tsx:49` · `academy-web/src/app/(localized)/courses/[slug]/[locale]/page.tsx:84` · `academy-web/tests/unit/security-headers.test.ts:10`
- **Attack path:** ไม่มี injection sink วันนี้ (dangerouslySetInnerHTML 2 จุด = escaped JSON-LD + constant theme script; lesson blocks เป็น React text node) แต่ XSS ใด ๆ ในอนาคต (รวม SEC-ACADEMY-012) รันได้โดย CSP ไม่ขวาง.
- **Impact:** CSP มีแต่ไม่ได้ทำหน้าที่ defense-in-depth สำหรับ script.
- **Evidence:**
  ```
  next.config.ts:32          `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`
  AppShell.tsx:49            <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
  security-headers.test.ts:10  ['script-src', ["'self'", "'unsafe-inline'"]],
  ```
- **Remediation:** per-request nonce ใน middleware (`x-nonce`) + `'strict-dynamic'`; hash `THEME_BOOTSTRAP_SCRIPT`; เปลี่ยน test ให้ assert ว่าไม่มี `'unsafe-inline'` ใน `script-src`; คง `'unsafe-eval'` เฉพาะ dev.
- **Sources:** both (Fable #7/#38, GLM low) · **Status:** OPEN

### SEC-ACADEMY-014 · static assets ข้าม Worker ทั้งหมด (ไม่มี `run_worker_first`, ไม่มี `public/_headers`): security headers และ legacy-media 404 guard ไม่ครอบอะไรใต้ `.open-next/assets`
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/wrangler.jsonc:11` · `academy-web/public/` (มีแค่ `brand/`, `media/`; ไม่มี `_headers`) · `academy-web/src/lib/media/worker-delivery.ts:30` · `academy-web/worker.ts:43-49`
- **Attack path:** `/_next/static/*`, `/brand/*`, `/media/diagrams/*` ถูกตอบโดย Workers Assets ก่อน `worker.ts` รัน → ไม่มี HSTS/nosniff/CSP จาก next.config; ไฟล์ใดที่หลุดไป `public/` หรือ build assets (แผน 2026-08-02 บันทึกว่าเคยเกิดกับ MP4/PDF) เป็น public ทันทีโดย `privateMediaByLegacyPath` 404 guard ไม่ทำงาน; response ที่ worker.ts สร้างเอง (429/503) และ media response ก็ไม่มี baseline headers. ไม่พบ build gate ที่ scan `.open-next/assets` หา mp4/vtt/pdf/zip (grep scripts/ เจอแค่ release tooling tests). วันนี้ `public/` สะอาด (find: ไม่มี mp4/pdf/vtt/zip).
- **Impact:** header hardening ครอบไม่ครบ; ขอบเขต private media พึ่ง directory convention ไม่ใช่ gate.
- **Evidence:**
  ```
  wrangler.jsonc:11      "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },   // ไม่มี run_worker_first
  worker-delivery.ts:30  if (privateMediaByLegacyPath(url.pathname)) return new Response(null, { status: 404 })   // รันเฉพาะเมื่อ Worker ได้ request
  worker.ts:43-49        new Response('ส่งคำขอถี่เกินไป ...', { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': ... } })
  public/                brand/logo-academy.svg, media/sample-diagram.svg, media/diagrams/ — ไม่มี _headers
  ```
- **Remediation:** เพิ่ม `public/_headers` baseline สำหรับ `/*`; build gate fail เมื่อ `.open-next/assets` มี mp4/vtt/pdf/zip; ใส่ baseline headers ให้ response ที่ worker.ts/worker-delivery สร้าง; พิจารณา `assets.run_worker_first` สำหรับ `/media/*`.
- **Sources:** Fable (#39) · **Status:** OPEN

### SEC-ACADEMY-015 · waitlist `POST /api/leads` บันทึก consent ให้ email ใดก็ได้โดยไม่พิสูจน์เจ้าของ และ re-grant consent ที่ถอนแล้ว/หมดอายุ (ไม่มี double opt-in)
- **Severity:** LOW (email sending ปิดโดย founder; 10/min/IP) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/app/(site)/api/leads/route.ts:18-25,27-39,72-80` · `academy-web/supabase/migrations/0017_privacy_retention_and_appeals.sql:103-129`
- **Attack path:** `POST /api/leads {"email":"victim@example.org","consent":true}` พร้อม `Origin` = host (curl ได้) → `record_lead_consent`: email ใหม่ → insert + event `granted` 3 ปี; email ที่เคย unsubscribe (`marketing_withdrawn_at` set) → เข้า update branch: ล้าง withdrawal, ออก `unsubscribe_token` ใหม่, append `granted`. comment ใน SQL กันเฉพาะ *active* consent จากการต่ออายุ ไม่ได้กัน withdrawn จากการ re-grant.
- **Impact:** เมื่อเปิด marketing จริง จะส่งหาคนที่ไม่เคย/ไม่ต้องการ consent และบริษัทถือ "consent evidence" ที่ defend ไม่ได้ (PDPA); competitor ปั่น lead metrics ได้.
- **Evidence:**
  ```
  leads/route.ts:20      consent: z.literal(true)   // shape เท่านั้น
  0017:105-111           if v_lead.marketing_withdrawn_at is null and marketing_consent_expires_at > p_consent_at and consent_text_version = p_consent_text_version then return;
  0017:113-118           update academy.leads set consent_at = p_consent_at, ..., marketing_withdrawn_at = null, unsubscribe_token = gen_random_uuid(), ...
  0017:125-128           insert into academy.consent_events (...) values (v_lead.id, p_consent_at, p_consent_text_version, 'granted', 'waitlist');
  ```
- **Remediation:** double opt-in: บันทึกเป็น `unconfirmed` และ emit `granted`/ล้าง `marketing_withdrawn_at` เฉพาะเมื่อคลิกลิงก์ยืนยันที่ sign แล้ว; จนกว่าจะมี ให้ RPC treat withdrawn lead เป็น no-op เหมือน active; Turnstile บนฟอร์ม; คง uniform response.
- **Sources:** Fable (#18/#32) · **Status:** OPEN

### SEC-ACADEMY-016 · `academy_runtime` (BYPASSRLS) ถือ insert/update บน `course_entitlement`/`service_activation` และ session-mint RPC ทั้งที่ไม่มี request path ใช้ — ขยาย blast radius ของ bug/secret leak ฝั่ง Worker
- **Severity:** LOW · **Verdict:** CONFIRMED
- **File:line:** `academy-web/supabase/migrations/0019_dedicated_runtime_api.sql:33-34,57` · `academy-web/supabase/privileged/academy-data-api-roles.sql:13,28` · `0027_identity_session_store.sql:208-211` · `academy-web/src/lib/account/access.ts:65-95` · `academy-web/src/lib/db/runtime-token.ts:5`
- **Attack path:** ใครที่ได้ `ACADEMY_DATA_API_JWT_SECRET` (HS256 token อายุ 60 s) + reach dedicated PostgREST, หรือ code-exec/SSRF ใน Worker → upsert `course_entitlement` ให้ตัวเอง ("enrol ฟรี"), flip `service_activation` ตรง (ข้าม revision-monotonic RPC), หรือเรียก `create_identity_session` ให้ principal ใดก็ได้โดยไม่ผ่าน Identity Control. `grantCourseEntitlement`/`revokeCourseEntitlement` มี caller เดียวคือ `tests/integration/identity-boundary.test.ts:143-194`; production grant ทำผ่าน operator psql.
- **Impact:** ไม่ exploit ได้เอง; กำหนดว่า authorization bug ใด ๆ ของ app จะ "ทำได้แค่ไหน" — วันนี้คือถึงขั้นให้สิทธิ์คอร์สจ่ายเงินและ mint session.
- **Evidence:**
  ```
  0019:33-34   grant select, insert, update on academy.service_activation to academy_runtime; grant select, insert, update on academy.course_entitlement to academy_runtime;
  roles.sql:13 create role academy_runtime nologin noinherit ... bypassrls;
  0027:208-211 grant execute on function academy.create_identity_session(...) / read_ / revoke_ to academy_runtime;
  access.ts:65 export async function grantCourseEntitlement(...)   // grep: ไม่มี route/page เรียก
  ```
- **Remediation:** revoke insert/update บน `course_entitlement` และ `service_activation` จาก `academy_runtime` จนกว่าจะมี purchase path (ให้ผ่าน RPC แคบ ๆ ที่ audit); พิจารณาแยก credential/role ที่สองสำหรับ identity RPC (transaction/session/profile) ออกจาก learner-data role; ลบหรือย้าย `grantCourseEntitlement` ไป operator script ที่ต้องใช้ `academy_staff_admin`.
- **Sources:** Fable (#3/#33) · **Status:** OPEN

### SEC-ACADEMY-017 · learning mutation ที่ authenticated (`/api/progress`, `/api/progress/reset`, `/api/practice/simulation`) ไม่มี per-account quota
- **Severity:** LOW (ปรับลงจาก GLM MEDIUM: ต้องเป็นผู้เรียนที่มี entitlement; body bounded; ownership-scoped) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/app/(site)/api/progress/route.ts:138-179` · `academy-web/src/app/(site)/api/practice/simulation/route.ts:47-89` · `academy-web/src/app/(site)/api/progress/reset/route.ts` · `academy-web/src/lib/edge-rate-limit-policy.ts:17-22`
- **Attack path:** ผู้เรียนที่ active ยิง progress/reset/practice-grading ถี่ ๆ ด้วย script → แต่ละ request = `currentUser()` RPC + `authorizeCourseResource` (activation + entitlement + progress) + write.
- **Impact:** DB contention/Worker CPU กระทบผู้เรียนอื่น; ไม่ข้าม validation/entitlement.
- **Evidence:**
  ```
  progress/route.ts:138-179  validateMutationRequest → currentUser → readBoundedJson → zod → authorizeCourseResource → commit...   // ไม่มี limiter
  practice/simulation/route.ts:47-89  รูปเดียวกัน
  edge-rate-limit-policy.ts:17-22  rules ไม่มี learning route
  ```
- **Remediation:** per-account (+per-course) quota ใน DO policy — key จาก account id หลัง auth; เข้มกว่าสำหรับ reset/grading; budget แยกสำหรับ bulk UI ปกติ.
- **Sources:** GLM (medium) · **Status:** OPEN

### SEC-ACADEMY-018 · integration test ของ dedicated-API boundary ใช้ `describe.skipIf(!hasDedicatedApi)` — `npm test` เขียวได้โดย negative test (anon/forged role/cross-schema) ไม่เคยรัน
- **Severity:** LOW (ปรับลงจาก GLM MEDIUM: evidence gate ใน repo อ้างเฉพาะ unit count ไม่ได้อ้าง suite นี้) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/tests/integration/academy-runtime-api.test.ts:6-11,34` · `academy-web/tests/integration/academy-retention-api.test.ts:4-19,42` · `academy-web/vitest.config.ts` (integration project อยู่ใน `vitest run`) · `plans/active_plan.md:2424-2431`
- **Attack path:** ไม่ใช่ attacker path. รัน `npm test` โดยไม่มี `ACADEMY_DATA_API_URL`/secret → suite skip เงียบและ exit 0; guard ที่ M2-1 เพิ่ม (2026-08-16) fail เฉพาะกรณี URL ตั้งแล้วชี้ origin ต้องห้าม; retention suite ยังเป็นรูป skip เดิม (บันทึกเป็น debt).
- **Impact:** สัญญาณ PASS ทับสิ่งที่ไม่เคยตรวจ — RLS/role isolation ของ production seam อาจไม่ถูก exercise ในรอบ release.
- **Evidence:**
  ```
  academy-runtime-api.test.ts:11   const hasDedicatedApi = Boolean(apiUrl && signingSecret && isSafeAcademyDataApiUrl(apiUrl))
  academy-runtime-api.test.ts:34   describe.skipIf(!hasDedicatedApi)('dedicated Academy PostgREST contract', ...
  academy-retention-api.test.ts:42 describe.skipIf(!hasDedicatedApi)(...)
  active_plan.md:2428-2431         "academy-retention-api.test.ts ใช้รูป skip เดิม ... บันทึกเป็น debt"
  ```
- **Remediation:** profile `test:boundary` ที่ **fail** เมื่อ env ขาด (ใช้ `requiredEnv`) และผูกเข้า release evidence; ให้ developer skip อยู่คนละ script; รายงานจำนวน test ที่รัน/skip ใน evidence packet.
- **Sources:** GLM (medium) · **Status:** OPEN

### SEC-ACADEMY-019 · operator superuser scripts ประกอบ SQL ด้วย string interpolation (`p1-p7-host.mjs`, `poola-production-producer.mjs`) — ปลอดภัยวันนี้ด้วย regex ก่อนหน้า
- **Severity:** LOW (ไม่ exploit ได้ที่ commit นี้) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/scripts/academy-production-p1-p7-host.mjs:72-91,97-101` · `academy-web/scripts/academy-poola-production-producer.mjs:204,243,247,291`
- **Attack path:** p1-p7: `subject`/`email` จาก `/root/identity-synthetic-operations/<op>/{prepare-input,cleanup}.json` ถูกวางลง template แล้ว pipe เข้า `psql -U postgres` ใน container จริง — วันนี้ email ต้อง `=== ${operationId}@synthetic...` และ `userId` ต้องผ่าน UUID regex จึงใส่ quote ไม่ได้; producer: Python ที่ส่งไป root@ssh-db แทรก `scratch` (จาก `--authority` ที่ตรวจ UUID ฝั่ง client เท่านั้น) ลง `psql -c` และรัน `p['sql']` ตรง ๆ. ถ้า validation ถูกผ่อนหรือเพิ่ม mode ใหม่ → arbitrary SQL as postgres บน production learner DB.
- **Impact:** defence-in-depth gap บนเส้นทาง superuser; ผู้โจมตีต้องเป็น root บน DB host อยู่แล้ว.
- **Evidence:**
  ```
  p1-p7-host.mjs:99-100  `... where subject='${subject}' and email='${email}' ...` / `begin; delete from academy.users where subject='${subject}' and email='${email}'; commit; ...`
  p1-p7-host.mjs:81-90   email !== `${operationId}@synthetic.cyberskills.co.th` || !/^[0-9a-f]{8}-.../i.test(cleanup.userId ?? '')  → fail()
  producer.mjs:243       "select count(*) from pg_database where datname='"+scratch+"'"
  producer.mjs:247       sql='BEGIN;\n'+p['sql']+'\nCOMMIT;\n'
  ```
- **Remediation:** ส่งค่าเป็น psql variable (`-v subject=... ` + `:'subject'`) หรือ pg client แบบ parameterised อย่างที่ `manage-staff-role.mjs` ทำ; ตรวจ `authorityId` ซ้ำใน payload ฝั่ง remote; unit test ป้อน quote/semicolon ผ่าน `fixture()` แล้ว assert ปฏิเสธ.
- **Sources:** Fable (#5/#6) · **Status:** OPEN

### SEC-ACADEMY-020 · shared Pool A `service_role` ยังมี SELECT บน staff roster/audit และ EXECUTE `has_staff_role`; migration role `postgres` ถือ `academy_staff_admin`
- **Severity:** INFO · **Verdict:** CONFIRMED
- **File:line:** `academy-web/supabase/migrations/0018_staff_authorization.sql:137-140,237`
- **Attack path:** product/operator ใดที่ถือ shared `service_role` key (Crux/STAR/Forge) อ่าน `academy.staff_role_assignment`/`staff_role_audit` ได้; role migration ที่แชร์ assume `academy_staff_admin` แล้วแก้ staff role นอก `manage-staff-role.mjs` ได้.
- **Impact:** cross-product read + control-plane grant บน role แชร์; กว้างกว่า "dedicated boundary" ที่ 0019 ตั้งใจ.
- **Evidence:**
  ```
  0018:137-138  grant select on academy.staff_role_assignment to service_role; grant select on academy.staff_role_audit to service_role;
  0018:140      grant academy_staff_admin to postgres;
  0018:237      grant execute on function academy.has_staff_role(uuid, text) to service_role;
  ```
- **Remediation:** revoke grant ของ `service_role` (Academy ย้ายไป `academy_runtime` แล้วใน 0019); ให้ `academy_staff_admin` แก่ login role เฉพาะสำหรับ `manage-staff-role.mjs` แทน `postgres`.
- **Sources:** Fable (#42) · **Status:** OPEN

### SEC-ACADEMY-021 · diagnostic Worker รับ `cf-access-jwt-assertion` ด้วย regex เท่านั้น (ไม่ verify ลายเซ็น); nonce เป็น gate เข้ารหัสเดียว (candidate ยังไม่ deploy)
- **Severity:** INFO · **Verdict:** CONFIRMED
- **File:line:** `academy-web/worker/identity-client-assertion-secret-diagnostic.ts:220,229-237`
- **Attack path:** ถ้า candidate version reach ได้โดยไม่มี Access หน้า และ attacker รู้ nonce ต่อ candidate → เรียก diagnostic ได้; ไม่รู้ nonce → ปฏิเสธ. JWT check ไม่เพิ่ม assurance.
- **Impact:** เกือบศูนย์ (ยังไม่ deploy; nonce 32 byte เทียบ constant-time; output เป็น marker ไม่ใช่ key material). บันทึกเพื่อไม่ให้ runbook อธิบาย header นี้เกินจริง.
- **Evidence:**
  ```
  diagnostic.ts:235-237  && typeof accessAssertion === 'string' && accessAssertion.length <= ACCESS_ASSERTION_MAX_CHARACTERS && ACCESS_ASSERTION.test(accessAssertion)
  diagnostic.ts:229-232  && constantTimeOpaqueEqual(request.headers.get('x-academy-diagnostic-nonce'), environment.ACADEMY_IDENTITY_DIAGNOSTIC_NONCE)
  ```
- **Remediation:** verify Access JWT กับ team JWKS (aud = application AUD) หรือถอด pseudo-check ออกจากโค้ดและ runbook.
- **Sources:** Fable (#25) · **Status:** OPEN

### SEC-ACADEMY-022 · `challengeVersion` ของ assessment evidence ใช้ FNV-1a 32-bit
- **Severity:** INFO (ปรับลงจาก Fable LOW: ไม่มี attacker leverage; ความน่าจะเป็นชนโดยบังเอิญต่ำ) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/src/lib/simulation/types.ts:186-204` · `academy-web/src/app/(site)/api/progress/route.ts:418`
- **Attack path:** ไม่มี (คำนวณฝั่ง server จาก content). ความเสี่ยงคือ rule set สองชุดต่างกันได้ fingerprint เดียวกันโดยไม่มีใครรู้ → พิสูจน์ตอน appeal/certificate ไม่ได้ว่าผ่านกติกาไหน.
- **Impact:** ค่า evidentiary ของ `challengeVersion` ต่ำกว่าที่ `docs/certificate-claim.md` อ้าง.
- **Evidence:**
  ```
  types.ts:199-203  let hash = 0x811c9dc5; for (...) { hash ^= canonical.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0 } return `sim-${hash.toString(16).padStart(8, '0')}`
  ```
- **Remediation:** SHA-256 ของ canonical JSON (WebCrypto ใช้ได้ทั้งสองฝั่ง) ตัด ≥128 bit; คง FNV เฉพาะ UI label.
- **Sources:** Fable (#24) · **Status:** OPEN

### SEC-ACADEMY-023 · PDPA rights: ไม่มี code path สำหรับ export/portability หรือ self-service deletion; unsubscribe เป็น automated right เดียว
- **Severity:** INFO (launch-gate/process) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/docs/privacy/request-runbook.md:39-43` · `academy-web/src/app/(site)/api/leads/unsubscribe/route.ts` (ทางเดียวที่ automated)
- **Attack path:** N/A. คำขออื่นนอกจาก unsubscribe ต้องใช้ operator SQL บน shared host; deletion แบบ manual เจอ SEC-ACADEMY-004.
- **Impact:** SLA 30 วันสำหรับ access/portability ทำซ้ำได้ยาก; ไม่มี export ที่ review แล้ว.
- **Evidence:**
  ```
  request-runbook.md:39-42  "Log and verify access, copy, correction, deletion, restriction, objection, portability ... before action" / "Provide access or a copy ... within 30 days" — manual ทั้งหมด
  ```
- **Remediation:** ก่อน public launch เพิ่ม operator-run export (users, node_progress, attempt outcomes, consent_events) และ deletion procedure ที่ revoke sessions ก่อน; เติม "sessions" ใน map ของ runbook.
- **Sources:** Fable (#27) · **Status:** OPEN

### SEC-ACADEMY-024 · signed production-authority record หมดอายุแล้ว (fail-closed)
- **Severity:** INFO (operational) · **Verdict:** CONFIRMED
- **File:line:** `academy-web/config/identity-production-authority-2951f5d.json` (`expiresAt: 2026-09-05T03:00:00.000Z`) · `academy-web/scripts/verify-identity-production-authority.mjs`
- **Attack path:** ไม่มี. script ที่พึ่ง `verifyIdentityProductionAuthority()` จะปฏิเสธจนกว่าจะ re-observe/re-sign — พฤติกรรมที่ถูกต้อง.
- **Impact:** identity production operation ที่ gate ด้วย record นี้เดินต่อไม่ได้จนกว่าจะ re-issue.
- **Evidence:**
  ```
  identity-production-authority-2951f5d.json  "observedAt":"2026-08-29T03:00:00.000Z","expiresAt":"2026-09-05T03:00:00.000Z"
  ```
- **Remediation:** re-observe + `ssh-keygen -Y sign` (namespace `cyberskills-academy-identity-authority-v1`) แล้วอัปเดต pinned SHA-256 — ต้องมี founder authority ตาม sensitive-operation.
- **Sources:** Fable (#28) · **Status:** OPEN

### SEC-ACADEMY-025 · npm audit: production tree สะอาด; `qs` 6.15.3 moderate ×2 advisories ใน dev-only chain
- **Severity:** INFO · **Verdict:** CONFIRMED
- **File:line:** `academy-web/package-lock.json` (`node_modules/qs` `dev: true`) · หลักฐาน `scratchpad/npm-audit-prod.json`, `npm-audit-all.json`
- **Attack path:** `qs` มาจาก express/body-parser ฝั่ง dev tooling; ไม่อยู่ใน Worker bundle.
- **Impact:** ไม่มีบน production; hygiene.
- **Evidence:**
  ```
  npm audit --omit=dev  → {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}  (prod deps 38)
  npm audit             → qs moderate, range 2.2.5 - 6.15.3, isDirect:false, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, fixAvailable:true
  ```
- **Remediation:** `npm audit fix` / bump dev dependency ที่ดึง qs รอบถัดไป; เพิ่ม `npm audit --omit=dev` ใน `deploy:cf`.
- **Sources:** Fable (#8/#43) · **Status:** OPEN (hygiene)

### SEC-ACADEMY-026 · Workers invocation logs (sampling 10%) น่าจะบันทึก URL เต็มของ `/auth/callback?code=…&state=…` ซึ่ง runbook ห้ามพิมพ์
- **Severity:** LOW · **Verdict:** UNCERTAIN — ข้อเท็จจริงในโค้ดยืนยันแล้ว (callback เป็น GET ที่ถือ code/state ใน query; `invocation_logs: true`); สิ่งที่ยังไม่ยืนยันคือ field ของ Workers Logs ฝั่ง Cloudflare เก็บ query string หรือไม่ และ retention เท่าไร. **สิ่งที่จะตัดสิน:** เปิด invocation log ที่ sample ได้ 1 รายการของ `/auth/callback` ใน dashboard แล้วดู `$workers.event.request.url`; หรือตั้ง `invocation_logs: false` แล้วปิดประเด็นไปเลย.
- **File:line:** `academy-web/wrangler.jsonc:20-26` · `academy-web/src/app/(site)/auth/callback/route.ts:28-29` · `docs/maintenance/academy-operations-runbook.md:166-167`
- **Attack path:** ผู้ที่มีสิทธิ์อ่าน Workers Logs หรือ log export ที่หลุด เห็น ~1 ใน 10 ของ callback URL พร้อม one-time code + state; replay ถูกกันด้วย browser-binding cookie + single-use → เป็น disclosure ของ protocol material ไม่ใช่ takeover ตรง.
- **Impact:** ขัด runbook §5.5; ขยายกลุ่มผู้เห็น one-time code และ `?next=` return path.
- **Evidence:**
  ```
  wrangler.jsonc:22-25   "logs": { "enabled": true, "head_sampling_rate": 0.1, "invocation_logs": true }
  callback/route.ts:28-29  export async function GET(request: Request) { const url = new URL(request.url)
  runbook.md:166-167     "Do not print recipient, challenge, one-time code, cookies, callback query, provider payload, or secret values."
  ```
- **Remediation:** `observability.logs.invocation_logs: false` (คง console logs) หรือย้าย callback ไปรับ code ทาง POST/form; บันทึก retention ของ Workers Logs ใน secret registry.
- **Sources:** Fable (#40) · **Status:** OPEN

### SEC-ACADEMY-027 · raw `workers.dev` route เสิร์ฟทั้ง app นอก Cloudflare Access gate (pre-launch Zero Trust bypass ได้)
- **Severity:** HIGH (as-was) · **Verdict:** FIXED AND VERIFIED IN PRODUCTION — `c6a67e0` รวมใน source `c5a169b9`, version `6c2e3881` @100%
- **File:line (02c712e):** `academy-web/wrangler.jsonc:1-35` (ไม่มี `workers_dev:false`/`preview_urls:false`) · `academy-web/worker.ts:71-78` (ไม่ตรวจ host) · `docs/maintenance/academy-system-inventory.md:9-10` (raw route ตอบ 200) · **Fix:** `academy-web/src/lib/edge-host-policy.ts` (ใหม่, 47 บรรทัด) · `academy-web/worker.ts` (+3: `if (!isServedHost(request, env)) return unservedHostResponse()` ก่อน `enforceEdgeRateLimit`) · `academy-web/tests/unit/edge-host-policy.test.ts`
- **Attack path (ก่อนแก้):** `https://cyberskills-academy.songpon-te.workers.dev/` (ชื่ออยู่ใน AGENTS.md/docs และ enumerate ได้) → หน้าร้าน, `/api/leads` (Origin = raw host ผ่าน `validateMutationRequest`), `/api/auth/identity/start` (สร้าง transaction) reach ได้โดยไม่ผ่าน Access; sign-in จบไม่ได้บน raw host (redirect_uri pin canonical).
- **Impact (ก่อนแก้):** "behind Zero Trust until founder opens public" ไม่ได้ถูกบังคับจริง; SEC-ACADEMY-001/005/015 reach ได้จาก internet วันนี้ผ่าน route นี้จนกว่าจะ deploy.
- **Evidence:**
  ```
  02c712e worker.ts:72-77   async fetch(request, env, ctx) { const protectedRequest = await enforceEdgeRateLimit(request, env); ... openNextHandler.fetch(...) }   // ไม่มี host check
  c6a67e0 worker.ts:+74-75  // The raw workers.dev route bypasses the Access policy on the canonical host.  if (!isServedHost(request, env)) return unservedHostResponse()
  c6a67e0 edge-host-policy.ts:13,15  CANONICAL_HOST = 'academy.cyberskills.co.th'; LOOPBACK_HOSTS = {localhost, 127.0.0.1, [::1]}; + ACADEMY_SERVED_HOSTS (operator opt-in)
  c6a67e0 edge-host-policy.ts:44-46  unservedHostResponse(): 404, body null, cache-control: no-store
  ```
- **Production evidence:** deploy ผ่านเส้นทาง split/override ใน handoff; GET ทั้ง 3 path ผ่านหลัง activation และไม่มี `ACADEMY_SERVED_HOSTS` override. Owner-present sign-in ยัง pending แยกเป็น SEC-ACADEMY-002.
- **Sources:** both (Fable #35, GLM high) · **Status:** CLOSED — 2026-09-05; raw `/`, `/courses`, `/api/leads` ตอบ 404, body 0 bytes, no-store; canonical ยัง Access 302. หลักฐาน `reports/releases/2026-09-05-production-session-host-gate.md`.

## Checklist

| ID | Area | Item | Status | Checked on | Remaining |
| --- | --- | --- | --- | --- | --- |
| DIM-01 | Authentication & session | อ่าน `middleware.ts`, `session.ts`, `session-store.ts`, `postgres-session-store.ts`, `runtime-browser-flow.ts`, `runtime-completion.ts`, `transaction.ts` (parseIdentityCallback/completeSignedIdentityCallback), routes start/callback/sign-out/me, migrations 0024/0025/0027/0028: PKCE+state+binding digest, opaque 32-byte session, TTL 24 h, cookie flags, revoke-by-id | CHECKED | 2026-09-05 | SEC-ACADEMY-001/002/003/004/005/009/011 |
| DIM-02 | Authorization, IDOR & tenancy | ทุก route/page ใต้ `src/app` ถูก grep: protected APIs/lesson/course/access-required เรียก `currentUser()` และ internal player เรียก staff guard; dashboard ตรวจ `currentUser()` ฝั่ง server ก่อน render; `course-access.ts` 4 ชั้น; 0019 grants + `privileged/academy-data-api-roles.sql`; 0018 staff grants | CHECKED | 2026-09-05 | SEC-ACADEMY-016/020; `/player/*` staff guard อ่านผ่าน grep เท่านั้น |
| DIM-03 | Injection & unsafe I/O | zod schema ของ content blocks + sinks `LessonBody`/`ImageBlock`, `resolve.ts`, path-traversal guard ใน course-media (`resolve`+`startsWith`), operator scripts p1-p7/poola producer, diagnostic Worker; ไม่พบ raw SQL ใน runtime (ทุก write ผ่าน supabase-js/RPC) | CHECKED | 2026-09-05 | SEC-ACADEMY-012/019/021 |
| DIM-04 | Input validation & API abuse | `edge-rate-limit-policy.ts`, `rate-limit.ts`, DO limiter, `mutation-security.ts`, `bounded-body.ts` ใช้ใน leads/otp/verify/progress/practice; `formData()` ใน start; trailing-slash routing ตรวจกับ `@opennextjs/aws` matcher + Next 15.5.22 `next-server.js:336` | CHECKED | 2026-09-05 | SEC-ACADEMY-001/005/007/008/017 |
| DIM-05 | Secrets, config & info leakage | `wrangler.jsonc` (vars/observability), `next.config.ts` headers/CSP, `safe-log` usage ใน error paths, runbook log rule; ไม่มี tracked env file; ไม่มี secret value ถูกอ่านหรือพิมพ์ | CHECKED | 2026-09-05 | SEC-ACADEMY-026 (UNCERTAIN) |
| DIM-06 | Infra, deploy & hardening | `worker.ts`, `wrangler.jsonc`, diff `c6a67e0`, assets/`_headers`, `deploy:cf` (`--keep-vars`), grants SQL; Docker/systemd ไม่มีใน tree นี้ (retention API compose ไม่ได้อ่านลึก) | CHECKED | 2026-09-05 | SEC-ACADEMY-013/014; 027 production GET verified 2026-09-05 |
| DIM-07 | Dependencies & supply chain | `npm audit --omit=dev` = 0 (38 prod deps), full = 1 moderate dev-only; zod 4.4.3 พฤติกรรม `url()` ทดสอบจริง; lockfile pinned, overrides nanoid/postcss/sharp | CHECKED | 2026-09-05 | SEC-ACADEMY-025 |
| DIM-08 | Cryptography & data protection | HMAC-SHA256 grant + constant-time compare, CSPRNG session id, plaintext-at-rest, FNV fingerprint, erasure path (`users.ts` insert-on-read), privacy runbook, consent RPC | CHECKED | 2026-09-05 | SEC-ACADEMY-004/009/010/015/022/023 |
| DIM-09 | Business-logic abuse | วัด answer space จาก 47 capstone lesson files, quota `issue_attempt` 0013, `roadmap.ts` skip semantics, oracle shape ใน progress route, env override | CHECKED | 2026-09-05 | SEC-ACADEMY-006 |
| DIM-10 | Security test coverage & fail-open gates | middleware unit test env, integration `skipIf`, e2e `security-boundaries.spec.ts` (suspend/revoke/CSRF), `security-headers.test.ts` pin `'unsafe-inline'`, `edge-host-policy.test.ts` ใน fix | CHECKED | 2026-09-05 | SEC-ACADEMY-002(test)/013(test)/018 |
| SEC-ACADEMY-001 | Rate limiting | เพิ่ม edge rule (method-aware) สำหรับ `/api/auth/identity/start` GET/POST และ `/auth/callback` GET; fail closed เมื่อไม่มี marker; pending-row ceiling ใน `create_identity_authorization_transaction`; Turnstile/WAF ก่อน public | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-002 | Auth gate wiring | production branch ใน middleware (syntactic prefilter, 401 JSON สำหรับ `/api/*`), `/api/auth/me` และ dashboard ผ่าน `currentUser()`, adversarial unit ครอบ forged/expired/revoked durable session | DEPLOYED; real-session pending | 2026-09-05 | production smoke ด้วย cookie จริงและ owner-present journey — ยังไม่ปิด production |
| SEC-ACADEMY-003 | Session revocation / lifecycle | RPC `revoke_identity_sessions_for_principal` + index; wire lifecycle pull → `sync_service_activation` + revoke; manual kill-switch ใน runbook | OPEN | 2026-09-05 | ทั้งหมด (release blocker `lifecycle-publisher-endpoint-and-audience` ยังเปิด) |
| SEC-ACADEMY-004 | Data protection (erasure) | find-only resolver บน request path; email อัปเดตเฉพาะจาก exchange/lifecycle; revoke sessions ก่อนลบ `users`; `account_id` cascade | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-005 | Unbounded input | bounded form read (≤2 KB, urlencoded เท่านั้น) ใน `runtime-browser-flow.ts:132` และ `start/route.ts:77`; unit test 413 | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-006 | Assessment integrity | bank ≥3× + sample/shuffle; backoff + daily cap ใน `issue_attempt`; alert; clamp `ATTEMPT_MAX_PER_WINDOW` ใน production; dwell time | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-007 | Rate-limit path normalisation | normalise pathname ก่อน lookup; ปฏิเสธ variant ด้วย 404; production fail-closed แทน in-memory fallback; tests สำหรับ `/…/` และ encoded | OPEN | 2026-09-05 | ทั้งหมด (latent) |
| SEC-ACADEMY-008 | Rate-limit key granularity | IPv6 /64 aggregation; per-target key (email hash); global per-route ceiling | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-009 | Credential storage | digest session id ก่อนทุก RPC; migrate โดย expire แถวเดิม | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-010 | Bearer binding | ผูก grant กับ session/account; Worker เทียบกับ `academy_session`; log account id | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-011 | Cookie scope | `__Host-`/`__Secure-` prefix สำหรับ session และ binding cookie; อัปเดต parser/fixture | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-012 | Content XSS | scheme allowlist `.refine()` บน image.src/attachment.href/externalLink.href; content-gate test | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-013 | Security headers (CSP) | nonce + `'strict-dynamic'`, hash theme script, test assert no `'unsafe-inline'` ใน script-src | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-014 | Static asset hardening | `public/_headers`; build gate ห้าม mp4/vtt/pdf/zip ใน `.open-next/assets`; headers บน worker-generated responses | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-015 | Consent integrity | double opt-in; withdrawn = no-op จนกว่ายืนยัน; Turnstile | OPEN | 2026-09-05 | ทั้งหมด (email sending ยังปิด) |
| SEC-ACADEMY-016 | Least privilege (DB role) | revoke insert/update `course_entitlement`/`service_activation` จาก `academy_runtime`; แยก identity credential; ย้าย grant helper ไป staff script | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-017 | Authenticated quota | per-account/per-course quota ใน DO policy สำหรับ progress/reset/practice | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-018 | Test gate hygiene | `test:boundary` ที่ fail เมื่อ env ขาด; ผูกกับ release evidence; รายงาน skip count | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-019 | Operator script SQL | psql variables/parameterised client; remote-side UUID re-check; injection unit test | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-020 | DB privileges (shared role) | revoke `service_role` grants ใน 0018; dedicated login role ถือ `academy_staff_admin` | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-021 | Diagnostic Worker | verify Access JWT ด้วย JWKS หรือถอด pseudo-check | OPEN | 2026-09-05 | ทั้งหมด (candidate ไม่ deploy) |
| SEC-ACADEMY-022 | Evidence integrity | SHA-256 fingerprint สำหรับ `challengeVersion` | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-023 | PDPA process | reviewed export + deletion procedure (revoke sessions ก่อน); เติม sessions ใน runbook map | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-024 | Authority lifecycle | re-observe/re-sign production authority record (ต้อง founder authority) | OPEN | 2026-09-05 | ทั้งหมด |
| SEC-ACADEMY-025 | Dependencies | bump `qs` chain; `npm audit --omit=dev` ใน `deploy:cf` | OPEN | 2026-09-05 | ทั้งหมด (hygiene) |
| SEC-ACADEMY-026 | Logging | ยืนยัน field ของ Workers Logs หรือปิด `invocation_logs`; บันทึก retention | OPEN (UNCERTAIN) | 2026-09-05 | ตัดสินด้วย 1 sampled log หรือปิด flag |
| SEC-ACADEMY-027 | Edge exposure | host allowlist ใน `worker.ts` + `edge-host-policy.ts` + unit test | CLOSED — production verified | 2026-09-05 | GET raw /, /courses, /api/leads = empty no-store 404; canonical = Access 302; release 6c2e3881; inventory/runbook updated |
| NC-01 | Dynamic testing | ไม่ได้ส่ง request ใด ๆ ไป canonical/raw host, PostgREST, Identity Control; `formData()` DoS และ trailing-slash variant ไม่ได้ exercise ใน `wrangler dev` | NOT CHECKED | — | รัน `wrangler dev` + curl variants; reproduce 005 ด้วย body 50 MB |
| NC-02 | Cloudflare Access policy | policy/AUD/allowed identities ของ Access บน canonical host อยู่นอก tree; ยืนยันได้แค่จาก inventory ว่า 302 | NOT CHECKED | — | ตรวจ Zero Trust dashboard: paths ที่ครอบ, bypass rules, service tokens |
| NC-03 | Identity Control server side | code exchange/registry/lifecycle publisher ฝั่ง `accounts.cyberskills.co.th` ไม่อยู่ใน tree นี้ (มี lane แยก identity-control__*) | NOT CHECKED | — | อ่านผลจาก lane identity-control |
| NC-04 | Live DB catalog vs migrations | grants/roles/RLS บน Pool A จริงไม่ได้อ่าน (เทียบจาก migration files เท่านั้น); memory เตือน catalog baseline ต้องอ่านด้วย role เดียวกัน | NOT CHECKED | — | `psql` read-only เทียบ `information_schema.role_table_grants` + `pg_roles` กับ 0019/0027; ต้อง shared-infra authority |
| NC-05 | Retention worker / retention API | `ops/academy-retention-worker`, `ops/academy-retention-api` compose และ `0020` อ่านแค่ `scheduled()` entry | NOT CHECKED | — | review bounded SECURITY DEFINER wrappers + credential separation |
| NC-06 | R2 bucket / CORS / public access | bucket `cyberskills-academy-media` policy อยู่นอก tree | NOT CHECKED | — | ยืนยันไม่มี public bucket access/custom domain |
| NC-07 | Staff/internal surfaces | `/player/*`, `requireInternalContentStaff`, `INTERNAL_SURFACES` อ่านผ่าน grep + middleware 404 เท่านั้น | NOT CHECKED | — | อ่าน `staff/authorization.ts` + player pages เต็ม |
| NC-08 | Lifecycle libraries | `lifecycle-*.ts` (reducer/page-store/pull) ไม่ได้ review ความถูกต้องเพราะยังไม่ wired | NOT CHECKED | — | review เมื่อ wire ตาม SEC-ACADEMY-003 |
| NC-09 | Deployed artifact vs frozen source | production serve `d4717406` = source `594dede` ไม่ใช่ `02c712e`; ไม่ได้เทียบ diff ระหว่างสอง sha | NOT CHECKED | — | `git diff 594dede..02c712e --stat` ก่อน deploy `c6a67e0` |
| NC-10 | E2E suites execution | `e2e/*.spec.ts` (security-boundaries, answer-leak, assessed-redaction, player-boundary) อ่านชื่อ/หัวข้อ ไม่ได้รัน | NOT CHECKED | — | รัน `test:e2e` กับ local Supabase |

## Refuted

- ไม่มี finding ใดที่หักล้างได้ทั้งข้อ — ทุกข้อเปิดโค้ดแล้วยืนแบบเดิมหรือยืนโดยลด severity. ข้อแก้ไขบางส่วน (ไม่ถึงกับ refute):
- GLM "Identity start performs ... upstream work / outbound Identity calls" — `startAuthorization` ฝั่ง production สร้าง authorize URL ในเครื่อง (`production-runtime.ts:216-229`); outbound call เกิดเฉพาะ callback (`transaction.ts:715`) — รวมไว้ใน SEC-ACADEMY-001 แล้ว.
- Fable #36 "unbounded write amplification" — ตาราง transaction มีขอบ: ทุก create ลบ expired ≤100 แถว (`0025:106-115`), steady state ≈ rate × 300 s; ที่ไม่มีขอบคือจำนวน exchange ขาออก.
- Fable #10 "API branch returns a 302" — `NextResponse.redirect` ค่า default = 307 (`middleware.ts:112`); ผลต่อ client เหมือนกัน.
- Fable #24 severity LOW → INFO (ไม่มี attacker leverage); GLM MEDIUM ×2 (authenticated quota, skipIf) → LOW (ต้อง entitled learner / evidence gate ไม่ได้อ้าง suite).

## Coverage & blind spots

- **Coverage:** อ่านจริงทั้งหมด 60+ ไฟล์ตาม DIM-01..10 (routes ทุกไฟล์ใต้ `src/app` ผ่าน grep ครบ, identity flow ครบ start→callback→session→currentUser, migrations 0013/0017/0018/0019/0024/0025/0027/0028, privileged roles, worker/wrangler/next config, operator scripts 3 ไฟล์, tests 6 ไฟล์, content 47 capstone files, node_modules ของ product repo สำหรับ OpenNext/Next routing และ zod). ทุก finding ที่ Fable/GLM อ้าง line ตรงกับ tree ที่ 02c712e; ไม่มีข้ออ้างที่ชี้ไฟล์/บรรทัดผิด.
- **ตกลงตามหลักฐานว่าเข้มแข็ง:** opaque session + PKCE/state/binding/nonce/audience/issuer checks, bounded JSON bodies, Origin/Sec-Fetch mutation gate, default-deny RLS + dedicated PostgREST authenticator ที่ไม่มี service_role membership (มี boundary check ใน roles.sql), HMAC media grant constant-time, exact-one cookie parser, assessed-response uniform shape, DB-side attempt quota + claim tokens, retention isolated ใน Worker/credential แยก.
- **Blind spots (ตาม NC-01..10):** ไม่มี dynamic test; Access policy, Identity Control server, R2 policy, live DB catalog อยู่นอก tree; retention worker/API, staff surfaces, lifecycle libraries อ่านตื้น; deployed version (`594dede`) ≠ frozen source (`02c712e`) — "deployed" เป็นคุณสมบัติของ artifact ไม่ใช่ commit; SEC-ACADEMY-026 ต้องดู log จริง 1 รายการ.
- **Process notes:** GLM lane ให้ 6 ข้อ ทุกข้อ overlap กับ Fable ยกเว้น 2 ข้อ (authenticated quota, skipIf) ซึ่งเป็นของจริงแต่ severity ต่ำกว่าที่ให้; Fable ให้ 44 ข้อที่ dedup เหลือ 25 mechanism — reviewer หลายตัวรายงานเรื่องเดียวกันด้วย severity ต่างกัน (HIGH/MEDIUM/LOW สำหรับ start rate-limit) จึงต้องรวมก่อนจัดอันดับ. ไม่มี secret value ใดถูกอ่านหรือบันทึกระหว่าง triage.
