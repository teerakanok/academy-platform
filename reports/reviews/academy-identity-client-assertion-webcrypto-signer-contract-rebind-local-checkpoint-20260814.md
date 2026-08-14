# Academy Identity Client-Assertion Web Crypto Signer — Contract Rebind Local Checkpoint

**Date:** 2026-08-14
**Status:** รีวิวอิสระหกรอบ · in-bound ของรอบห้าและรอบหกปิดครบแล้ว · รอ delta re-review รอบเจ็ด
**Production:** NO-GO
**Supersedes:** `academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md`

รายงาน 2026-08-11 ยังคงถูกต้องในฐานะบันทึกของวันนั้น และไม่ถูกแก้ไข แต่มัน
บรรยาย contract ที่เลิกใช้แล้ว: signer ไม่รับ `CryptoKey` จากผู้เรียกอีกต่อไป

## ทำไม contract ถึงเปลี่ยน

รีวิวอิสระข้ามโมเดล — ตัวที่ brief กำหนดไว้เป็นเงื่อนไขบังคับของทุก checkpoint
(codex `gpt-5.6-sol`, effort xhigh) บันทึกไว้เป็นหลักฐานว่าผู้เขียนกับผู้ตรวจเป็นคนละ agent
ไม่ใช่การผูก governance เข้ากับผู้ให้บริการ — ตีกลับ `C0/H2/M2/L0` การแก้ที่ใช้
`structuredClone` กัน Proxy สองข้อ HIGH คือ

- **H1** `structuredClone` พิสูจน์แค่ว่า "ค่านอกสุด serialize ได้" ไม่ใช่ว่าเป็น
  `CryptoKey` จริง `Object.create(realKey)` ที่บัง `Symbol(kExtractable)` ผ่านทุก
  getter, clone สำเร็จ และ factory เดิมรับไปเซ็นให้ — ทำซ้ำได้บน Node 25
- **H2** บน workerd ที่ `compatibility_date` ของแอป (`2025-03-25`)
  `CryptoKey.prototype` **ไม่มี** getter และ `structuredClone(key)` โยน
  `DataCloneError` การป้องกันแบบนั้นจึงปฏิเสธ key ที่ถูกต้อง = signer พังทั้งตัว
  บน runtime ที่ deploy จริง

รากปัญหาเป็นอันเดียวกับที่เลนนี้เจอมาแล้วหลายรอบ: **ถ้าจุดยึดความเชื่อถือมาจาก
ผู้เรียก มันไม่ใช่ boundary** ยิ่งพยายามตรวจจับของปลอมเก่งขึ้น ยิ่งผูกตัวเองกับ
รายละเอียดที่ runtime ไม่รับประกัน

## contract ปัจจุบัน

`createIdentityClientAssertionWebCryptoSigner` เป็น async และรับ `privateJwk`
เป็น **ข้อความ** ไม่ใช่ object และไม่ใช่ `CryptoKey` มัน import เองภายใน boundary
ด้วย `extractable: false` และ `usages: ['sign']` แล้วปิด `CryptoKey` ไว้ใน closure
ไม่มี property ให้อ่านกลับ และไม่มี API ที่รับ `CryptoKey` จากใครเลย

การตรวจ metadata ผ่าน prototype getter และ `structuredClone` ถูกถอดออกทั้งหมด —
ไม่จำเป็นแล้วเพราะไม่มีของปลอมให้ตรวจ และมันคือส่วนที่พังบน workerd

ข้อความต้องเป็น **การสะกดแบบ canonical** ของ key นั้น สมาชิกห้าตัว เรียงตามนี้
ไม่มีช่องว่างเกิน ไม่มี escape พิกัดเป็น base64url canonical ของ 32 ไบต์
มี newline ท้ายได้ไม่เกินหนึ่งตัว

```
{"kty":"EC","crv":"P-256","x":"…","y":"…","d":"…"}
```

