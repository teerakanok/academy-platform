# ADR — Single Account ทุก Product ของ CYBERSKILLS

> **สถานะ: ACCEPTED — founder เคาะ 2026-08-01** · draft เขียน 2026-07-31
> (M3-prep ของ academy one-shot)
> **ยังต้องยกขึ้นเป็น ecosystem ADR ระดับ director** (decision นี้แตะ
> Crux/STAR/Forge/Academy) — งานนั้นทำใน director repo ตอนที่ worktree ว่าง
> M3 auth ของ Academy **ปลดล็อกแล้ว** ยกเว้นส่วนที่ต้องแตะ Pool A (ดู §0.2)

---

## 0) Decision ของ founder (2026-08-01)

**เคาะตามคำแนะนำทุกข้อ ยกเว้นข้อ 4 ซึ่ง founder ตัดสินตรงข้ามกับที่เสนอ**

### 0.1 สิ่งที่เคาะ

| # | เรื่อง | ผล |
|---|---|---|
| 1 | สถาปัตยกรรม identity | **Option A** — formalize shared issuer บน Pool A GoTrue + identity contract |
| 2 | Pool A asymmetric JWT + JWKS | **ทำ** (ปลด blocker ของ STAR ไปด้วย + เลิกแจก HS256 secret ให้ Forge) |
| 3 | PDPA consent ครอบ identity ข้าม product | **ทำ** — consent text ฉบับ ecosystem เดียว มี version |
| 4 | Academy บังคับสมัครไหม | **บังคับสมัคร** — ตรงข้ามกับที่ draft แนะนำ (ดูเหตุผลด้านล่าง) |
| 5 | วิธี login | **ทั้ง email OTP และ Google** |

### 0.2 ข้อ 4 — บังคับสมัคร (founder overrule คำแนะนำ)

draft แนะนำให้เรียนได้โดยไม่ต้องมี account แล้วค่อยสมัครตอนที่ account ซื้ออะไรให้
founder ตัดสินตรงข้าม ด้วยเหตุผลสองข้อที่หนักกว่าที่ draft ชั่งไว้:

1. **ค่า infra ไม่ใช่ศูนย์** — ผู้ใช้ที่ไม่มีตัวตนเผาค่า infra ของเราทิ้งได้ โดยเฉพาะ
   lab plane ที่เป็น compute จริงต่อ session (M4) ไม่ใช่หน้าเว็บที่ต้นทุนส่วนเพิ่ม
   เกือบศูนย์ — draft ชั่งน้ำหนักด้าน conversion แต่ไม่ได้ชั่งด้านต้นทุนต่อหัว
2. **การสมัครคือ filter ของความตั้งใจ** — "ถ้าของฟรีมันดีจริง สมัครอะไม่ยากเย็นหรอก"
   คนที่ยอมลงทุนเวลาสมัครคือคนที่ตั้งใจเรียนจริง ซึ่งเป็นกลุ่มที่ signal มีความหมาย

**ผลต่อการออกแบบ:** ทุกอย่างที่ "ใช้" ต้องมี account — บทเรียน, quiz, lab, progress
หน้าที่เป็นหน้าร้าน (รายการคอร์ส, หน้าแนะนำคอร์ส, landing) ยังเปิดสาธารณะ เพราะนั่น
คือสิ่งที่ทำให้คนอยากสมัคร ไม่ใช่สิ่งที่คนมาใช้ — และเป็นหน้าเดียวที่ search engine
กับการแชร์ลิงก์เข้าถึงได้ ซึ่งสำคัญเพราะ "หา distribution channel ไม่ได้" เป็นข้อ
ที่ยังเปิดอยู่ในแผน

### 0.3 Account = universal CYBERSKILLS account (founder framing)

**ไม่ใช่ "สมัคร Academy" แต่คือ "สมัคร CYBERSKILLS"** — หนึ่ง account ใช้ได้กับทุก
บริการของเรา และ founder ระบุชัดว่า **รวมถึงการสอบ certification ที่เราอาจออกเอง
ในอนาคต** ด้วย

ผลที่ตามมาและต้องออกแบบเผื่อตั้งแต่ M3:
- หน้าสมัครต้องพูดในนาม CYBERSKILLS (มี Academy เป็นบริบท) ไม่ใช่แบรนด์ Academy เดี่ยว
- consent ข้อ 3 ต้องครอบทั้ง ecosystem อยู่แล้ว — สอดคล้องกันพอดี
- **certification เป็นข้อผูกมัดเรื่องความน่าเชื่อของตัวตน**: ใบรับรองคือคำกล่าวอ้าง
  เกี่ยวกับตัวบุคคล ดังนั้น identity ต้องยืนยัน email จริงตั้งแต่วันแรก และโครงต้อง
  รองรับการยกระดับการพิสูจน์ตัวตนตอนสอบภายหลัง โดยไม่ต้องรื้อ data model
  (`(issuer, subject)` รองรับอยู่แล้ว — ห้ามถอยไปใช้ email เป็น join key เด็ดขาด)

