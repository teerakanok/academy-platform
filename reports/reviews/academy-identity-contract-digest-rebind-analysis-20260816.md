# Academy ↔ Identity Control contract-digest rebind analysis (2026-08-16)

**ลาน:** read-only analysis lane (ไม่แก้ไฟล์ใดนอกจากไฟล์นี้)
**ฐานที่วัดจริง:** Academy HEAD `6de80c2` (dirty: untracked `.mimosa/`, `academy-web/.mimosa/`, `reports/security/` เท่านั้น) ·
Identity Control HEAD `fdcaf30bfb9b3644c43dcabb192d99820d52a336` (worktree สะอาด มีแต่ untracked `reports/security/`)
**คำถามที่ตั้ง:** digest ที่ Academy pin อยู่ครอบคลุม result verification-key distribution boundary
(commit `7b62c0a`) หรือยัง และถ้าจะ rebind ต้องทำอะไรบ้าง

> ข้อค้นพบสำคัญที่ต้องอ่านก่อน: **premise ของงานนี้เก่าแล้ว** — digest ชุดปัจจุบัน
> **ไม่ได้** เก่ากว่า `7b62c0a` การวัด sha256 จากเครื่อง (ตาราง §1) ยืนยันว่า pin ปัจจุบัน
> คือ Identity `fdcaf30` ซึ่งเป็น **ลูกของ `7b62c0a`** และรวมการเปลี่ยน contract ของ
> commit นั้นอยู่แล้ว rebind ที่ briefing ขอ ถูกทำเสร็จและ commit ไปแล้วที่ `b715a09`
> (2026-08-15 หลังรีวิวข้าม repo) เอกสารนี้จึงบันทึกข้อเท็จจริง + procedure สำหรับรอบถัดไป

## 1. Digest ปัจจุบันที่ pin และ revision ต้นทาง

Ledger: `reports/conformance/identity-control/academy-identity-control-conformance.json`
(schema `identity-consumer-conformance-report/v1`, `clientId=academy-web`,
summary 23 scenarios / 16 pass / 7 `not_proven`, `enabled=false`, `runtimeWired=false`,
`releaseApproval=false`)

Revision ที่ ledger และ generator ผูกอยู่ (`academy-web/scripts/generate-identity-control-conformance.mjs:20-21`):

| ฝั่ง | Revision ที่ pin | ความหมาย |
|---|---|---|
| Academy `ACADEMY_SOURCE_REVISION` | `f6b043c6b7acb9131f23b3f8e39a3bca9d401b86` | parent ของ rebind commit `b715a09` (รัน generator ตอน HEAD นี้ แล้ว commit ผลเป็น `b715a09`) |
| Identity `IDENTITY_SOURCE_REVISION` | `fdcaf30bfb9b3644c43dcabb192d99820d52a336` | **HEAD ปัจจุบันของ identity-control** — parent ของมันคือ `7b62c0a` |

`identityContractDigests` หกไฟล์ (generator hash เนื้อไฟล์ดิบด้วย sha256,
`assertSourceRevisions()` บังคับทั้ง HEAD ทั้งสอง repo และ digest ทั้งหกให้ตรงก่อนรัน —
`generate-identity-control-conformance.mjs:623-634`). ผลวัดซ้ำบนเครื่องวันนี้
(`git show <rev>:<path> | shasum -a 256`):