เหตุผล: `JSON.parse` ยุบสมาชิกซ้ำแบบ last-wins ดังนั้น
`{"kty":"RSA",…,"kty":"EC"}` ผ่านด่าน "ห้าสมาชิกพอดี" ได้ ขณะที่คนตรวจหรือ
parser แบบ first-wins อ่านไฟล์เดียวกันแล้วเห็นคนละ key เดียวกันกับ `kty`
และกับบิตว่างสองบิตท้าย base64url ที่ทำให้ key เดียวสะกดได้สี่แบบ ไม่ใช่ช่อง
โจมตีโดยตรง แต่เป็นปัญหา provenance: ไฟล์ที่คนตรวจกับ key ที่โปรเซสใช้เซ็น
ต้องเป็นก้อนเดียวกัน และ "เดียวกัน" ต้องแปลว่าตรงทุกไบต์

## ข้อจำกัดที่ต้องอ่านคู่กันเสมอ

ถ้าผู้เรียกเป็นคนถือ JWK เอง เขา copy key material ก่อน import ได้อยู่แล้ว
`extractable: false` หลัง import จึงเป็นการ **กันความผิดพลาดภายในโปรเซส**
ไม่ใช่หลักฐาน provenance key ที่ห้าม export จริงต้องอยู่ใน KMS หรือ HSM
รายงานนี้ไม่ได้อ้างว่าให้สิ่งนั้น

## หลักฐาน

| ด่าน | ผล |
|---|---|
| unit ทั้ง repo | 1343 ข้อผ่าน (117 ไฟล์) |
| เลน signer + ด่าน not-wired + sandbox | 66 ข้อผ่าน บนทั้ง node 24.18.0 (engine ที่ประกาศ) และ 25.5.0 |
| `tsc --noEmit` | สะอาด |
| eslint | 0 error · 1 warning ที่มีมาก่อนใน `src/lib/content/registry.generated.ts` (ไฟล์ generated ไม่เกี่ยวกับลานนี้) |
| `npm run test:workerd-signer` | 8 ข้อผ่านบน workerd จริง ที่ compatibility ของแอป |
| `scripts/adversarial/not-wired-gate-evasions.mjs` | ทางหลบ 11 แบบถูกจับครบ เลนปกติผ่าน |
| `scripts/adversarial/workerd-runner-attacks.mjs` | 12 รายการเป็นไปตามที่ควรครบ รวมการยึดพอร์ตหลัง bind |

หลักฐาน H2 ตรงจาก runtime: `prototype type getter: absent; structuredClone:
throws DataCloneError`

### mutation ที่ยิงแล้วตาย

signer — `extractable=true` · เพิ่ม `'verify'` ใน usages · ตัดกติกาสมาชิก JWK ครบห้า ·
รับ object แทน text · แทนที่ `COORDINATE_PATTERN` ด้วยเพียง "ไม่ว่าง" ·
เรียก `importKey` โดยไม่ผูก receiver · ตัดการเทียบไบต์ canonical ·
ตัด base64url canonicality · ยอมช่องว่างรอบข้อความ · ยอมลำดับสมาชิกใดก็ได้

เลน workerd — mutate source จริงเป็น `extractable: true` แล้วเลนนี้ fail ตรงจุด
(`FAIL signer-imports-non-extractable-sign-only: Error: extractable true`)

### mutation ที่ **รอด** และเหตุผลที่ยอมรับได้

รอบก่อนรายงานนี้เขียนว่า "ผ่อน regex พิกัดแล้วตาย" ซึ่งไม่ precise พอ — mutant ที่ผมยิง
คือการถอด `COORDINATE_PATTERN` ทิ้งทั้งอัน ส่วนการผ่อนเล็กน้อยจาก `{43}` เป็น `{42,43}`
**รอด** ทั้ง 42 ข้อ ยืนยันด้วยตัวเองแล้ว เพราะ `isCanonicalBase64Url` ปฏิเสธค่ายาว 42
อยู่ก่อนแล้ว เมื่อผ่อนทั้งสองด่านพร้อมกันจึงมีเทสตาย 1 ข้อ