---

## 1) ปัญหาและบริบท

**Requirement (founder 2026-07-31):** ผู้ใช้ 1 คนมี 1 account เข้าได้ทั้ง Crux,
STAR, Academy, Forge (และ product อนาคต) — ยกระดับจากหลัก "single email-based
identity" เดิมเป็น cross-product identity จริง

**สถานะจริงวันนี้ (อ่านจาก code read-only, 2026-07-31):** ทุก product ที่มี auth
ใช้ **GoTrue ตัวเดียวกันบน Pool A (`supabase.cyberskills.co.th`) อยู่แล้ว** —
คือมี "shared issuer โดยพฤตินัย" แต่ยังไม่มี contract ร่วม และรายละเอียดต่างกันมาก:

| | Crux | STAR | Forge | Academy (M1–M2 วันนี้) |
|---|---|---|---|---|
| วิธี login | email OTP 6 หลัก ผ่าน server (BFF) | Google OAuth + PKCE เท่านั้น | Google OAuth ผ่าน GoTrue | ยังไม่มี auth (มีแค่ waitlist email) |
| Credential ฝั่ง browser | opaque HttpOnly cookie + CSRF (ไม่มี token ใน browser) | Supabase SSR cookies | GoTrue access token ใน JS memory | — |
| การ verify token | server เรียก GoTrue ทุกครั้ง | `getUser()` network call (getClaims ติด block — JWKS ของ Pool A ยังไม่มี asymmetric key) | decode HS256 ในเครื่องด้วย **JWT secret ของ Pool A ที่ Forge ถือเอง** | — |
| Identity key ภายใน | `(issuer, subject)` → `crux.user_identities` (ห้ามใช้ email — ล็อกใน contract) | `star.users.id` FK ตรงไป `auth.users.id` | **email** (จับคู่ GoTrue user ด้วย email — ช่องโหว่ที่ STATUS ของ Forge เองก็ flag) | email เป็น identity key ของ leads (pre-auth) |
| ตาราง user ของตัวเอง | `crux.users` + enrollments (RBAC ต่อ cohort) | `star.users` (role + cohort + RLS) | `forge.users` (email อย่างเดียว) | `academy.leads` (ยังไม่ใช่ account) |

หลักฐานหลัก (paths ในแต่ละ repo):
- Crux: `product/services/control-plane/src/{authRoutes,session,idp.gotrue,auth}.ts`,
  `product/packages/db/migrations/0007_add_user_identities.sql`,
  docs: `docs/auth-transport-threat-model.md`, `docs/idp-selection.md`
  (founder-locked 2026-07-31), `docs/identity-and-access-contract.md`,
  `docs/authorization-model.md`
- STAR: `src/star-cockpit-web/src/app/auth/callback/route.ts`,
  `src/star-cockpit-web/src/middleware.ts`, `src/star-forge-engine/supabase/schema.sql`,
  docs: `docs/SUPABASE_AUTH_PROOF.md`,
  `reports/security/star-auth-getclaims-readiness-g6-2026-06-13.md`
  (**BLOCKED: JWKS Pool A มี 0 asymmetric keys**)
- Forge: `backend/routes/auth.py` (ทั้งไฟล์ — รวมจุด join ด้วย email L46–53),
  `backend/config.py`, `database/schema.sql`; gap ถูกบันทึกใน `STATUS.md` L43/52
- Academy: `academy-web/src/app/api/leads/route.ts` (email normalize เป็น
  identity key ของ waitlist), `academy-web/src/lib/player/progress.ts`
  (progress key ต่อ contentId+attemptId — พร้อมผูก user id ภายหลัง)

**ข้อจำกัดที่ decision ต้องเคารพ:**
1. **Crux zero-friction ILT ห้ามพัง** — "zero-friction" ของ Crux คือ lab เข้าจาก
   browser ทันทีโดยไม่แจก VPN/ไฟล์ (ไม่ใช่การเข้าแบบไม่มีตัวตน — anonymous ถูก
   ห้ามใน contract; enrollment มาจาก roster ของ instructor) และ lab plane
   **ไม่รู้จัก learner เลย** (service-to-service Ed25519 เท่านั้น:
   `product/packages/service-auth/src/index.ts`) → การเปลี่ยน issuer กระทบเฉพาะ
   control plane ไม่แตะ lab plane
