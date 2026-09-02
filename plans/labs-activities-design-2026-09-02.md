# Wave 3 — Labs & Activities System: ข้อเสนอออกแบบ (2026-09-02)

**บริบท:** Academy กำลัง deploy ขึ้น production อยู่ — การออกแบบนี้ตั้งใจให้
กิจกรรมชนิดใหม่ทยอยเปิดบน production จริงแบบ feature-flag รายคอร์ส และถือโอกาส
**ทดสอบ live lab บน GCP (Crux lab plane · M4)** ไปในตัว เพื่อให้แผน free-tier
(Basic Linux → N+) มีของจริงในมือตอนเรียกแขก

**หลักฐานที่อยู่ในมือ:** review 2026-09-02 พบว่า 8 วิชาจริงมี labs/simulations
= 0 ทั้งที่ platform มี engine พิสูจน์แล้ว (demo course) และ reviewers เสนอ
กิจกรรมเฉพาะทางมา 40 ชิ้น ข้อเสนอนี้ย่อ 40 ชิ้นเหล่านั้นเป็น **ระบบกิจกรรม
แบบเดียวที่ขยายได้** ไม่ใช่งาน custom ต่อบท

---

## 1. สถาปัตยกรรม: Activity Runtime เดียว หลายชนิดกิจกรรม

ทุกกิจกรรมคือ block ใน lesson JSON (ต่อยอด schema ที่มี — `lab`/`simulation`
พิสูจน์แล้ว) โดยเพิ่ม union ใหม่:

```
ActivityBlock = live-lab | sim | order-puzzle | match-pairs | step-demo | predict-trace
```

หลักการตัดสินกลาง: **ตัดสินจากสถานะสุดท้าย ไม่ใช่ลำดับคลิก** (สืบทอดจาก
simulation engine ที่มีอยู่) — ทุกชนิดประกาศ `requirements` แบบเดียวกัน
(operator: equals/oneOf/isTrue/seq) ทำให้ grading, hints, debrief, credit
และ progress เดินผ่าน pipeline เดิมทั้งหมด

| ชนิด | ผู้เรียนทำอะไร | ตัดสินยังไง | ต้องมี infrastructure |
|---|---|---|---|
| `live-lab` | ทำงานบน Linux จริงใน browser (terminal + editor) ตาม mission | รัน verify script ในเครื่องผู้เรียน + token ที่ฝังไว้ | **Crux lab plane บน GCP (M4)** + credit meter |
| `sim` | ตั้งค่า/แก้สถานะหน้าจอจำลอง | สถานะสุดท้ายเทียบ requirements (มีอยู่แล้ว) | ไม่ต้อง — JS ล้วน |
| `order-puzzle` | ลากการ์ดเรียงลำดับ (pipeline, encapsulation, boot sequence) | ลำดับสุดท้าย + output ที่รันได้จริงบน fixture | ไม่ต้อง — JS ล้วน |
| `match-pairs` | จับคู่概念 (signal↔พฤติกรรม, syscall↔หมายเลข, error↔ชั้นที่ตี) | คู่ที่ถูกทั้งหมด (สุ่มลำดับต่อรอบ) | ไม่ต้อง — JS ล้วน |
| `step-demo` | ดูภาพ/ไดอะแกรมชุดพร้อมคำบรรยายทีละก้าว + scrub/autoplay | ไม่ตัดสิน (รอช่วยความเข้าใจ) — จบเมื่อดูครบหรือกด "ลงมือเอง" | ไม่ต้อง — สื่อเดิมของ Crucible |
| `predict-trace` | ทำนายค่า (register, stack, page walk) ก่อน reveal | ทำนายตรงเทียบ state machine (สุ่มพารามิเตอร์ต่อรอบ) | ไม่ต้อง — JS ล้วน |

**เกตที่สำคัญของ production:** กิจกรรมทุกชนิดยกเว้น `live-lab` รันฝั่ง client
ล้วน (ถูก/embeddable/ไร้ค่าใช้จ่ายรายครั้ง) — `live-lab` เท่านั้นที่ใช้ทรัพยากร
GCP จึงถูกคุมด้วย **แต้ม lab (academy currency)** ตามแผนเดิม: ฟรี X ครั้ง/เดือน
เพดานต้นทุนต่อ active ชัดเจน budget alarm ที่ project ของ lab plane

## 2. Live lab บน GCP — แผนทดสอบในตัว (สิ่งที่ founder ขอ)

**Pilot เดียวพอ:** lab "Guided first script" ของ **basic-os-linux** (วิชาเรือธง
ของ free-tier) — เหตุผล: เป็นวิชาแรกที่จะเรียกแขก, โจทย์สั้น (10 นาที),
grading ง่าย (รัน script กับ fixture 2 ชุด เทียบ stdout + exit code —
"real execution, not pattern matching" ตามที่ reviewer ย้ำ)

