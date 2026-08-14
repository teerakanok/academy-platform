# Academy — Identity Result Key-Set Importer (Local Checkpoint)

**วันที่:** 2026-08-14
**ขอบเขต:** local source เท่านั้น — ไม่เปิด route, ไม่ wire runtime, ไม่แตะ DB, ไม่มี network
**Production:** `NO-GO` · **Release approval:** `false`

## ทำไมทำได้ตอนนี้

Execution brief ระบุตรงตัวว่า *"Academy's production-disabled importer and local tests may
proceed once the public distribution contract is frozen"* — Identity ตรึง contract แล้วและ push
เรียบร้อย (`7b62c0a` บน identity-control `main`) ลานนี้จึงเดินได้โดยไม่ต้องรอ Pool A

handoff ของ Academy ระบุงานค้างข้อ 2 ว่า *"ต้องได้และตรวจสอบอิสระซึ่ง Identity Control
result-key distribution และ rotation inputs ก่อน จึงจะประกอบ Academy runtime key adapter ได้"*
นี่คือชิ้นนั้น

## สิ่งที่เพิ่ม

### `src/lib/identity/result-key-set-importer.ts`

**รับเอกสารเป็น raw text ไม่ใช่ object graph** แล้ว parse เอง — JavaScript ไม่มีวิธีที่ปลอดภัย
ข้ามเบราว์เซอร์ในการแยก Proxy ออกจาก object ที่มันห่อ การรับ text จึงกำจัดทั้งชั้นของปัญหา
(Proxy, accessor, prototype, object ที่ตอบไม่เหมือนเดิมในการอ่านครั้งที่สอง) โดยโครงสร้าง
แทนที่จะพยายามตรวจจับ — เพราะ Proxy ออกมาจาก `JSON.parse` ไม่ได้

จากนั้น project ลงเป็น shape ที่ verifier port เดิมรับได้
(`issuer` / `revision` / `keys`) โดยเก็บ tombstone ไว้ที่ผลลัพธ์ของการ import ไม่ต้องขยาย contract
ของ verifier port

**จุดที่สำคัญที่สุด: consumer คำนวณ fingerprint เอง ไม่เชื่อค่าที่เอกสารแจ้ง**
tombstone list คือ *คำกล่าวอ้าง* ของ producer ว่ามีคีย์ใดเลิกใช้แล้ว consumer ที่เชื่อตามตรง ๆ
อาจถูกส่งรายการที่จงใจไม่ใส่คีย์ที่กำลังจะรับ นิยาม normative คือ SHA-256 ของ DER SPKI

**พิสูจน์ความเข้ากันได้ข้ามผลิตภัณฑ์:** producer ใช้ Node crypto ส่วน consumer ใช้ WebCrypto
ทดสอบแล้วว่า SPKI ที่ได้ **เหมือนกันไบต์ต่อไบต์ (91 ไบต์)** fingerprint จึงตรงกัน — และผูกความ
เท่ากันนี้ไว้เป็นเทสต์ ไม่ใช่สมมติ เพราะถ้าวันหนึ่งมันต่างกัน สองผลิตภัณฑ์จะเลิกรู้จักคีย์เดียวกันแบบเงียบ ๆ

### `src/lib/identity/result-key-set-cache.ts`

Resolver-miss policy ที่ยกมาเป็นเงื่อนไขบังคับตอน review ฝั่ง Identity

resolver miss กำกวมโดยตั้งใจ — retired กับ unknown คืน `null` เหมือนกัน เพราะทั้งคู่ต้อง verify
ไม่ผ่าน และสถานะ rotation ไม่ใช่เรื่องของ consumer ความกำกวมนั้นเองคือเหตุผลที่ต้องมี policy:
refresh ทุกครั้งที่ miss จะทำให้ envelope ที่ถูก replay กลายเป็นการยิงหนึ่งครั้งต่อการ replay
ส่วนไม่ refresh เลยจะทำให้ active key ใหม่ไม่ถูกรู้จักจนกว่าจะมีอย่างอื่นมาโหลดใหม่