2. **STAR มี account จริงอยู่แล้ว** (Google-only, allowlist ปิด, closed beta) —
   migration ต้องไม่ทำ account เดิมหลุด
3. PDPA: identity ข้าม product = ใช้ PII ร่วมกัน — consent ต้องครอบและตรวจสอบได้
4. Forge ถือ HS256 secret ของ Pool A → rotation เป็นเรื่อง ecosystem ทั้งเส้นอยู่แล้ววันนี้

---

## 2) ทางเลือก

### Option A — Formalize shared issuer บน Pool A GoTrue (ของที่มีอยู่ + contract ร่วม)

ทุก product ใช้ GoTrue ตัวเดิมบน Pool A เป็น issuer เดียว อย่างเป็นทางการ พร้อม
"identity contract" ระดับ ecosystem ที่ทุก product ต้อง comply:
- Identity key ภายในทุก product = `(issuer, subject)` (ตามแบบ Crux) — **Forge
  ต้องแก้จุด email-join** (มีแผนของตัวเองอยู่แล้วใน STATUS)
- ยก JWKS ของ Pool A เป็น asymmetric (งานที่ STAR รอ อยู่แล้ว) → ทุก product
  verify token ในเครื่องได้โดยไม่ถือ shared secret และปลดล็อกเลิกแจก HS256 secret
- Login method ต่อ product เลือกได้อิสระ (OTP ของ Crux / Google ของ STAR อยู่ร่วม
  กันได้ — GoTrue ผูกทั้งสองเข้า `auth.users` เดียวด้วย verified email ตามที่
  `crux-lms/docs/idp-selection.md` วิเคราะห์ไว้แล้ว)
- ตาราง user/role/enrollment ยังอยู่ per-product schema (star/crux/forge/academy)

### Option B — Dedicated self-hosted OIDC IdP (เช่น Keycloak / Zitadel / Ory)

ตั้ง IdP แยกเป็น service ใหม่ ทุก product เป็น OIDC client; Pool A GoTrue เลิกทำ
หน้าที่ issuer (หรือ federate เข้า IdP ใหม่)
- ข้อดีเชิงสถาปัตย์: อิสระจาก Supabase stack, feature enterprise (SSO/SAML/
  org management) ครบกว่าในระยะยาว B2B
- ราคาแพงจริง: service ใหม่ที่ต้องดูแลตลอดชีพ (patch/HA/backup), ทุก product
  ต้อง migrate ทั้ง STAR (Google flow), Crux (เพิ่ง lock idp-selection ไป GoTrue
  เมื่อ 2026-07-31), Forge; consent/PDPA ต้องทำใหม่ทั้งเส้น
- ตัวเลือก vendor ข้างต้นเป็น **candidates ที่ต้อง DD สด ณ วันทำจริง** เท่านั้น —
  ห้ามถือว่าเลือกแล้ว (กติกา ecosystem: named component ในแผน = ungated decision)

### Option C — Status quo (ต่าง product ต่าง auth เต็มรูป ไม่มี contract ร่วม)

ไม่ทำอะไร — ยอมรับ divergence ปัจจุบัน
- ขัด requirement ของ founder โดยตรง (user ต้องสมัคร/login แยกใน mental model,
  แม้หลังบ้านบังเอิญ share `auth.users`) และปล่อยช่องโหว่ Forge email-join +
  HS256 secret แจกข้าม product ค้างไว้ — ใส่ไว้เป็น baseline เปรียบเทียบเท่านั้น

---

## 3) Decision matrix (แกนตามที่แผนล็อก)

เกณฑ์: ✅ ดี · ⚠️ มีงาน/มีเงื่อนไข · ❌ แย่

