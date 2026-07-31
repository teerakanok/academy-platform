# CAS-005 Answer-Key Dispute Audit + Founder Decision Brief

**วันที่:** 2026-07-31 · **Lane:** Academy Phase 0 — Lane A (critical path)
**ผู้จัดทำ:** Director session (audit read-only จาก Crucible archive — ยังไม่มี answer key ใดถูกแก้)
**Source ที่ audit:** `products/personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/`

---

## สรุปสำหรับ founder (อ่านแค่ส่วนนี้ก็เคาะได้)

ตรวจจากไฟล์จริงทั้งเส้น pipeline แล้ว ข้อสรุปคือ:

1. **"11 founder-level disputes" มีตัวตนจริง** — คือ 11 ข้อที่ reviewer ติดธง
   ระดับ *answer key ผิด/ไม่ครบ* ในรอบ review แรก (iter1: 610 ข้อ / 75 ธงทุกประเภท)
2. **ไม่มี answer key ใดถูกเปลี่ยนเลยตลอดกระบวนการ** — ตรวจด้วย script เทียบ key
   ครบทั้ง 600 ข้อ + 10 PBQ: ตรงกับต้นฉบับ 100% (rewrite pipeline ถูกออกแบบให้แก้ได้
   เฉพาะ prose — `merge.mjs` copy `correct` แบบ byte-for-byte, `finalfix.mjs` ประกาศ
   "never touches correct/choices/keys")
3. ใน 11 ข้อนั้น: **8 ข้อ reviewer ถอนธงเองหลัง explanation ถูกเขียนใหม่** (ประเด็นเดิม
   เป็นข้อถกเถียงเชิง "ตัวเลือกอื่นก็ defensible" — พอ explanation ชัดขึ้น รอบ re-review
   ไม่ติดธงซ้ำ), 1 ข้อ (M1-136) ถูกลดระดับเหลือประเด็น prose แล้วปิดในรอบสุดท้าย
4. **ยังเปิดจริง 3 ข้อ — ต้องการ founder เคาะทีละข้อ:**

| # | ข้อ | ประเด็น | คำแนะนำ | เคาะ |
|---|---|---|---|---|
| 1 | **PBQ-010** (Full-Practice 02) | ลำดับ recovery key ให้ "restore ก่อน fix root cause" — ขัด NIST SP 800-61 และขัด field อื่นใน PBQ เดียวกันเอง | **แก้ key order** เป็น Preserve → Contain → Fix root cause → Validate restore | ☐ แก้ / ☐ คง / ☐ อื่นๆ |
| 2 | **M4-082** (Module 4) | โจทย์บอกเองว่าปัญหาคือ "inconsistent fields" แต่ key ไม่รวมตัวเลือก "Map fields" — reviewer ยืนยัน 2 รอบอิสระ | **เพิ่ม D เข้า key** → A,C,D,E | ☐ เพิ่ม D / ☐ คง / ☐ เขียน distractor ใหม่ |
| 3 | **M4-067** (Module 4) | "Sandbox process" เป็น containment ที่ defensible สำหรับ malicious postinstall script แต่ไม่อยู่ใน key | **เพิ่ม A เข้า key** → A,B,C,E | ☐ เพิ่ม A / ☐ คง / ☐ เขียน distractor ใหม่ |

5. หลังเคาะ: การแก้ทำใน **Crucible session แยก** (ตาม boundary ของ lane นี้) —
   แก้ key + explanation → re-run merge/regenerate student-version-2 → re-review
   3 ข้อนี้ → อัปเดต validation แล้ว CAS-005 จึงพ้น hard prerequisite ก่อน public
   distribution

> ข้อสังเกตเชิงคุณภาพ: ทั้ง 3 ข้อเป็น dispute แบบ "key แคบไป/เรียงผิด" ไม่ใช่ "key
> ผิดข้อเท็จจริงร้ายแรง" — แต่กับกลุ่มเป้าหมาย senior security ข้อแบบนี้แหละที่โดนจับได้
> และทำลายความเชื่อถือของทั้ง bank จึงควรปิดก่อนแจกจริงตามที่ล็อกไว้

---

## Decision Card 1 — PBQ-010 `recoveryOrder` (เปิด — สำคัญสุด)

**ที่อยู่:** Full-Length Practice 02 · ไฟล์ `full-length/cas005-full-practice-02.json`,
`v2-build/rewritten/pbqs/cas005-full-practice-02__PBQ-010.json`,
`student-version-2/full-length/cas005-full-practice-02.json`
**Source anchor ของข้อ:** SecurityX CertMaster 3C/5E; CAS005 LO 2.1, 4.4; NIST SP 800-61