- single-flight: คำขอที่เข้ามาระหว่าง refresh ใช้รอบเดียวกัน
- negative cache ต่อ `(issuer, keyId, revision)`
- **cooldown เริ่มนับเฉพาะเมื่อ refresh แล้ว revision ไม่ขยับ** — การดึงที่ได้ revision ใหม่
  พิสูจน์ตัวเองว่ามีประโยชน์ การจำกัดอัตรามันจะทำให้ rotation ที่ถูกต้องล้มเหลวกับผู้ใช้จริง
  ส่วนการดึงที่ได้ revision เดิมคือรูปร่างของการพยายามขยายผล
- เอกสารที่ไม่ succeed ของเดิมถูกทิ้ง ไม่ adopt — การถอยหลังคือทางที่ retired key จะกลับมา
- load ที่ล้มเหลวหรือผิดรูปไม่ทำลายชุดที่ใช้ได้อยู่

## หลักฐาน

| รายการ | ผล |
|---|---|
| importer focused | **7/7** |
| cache focused | **7/7** |
| `npx tsc --noEmit` | exit `0` — 0 error |
| `npx eslint` (สี่ไฟล์) | exit `0` |
| Academy unit project ทั้งชุด | **1287/1288** — ดูหนี้ด้านล่าง |
| หลัง remediation: importer | **11/11** |
| หลัง remediation: cache | **8/8** |
| **Academy unit project ทั้งชุด หลังปิดหนี้เก่า** | **115/115 files · 1294/1294 tests · 0 fail** |

**Mutation-verified:** ถอดกติกา carry-forward ของ tombstone ออก → เทสต์ rotation ตกทันที
คืนไฟล์จาก snapshot แล้วผ่าน

## Independent adversarial review: `C0/H2/M4/L1` → แก้ครบทุกข้อ

Reviewer: **Codex `gpt-5.6-sol` effort `xhigh`** ทุก finding มี counterexample ที่รันจริง

| ข้อ | สิ่งที่พัง | แก้อย่างไร |
|---|---|---|
| H1 | ไม่บังคับ bijection `keyId` ↔ key material — key ที่ยัง verify อยู่เปลี่ยน material ได้ และ material เดียวกันโผล่ใต้สองชื่อได้ | บังคับสองทิศทางทั้งภายในเอกสารเดียว และข้ามคู่ previous/next เหมือนที่ producer ทำ |
| H2 | `current()` คืน key record ที่แก้ไขได้ — reviewer เซ็ต `retired.state = 'overlap'` แล้ว `resolve()` คืน retired key แทน `null` | freeze key object ทุกตัว |
| M1 | refresh ที่ **ล้มเหลว** ถูกจำเป็น negative cache ราวกับยืนยันแล้วว่าคีย์ไม่มี — network blip ครั้งเดียวล็อกคีย์ใหม่ที่ถูกต้องออกไปเต็ม TTL | แยกผลเป็น `advanced` / `unchanged` / `failed` และบันทึก negative เฉพาะเมื่อได้เอกสารจริง |
| M2 | `asImported` ตรวจแค่รูปร่าง object ที่ปั้นมือจึงตอบคำถาม rotation ได้ | ผูก brand ด้วย `WeakSet` เฉพาะผลที่ importer สร้าง |
| M3 | `isProxyLike` ที่ผมเขียนจับได้แค่ **revoked** proxy — `new Proxy(doc, {})` ผ่านฉลุย | เปลี่ยนสัญญาเป็นรับ raw text (ดูด้านบน) |
| L1 | `expectSuccessionRefused` ยอมให้ importer ปฏิเสธแทนการพิสูจน์กติกา succession จึงพิสูจน์ผิดเรื่อง | บังคับให้ import สำเร็จก่อน แล้วค่อย assert ว่า succession เป็น `false` |

### Delta re-review: `C0/H0/M0/L1` → ปิด L1 ด้วย

H และ M ปิดครบตาม counterexample เดิม เหลือ L1 ที่ reviewer จับได้คมมาก: เคส "ปฏิเสธ" ห้าข้อ
ของผมสร้าง candidate ด้วย spread จากผลที่ import แล้ว ซึ่ง **ทำให้เสีย brand** จึงถูกปฏิเสธ
เพราะไม่มี brand ไม่ใช่เพราะกติกาที่อ้างว่าทดสอบ — false green ชั้นที่สองซ้อนกับข้อ L1 รอบแรก