แปลว่า `COORDINATE_PATTERN` เป็นทางลัดราคาถูก ไม่ใช่ด่านที่มีความคุ้มกันเป็นของตัวเอง —
`isCanonicalBase64Url` ครอบทุกกรณีที่ regex ครอบ (ยาวผิด, อักขระนอกชุด base64url,
padding ที่ไม่ canonical) เก็บ regex ไว้เพื่อไม่ให้ `atob` เห็นอินพุตอะไรก็ได้
ไม่ใช่เพราะมันเป็นด่านอิสระ

### runner และด่าน not-wired — สคริปต์โจมตีที่ commit ไว้รันซ้ำได้

ข้ออ้าง mutation ที่ไม่มีสคริปต์ให้รันคือข้ออ้างที่ตรวจไม่ได้ สองไฟล์นี้จึงเป็นของจริง
ในรีโป ไม่ใช่บันทึกในรายงาน

| สคริปต์ | ยิงอะไร |
|---|---|
| `scripts/adversarial/not-wired-gate-evasions.mjs` | re-export bridge ใน `src/lib/identity` · dynamic import ที่ประกอบ specifier เอง · wrangler entry ตัวใหม่นอกรากเดิม · static import ตรงจาก route |
| `scripts/adversarial/workerd-runner-attacks.mjs` | squatter ที่แต่งผลผ่านครบ · `checks` ว่างพร้อม `ok:true` · check เดียวที่ชื่อเป็นรายการที่ join · ชื่อซ้ำปั๊มจำนวน · การเชื่อมต่อที่ไม่เคยตอบ · คอมเมนต์บล็อกไม่ปิด · BOM+trailing comma ที่ต้องไม่ทำให้พัง · compatibility เลื่อนออกจากแอป |

ทั้งสองสคริปต์ออก 0 เมื่อทุกการโจมตีถูกจับ **และ**เลนปกติยังผ่าน คืนสภาพไฟล์เสมอ

## Triage ของรีวิวรอบห้า (ตาม `checkpoint-ril` §3)

ป้ายความรุนแรงบอกว่า defect ร้ายแค่ไหน ไม่ได้บอกว่าควรทำอะไรต่อ — reviewer ไม่รู้ว่า
โมดูลชุดนี้ยังไม่มีผู้เรียกใน production และไม่รู้ว่าลานไหนกำลังล็อกผลิตภัณฑ์อื่นอยู่
ตารางนี้คือการตัดสินของเจ้าของงาน ไม่ใช่การคัดลอกป้ายของ reviewer