| ไฟล์ (identity-control) | ค่าที่ pin (= ค่าที่วัดได้ที่ `fdcaf30` = worktree วันนี้) | ที่ `7b62c0a` | ที่ `8b361c2` (ก่อน `7b62c0a`) |
|---|---|---|---|
| `config/consumer-registry-v1.approved.json` | `572d230a…03d1875` | เท่ากัน | เท่ากัน |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2…bed575a4` | เท่ากัน | เท่ากัน |
| `docs/integration/consumer-conformance-kit.md` | `df1ef8c8…beadb97` | `df1ef8c8…` | `4aaa997a…` **ต่าง** |
| `docs/integration/lifecycle-pull-consumer-contract.md` | `ba7ca71f…ce6f17c` | เท่ากัน | เท่ากัน |
| `packages/contracts/src/index.ts` | `e3f22d7b…f5799f` | `e3f22d7b…` | `2dfc32ca…` **ต่าง** |
| `packages/testing/src/index.ts` | `d12f8161…0b6a51d` | เท่ากัน | เท่ากัน (เปลี่ยนก่อนหน้านั้นในช่วง `5cf3d58`/`fa8e8fd`) |

อ่านตาราง: ไฟล์ที่ `7b62c0a` แตะจริงมีสองไฟล์ (kit + contracts) และ **ค่าที่ pin ตรงกับ
เนื้อไฟล์หลัง `7b62c0a` แล้ว** — pin ปัจจุบันครอบคลุม key-distribution boundary ครบ

นอกจากหก contract digest, generator ยังผูก digest ย่อยอีกสองชุดที่ rebind ต้องเช็คด้วย
(`generate-identity-control-conformance.mjs:66-170`):

- `expectedIdentityEvidenceDigests` — 4 ไฟล์ evidence ฝั่ง Identity
  (`packages/core/src|test/client-assertion.*`, `packages/core/src|test/signed-lifecycle-event.*`)
- `expectedEvidenceDigests` — 21 ไฟล์ evidence ฝั่ง Academy (review/freeze/ledger ต่างๆ
  รวม `academy-identity-unit-conformance.txt` และ
  `academy-web/tests/unit/identity-client-assertion-conformance.test.ts`)

Self-test ของ generator: `academy-web/scripts/generate-identity-control-conformance.test.mjs`
— 7 tests: ชุดไฟล์ checkpoint 12 ไฟล์เรียง byte-exact, การ promote/retain scenario,
render byte-identical, fail-closed เมื่อ checkpoint artifact drift, fail-closed เมื่อ producer
evidence drift, ห้ามเปลี่ยน checkpoint evidence เป็น runtime/release authorization,
และขอบเขต profile-only activation

Receipt ของ ledger มาจาก script ฝั่ง Identity
`scripts/intake-consumer-conformance.mjs --print-local-receipts`
(generator เรียกผ่าน `receiptArguments()` — `generate-identity-control-conformance.mjs:648-658`)

## 2. Delta ของ Identity นับจาก pin

**หลัง `fdcaf30` ไม่มี commit ใหม่** — `fdcaf30` คือ HEAD ปัจจุบันของ identity-control
(`git rev-parse HEAD`) ไม่มีอะไรต้องตาม

ช่วงที่ rebind ล่าสุด (`b715a09`, 2026-08-15 13:27 +0700) เลื่อนจาก pin เก่า
`4efd9b7` มา `fdcaf30` ประกอบด้วย commit เหล่านี้ (ตาม `git log` ของ identity-control):

| Commit | เนื้อหา | แตะไฟล์ที่ pin? |
|---|---|---|
| `5cf3d58` | feat: sign code exchange results (schema signed result + key set + producer vectors) | ใช่ — ต้นทางของ `packages/contracts` / `packages/testing` digest ปัจจุบัน |
| `fa8e8fd` | feat(control-api): compose exchange result signer | ไม่ |
| `8b361c2` | docs: hand off Identity pilot continuation | ไม่ |
| `7b62c0a` | **feat(core): publish result verification-key distribution boundary** (7 ไฟล์ +1014) | **ใช่ — kit +48 บรรทัด, contracts +38 บรรทัด** |
| `fdcaf30` | docs(plan): ตารางลำดับความสำคัญ three-product pilot | ไม่ (แตะ `plans/active_plan.md` ฝั่ง Identity เท่านั้น) |

พื้นผิว contract ที่ `7b62c0a` เพิ่ม (อ่านจาก diff จริง):

- `docs/integration/consumer-conformance-kit.md` — หัวข้อใหม่
  "Result Verification-Key Set: Normative Rotation Contract": เอกสาร key set พก
  rotation memory ของตัวเองสองมิติ (`retiredKeyFingerprints` + `retiredKeyIds`),
  fingerprint นิยามเป็น lowercase hex SHA-256 ของ DER SPKI, successor rules
  (revision โตเท่านั้น, tombstone ห้ามหาย, state เดินทางเดียว `active → overlap → retired`),
  resolver-miss policy (unknown กับ retired คืน `null` เหมือนกันโดยตั้งใจ), และ
  "proves ORDER, not DURATION"
- `packages/contracts/src/index.ts` — เพิ่ม field บังคับสอง field
  (`retiredKeyFingerprints`, `retiredKeyIds` — required array, ไม่มี `.optional()`) เข้า
  `codeExchangeResultVerificationKeySetSchema` ที่เป็น `z.strictObject` อยู่แล้ว
  พร้อม superRefine เช็ค sorted/unique/self-consistency ของ tombstone
- `packages/core/src/code-exchange-result-key-distribution.ts` (+303, ไฟล์ใหม่ ไม่อยู่ใน
  digest รายการใดของ Academy) — `createCodeExchangeResultKeyDistribution`
  (snapshot hostile config ครั้งเดียว, reject Proxy, import JWK ตอน construct),
  resolver จริงที่คืน key เฉพาะ `active`/`overlap`, `resultKeySetSucceeds(previous, next)`,
  interface ประกาศ `productionEnabled: false`, `releaseApproval: false`
- `packages/core/test/code-exchange-result-key-distribution.test.ts` (+397, ใหม่)
- `reports/reviews/code-exchange-result-key-distribution-local-checkpoint-20260814.md`
  (+169, ใหม่) — checkpoint ฝั่ง Identity: รีวิว independent 4 รอบ
  `C0/H2/M2/L3 → C0/H1/M1/L1 → C0/H1/M0/L1 → C0/H0/M0/L1` แล้วปิด L1 พร้อม
  mutation evidence (ตรงกับที่ briefing อ้าง "reviewed C0/H0/M0/L1-closed")
- `scripts/check-boundaries.mjs` (+36) — gate กัน dynamic import ของ core ใน apps

ฝั่ง Academy: rebind นี้เกิดขึ้นแล้วที่ commit `b715a09`
"chore(identity): rebind conformance หลังรีวิวข้าม repo — เลื่อน revision ไม่เลื่อนข้ออ้าง"
(แก้ 5 ไฟล์: generator, self-test, ledger, evidence, unproven) — เลื่อน
`ACADEMY_SOURCE_REVISION` `f497649d→f6b043c6`, `IDENTITY_SOURCE_REVISION`
`4efd9b7→fdcaf30`, digest สามค่า (kit `52c402cc→df1ef8c8`, contracts `3954689f→e3f22d7b`,
testing `72aa668b→d12f8161`) และ evidence digest ฝั่ง Academy หนึ่งไฟล์
(`identity-client-assertion-conformance.test.ts` `5b4371c8→24154049` เปลี่ยนที่ `3ea4646`
ตอน signer เลิกรับ `CryptoKey`)

**รีวิวข้าม repo ที่ rule สั่งไว้ เกิดขึ้นแล้วก่อน rebind นั้น:**
`reports/reviews/identity-academy-cross-repo-conformance-review-20260815.md`
(ฐาน Academy `86e94eb` + Identity `fdcaf30`, read-only) สรุป "ไม่พบ contract gap ที่ต้องปิดก่อนเลื่อน
digest" พร้อมค่า digest ทั้งหกที่ควร pin — ตรงกับที่วัดซ้ำได้ทุกตัว

## 3. คำตัดสินผลกระทบ: additive ไม่ breaking

ต่อ 23 scenarios และ importer ที่ยังไม่ต่อ production ของ Academy:

1. **Ledger ไม่ขยับตาม:** rebind `b715a09` เลื่อนแต่ revision ที่หลักฐานผูกอยู่ ไม่เลื่อนข้ออ้าง —
   16 pass / 7 `not_proven` เท่าเดิมทั้งก่อน/หลัง (บันทึกไว้ใน `plans/active_plan.md:16-17`
   และ summary block ของ ledger เอง) `exchange.result-key-rotation` ยัง `not_proven`
   โดยตั้งใจ เหตุผลที่ generator ระบุ ("No released Identity Control result-key distribution
   or active/overlap rotation path is wired." — `generate-identity-control-conformance.mjs:244`)
   ยังจริงอยู่: โมดูลใหม่ของ Identity เป็น boundary ท้องถิ่น ไม่มี operational key,
   endpoint, route, client registration, deployment (commit message และ checkpoint
   `code-exchange-result-key-distribution-local-checkpoint-20260814.md` ประกาศ production NO-GO ทั้งคู่)
2. **Contract เป็นการเพิ่ม ไม่ใช่แทนที่:** `7b62c0a` เพิ่ม normative rotation contract ใหม่
   (tombstone สองมิติ, resolver semantics, successor rules) บน schema signed-result
   ที่มีอยู่แล้วจาก `5cf3d58` — สี่ไฟล์ที่เหลือในหก digest (registry JSON/MD,
   lifecycle-pull contract) byte-identical ยาวจากก่อน `7b62c0a` ถึง `fdcaf30` (วัดแล้ว §1)
   ส่วน authorization/callback/exchange/lifecycle scenario ของ Academy ไม่มี wire contract
   ใดถูกแก้
3. **ข้อควรระวังเชิงรูปแบบ (ไม่ใช่ความเสียหายจริง):** สอง field ใหม่เป็น required member ของ
   `z.strictObject` — key-set document รูปแบบเก่า (ไม่มี field สองตัว) จะ fail validation
   หลัง `7b62c0a` แต่ยังไม่เคยมี deployed key-set document หรือ distribution endpoint
   (production NO-GO ทั้งสอง repo) จึงไม่มี wire จริงที่ถูก break และ importer ของ Academy
   เองก็บังคับ field ใหม่อยู่แล้ว (ข้อ 4)
4. **Importer (production-disabled) ทำตาม contract ใหม่ครบ:** รีวิวข้าม repo
   2026-08-15 ตรวจ source จริงแล้วยืนยัน `academy-web/src/lib/identity/result-key-set-importer.ts`
   (fingerprint DER SPKI, one-ID↔one-material ทั้งในและข้าม revision, tombstone sorted/unique,
   successor rules ครบทุกข้อ) และ `academy-web/src/lib/identity/result-key-set-cache.ts`
   (resolver คืน `null` เหมือนกันสำหรับ unknown/retired, miss key ต่อ `(issuer, kid, revision)`,
   global single-flight, last-known-good + cooldown + negative cache) — ไม่พบ gap;
   การไม่ต่อเข้า production graph เป็นของตั้งใจและมี test กันอยู่ที่
   `academy-web/tests/unit/identity-key-distribution-not-wired.test.ts`
5. **ตรวจสดวันนี้:** รัน generator แบบ verify (read-only) ที่ HEAD `6de80c2` ได้
   `Identity conformance generation failed: Academy source revision mismatch` (exit 1) —
   คือ fail ที่ pin revision ฝั่ง Academy เท่านั้น **ไม่มี identity digest ใด mismatch**
   (ฝั่ง Identity HEAD กับ worktree ตรง pin ทั้งหกไฟล์)

## 4. Procedure rebind ที่เสนอ

### 4a. เฉพาะขอบเขต "ครอบคลุม `7b62c0a`" — ไม่ต้องทำอะไร

Pin ปัจจุบัน (`fdcaf30`) รวม `7b62c0a` แล้ว (§1) การ rebind ซ้ำวันนี้เป็น no-op
ฝั่ง identity digests — และจะ fail อยู่ดีที่ academy revision pin (ข้อ 5 ของ §3)
จนกว่าจะทำตาม 4b

### 4b. Procedure สำหรับรอบ rebind ถัดไป (เมื่อ repo ใด repo หนึ่งขยับ)

ตาม rule ที่บันทึกไว้ (`plans/active_plan.md:2156-2159`): "การเลื่อน digest ชุดนั้นเท่ากับ
อ้างว่ามีรีวิวข้าม repo ชุดใหม่แล้ว จึงต้องมีรอบรีวิวจริงก่อน" และแบบแผนที่ `b715a09`
ทำไว้:

**Gate 0 — รีวิวข้าม repo ก่อนเสมอ**
1. เปิดลานรีวิวอิสระ read-only ทั้งสอง worktree ถามเหมือนรอบ 2026-08-15:
   contract ของ Identity ที่เปลี่ยนตั้งแต่ pin มี gap ที่ Academy ยังไม่ทำตามไหม +
   ค่า digest ทั้งหก + revision สองฝั่งที่ควร pin
2. เก็บคำตัดสินดิบเป็นไฟล์ใหม่ `reports/reviews/identity-academy-cross-repo-conformance-review-<date>.md`
3. วัด digest ทั้งหกซ้ำเองบนเครื่อง (`git show <rev>:<path> | shasum -a 256`)
   และบังคับให้ตรงกับค่าที่ผู้ตรวจให้ ทุกตัว (แบบแผน `plans/active_plan.md:11-12`)

**ขั้นทำ**
1. แก้ `academy-web/scripts/generate-identity-control-conformance.mjs`:
   `ACADEMY_SOURCE_REVISION` → HEAD ของ Academy ที่จะรัน generate,
   `IDENTITY_SOURCE_REVISION` → revision ที่ผ่านรีวิว, ค่า `identityContractDigests`
   ที่เปลี่ยน, และรายการ `expectedEvidenceDigests`/`expectedIdentityEvidenceDigests`
   ใดที่ drift (รอบก่อน drift หนึ่งไฟล์)
2. ตรวจว่า identity-control ยืนอยู่ที่ revision ที่รีวิว และไม่มีไฟล์แก้ค้าง
   (`git -C ../identity-control rev-parse HEAD` + `git status`); generator จะเช็ค
   digest ให้อัตโนมัติอยู่แล้วใน `assertSourceRevisions()`
3. `node academy-web/scripts/generate-identity-control-conformance.mjs --write`
   — เขียนสาม artifact แบบ atomic:
   `reports/conformance/identity-control/academy-identity-control-conformance.json`,
   `academy-identity-local-evidence.json`, `academy-identity-unproven-scenarios.json`
   (receipt ดึงจาก `scripts/intake-consumer-conformance.mjs` ฝั่ง Identity)
4. `node academy-web/scripts/generate-identity-control-conformance.mjs` (verify)
   — ต้องได้ `{"status":"current"}`; note: verify ผ่านได้ที่ pinned HEAD เท่านั้น
   (รอบก่อน generate ที่ parent `f6b043c6` แล้ว commit ผลเป็น `b715a09`)
5. รัน `node --test academy-web/scripts/generate-identity-control-conformance.test.mjs`
   (7/7) + unit suite + `tsc` + eslint (ตัวเลขรอบก่อน: unit 1348/1348,
   บันทึกที่ `plans/active_plan.md:18`)
6. Commit ไฟล์ที่แตะ: generator, self-test (ถ้า declaration เปลี่ยน), สาม artifact
   ใน `reports/conformance/identity-control/` — **ห้าม** ดึง untracked อย่าง
   `.mimosa/` หรือ `reports/security/` เข้า commit
7. ข้ออ้าง scenario ต้องไม่ขยับโดย default ("เลื่อน revision ไม่เลื่อนข้ออ้าง") —
   การ promote scenario (เช่น `exchange.result-key-rotation`) เป็นการตัดสินหลักฐาน
   แยกต้องมี evidence + รีวิวของตัวเอง

**Review gates:** Gate 0 (รีวิวข้าม repo) ก่อนแตะ digest · checkpoint-ril บน commit rebind ·
คง `enabled=false`, `runtimeWired=false`, `releaseApproval=false` · ทุก flag production
NO-GO เหมือนเดิม

## 5. ความเสี่ยง / คำถามที่เปิดอยู่สำหรับรอบรีวิวถัดไป

1. **Premise เก่า (เกิดแล้วจริงในงานนี้):** briefing ตั้งสมมติฐานว่า pin เก่ากว่า `7b62c0a`
   — การวัดพบว่าไม่ใช่ ใครทำตาม briefing โดยไม่วัด digest ก่อนจะเปิด rebind ซ้ำซ้อน
   (และเปลือกันทั้งรีวิวข้าม repo รอบใหม่) ควรเริ่มทุก rebind ด้วยการวัด digest หกค่ากับ
   HEAD จริงเสมอ (ตาราง §1 คือ template)
2. **Academy revision pin ตกระหว่างรอบโดย design:** pin `f6b043c6` แต่ HEAD วันนี้ `6de80c2`
   — generator verify fail-closed ("Academy source revision mismatch") จนถึง rebind ถัดไป
   พฤติกรรมถูกต้อง แต่แปลว่า "ledger current" ตรวจได้เฉพาะที่ pinned HEAD
3. **Checkpoint report เก่า digest ไม่ตรงไฟล์จริง:** รีวิว 2026-08-15 ชี้ว่า
   `reports/reviews/identity-result-key-set-importer-local-checkpoint-20260814.md:104`
   บันทึก digest test importer เป็น `1181…` แต่ไฟล์ปัจจุบัน `b9f99c…` — ต้อง refresh
   ก่อนใช้เป็น byte-bound proof (ไม่บล็อก digest หกตัว)
4. **Freeze manifest เป็น snapshot ลงวันที่ ไม่ใช่ current-state:** 
   `reports/reviews/academy-identity-control-contract-rebind-freeze-20260814.json` pin
   12 ไฟล์ รวม generator `dacf7f82…`, `plans/active_plan.md` `24d0dfd8…`,
   ledger `d15158f8…` — ไบต์ปัจจุบันคือ `4ec99e14…`, `21c4d9ed…`, `1a665961…`
   ตามลำดับ (วัดแล้ว) และ `b715a09` ไม่ได้ refresh ไฟล์นี้ คำถามเปิด: รอบถัดไปควร
   refresh หรือถือเป็นหลักฐาน point-in-time ของ checkpoint 2026-08-14 ไปเลย
5. **ข้อจำกัด sandbox ของลานรีวิว:** รอบ 2026-08-15 รัน full suite ไม่ได้ (EPERM ตอนสร้าง
   Vite worker/temp files) ชดเชยด้วย read-only source probes (Academy 18 assertions,
   Identity 9, producer vectors 4/4) และฝั่ง Academy เติม full-suite เอง
   (`plans/active_plan.md:17-18`) — รอบหน้าควรคาดข้อจำกัดเดิมและชดเชยแบบเดิม
6. **เส้นทาง promote `exchange.result-key-rotation`:** ต้องมี distribution endpoint
   ที่ปล่อยจริงฝั่ง Identity + runtime key adapter ที่ต่อ production graph ฝั่ง Academy
   ก่อน และ overlap duration เป็นหน้าที่ producer runtime ที่ถือ clock — consumer
   พิสูจน์จาก module เองไม่ได้ (kit เขียนไว้ "proves ORDER, not DURATION") scenario
   นี้จึงไม่สามารถ flip จากงาน consumer-side อย่างเดียว
7. **สภาพ worktree:** ทั้งสอง repo มี untracked `reports/security/` (และ `.mimosa/`
   ฝั่ง Academy) — อย่าให้หลุดเข้า commit rebind; งานนี้ไม่ได้แตะและไม่ได้อ่านเนื้อใน
   `reports/security/` หรือ `.mimosa/` ใดๆ

---
*ทุกค่า digest ในเอกสารนี้วัดด้วย `shasum -a 256` / `git show <rev>:<path>` จากเครื่อง
วันที่ 2026-08-16; ทุก commit อ้างจาก `git log`/`git show` จริงของ repo นั้นๆ*