แก้โดยให้ทุกเคสเป็นเอกสารจริงที่ import สำเร็จก่อน แล้วค่อย assert ว่า succession เป็น `false`

**และ mutation จับได้อีกชั้น:** หลังแก้แล้ว ถอดกติกา carry-forward ของ tombstone ออก
เทสต์ยัง **ผ่านหมด** — แปลว่าเคสนั้นตกด้วยกติกาอื่น (key ที่ยัง verify อยู่หายไป) ไม่ใช่กติกา
ที่อ้าง จึงแก้ให้แยกตัวแปรจริง: คงชุดคีย์ไว้เหมือน rotation ที่ถูกต้องทุกประการ เปลี่ยนเฉพาะ
tombstone ที่ถูกทิ้ง

ตอนนี้กติกา succession ทั้งสี่ข้อผ่าน mutation ครบ — ถอด revision, issuer, material tombstone,
หรือ id tombstone ออกทีละข้อ เทสต์ตกหนึ่งข้อพอดีทุกครั้ง

**M4 (freeze manifest DRIFT):** reviewer ตรวจ freeze manifest ของผมไม่ได้เพราะไฟล์ยัง untracked
และ manifest อยู่ใน scratchpad ไม่ใช่ที่ที่ verifier ของ repo คาด รับทราบและแก้วิธีทำ — digest
จริงหลัง remediation บันทึกไว้ในรายงานนี้แทน:

```
importer      05645e9fefe2f7e00d63036eb9bbb4ca6e68e5b14d054a95833a3ce50db74cab
cache         ceed8f978b370233c008fc187f21801825c22399e814cf6b3e7ffe7a46f31973
importer test 1181b90e0be624f9c808f24078af5b831e52d7519d27ffbe0234d29f7406daa1
cache test    f55fda97056a00258057cfa4782d7a26989b2e33ed68142713ba35902ea6adf5
```

## หนี้ที่พบและบันทึกไว้ (ไม่ใช่ของ slice นี้)

| รายการ | เจ้าของ | หลักฐาน | ผลกระทบ |
|---|---|---|---|
| `tests/unit/identity-client-assertion-webcrypto-signer.test.ts` เทสต์ "rejects a Proxy that forges metadata around a genuine key" ตกอยู่แล้วบน HEAD นี้ | Academy | รันเดี่ยว 17/18 | **ปิดแล้วใน commit แยกต่างหาก** |

**วินิจฉัยจริง (แก้จากที่ผมสรุปไว้ครั้งแรก):** โค้ดไม่ได้พึ่ง `getPrototypeOf` แต่ดึง getter จาก
`CryptoKey.prototype` มาเรียก `.call(privateKey)` ซึ่งเป็นเทคนิคที่ **ถูกต้องในเบราว์เซอร์**
เพราะ `CryptoKey` เป็น WebIDL interface ที่ brand-check `this` — probe จริงพบว่าบน Node
`getter.call(proxyWrappingRealKey)` **คืนค่าปกติ ไม่ throw** Proxy จึงโกหก `extractable` /
`usages` / `algorithm` ได้ทั้งที่ห่อคีย์จริงอยู่

ตัวที่ใช้ได้จริงทั้งสองสภาพแวดล้อมคือ **`structuredClone`**: CryptoKey เป็น serializable
ตาม HTML spec ส่วน Proxy ที่ห่อมันไม่ cloneable — probe ยืนยันว่า `subtle.sign` กับ
`Object.prototype.toString` ใช้เป็น detector ไม่ได้เพราะ Proxy ผ่านทั้งคู่

หลังแก้: ชุดเทสต์ของ signer **19/19** และ Academy unit project ทั้งชุด **1294/1294 เขียวหมด**
เป็นครั้งแรก mutation-verified: ถอด brand check ออก → เทสต์ Proxy ตกทันที

## สิ่งที่ checkpoint นี้ยัง **ไม่** ให้

ไม่มี route, ไม่มี runtime wiring, ไม่มี registry enablement, ไม่แตะ migration และไม่มี
release approval หลักฐาน route/browser จริงยังต้องรอ operational key custody และ endpoint
ของ Identity ที่ deploy จริง ตามที่ brief กำหนด