| Finding | In-bound? | เหตุผล |
|---|---|---|
| M2 runner ถูกปลอมผลได้ | **ใช่** | หักล้างข้ออ้าง "workerd 8 checks ผ่าน" ที่เขียนไว้ในรายงานฉบับนี้แล้ว — เข้าเกณฑ์ "invalidates a claim already written into an evidence artifact" |
| M3 Sandbox ทำลายข้อมูลได้ | **ใช่** | ลบไฟล์ที่ไม่ได้เป็นเจ้าของได้โดยไม่ต้องมีผู้โจมตี และเกิดขึ้นจริงมาแล้วหนึ่งครั้ง — data integrity |
| M1 ทางหลบ `.js` → `.ts` specifier | **ใช่** | `moduleResolution: bundler` แทนนามสกุลให้เอง การ refactor ปกติสร้างทางนี้ได้โดยไม่ตั้งใจ |
| M1 ทางหลบ `instrumentation-client.ts` ที่ราก | ไม่ | ต้องสร้างไฟล์ใหม่ที่รากโดยตั้งใจ ด่านนี้มีไว้กันการต่อสายที่หลุดมาโดยไม่ตั้งใจ ไม่ใช่กันคนที่ตั้งใจแก้ซอร์สซึ่งลบชื่อออกจากรายการได้อยู่แล้ว · เจ้าของ: Academy identity lane · ปลดเมื่อ: ก่อนโมดูลใดในรายการถูกต่อเข้า production จริง |
| M1 conditional `exports` | ไม่ | เหมือนข้างบน และ repo นี้ยังไม่มี `exports` เลยแม้แต่ตัวเดียว · เจ้าของและเงื่อนไขปลดเดียวกัน |
| L1 ตัวเลขในรายงานเก่า | **ใช่** | รายงานนี้ถูกใช้เป็นหลักฐาน แก้แล้วในรอบนี้ |
| L2 `KILLED` รายบรรทัดกำกวม | ไม่ | สคริปต์ยังออก non-zero เมื่อ baseline พัง จึงยังไม่เกิด false acceptance ทั้งสคริปต์ · เจ้าของ: harness maintainer · ปลดเมื่อ: ก่อนเอาผลรายบรรทัดไปนับ mutation coverage ด้วยเครื่อง |

**บทเรียนของรอบนี้:** สามรอบหลังสุดไม่ได้เจอปัญหาในตัวผลิตภัณฑ์เลย — signer ไม่มี
finding เหลือตั้งแต่รอบสอง ที่เจอทั้งหมดคือปัญหาใน**เครื่องมือที่สร้างมาเพื่อพิสูจน์
ผลิตภัณฑ์** ซึ่งเป็นหลุมที่ไม่มีพื้น เพราะ harness ที่รันบนเครื่องเดียวกับผู้โจมตี
ย่อมถูกหลอกได้เสมอ กติกาหยุดถูกเขียนเข้า `skills/checkpoint-ril` §3 แล้ว

## ขอบเขตของ runner ที่ต้องอ่านคู่กับตัวเลข "8 checks"

`scripts/workerd-signer-check.mjs` ยืนยันได้ว่าคำตอบมาจาก worker ที่มันสตาร์ทเอง
(nonce เดินทางเข้าไปทาง `--var` ไม่ใช่ทาง URL ผู้ครองพอร์ตจึงไม่มีอะไรให้ลอก),
ว่า child ยังมีชีวิตและไม่ได้ตายด้วยสัญญาณ, ว่า HTTP เป็น 200, ว่าชื่อ check ตรง
รายการครบถ้วนและไม่ซ้ำ, และว่าทุก check ผ่าน

**ข้ออ้างที่เคยผิดและแก้แล้ว:** รอบห้าหักล้างประโยคที่ว่า "สิ่งที่ตัดผู้ครองพอร์ตออกจริง
คือ liveness" — reviewer ครองพอร์ตไว้ก่อน อ่าน nonce จาก `ps` (มันเป็น argument ของ
โปรเซส ไม่ใช่ความลับ) แล้วตอบครบแปดข้อ**ก่อน**ที่ wrangler จะ bind ไม่สำเร็จ runner
จึงออก 0 ทั้งที่ workerd ไม่เคยรัน

**ชั้นที่ 1 — หลักฐานการ bind จากปาก wrangler เอง.** runner ไม่ยิง fetch จนกว่าจะเห็น
บรรทัด `Ready on http://…:61987` ยิงพิสูจน์ทั้งสองทางแล้ว: พอร์ตว่าง wrangler พิมพ์
บรรทัดนั้น · พอร์ตถูกครอง มันตายด้วย `Address already in use` โดย**ไม่ fallback
ไปพอร์ตอื่น**

