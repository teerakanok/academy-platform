# PENDING_USER_ACTION — Academy (หลัง one-shot build 2026-07-31)

> External steps ที่ต้องทำโดย founder / session ที่มี founder เท่านั้น
> (one-shot run ห้าม mutate external service ทุกชนิด — ตามแผน
> `plans/platform-build-oneshot-2026-07-31.md` §5)
> เรียงตามลำดับที่ต้องเกิด

## 1) Cloudflare Workers — production env vars
> (แก้ 2026-08-02: deploy จริงปัจจุบันอยู่บน **Cloudflare Workers** —
> `cyberskills-academy.songpon-te.workers.dev` ผ่าน `npm run deploy:cf` ตาม D6
> "hosting เอียง Cloudflare" · ขั้นตอน Vercel เดิมจึงพัก — การยืนยัน hosting
> ขั้นสุดท้ายรอวัด latency จริงหลัง M3 ตาม `plans/active_plan.md` ส่วน Hosting)

- ตั้ง secret บน Worker `cyberskills-academy` ตามรายชื่อใน
  `academy-web/.env.example`: `SUPABASE_URL` + DB credential
  (ใส่เมื่อทำข้อ 3 แล้วเท่านั้น; `TEST_*` ใช้เฉพาะเทส local)
- ⚠️ **อย่าเพิ่งเอา `SUPABASE_SERVICE_ROLE_KEY` (shared Pool A) ขึ้น Worker** —
  ข้อขัด "Academy ถือ shared service-role" ยังรอ session identity ตัดสิน
  (ทางแก้ที่เสนอ: Postgres role เฉพาะสคีมา `academy` — ดู `plans/active_plan.md`
  ส่วนข้อขัดสองข้อ) · key รั่วจาก Worker = blast radius เกินสคีมา Academy
  ถ้าจำเป็นต้องขึ้นก่อนมี role เฉพาะ ให้เป็น founder decision ที่บันทึก
  risk/rollback ชัดเจนเท่านั้น
- **ยังไม่เปิด public** (ตอนนี้ `NEXT_PUBLIC_SEARCH_INDEXING=off` และระบบบัญชี
  ยังไม่เปิดบน preview)

## 2) Cloudflare — custom domain + Zero Trust

- ผูก custom domain `academy.cyberskills.co.th` เข้ากับ Worker
  `cyberskills-academy` (Workers custom domain — ไม่มีค่า CNAME จาก vendor อื่น)
  · การผูก domain คือจุด commit ของ hosting — ทำเมื่อ founder ยืนยันผลวัด
  latency หลัง M3 แล้ว (ดูหมายเหตุข้อ 1)
- Zero Trust Access app **ครอบทุก path** (allowlist email founder/ทีม)
- ตรวจ free-tier seat ตอน setup

## 3) DB prod (Pool A) — due-care เต็ม

ลำดับตามแผน §5-3 (ทำผ่าน `ssh-db` ตาม `ecosystem/SHARED_INFRA_ACCESS.md`):
1. Backup point ก่อน
2. Apply migration **ทุกไฟล์**ใน `academy-web/supabase/migrations/`
   ตามลำดับเลข (ปัจจุบัน 0001–0005: schema · accounts+progress ·
   record_node_progress · activation+entitlement · attempt)
   — schema `academy` เท่านั้น
3. เพิ่ม `academy` เข้า `PGRST_DB_SCHEMAS` ของ Pool A แล้ว restart PostgREST —
   **cross-product change**: ตรวจ consumer อื่น (star/forge/crux/phalanx/angler/
   helm/crucible) ก่อน + เตรียม rollback เป็นค่าเดิม
4. `NOTIFY pgrst, 'reload schema'` (refresh cache — ใช้แทนข้อ 3 ไม่ได้)
5. Verify: REST query schema `academy` ผ่าน + anon อ่าน/เขียน `academy.leads`
   ถูกปฏิเสธ + สุ่มเช็ค product schema อื่นยังตอบปกติ

## 4) ✅ เคาะ ADR single-account แล้ว (2026-08-01) → M3 ปลดล็อก

founder เคาะครบ 5 ข้อ (Option A · เปิด JWKS · consent ecosystem · **บังคับสมัคร** ·
login สองทาง) — รายละเอียดและเหตุผลอยู่ใน `docs/adr/ADR-draft-single-account.md` §0

**เหลือเป็น external checkpoint ที่ founder เท่านั้นทำได้:**

### 4.1 ✅ Pool A — เปิด asymmetric JWT + JWKS แล้ว 2026-08-01 (ไม่ blocking แล้ว)
- แตะ Supabase production ที่ Crux/STAR/Forge/Academy ใช้ร่วมกัน → due-care เต็ม
- ต้อง **verify สดก่อนลงมือ** ว่า GoTrue เวอร์ชันที่รันอยู่รองรับจริง (third-party
  facts rot — ADR จงใจไม่ pin ความสามารถ vendor)
- ปลด blocker ของ STAR ที่ค้างตั้งแต่ 2026-06-13 ไปด้วย และเลิกแจก HS256 secret
  ให้ Forge ถือ
- Rollback: คืน `.env.pre-asymjwt-20260801-154836` + `docker-compose.override.yml.pre-asymjwt-20260801-154836`
  แล้ว `docker compose up -d --no-deps auth rest storage realtime`
- ผลตรวจหลังทำ: JWKS มี ES256 1 คีย์ (public เท่านั้น) · 4 container healthy restarts=0 ·
  rest+anon 200 · rest+service 200 · storage+service 200 · auth health 200 ·
  refresh token 10 ใบยังไม่ถูก revoke (ไม่มีใครหลุด) · log ไม่มี error/fatal
