# รีวิวอิสระข้าม repo — Identity Control ↔ Academy conformance contract (2026-08-15)

**ลานตรวจ:** independent cross-model review lane (read-only worktree ทั้งสอง repo, ไม่แก้ไฟล์ใดๆ)
**ฐาน:** Academy `86e94eb` · Identity Control `fdcaf30`
**คำถามที่ส่งไปตรวจ:** contract ของ Identity ที่เปลี่ยนไปตั้งแต่ pin ครั้งก่อน มี gap ที่
Academy ยังไม่ทำตามไหม และเลื่อน `identityContractDigests` ได้หรือยัง
**ผลสรุป:** ไม่พบ contract gap ที่ต้องปิดก่อนเลื่อน digest · ผู้ตรวจให้ digest ที่ควร pin
ครบหกไฟล์และ revision ทั้งสองฝั่ง
**ข้อจำกัดที่ผู้ตรวจประกาศเอง:** รันชุดเทสเต็มไม่ได้ใน sandbox (EPERM ตอนสร้าง Vite
worker/temp files) จึงไม่อ้าง fresh full-suite pass — ชดเชยด้วย read-only probe บน source
จริง (Academy 18 assertions, Identity 9 assertions, producer vectors 4/4)
**หลักฐานที่ฝั่งเราเติมให้ครบ:** ดูบันทึกการ regenerate ใน `plans/active_plan.md`

> ข้อความด้านล่างคือคำตัดสินดิบของผู้ตรวจ เก็บไว้ตามที่ได้รับ ไม่แก้ถ้อยคำ

---

VERDICT: พร้อมเลื่อน digest

1. Contract ฝั่ง Identity เปลี่ยนเฉพาะ 3 จาก 6 ไฟล์

เทียบจาก Identity revision `4efd9b7e76f48e00aa6e3896bc14626cd38bcb6a` ถึง HEAD ปัจจุบัน:

- `consumer-conformance-kit.md` เพิ่ม normative rotation contract ได้แก่ fingerprint แบบ SHA-256 ของ DER SPKI, tombstone สองชนิด, successor rules และ resolver-miss policy ที่ [consumer-conformance-kit.md:274](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/docs/integration/consumer-conformance-kit.md:274), [consumer-conformance-kit.md:281](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/docs/integration/consumer-conformance-kit.md:281), [consumer-conformance-kit.md:297](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/docs/integration/consumer-conformance-kit.md:297), [consumer-conformance-kit.md:314](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/docs/integration/consumer-conformance-kit.md:314)
- `packages/contracts/src/index.ts` เพิ่ม strict schema ของ signed result และ result verification-key set รวมถึง self-consistency ของ key states/tombstones ที่ [index.ts:68](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/packages/contracts/src/index.ts:68), [index.ts:84](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/packages/contracts/src/index.ts:84), [index.ts:107](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/packages/contracts/src/index.ts:107)
- `packages/testing/src/index.ts` เพิ่ม producer vectors สำหรับ active/overlap/retired และ rotation ที่ [index.ts:334](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/packages/testing/src/index.ts:334), [index.ts:371](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/identity-control/packages/testing/src/index.ts:371)
- อีก 3 ไฟล์ไม่เปลี่ยน byte/digest ได้แก่ consumer registry JSON, consumer registry Markdown และ lifecycle pull contract

2. Academy ทำตาม normative rotation contract ครบในขอบเขตปัจจุบัน

- Fingerprint: import JWK แล้ว export เป็น DER SPKI ก่อนคำนวณ SHA-256 และคืน lowercase hex ตรงตามนิยาม รวมถึงทำให้ JWK ที่สะกด base64url ต่างกันแต่เป็น key เดียวกันได้ fingerprint เดียวกัน ที่ [result-key-set-importer.ts:218](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:218)
- ตรวจ one-ID-to-one-material และ one-material-to-one-ID ทั้งภายใน document และข้าม revision ที่ [result-key-set-importer.ts:113](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:113), [result-key-set-importer.ts:181](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:181)
- บังคับให้มี active key เพียงหนึ่งตัว, tombstones ต้อง sorted/unique และ document ต้อง self-consistent ที่ [result-key-set-importer.ts:129](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:129), [result-key-set-importer.ts:134](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:134)
- Successor ครบทุกข้อ: issuer เดิม, revision เพิ่มเท่านั้น, tombstones ห้ามหาย, key ห้ามเปลี่ยนคู่, state เดินหน้าเท่านั้น, active ห้ามข้ามตรงไป retired, key ใหม่เข้าได้เฉพาะ active และ active/overlap ห้ามหาย ที่ [result-key-set-importer.ts:171](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:171), [result-key-set-importer.ts:198](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:198), [result-key-set-importer.ts:208](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-importer.ts:208)
- Resolver คืน `null` เหมือนกันสำหรับ unknown และ retired ที่ [result-key-set-cache.ts:56](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:56)
- Miss key แยกตาม `(issuer, kid, revision)` ที่ [result-key-set-cache.ts:51](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:51)
- ใช้ global single-flight ซึ่งเข้มกว่าการ deduplicate เฉพาะ tuple: concurrent miss ของ tuple เดียวกันจะไม่มี fetch ซ้ำ และ miss คนละ tuple ใช้ key-set response เดียวกันได้โดยไม่เสียความถูกต้อง ที่ [result-key-set-cache.ts:64](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:64)
- รับ revision ใหม่เฉพาะ legitimate successor, เก็บ last-known-good เมื่อ rollback/malformed และมีทั้ง cooldown กับ negative cache ที่ [result-key-set-cache.ts:71](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:71), [result-key-set-cache.ts:90](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:90), [result-key-set-cache.ts:101](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/src/lib/identity/result-key-set-cache.ts:101)