**ชั้นที่ 2 — ผูกคำตอบเข้ากับตัว process.** รอบหกชี้ว่าชั้นแรกยังไม่พอ เพราะ readiness
พิสูจน์แค่ว่า **เคย** ถือพอร์ต ณ ขณะหนึ่ง ไม่ได้ผูกคำตอบที่ได้ทีหลังเข้ากับ process นั้น
reviewer จึงรอ bind สำเร็จ → ฆ่าเฉพาะ process ที่ listen → ยึดพอร์ตต่อทันที → อ่าน
nonce จาก `ps` แล้วตอบครบแปดข้อ ผลคือ runner ออก 0 อีกครั้ง

ตอนนี้ก่อนยิงและหลังได้คำตอบ runner ตรวจว่า **PID ที่ listen พอร์ตนี้เป็นลูกหลานของ
child ที่เราสตาร์ทเอง และเป็นชุดเดียวกันทั้งสองครั้ง** ผู้ยึดพอร์ตไม่ใช่ลูกหลานของเรา
จึงตกด่านนี้ไม่ว่าจะรู้ nonce หรือไม่ — ตัวตนของ process ปลอมไม่ได้ด้วยการรู้ค่า

การโจมตีทั้งสองแบบเป็นเคสถาวรใน `workerd-runner-attacks.mjs` แล้ว และ mutation
ยืนยันว่าแต่ละชั้นคือตัวที่ฆ่าแบบของมันจริง: ตัด readiness ออก การครองพอร์ตก่อน bind
**SURVIVED** · ตัด ownership ออก การยึดพอร์ตหลัง bind **SURVIVED** (ทั้งคู่ exit 0)

สิ่งที่มัน **ไม่** ให้: ความคุ้มกันจากโค้ดที่รันอยู่ในโปรเซสของมันเองแล้ว ใครที่ preload
โค้ดเข้ามาได้จะปลอม `spawn` และ `fetch` พร้อมกันแล้วป้อนคำตอบที่ผ่านทุกด่านได้ทั้งหมด
นี่ปิดในโปรเซสไม่ได้ตามนิยาม — ผู้ที่รันโค้ดในโปรเซสได้คือเจ้าของโปรเซส ความน่าเชื่อถือ
ของหลักฐานชุดนี้จึงอยู่ที่ "ใครเป็นคนสั่งรัน" ไม่ใช่ที่ตัวสคริปต์ เป็นข้อจำกัดประเภทเดียวกับ
ที่ฝั่ง director บันทึกไว้เรื่อง preload ใน archive-transfer CLI

## สิ่งที่ยังไม่ปิด

1. **หลักฐาน conformance ค้างอยู่คนละ revision** —
   `reports/conformance/identity-control/academy-identity-local-evidence.json`
   ยังชี้ไปรายงาน 2026-08-11 และ freeze manifest ของมัน
   `generate-identity-control-conformance.mjs` pin `ACADEMY_SOURCE_REVISION`
   และ `IDENTITY_SOURCE_REVISION` ไว้ที่ commit เก่ากว่า HEAD ทั้งคู่ (ค้างมาก่อน
   การเปลี่ยน contract นี้) และหยุดที่
   `Identity Control contract digest mismatch: docs/integration/consumer-conformance-kit.md`

   การเลื่อน digest ชุดนั้นเท่ากับ **อ้างว่ามีการรีวิว Academy กับ Identity contract
   ชุดใหม่แล้ว** ซึ่งยังไม่มีจริง จึงไม่แตะ ต้องมีรอบรีวิวข้าม repo ก่อน แล้วค่อย
   regenerate ทั้งชุด