| แกน | A: shared issuer Pool A | B: dedicated OIDC IdP | C: status quo |
|---|---|---|---|
| **PDPA consent scope** | ⚠️ ต้องเพิ่ม consent ครอบ "ใช้ identity ร่วมข้าม product" + ประกาศใน privacy ทุก product (ฐานข้อมูล PII จุดเดียว = ขอบเขตชัด ตรวจสอบง่าย) | ⚠️ เหมือน A + ต้องเขียน data-processing ของ service ใหม่ทั้งชุด | ❌ PII กระจายโดยไม่มีเจ้าภาพ ทั้งที่หลังบ้าน share `auth.users` อยู่แล้ว — ความเสี่ยงเงียบ |
| **Migration account STAR เดิม** | ✅ แทบเป็นศูนย์ — STAR อยู่บน GoTrue Pool A อยู่แล้ว (`star.users.id` FK ไป `auth.users.id`); งานคือ contract + เปิด allowlist ตามจังหวะ launch | ❌ ต้อง migrate ทุก account + OAuth flow ใหม่ + เสี่ยง session/refresh หลุดทั้ง closed beta | ✅ ไม่มี migration (แต่ไม่ได้ single account) |
| **ผลต่อ Crux zero-friction ILT** | ✅ ไม่แตะ — Crux เพิ่ง lock IdP = Pool A GoTrue (2026-07-31); BFF + OTP + roster เดิมใช้ต่อ; lab plane ไม่รู้จัก learner อยู่แล้ว | ❌ Crux ต้องรื้อ idp-selection ที่ founder เพิ่งเคาะ + เพิ่ม network hop ใน flow onsite | ✅ ไม่แตะ |
| **Ops load** | ⚠️ งานหลัก 2 ก้อน: (1) JWKS asymmetric บน Pool A (งานที่ STAR ต้องการอยู่แล้ว — แก้ครั้งเดียวได้สองเรื่อง) (2) บังคับ contract ต่อ product; ไม่มี service ใหม่ | ❌ +1 stateful service ถาวร (HA/patch/backup/monitor) บน ops ที่เป็นคนเดียว | ✅ ศูนย์วันนี้ ❌ จ่ายทีหลังเป็น incident (secret แชร์/email-join) |
| **Lock-in** | ⚠️ ผูก GoTrue แต่เป็น **self-hosted + open source + มาตรฐาน JWT/JWKS**; ออกแบบ client ทุกตัวให้คุยผ่าน OIDC-ish surface → เปลี่ยน issuer ภายหลังได้โดย per-product ไม่ต้องรื้อ data model (identity key คือ `(issuer, subject)` — รองรับหลาย issuer โดยธรรมชาติ) | ✅ มาตรฐาน OIDC เต็มรูป (แต่ lock-in ย้ายไปที่ vendor IdP แทน) | ⚠️ ไม่ lock อะไร เพราะไม่มีระบบร่วม |

---

## 4) คำแนะนำ (ของ draft นี้ — รอ founder)

**เลือก Option A**: formalize shared issuer บน Pool A GoTrue + identity contract
ระดับ ecosystem โดยมีเงื่อนไขบังคับ 4 ข้อ:

1. **Identity key ทุก product = `(issuer, subject)`** ตาม
   `crux-lms/docs/identity-and-access-contract.md` — email เป็นแค่ attribute;
   Forge ต้องปิด email-join gap ก่อนถือว่า comply
2. **JWKS asymmetric บน Pool A ก่อนเพิ่ม consumer ใหม่** — Academy จะเป็น consumer
   ที่ 4 อย่าเพิ่มโดยให้ทุกคน verify แบบเรียก GoTrue ตลอด (latency ที่ STAR วัดแล้ว)
   หรือแบบถือ HS256 secret (ช่องโหว่แบบ Forge); ทำครั้งเดียวปลดบล็อก STAR ด้วย
   (อ้าง `star-navigator/reports/security/star-auth-getclaims-readiness-g6-2026-06-13.md`
   และ director memory: มีงาน asym JWT ของ selfhost ค้างเป็น initiative อยู่แล้ว)
3. **Consent/PDPA**: เพิ่มข้อความ consent เวอร์ชันใหม่ครอบ cross-product identity
   ในทุก product ที่ login ได้ + ระบุใน privacy notice ว่า account เดียวใช้ร่วมกับ
   product ใดบ้าง; consent เก็บแบบ versioned ตาม pattern ที่ Academy M1 วางไว้แล้ว
   (`consent_text_version` + CHECK constraint)
4. **Authorization ไม่ยกไปกลาง** — role/enrollment อยู่ per-product เหมือนเดิม
   (Crux ผูก cohort, STAR ผูก role/cohort, Academy จะผูก purchase/credit ใน M5);
   สิ่งที่ share คือ "ใครคือคนนี้" ไม่ใช่ "คนนี้ทำอะไรได้"

**ทำไมไม่ B ตอนนี้:** จ่าย ops ถาวร + รื้อ decision ที่เพิ่ง lock (Crux idp-selection)
เพื่อ benefit ที่ยังไม่มีลูกค้า B2B SSO จริงมาเรียกร้อง; ถ้าวันหน้ามี requirement
enterprise SSO ค่อยยก ADR ใหม่ — Option A ออกแบบ identity key ให้รองรับหลาย
issuer อยู่แล้ว จึงไม่ปิดทาง B ในอนาคต