ไม่พบ contract gap ที่ต้องปิดก่อนเลื่อน digest

3. สิ่งที่ “ยังไม่ถึงเวลา” ไม่ใช่ conformance defect

- Importer/cache ยังไม่ถูกต่อเข้า production graph โดยตั้งใจ และมี test ป้องกันการ wiring ก่อนอนุมัติ ที่ [identity-key-distribution-not-wired.test.ts:9](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/unit/identity-key-distribution-not-wired.test.ts:9), [identity-key-distribution-not-wired.test.ts:321](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/tests/unit/identity-key-distribution-not-wired.test.ts:321)
- overlap duration เป็นหน้าที่ producer runtime ที่มี clock จึงยังพิสูจน์ไม่ได้จาก consumer module และไม่ควรถูก Academy อนุมานจาก revision
- Generator ยังรายงาน `result-key-rotation` เป็น `not_proven` และระบุขอบเขตว่า `runtimeWired=false`, `productionEvidence=false`, `releaseApproval=false` อย่างถูกต้อง ที่ [generate-identity-control-conformance.mjs:206](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/scripts/generate-identity-control-conformance.mjs:206), [generate-identity-control-conformance.mjs:527](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/scripts/generate-identity-control-conformance.mjs:527), [generate-identity-control-conformance.mjs:562](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/scripts/generate-identity-control-conformance.mjs:562)

พบ evidence-hygiene issue หนึ่งจุดแต่ไม่บล็อกการเลื่อนหก digest: checkpoint report เดิมบันทึก digest ของ importer test เป็น `1181…` ที่ [identity-result-key-set-importer-local-checkpoint-20260814.md:104](/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/reports/reviews/identity-result-key-set-importer-local-checkpoint-20260814.md:104) แต่ไฟล์ปัจจุบันเป็น `b9f99c…` รายงานเดิมจึงไม่ควรถูกใช้เป็น byte-bound proof จนกว่าจะ refresh อย่างไรก็ตาม report นี้ไม่ได้อยู่ในหก contract digests และการตรวจรอบนี้อ่าน source ปัจจุบันโดยตรง

4. Revision และ digest ที่ควร pin

```text
ACADEMY_SOURCE_REVISION
86e94ebd1ff5cd29a8125932c35f08746e7baf21

IDENTITY_SOURCE_REVISION
fdcaf30bfb9b3644c43dcabb192d99820d52a336
```

```text
config/consumer-registry-v1.approved.json
572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875

docs/integration/consumer-registry-v1.md
d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4

docs/integration/consumer-conformance-kit.md
df1ef8c8b385be09cfcf0481f6e0643db4517eb3a72fb406e8612e388beadb97

docs/integration/lifecycle-pull-consumer-contract.md
ba7ca71fd5ab845821f6dc9cfc09bc612bef1ed12914331e4ad4e65a0ce6f17c

packages/contracts/src/index.ts
e3f22d7bb02f255c01d3552022b874202df849cf31410ebff98fac7460f5799f

packages/testing/src/index.ts
d12f81616596dc37a9f62ae16e37873c08efabc222427f4b82ced187c0b6a51d
```

ข้อจำกัดของหลักฐาน: full Vitest และ `npm test` รอบนี้ไม่ได้ผล pass/fail เพราะ read-only sandbox ปฏิเสธการสร้าง Vite worker/temp files (`EPERM`) จึงไม่อ้างว่าได้ fresh full-suite pass ผมชดเชยด้วย read-only actual-source probes สำหรับ Academy 18 assertions, Identity 9 assertions และยืนยัน producer vectors ตรงกัน 4/4 ทั้งหมดผ่าน หากนโยบายกำหนดว่าการเลื่อน metadata ต้องมี full-suite exit `0` จาก reviewer รอบเดียวกัน ต้องรันสองคำสั่งเดิมอีกครั้งใน environment ที่เขียน temp files ได้ก่อน regenerate

ทั้งสอง worktree ยัง clean และไม่มีไฟล์ถูกแก้ในรอบ review นี้.