ขอบเขต pilot:
1. **Plane:** Crux lab plane (GCP project แยก + budget alarm) ตาม M4 ใน
   active_plan — ไม่ปะปนกับ pool อื่น
2. **ชีวิต container:** ephemeral ต่อ session, ไม่มี egress ออก internet
   โดยตั้งต้น, จอ CPU/RAM/เวลา, ทำลายทันทีที่ออกจาก lab
3. **Grading:** verify script รัน *ใน* container ของผู้เรียน + ผลลัพธ์ส่งกลับ
   เป็น receipt (token) — server ไม่ต้องรู้ลำดับสิ่งที่พิมพ์ ตัดสินจาก
   สถานะ/ผลลัพธ์เท่านั้น
4. **ความพร้อมตอนเครื่องพัง:** lab unavailable → บทเรียนยังเรียนได้ครบ
   (try block + sim fallback) — lab เป็นด่าน *เสริม* ใน pilot, จะบังคับ
   เป็น gate เมื่อ SLO ผ่านแล้วเท่านั้น
5. **ค่าใช้จ่าย:** วัดจริงต่อ session ในช่วง pilot (เป้า ~$0.005–0.02/ครั้ง
   สำหรับ container เล็กสั้น) → ป้อนกลับเข้าแบบจำลองแต้มก่อนเปิดกว้าง

นี่คือ "ทดสอบการใช้งาน live lab บน GCP บน production จริง" — เปิดให้
internal/allowlist ก่อน (Zero Trust อยู่แล้ว) แล้วค่อยขยายตามแผนเรียกแขก

## 3. สื่อ 6 แบบแรก (mockup แนบมา)

Mockups (ดู `artifacts/labs-wave3-mockups/`) วาดตาม design tokens จริงของ
Academy (light theme, Fraunces/Inter/JetBrains Mono) เพื่อเห็น look & feel:

| # | ไฟล์ | ชนิด | ตัวอย่างจริงที่จะใช้ | วิชาแรกที่ได้ใช้ |
|---|---|---|---|---|
| 1 | `mockup-1-live-lab.png` | live-lab | Sanitizer Hunt (gcc + ASan ใน browser) | c-low-level (pilot จริง: first script บน basic-os-linux) |
| 2 | `mockup-2-sim-permission.png` | sim | Permission repair — โต๊ะไฟล์จำลอง + chmod + checklist สด | basic-os-linux |
| 3 | `mockup-3-dragdrop-pipeline.png` | order-puzzle | Pipeline builder — ประกอบ grep/sort/uniq/awk ตอบคำถามจาก auth.log | basic-os-linux (capstone) |
| 4 | `mockup-4-matching-signals.png` | match-pairs | Signal ↔ สิ่งที่เกิดจริง | basic-os-linux / OS |
| 5 | `mockup-5-stepdemo-packet.png` | step-demo | การเดินทางของ packet ทีละ hop (MAC เปลี่ยน IP คงเดิม) | computer-networking |
| 6 | `mockup-6-predict-trace.png` | predict-trace | ทำนายค่า register ทีละคำสั่ง ก่อน reveal | assembly |

ไอเดียสร้างสรรค์ที่ฝังอยู่ใน 6 แบบนี้ (ตอบ "ช่วยจินตนาการ"):
- **Verify แบบ mission, ไม่ใช่ check button** — ฝั่งขวาของ live lab เป็น
  step list ที่ติ๊กเองเมื่อข้อนั้น "พิสูจน์แล้ว" (build ผ่าน, report ถูก
  classify, re-run สะอาด) ผู้เรียนเห็นความคืบหน้าแบบเกมแต่เกณฑ์คือของจริง
- **Deliberate-failure ยังเป็นแกน** — sim permission เริ่มจากไฟล์ที่พังจริง
  (777 script, 644 key) ตามจริยธรรม "ทำให้พังก่อนแล้วแก้" ของคอร์ส
- **สุ่มค่าต่อรอบทุกชนิด** — match-pairs สลับ, predict-trace สุ่ม register,
  order-puzzle สุ่มคำถามจาก pool → เฉลยแชร์กันไม่ได้ (ต่อยอดระบบ
  variables ของ simulation engine เดิม)
- **step-demo จบด้วย "ลงมือเอง"** — ทุก step-demo ปิดท้ายด้วยปุ่มส่งต่อไป
  กิจกรรมที่ตัดสินได้ (จากดู → ทำ) ไม่ปล่อยให้จบที่การดู