- รายละเอียด: `reports/state/supabase.md` ของ director repo

### 4.2 ยก ADR ขึ้นเป็น ecosystem ADR ระดับ director
- decision แตะ 4 product จึงไม่ควรอยู่ใต้ repo เดียว
- ทำใน director repo ตอน worktree ว่าง (ตอนนี้มี workstream อื่นค้างอยู่)

### 4.3 consent text ฉบับ ecosystem
- แตะ privacy notice ของทุก product = เรื่อง legal ไม่ใช่ technical
- reuse pattern versioning ที่ Academy M1 ทำไว้แล้ว

## 4b) W2 (`/media/*`) — founder blockers สองตัว (ตามแผน 2026-08-02 §4.2b)

> `/media/*` ทุกวันนี้เปิดสาธารณะ (เสิร์ฟผ่าน ASSETS binding — request ไม่ถึง
> Worker) · W2 ปิดไม่ได้ถ้าสองข้อนี้ยังไม่เกิด — บันทึกไว้ตั้งแต่เปิด session
> ไม่ใช่ค้นพบตอนติด

1. **สร้าง R2 bucket** สำหรับย้าย media ออกจาก `public/` (ทาง ก ของ W2-0 —
   ทางที่แผนเอนไป) — external service, founder เท่านั้น
   · ถ้ายังไม่พร้อม: ทาง ข ชั่วคราวคือ `run_worker_first` สำหรับ `/media/*`
     (ทุก byte วิ่งผ่าน Worker — ต้องเขียนไว้ว่าเป็นของชั่วคราว)
2. **อนุญาต deploy หนึ่งครั้ง** เพื่อ verify `/media/*` บนสภาพแวดล้อมที่มี
   ASSETS binding จริง (แผน §4.1 ห้าม agent deploy เอง · `npm run start`
   เขียวปลอมเพราะไม่มี ASSETS binding)
   · agent ต้องลองทางสำรองก่อนขอ: `wrangler dev --remote` หรือ preview worker
     — สองทางนี้นับว่าปิดเกณฑ์ได้

## 5) M4+ / M5 (ยังไม่ถึงเวลา — บันทึกไว้ตามแผน)

- (M4) GCP project แยกสำหรับ Academy lab + budget alarm
- (M5) DD payment gateway ไทย + ยืนยัน CF Stream + ราคา ณ วันใช้จริง
- ก่อน public release: deploy edge rate limit ที่ source พร้อมแล้ว โดย set
  `RATE_LIMIT_KEY_SECRET` ก่อน และตรวจ bounded `429`/`Retry-After` ตาม
  `academy-web/docs/edge-rate-limit.md`; ห้ามถือว่า gate ปิดก่อน production proof
  + ทบทวนการเอา CAS-005 fixture ออกจาก deploy (ตอนนี้ INTERNAL ONLY — `/player`
  ห้าม public)

## 6) Push + submodule pointer (รอ authorization)

- academy-platform ahead ~26 commits (แผน + one-shot ทั้งหมด) ยังไม่ push
- Crucible `640c8613` (answer-key fixes) ยัง local เช่นกัน
- Director submodule pointer bump ต้องทำตอนอยู่บน director branch ที่ถูกต้อง
  (ตอน run นี้ director อยู่ branch ของ workstream อื่น — ห้ามแตะ)

## 7) งาน director repo ที่แตะจาก run นี้ไม่ได้ (บันทึกแทน)

- เพิ่ม key `academy` ใน canonical tokens
  (`cyberskills-website/cyberskills-web/packages/tokens/products.js`) —
  ตอนนี้ academy-web vendored tokens ใช้ preset key `website` ไปก่อน

## 7b) ✅ Retention scheduler deploy แล้ว — รอหลักฐาน Cron รอบแรก

ได้เลือกและ deploy Dedicated Cloudflare Cron Worker + Dedicated PostgREST API แล้ว;
ไม่ใช้ shared `service_role` และไม่มี manual-maintenance path. Worker
`cyberskills-academy-retention` รันทุกวัน `0 3 * * *` พร้อม role
`academy_retention` ที่ execute ได้เฉพาะ wrapper purge 5 งาน:

- attempt เก็บ 90 วัน, lead/waitlist 3 ปี, inactive user 2 ปี, privacy request และ
  staff authorization history 3 ปี
- batch size ถูกจำกัดตามชนิดข้อมูล; API bind loopback และ public anonymous request
  ถูกปฏิเสธ
- ก่อนถือว่า operational ต้องตรวจ Trigger Events/logs ของรอบที่ scheduler รันจริงให้
  ครบทั้ง 5 `retention.purge_complete` หรือมี `retention.purge_failed` ที่ surfaced
  ชัดเจน โดยห้ามเรียก production purge RPC ด้วยมือเพื่อเร่งผล

หลักฐาน deployment และ rollback อยู่ที่
[`reports/academy-retention-api-rollout-2026-08-06.md`](reports/academy-retention-api-rollout-2026-08-06.md).

## 8) ⚠️ สุขภาพเครื่อง dev (พบระหว่าง run — ควรจัดการ)

- **Disk เกือบเต็ม**: ตอนเริ่ม run เหลือ 120MB จาก 460GB ทำให้ Docker พัง
  (image/snapshot corruption — กู้แล้ว + เคลียร์ docker image เก่าที่ไม่ใช้
  ได้คืน ~9GB) ปัจจุบันยังใช้อยู่ ~98% — แนะนำหาที่เคลียร์เพิ่ม
  (ผู้ต้องสงสัยหลัก: Docker Desktop data 53GB → เหลือ ~46GB หลังเคลียร์,
  Library/Caches ~5GB)