2. **รอบหก `C0/H0/M2/L0` — in-bound ทั้งสองปิดแล้ว รอ delta re-review รอบเจ็ด**

   - **ยึดพอร์ตหลัง bind** — ปิดด้วยการผูกคำตอบเข้ากับ PID ที่ listen (ดูด้านบน)
   - **Sandbox ทิ้ง snapshot หลัง restore ล้มเหลวชั่วคราว** — ของเดิมล้างบัญชีทิ้งทุกกรณี
     พอ `restore()` ติด `EACCES` ชั่วคราว ไบต์เดิมหายถาวร แม้ permission กลับมาแล้ว
     ก็กู้ไม่ได้ เป็นการทำข้อมูลหายโดยไม่ต้องมีผู้โจมตี ตอนนี้ลบออกจากบัญชีเฉพาะสิ่งที่
     **คืนสำเร็จจริง** · ธง "คืนแล้ว" ตั้งได้ต่อเมื่อไม่มีอะไรค้าง · เพิ่ม `pending()`
     ให้ผู้เรียกตัดสินใจ และ exit handler ลองซ้ำหนึ่งครั้งเผื่อสภาพชั่วคราว
     ทำซ้ำได้ตรงตาม POC: restore แรกล้มและเก็บไบต์เดิมไว้ → คืน permission →
     เรียกซ้ำแล้วได้ข้อมูลเดิมกลับมา

   *(รอบห้า)* in-bound ปิดครบแล้ว

   - **M2 runner ถูกปลอมผลได้** — ปิดด้วย readiness proof จาก wrangler (ดูด้านบน)
   - **M3 Sandbox ทำลายข้อมูลได้** — รีวิวให้ POC มา 6 แบบ ทั้งหมดมาจากรากสามอย่าง
     และแก้ที่รากทั้งสาม: containment ใช้ `realpath` ของบรรพบุรุษที่มีอยู่จริงแทนการ
     เทียบสตริง (ปิด parent symlink) · สร้างไฟล์ด้วย `O_CREAT|O_EXCL` แทน
     `existsSync` แล้วค่อยเขียน (ปิด dangling symlink และช่องว่าง TOCTOU) · ผูก
     ความเป็นเจ้าของกับ `dev`/`ino` แทนชื่อพาธ (ปิดการลบของที่ถูกสลับ และการเขียนทับ
     งานที่คนอื่นเพิ่งแก้) · อ่าน/เขียนด้วย `O_NOFOLLOW` · ธง "คืนแล้ว" ตั้งหลังลูปจบ
     และแต่ละรายการมี try ของตัวเอง · สิ่งที่คืนไม่ได้ออกทาง `problems()` ให้ผู้เรียก
     รายงานและออกด้วยรหัสที่ไม่ใช่ 0 แทนที่จะเงียบ
   - **M1 ทางหลบ `.js` → `.ts`** — resolver รองรับการแทนนามสกุลแบบที่
     `moduleResolution: bundler` ทำให้ ทางนี้ต่างจากทางหลบอื่นตรงที่ refactor ปกติ
     สร้างขึ้นเองได้โดยไม่ต้องตั้งใจ

   *(รอบสี่)* ปิดครบสามข้อแล้ว

   - **M-02 ด่าน not-wired หลบได้ 5 ทางใหม่** — ทางที่ร้ายที่สุดคือ
     `src/instrumentation.ts` ซึ่ง reviewer build จริงแล้วโค้ดจากโมดูลต้องห้าม
     ไปโผล่ใน `.open-next/middleware/handler.mjs` ขณะที่ด่านยังเขียว
     รากปัญหาคือรายการทางเข้าและ resolver เป็นของที่ hardcode ไว้เอง ไม่ได้อ่านจาก
     สิ่งที่ toolchain ใช้จริง ตอนนี้อ่าน `compilerOptions.paths` ทุก alias, รองรับ
     self-import ผ่าน `exports`, `realpath` ทุกพาธก่อนเทียบ, เพิ่มทางเข้า
     `instrumentation*`, `src/pages`, `next.config.ts`, `open-next.config.ts`
     และอ่าน wrangler `main` หลังตัดคอมเมนต์เท่านั้น
     **ของที่ไม่รู้มาก่อน:** รีโปนี้มี worker ที่ deploy จริงสองตัว ไม่ใช่ตัวเดียว
     (หน้าร้าน + `ops/academy-retention-worker`) เพิ่ม self-check บังคับไว้แล้ว
     ยิงทางหลบ 10 ทางถูกจับครบ
   - **M-01 runner อ่าน config ไม่ตรง wrangler** — parser ที่เขียนเทียบเคียงจบ
     คอมเมนต์บรรทัดที่ `\n` อย่างเดียว ส่วน wrangler จบที่ `\r` ด้วย เปลี่ยนมาใช้
     `unstable_readConfig` ของ wrangler เอง ปัญหาทั้งชั้นหายไป
     (รอบก่อนผมสรุปผิดว่าไม่มี API นี้ เพราะดูแค่ `exports` ใน package.json)
   - **M-04 สคริปต์ adversarial ลบไฟล์คนอื่นได้และรายงานผลที่ไม่ได้ยิง** — สร้าง
     `scripts/adversarial/sandbox.mjs` บังคับว่าลบได้เฉพาะสิ่งที่รอบนี้สร้างเอง
     และคืนสภาพแม้ถูกสัญญาณ · squatter ต้องบอกเองว่า listen สำเร็จก่อนถึงจะนับผล
     · แยกรหัสออก `2` สำหรับ "ยิงไม่ออก" ไม่ให้กลืนเป็น "ผ่าน"

   *(บันทึกของรอบสาม)* ยังไม่มี delta re-review บนการแก้รอบสาม — รอบสามคืน `C0/H0/M3/L1 — REJECT`
   โดยชี้ว่า runner ยังถูกหลอกได้ (nonce อยู่ใน query, ไม่ตรวจ `signalCode`,
   เทียบชื่อ check ด้วย `join()` โดยไม่นับสมาชิก, `fetch` ไม่มี deadline, parser JSONC
   ต่างจาก wrangler สามจุด), ด่าน not-wired หลบได้สี่ทาง, และ freeze manifest
   ไม่ครอบไฟล์ที่ checkpoint เปลี่ยนจริง ทั้งหมดแก้แล้วและมีสคริปต์ยืนยัน
   แต่ยังไม่ผ่านสายตาอิสระอีกรอบ