- **โหมดฝึก vs วัดผล** — hint เปิดได้เฉพาะโหมดฝึก (สืบทอดนโยบายเดิม),
  capstone ใช้โหมดวัดผล

## 4. Content contract (ตัวอย่างต่อชนิด — ย่อ)

```jsonc
// order-puzzle
{ "kind": "order-puzzle", "id": "pipeline-top3-ips",
  "goal": "Top 3 IPs by failed login attempts",
  "fixture": "auth.log.512",            // ไฟล์จริงที่ engine รันจริง
  "palette": ["grep 'Failed password'", "sort", "uniq -c",
              "awk '{print $(NF-3)}'", "sort -rn", "head -3"],
  "slots": 5,
  "requirements": [ { "id": "r-out", "type": "stdout-exact" },
                    { "id": "r-min", "type": "stage-count-max", "value": 5 } ] }

// match-pairs
{ "kind": "match-pairs", "id": "signals-meaning",
  "left":  [{ "id": "TERM", "label": "TERM (15)" }, ...],
  "right": [{ "id": "polite", "label": "asks the program to exit; can be caught" }, ...],
  "pairs": { "TERM": "polite", "KILL": "cannot-be-caught", ... },
  "rounds": 2, "shuffle": true }

// live-lab
{ "kind": "live-lab", "id": "first-script",
  "mission": [ { "id": "m1", "label": "Script runs with two fixture inputs",
                 "verify": "./verify.sh m1" }, ... ],   // รันใน container
  "image": "crux/lab-basic:1", "estimatedMinutes": 10,
  "credits": 1, "fallback": "try-first-script-v1" }

// predict-trace
{ "kind": "predict-trace", "id": "registers-zero-ext",
  "program": ["mov rax, 0", "mov eax, -1", "lea rbx, [rax+4]"],
  "asks": [ { "after": 2, "register": "rax", "answer": "0x00000000ffffffff" } ],
  "variables": { ... } }
```

`step-demo` คือ sequence ของ `{ image, caption, note }` + CTA ปลายทาง —
ใช้สื่อที่ Crucible ผลิตได้อยู่แล้ว (ภาพไดอะแกรม/screenshot จริง)

## 5. Rollout ผูกกับ production deployment

| เฟส | อะไร | เกณฑ์ผ่าน |
|---|---|---|
| 0 | ข้อเสนอนี้ + mockups (วันนี้) | founder เคาะทิศทาง |
| 1 | `sim` + `order-puzzle` + `match-pairs` + `predict-trace` engine (client ล้วน) + กิจกรรมแรก 6–8 ชิ้น (Tier A/B ของ review) — เปิดบน production แบบ flag รายคอร์ส ให้ internal เดินก่อน | e2e ผ่าน, gate fairness ไม่ถูกกระทบ, ผู้เรียน internal จบกิจกรรมได้ |
| 2 | **Live-lab pilot บน GCP** (§2) — 1 lab, allowlist | SLO ต่อ session, ต้นทุนจริง/ครั้ง ≤ เพดาน, ไม่มี incident ทรัพยากร |
| 3 | ขยาย live-lab เป็น gate ของ capstone วิชาเรือธง + step-demo ชุดแรก | ผล retention/ความสำเร็จของผู้เรียนเทียบก่อน-หลัง |
| 4 | ผลิตกิจกรรมตาม catalog 40 ชิ้นของ review แบบ batch รายวิชา | ตามแผนเรียกแขกของ free tier |

## 6. การตัดสินใจที่รอ founder

1. เห็นด้วยกับการรวมทุกกิจกรรมไว้บน **activity runtime เดียว** (ตาราง §1)
   หรืออยากเริ่มเฉพาะ live-lab ก่อน?
2. Pilot live-lab ที่ **basic-os-linux "first script"** (คำแนะนำ) หรืออยากได้
   c-low-level "Sanitizer Hunt" เป็นหน้าตาแรก (โชว์แบบเท่กว่า แต่เกณฑ์
   วัดซับซ้อนกว่า)?
3. แต้ม lab ฟรีต่อเดือนเริ่มที่เท่าไรสำหรับ pilot (เสนอ 10–20 ครั้ง/เดือน —
   เพดานต้นทุนชัด, สอนผู้เรียนรู้จักแต้มตั้งแต่วันแรกตามแผนเดิม)
4. step-demo ชุดแรก produce ที่ Crucible (สื่อต้นทาง) — ยืนยัน ownership
   นี้ได้ไหม (สอดคล้องสถาปัตยกรรม content ที่ประกาศไว้)

---
*ผลิตใน session ws-05d7e99d · ต่อจาก review 2026-09-02 (Wave 1+2 ดำเนินการ
แก้ content พร้อมกันใน lane เดียวกัน)*
