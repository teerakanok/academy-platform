# รีวิวอิสระรอบเจ็ด — Academy adversarial harness + workerd runner (2026-08-15)

**ลานตรวจ:** independent cross-model review lane (read-only worktree, ไม่แก้ไฟล์ใดๆ)
**ฐาน:** Academy `86e94eb` · **ขอบเขต:** เฉพาะสองข้อ in-bound ของรอบหก (M-01 ยึดพอร์ต,
M-02 sandbox snapshot) ห้ามเปิดประเด็นใหม่ในเครื่องมือ ตามกติกาหยุดของ `checkpoint-ril` §3
**ผลการ triage และการปิด:** ดู
[`academy-identity-client-assertion-webcrypto-signer-contract-rebind-local-checkpoint-20260814.md`](./academy-identity-client-assertion-webcrypto-signer-contract-rebind-local-checkpoint-20260814.md)
หัวข้อ "สิ่งที่ยังไม่ปิด" ข้อ 2 · ปิดแล้วใน commit `ae40210`

> ข้อความด้านล่างคือคำตัดสินดิบของผู้ตรวจ เก็บไว้ตามที่ได้รับ ไม่แก้ถ้อยคำ

---

VERDICT: C0/H0/M1/L1 — REJECT

REJECT เพราะ M-02 ยังทำข้อมูลหายได้โดยไม่ต้องมีผู้โจมตี แม้ POC แบบ manual retry จะผ่านแล้ว

### Findings

- **M — M-02 ยังไม่ปิดในเส้นทาง exit handler จริง**  
  [restoreOnExit()](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/scripts/adversarial/sandbox.mjs:277) ลอง `restore()` สองครั้งติดกันโดยไม่มี delay หรือ snapshot แบบ durable แล้วปล่อย process ออก แม้ `pending()` ยังมากกว่า 0

  POC ที่รันได้ผลดังนี้:

  - child exit `0`
  - restore ล้มด้วย `EACCES` สองครั้ง
  - หลัง process ออกแล้วคืน permission ไฟล์ยังเป็น `HARNESS-BYTES`
  - `ORIGINAL-UNCOMMITTED` กู้จาก Sandbox ไม่ได้อีก เพราะ snapshot อยู่เฉพาะในหน่วยความจำที่หายพร้อม process

  ดังนั้น EACCES ที่ “ชั่วคราว” แต่ยาวเกินสองครั้งที่เรียกติดกันยังทำข้อมูลหาย เข้าเกณฑ์ (ก) โดยตรง และหักล้างข้อความใน[รายงาน](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/reports/reviews/academy-identity-client-assertion-webcrypto-signer-contract-rebind-local-checkpoint-20260814.md:185)ว่ากรณีนี้ปิดแล้ว

  POC เดิมใน unit ผ่าน 14/14: restore แรกล้มและ `pending=1`; หากคืน permission ขณะที่ Sandbox object ยังมีชีวิตแล้วเรียกอีกครั้ง จะกู้ข้อมูลได้ แต่พิสูจน์ได้เพียง manual retry ไม่ครอบ exit path

  การ retry ไม่วนไม่จบ และถ้าไฟล์เปลี่ยนก่อน retry รอบถัดไป digest guard ไม่เขียนทับงานใหม่ แต่จะถือ conflict ว่าจบและล้าง snapshot ออกจากบัญชี จึงยังไม่ใช่ recovery guarantee

- **L — ตัวเลขเลนที่แตะไม่ตรง HEAD**  
  รายงานระบุ 66 แต่สามไฟล์ที่ระบุมี `42 + 12 + 14 = 68` tests และผ่าน `68/68` ทั้ง Node 24.18.0 และ 25.5.0

### M-01

M-01 ปิดจริงภายใน threat model ที่รายงานประกาศไว้:

- ยิง takeover หลัง workerd bind ซ้ำ: ถูกจับ, runner exit `1`; baseline exit `0`
- PID owner ถูกตรวจทั้งก่อน request และหลังได้ response ใน[workerd-signer-check.mjs](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/scripts/workerd-signer-check.mjs:138)
- บังคับให้ `lsof` ใช้ไม่ได้: runner exit `1`
- บังคับให้ `ps` ใช้ไม่ได้: runner exit `1`
- ไม่พบ race สำหรับ process ภายนอกที่ทำให้ false accept: การเปลี่ยน listener ทำให้ owner หายหรือ PID set เปลี่ยน ส่วนการปลอม ancestry ต้องควบคุม launch environment/PATH หรือรันโค้ดภายใน process tree ซึ่งอยู่นอก claim ที่รายงานเปิดเผยไว้แล้ว
- `lsof`/`ps` เป็น snapshot ที่ไม่ atomic จึงอาจ false-reject เมื่อ process churn ได้ แต่ไม่พบทาง false-accept ภายใต้ขอบเขตนี้

### หลักฐานและตัวเลข

- Unit: `1343/1343`, 117 files — ตรง
- เลนที่แตะ: `68/68` ทั้ง Node 24/25 — รายงานเขียน 66
- TypeScript: ผ่าน
- ESLint: 0 errors, 1 warning เดิมใน generated registry — ตรง
- ทางหลบ not-wired: 11 — ตรง
- Runner: 12 scenarios เป็นไปตามที่คาดครบ — ตรง
- Workerd: 8/8 ผ่านบน Node 25  
  การสั่ง runner ด้วย Node 24 ใน sandbox รอบนี้ bind `127.0.0.1` ไม่ได้ (`EPERM`) จึงไม่อ้างหลักฐาน Node 24 สำหรับด่านนี้
- Freeze manifest: 13/13 hashes และ byte counts ตรง ครอบ 5/5 ไฟล์ใน delta ที่ไม่ใช่ตัว manifest เอง; ไฟล์ที่ 6 คือตัว manifest ซึ่งไม่สามารถ hash ตัวเองแบบคงที่ได้

Deferred debt ไม่เป็น blocker:

- `node scripts/adversarial/*.mjs` รันเฉพาะไฟล์แรกที่ shell ขยาย ส่วน runner attack ต้องสั่งแยก เจ้าของ: harness maintainer; ปลดก่อนใช้ wildcard เป็น aggregate machine gate
- `problems()` เก็บ error เก่าแม้ retry ภายหลังสำเร็จ เจ้าของ: harness maintainer; ปลดก่อนนำข้อความ restore ไปตีความด้วยเครื่อง

รีโปสะอาด ไม่มี staged/unstaged/untracked file และไม่มี listener ค้างบนพอร์ต 61987/61988.