**Scenario:** "An order platform has a 20-minute RTO and a 5-minute RPO. The web tier
spans multiple zones, the database replicates asynchronously, the message broker has no
tested restore, and backups can be changed by platform admins."

**Field ที่โต้แย้ง — "Incident recovery action order" (ลาก order 4 ขั้น):**

Key ปัจจุบัน:
1. Preserve volatile evidence where feasible
2. Contain the affected access paths
3. **Validate a clean restore**
4. **Fix the root cause and update detections**

**ข้อโต้แย้ง (gemini reviewer, iter1):** ลำดับ 3–4 สลับกัน — ตาม NIST SP 800-61
ต้อง eradicate (fix root cause) ก่อน recovery (validate clean restore) ไม่งั้นเสี่ยง
re-compromise ทันทีหลัง restore

**Evidence:**
- **NIST SP 800-61** (r2 phase "Containment, **Eradication**, and Recovery"; r3
  ฉบับ current เม.ย. 2025 ตาม CSF 2.0: RS.MI containment/eradication อยู่ใน Respond,
  Recover ตามหลัง) — ลำดับสอนมาตรฐานคือ contain → eradicate → recover;
  restore ก่อนกำจัด root cause = ความผิดพลาดคลาสสิกที่ข้อสอบ IR ชอบทดสอบ
- **ขัดแย้งภายใน PBQ เดียวกัน:** field `irCoordination` ของ PBQ-010 เอง key คำตอบ
  "**Fix the root cause before resuming normal operation**" เป็นข้อถูก — คนทำข้อสอบ
  ที่ตอบ field นี้ถูกจะงงว่าทำไม field order ให้ restore มาก่อน
- ตรวจไฟล์จริง 2026-07-31: rewritten + student-version-2 ยังถือ key ลำดับเดิมทุกไฟล์
  (rewrite ไม่เคยแตะ) และไม่พบหลักฐานว่า PBQ-010 ถูก re-review หลัง iter1

**คำแนะนำ (recommended):** แก้ key order เป็น
`Preserve volatile evidence → Contain → Fix the root cause and update detections →
Validate a clean restore` พร้อมแก้ explanation ของ field ให้สื่อ "กำจัดสาเหตุก่อน
แล้วค่อยพิสูจน์ว่า restore สะอาด"

**ทางเลือกอื่น + trade-off:** เขียน option text ใหม่ให้ "validate restore" หมายถึงการ
ทดสอบใน isolated environment (ทำให้ลำดับเดิม defensible) — ไม่แนะนำ: ซับซ้อนขึ้น,
ต้อง re-author + re-review มากกว่า และผู้เรียนส่วนใหญ่จะยังอ่านเป็น recovery ปกติ

---

## Decision Card 2 — M4-082 (เปิด — reviewer ยืนยัน 2 รอบ)

**ที่อยู่:** Module 4 · `module-banks/module-4-security-operations.json` (ต้นฉบับ),
`v2-build/rewritten/module-4-security-operations/part-05.json`,
`student-version-2/module-banks/module-4-security-operations/part-05.json`
**Meta:** LO 4.3 (threat-hunting / threat intelligence) · multi ("Select all that apply") · Instructor-grade
**ปรากฏเฉพาะใน module bank** (ไม่อยู่ใน full-length / pre-post)

**โจทย์:** "A security council is deciding which evidence to require before approval.
Tooling is bought; the open issue is that multiple teams exchange indicators using
spreadsheets with **inconsistent fields** and no confidence ratings. Which items best
distinguish a defensible answer from a superficial one?"

**ตัวเลือก:** A. Track source handling · B. Create detections · C. Set expiration ·
D. **Map fields** · E. Record confidence

**Key ปัจจุบัน:** A, C, E — whyWrong ปัจจุบันอ้างว่า D "does not supply the indicator
confidence and TTL evidence this scenario requires"

**ข้อโต้แย้ง (codex reviewer — ติดธง `answer` ทั้ง iter1 และ iter2 หลัง rewrite):**
โจทย์ระบุปัญหา "inconsistent fields" ตรงๆ → การ map/standardize fields (D) คือการแก้
ปัญหาที่โจทย์ยกมาเองโดยตรง การตัด D ออกจาก key ทำให้ keyed set ไม่ครบ และ whyWrong
ที่บอกว่า mapping ไม่แก้ indicator-governance gap นั้นผิด

**Evidence:** ตัว stem เอง (internal consistency) + แนวปฏิบัติ TIP/STIX: field mapping /
schema normalization เป็นขั้นแรกของ indicator sharing ที่ใช้งานได้จริง · ข้อนี้เป็นธง
answer เพียงข้อเดียวที่ **recur หลัง rewrite** และถูกตัดออกจาก loop ปิดงานรอบสุดท้าย
(final loop re-review เฉพาะ 9 ข้อ prose — ไม่มี M4-082) → ไม่เคยถูกปิด