3. **`REQUIRED_CHECKS` ต้องแก้ด้วยมือ** — เพิ่ม check ใน worker แล้วลืมอัปเดตรายการ
   จะทำให้เลน fail ตั้งใจให้เป็นแบบนั้น ลืมแล้ว fail ดีกว่าลืมแล้วเงียบ

4. **การคืน `importKey` หลัง patch ใน worker** — ใช้ `Reflect.deleteProperty` ซึ่งคืน
   สภาพเดิมได้แม่นเฉพาะเมื่อ method เดิมมาจาก prototype ถ้า runtime ไหนมี own
   descriptor จะเสีย descriptor นั้นไป ยังไม่ได้พิสูจน์บน workerd ปัจจุบันว่าเป็นแบบใด
   บันทึกไว้เป็นหนี้ ไม่ใช่ finding เพราะ patch อยู่ในเลนทดสอบ ไม่ใช่โค้ด production

5. **ยังไม่ต่อเข้า production** — บังคับด้วยด่าน
   `tests/unit/identity-key-distribution-not-wired.test.ts` ซึ่งตอนนี้เดิน
   **กราฟการเรียกจริง** จากทางเข้า production (ทุกไฟล์ใต้ `src/app`, `middleware.ts`,
   `main` ของทุก wrangler config ที่ไม่ได้อยู่ใต้ `tests/`) ตามทั้ง import, re-export,
   dynamic import ที่เป็น string literal และ `require` แทนการค้น substring แบบเดิม
   ที่รีวิวอิสระหลบได้สี่ทาง

`enabled=false`, `releaseApproval=false`, `runtimeWired=false`, production NO-GO
คงเดิม รายงานนี้ไม่ให้ authority ใดๆ กับ runtime, deploy หรือ release