## 5) Migration + rollback sketch (ต่อ product)

ลำดับที่เสนอ (แต่ละก้าวมี rollback ของตัวเอง ไม่มี big-bang):

1. **Pool A: เปิด asymmetric JWT + JWKS** (งาน infra กลาง — due-care เต็ม + แผน
   rotation ตาม runbook selfhost เดิม)
   - Rollback: กลับ HS256 เดิม (GoTrue รองรับสลับ) — consumer ที่ยัง getUser()/
     server-verify ไม่กระทบ
2. **ประกาศ identity contract ecosystem** (เอกสาร director-level, สาระ = ข้อ 4
   ด้านบน) + ตาราง compliance ต่อ product
3. **Forge**: เพิ่ม `gotrue_sub` ใน `forge.users` + backfill จาก email ที่ verified
   แล้ว → สลับ join key → เลิกใช้ HS256 secret ไป JWKS
   - Rollback: คอลัมน์ใหม่เป็น additive — สลับกลับ email-join ได้ทันที
4. **STAR**: ไม่ต้อง migrate account; งานคือสลับ verify ไป getClaims/JWKS เมื่อ
   ข้อ 1 เสร็จ (มี readiness guard ของตัวเองอยู่แล้ว)
   - Rollback: กลับ `getUser()` (โค้ดปัจจุบัน)
5. **Crux**: ไม่เปลี่ยนอะไรใน flow (BFF + OTP อยู่บน issuer เดียวกันแล้ว) —
   แค่ผูกเข้า contract ตาราง compliance
6. **Academy (M3 จริง — หลัง ADR ผ่านเท่านั้น)**: เพิ่ม auth โดย consume issuer
   กลาง (SSR cookie แบบ STAR หรือ BFF แบบ Crux — เลือกตอน M3 design), ตาราง
   `academy.users` ใช้ `(issuer, subject)`; ผูก waitlist lead ↔ account ด้วย
   verified email **ณ เวลา sign-up** (ไม่ใช่ join ถาวรด้วย email)
   - Rollback: Academy ยังไม่มี user จริง — ถอยได้เต็มที่จนกว่าจะ public

## 6) ยืนยันความสอดคล้องของ Academy M1–M2 กับทิศทางนี้ (ตรวจจาก code จริง)

- ✅ email = identity key เฉพาะชั้น **waitlist lead (pre-auth)** — สมเหตุสมผลเพราะ
  ยังไม่มี account; จุดผูกเข้า account ระบุไว้แล้วใน sketch ข้อ 6
- ✅ ไม่มี auth hardcode ใน M1–M2 — ไม่มี session/token/login ใดๆ ใน academy-web;
  API ใช้ service role ฝั่ง server เท่านั้น (`src/lib/db/server.ts`)
- ✅ พร้อม consume external issuer — player progress ออกแบบ key ต่อ
  `contentId+attemptId` + version (`src/lib/player/progress.ts` ระบุ "โครง type
  ออกแบบให้ย้ายไป DB ได้ตอน M3") ไม่ผูก identity ภายในตัวเอง
- ✅ consent versioning pattern (M1) reuse ได้ตรงๆ กับ consent cross-product ในข้อ 4.3

## 7) Sources ที่ตรวจจริง ณ วันเขียน (2026-07-31)

ทั้งหมดอ่านแบบ read-only จาก working tree ปัจจุบันของแต่ละ repo ใน
`products/` (paths ระบุไว้ใน §1); เอกสารเชิง decision ที่พึ่งพิงหลัก:
- `crux-lms/docs/idp-selection.md` — founder-locked 2026-07-31 (IdP = Pool A
  GoTrue + email OTP; มีตารางสถานะ auth ของ STAR/Forge/Academy/Crux + source audit
  ของตัวเองใน `crux-lms/reports/reviews/identity-access-source-url-audit-20260730.md`)
- `crux-lms/docs/identity-and-access-contract.md` — ต้นแบบ identity contract
- `star-navigator/reports/security/star-auth-getclaims-readiness-g6-2026-06-13.md`
  — หลักฐาน JWKS Pool A ยังไม่มี asymmetric key (blocker ที่ Option A ต้องแก้)
- ข้อเท็จจริงภายนอก (ความสามารถ GoTrue asymmetric JWT, ตัวเลือก OIDC IdP) —
  **ต้อง DD สดอีกครั้ง ณ วันลงมือ** ตามกติกา third-party facts rot; draft นี้
  จงใจไม่ pin เวอร์ชัน/ความสามารถ vendor ใดเกินกว่าที่ repo evidence ยืนยัน