**คำแนะนำ (recommended):** เพิ่ม D เข้า key → **A, C, D, E** + ย้ายคำอธิบาย D ไป
whyCorrect + ปรับ explanation (ข้อยังคงรูป "Select all that apply" ผู้เรียนไม่รู้จำนวนข้อถูก
— ความยากลดลงบ้าง ยอมรับได้)

**ทางเลือกอื่น + trade-off:** คง key เดิมแล้วแทนที่ตัวเลือก D ด้วย distractor ที่ผิดชัด
(คงระดับความยาก 3-จาก-5) — แลกกับงาน re-author + re-review เพิ่ม และต้องแก้ stem
ไม่ให้เอ่ยถึง inconsistent fields ซึ่งเป็นจุดดีของ scenario นี้ — ไม่แนะนำ

---

## Decision Card 3 — M4-067 (เปิด — ธงใหม่จาก iter2)

**ที่อยู่:** Module 4 · `module-banks/module-4-security-operations.json` (ต้นฉบับ),
`v2-build/rewritten/module-4-security-operations/part-13.json`,
`student-version-2/module-banks/module-4-security-operations/part-13.json`
**Meta:** multi ("Select all that apply") · **ปรากฏเฉพาะใน module bank**

**โจทย์:** "A package update introduces a malicious postinstall script into the CI
pipeline. Which evidence points would let a reviewer defend the decision against
plausible alternatives?"

**ตัวเลือก:** A. **Sandbox process** · B. Monitor dependency changes · C. Isolate build
secrets · D. Deny metadata endpoints · E. Verify package provenance

**Key ปัจจุบัน:** B, C, E — whyWrong ปัจจุบันยอมรับเองว่า A "can be a valid supply-chain
containment control, but it is not the keyed evidence point here"

**ข้อโต้แย้ง (codex reviewer, iter2):** สำหรับ malicious postinstall script การ sandbox
กระบวนการ build/execution เป็น containment ตรงประเด็นและ defensible → keyed set
B,C,E ไม่ครบเมื่อมี A ให้เลือก

**Evidence:** แนวปฏิบัติ software supply-chain มาตรฐาน (เช่น การรัน install scripts ใน
sandbox/ephemeral build environment, ปิด lifecycle scripts) เป็น mitigation หลักของ
ภัย postinstall script — whyWrong ฉบับปัจจุบันก็ยอมรับว่า A valid แค่ "ไม่ใช่ข้อที่ key" ซึ่ง
สำหรับข้อสอบ multi แบบ "เลือกทุกข้อที่ใช่" ถือเป็น fairness defect · ข้อนี้ไม่อยู่ใน
final loop เช่นกัน → ไม่เคยถูกปิด

**คำแนะนำ (recommended):** เพิ่ม A เข้า key → **A, B, C, E** + ย้ายคำอธิบาย A ไป
whyCorrect (เหตุผลเดียวกับ M4-082: เปลี่ยนน้อยสุด ซื่อตรงต่อ evidence)

**ทางเลือกอื่น + trade-off:** แทนที่ A ด้วย distractor นอกประเด็นชัดๆ (คง 3-จาก-5) —
งานเพิ่ม + ต้อง re-review ใหม่ — เป็นทางเลือกถ้า founder อยากคงความยาก

---

## 8 + 1 disputes ที่ปิดแล้วโดย review loop (ไม่ต้องเคาะ — บันทึกไว้ตรวจย้อนได้)

ทั้งหมดถูกติดธง `answer` ใน iter1 → explanation/whyWrong ถูกเขียนใหม่ (key ไม่แตะ) →
รอบ re-review (iter2) ไม่ติดธง answer ซ้ำ:

| ข้อ | ประเด็นเดิม (iter1) | สถานะ |
|---|---|---|
| M1-116 | keyed set A,D,E แคบไป (data export paths / third-party ก็ใช่) | ถอนธงใน iter2 |
| M1-019 | ควรรวม E (documenting workflow steps) | ถอนธงใน iter2 |
| M1-136 | C (testing behavior changes) ก็ defensible | เหลือประเด็น prose → patch แล้วผ่าน final loop |
| M2-019 | "Map dependencies" ก็ relevant | ถอนธงใน iter2 |
| M2-139 | "Limit resource access" เป็น Zero-Trust control หลัก | ถอนธงใน iter2 |
| M2-138 | ควรรวม C (service/workload identity) | ถอนธงใน iter2 |
| M2-032 | ควรรวม C (verify provenance) | ถอนธงใน iter2 |
| M3-133 | E (protect signing keys) เป็น mTLS control ที่ valid | ถอนธงใน iter2 |
| M3-073 | B (collect attestation) เป็น confidential-computing element | ถอนธงใน iter2 |

