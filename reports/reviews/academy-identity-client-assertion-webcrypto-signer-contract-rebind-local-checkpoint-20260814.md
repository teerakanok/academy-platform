# Academy Identity Client-Assertion Web Crypto Signer — Contract Rebind Local Checkpoint

**Date:** 2026-08-14
**Status:** REJECT → remediated; รอบสุดท้ายยังไม่ผ่าน RIL (ดู "สิ่งที่ยังไม่ปิด")
**Production:** NO-GO
**Supersedes:** `academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md`

รายงาน 2026-08-11 ยังคงถูกต้องในฐานะบันทึกของวันนั้น และไม่ถูกแก้ไข แต่มัน
บรรยาย contract ที่เลิกใช้แล้ว: signer ไม่รับ `CryptoKey` จากผู้เรียกอีกต่อไป

## ทำไม contract ถึงเปลี่ยน

รีวิวอิสระ (codex `gpt-5.6-sol`, effort xhigh) ตีกลับ `C0/H2/M2/L0` การแก้ที่ใช้
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
| unit ทั้ง repo | 1324 ข้อผ่าน (116 ไฟล์) |
| เลน signer | 42 ข้อผ่าน บนทั้ง node 24.18.0 (engine ที่ประกาศ) และ 25.5.0 |
| `tsc --noEmit` / eslint | สะอาด |
| `npm run test:workerd-signer` | 8 ข้อผ่านบน workerd จริง ที่ compatibility ของแอป |

หลักฐาน H2 ตรงจาก runtime: `prototype type getter: absent; structuredClone:
throws DataCloneError`

mutation ที่ยิงแล้วตายครบ

- signer: `extractable=true`, เพิ่ม `'verify'` ใน usages, ตัดกติกาสมาชิก JWK ครบห้า,
  รับ object แทน text, ผ่อน regex พิกัด, เรียก `importKey` โดยไม่ผูก receiver,
  ตัดการเทียบไบต์ canonical, ตัด base64url canonicality, ยอมช่องว่างรอบข้อความ,
  ยอมลำดับสมาชิกใดก็ได้
- เลน workerd: mutate source จริงเป็น `extractable: true` แล้วเลนนี้ fail ตรงจุด
  (`FAIL signer-imports-non-extractable-sign-only: Error: extractable true`)
- runner: เลื่อน compatibility แล้วทิ้งค่าเก่าไว้ในคอมเมนต์ / worker ลบ check ทิ้ง /
  service อื่นครองพอร์ตแล้วตอบ `ok:true` — ถูกปฏิเสธทั้งสาม

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

2. **ยังไม่มีรอบรีวิวอิสระบน contract ล่าสุด** — รายงานนี้บันทึกการแก้ตามรีวิว
   รอบสอง (`C0/H0/M5/L1 — REJECT`) แต่การแก้ M4/M2/M1 ยังไม่ผ่านสายตาอิสระ

3. **ยังไม่ต่อเข้า production** — บังคับด้วยด่าน
   `tests/unit/identity-key-distribution-not-wired.test.ts` ซึ่งพิสูจน์แล้วว่ากัดจริง
   ด้วย mutation สามตัว

`enabled=false`, `releaseApproval=false`, `runtimeWired=false`, production NO-GO
คงเดิม รายงานนี้ไม่ให้ authority ใดๆ กับ runtime, deploy หรือ release