ธรรมชาติของธงกลุ่มนี้คือ "ตัวเลือกอื่นก็พอ defensible" — เมื่อ explanation ระบุเหตุผล
ของ keyed set ชัดขึ้น reviewer จึงยอมรับ key เดิม ถือเป็นการปิดระดับ reviewer
(สอง provider อิสระ) ไม่ใช่การแก้ key

---

## วิธี audit + evidence trail (สำหรับตรวจซ้ำ)

**Universe จริง = 610 items** (600 MCQ ใน 4 module banks + 10 PBQ) — full-length
ทั้ง 2 ชุด (85 ข้อ/ชุด) และ pre/post ทั้งหมด **reuse ข้อจาก module banks ตาม id**
(ตรวจแล้ว 85/85 เป็น M*-id) → ไม่มีข้อนอก universe ที่หลุด review

**เส้น pipeline (ตรวจจาก script จริง):**
`module-banks` (ต้นฉบับ key) → `extract.mjs` → LLM paraphrase → `rewritten/` →
`merge.mjs` (copy `correct`/choices byte-for-byte — โครงสร้างบังคับให้ key เปลี่ยนไม่ได้)
→ `v2-source/` → `generate-cas005-student-version-2.mjs` → `student-version-2/`
(deliverable, generated 2026-05-25)

**ลำดับ review:** iter1 = 610 ข้อ, 75 ธง (11 = ระดับ answer) → rewrite prose →
iter2 = 72 ข้อ, 11 ธง (answer: M4-082 recur + M4-067 ใหม่) → `finalfix.mjs`
patch prose 9 ข้อ → final loop re-review 9 ข้อ = 0 ธง
(`review/meta.json` + `review/out/codex/batch-00*.txt`)

**การยืนยัน key ไม่เปลี่ยน:** script เทียบ `correct` ทุกข้อระหว่าง `v2-source` กับ
`rewritten/_context` = ตรงกัน 600/600; PBQ-010 rewritten เทียบต้นฉบับ = ตรงทุก field;
spot-check ปลายทาง SV2: M4-082 = A,C,E และ PBQ-010 order เดิม → dispute ทั้ง 3
ยังอยู่ในไฟล์ที่จะแจกจริง

**Caveat ที่ต้องพูดตรงๆ:**
- รายชื่อข้อที่ iter2 ครอบจริงถูก overwrite โดย final loop (เหลือ summary: codex 72
  verdicts) — ข้อสรุป "9 ข้อถอนธง" อนุมานจากการที่ธง answer ไม่ recur ใน
  `findings-academic-iter2.json`; enumerate ต่อข้อไม่ได้แล้ว
- iter1 ฝั่ง gemini มี parse error 6 batches (coverage 562/610) และธง PBQ-010 มาจาก
  gemini รายเดียว (codex ไม่ติด) — แต่ข้อโต้แย้งยืนได้ด้วย primary source + ขัดแย้งภายใน
  ตัว PBQ เอง ไม่ขึ้นกับว่าโมเดลไหนเป็นคนพบ
- แหล่ง NIST: SP 800-61r3 เป็นฉบับ current (เม.ย. 2025, แทน r2) — ยืนยันผ่าน
  csrc.nist.gov 2026-07-31

**Source of truth (ปิด risk จาก handoff):** bank ที่ใช้งานได้จริง = archive path นี้
(`archive/legacy-output/v4.1/practice-tests/` — ต้นฉบับ `module-banks/` + deliverable
`student-version-2/`) ส่วนโครงใหม่ `cas-005/assessments/` ยังว่างจริง → Crucible
session ที่แก้ key ควรบันทึก pointer/promote ให้ชัดในคราวเดียว

---

## ขั้นตอนหลัง founder เคาะ (ทำใน Crucible session — ห้ามทำใน lane นี้)

1. แก้ key + explanation ตามที่เคาะ ใน `module-banks/` (ต้นฉบับ) แล้ว re-run
   v2-build merge + regenerate `student-version-2` (key ไหลอัตโนมัติทั้ง JSON/MD/HTML)
2. Re-review เฉพาะ 3 ข้อที่แก้ (สอง provider อิสระ ตาม protocol เดิม) + อัปเดต
   `practice-validation.json`
3. บันทึก founder decision เป็นลายลักษณ์อักษร (อ้าง report นี้) ใน Crucible
   `plans/completed_log.md`
4. แจ้งกลับ Academy repo → ปลด hard prerequisite ของ Phase 0 publish gate
