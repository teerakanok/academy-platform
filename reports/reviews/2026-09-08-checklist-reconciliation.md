# Independent checklist reconciliation review — 2026-09-08

Verdict: PASS — อนุมัติ disposition ของสามแถวที่แก้; ไม่มี material unsupported claim ในขอบเขตนี้
Reviewer เป็น independent evidence lane; root เป็นผู้แก้ checklist และไม่ได้เป็นผู้อนุมัติรายเดียว
ขอบเขต: Crux SEC007/008 และ Academy SEC013; exact dirty diff มีเพียง2+1table rows ในสองไฟล์ที่ระบุ

## Frozen files (SHA256)
- `/private/tmp/crux-integrated-release-cde63a58/reports/security/2026-09-05-security-review-checklist.md`: `42d2589ed81f03576b074b380074344ec0705b4a6969a22a7673418f761cbe90`
- `/private/tmp/academy-csp-cde63a58/reports/security/2026-09-05-security-review-checklist.md`: `4f5664e73d71b1fbc8e5d8af994481ae0d94b1a6878022fed2ae908c8d54129a`

## Crux SEC007/008 — PASS for DEPLOYED, live behavior remains OPEN
- เกณฑ์เดิม: concluded-cohort mutation ต้องปฏิเสธผ่าน actual Drizzle authorization; draft/withdrawn outline ต้องไม่เปิด quiz/CTF/lab (original finding146/161; revised table734/735)
- `crux-cohort-review-scope-r2.json` ตรง accepted base9731200ทั้ง8/8; deployed0a4fตรง6/8 โดยสองไฟล์ที่เปลี่ยนต่อคือ `quizStore.drizzle.ts` และ `repository.drizzle.ts`
- อ่าน diff9731200→0a4fของสองไฟล์: เป็น accepted SEC008 visibility additions; mutable-cohort/instructor lock และ quiz import transaction guard เดิมไม่ได้ถูกถอด
- Deployed `0a4f5e02d54f4d89db08572b23ac73bda080a64a` ตรง final SEC008 scope r2 ทั้ง22/22 files โดย `git show <release>:<path>` + SHA256
- หลักฐาน source: cohort production-path independentr3 PASS/actualPG11/11; visibility independentr2 PASS/actualPG50/50 พร้อม withdrawal negativeและpositive controls ไม่ถือ skipped broad integrationsเป็นpassed
- อ่าน `reports/verification/2026-09-08-integrated-production/crux-0a4-cp-launch-r1.json` และ `crux-0a4-cp-monitor-r2.json`: actual SHA-taking launch0a4f; exit0/current0a4f/image `sha256:17f32673e5ce69b1fe153eb3801886c08b91e1e7c8c3ef3bbbb36be958792738`/healthy ที่03:00:15UTC
- แถวใหม่กล่าวเฉพาะ deploymentที่พิสูจน์แล้ว; concluded-cohort denial และ enrolled-learner publication/withdrawal journey ยังคงOPEN จึงไม่ใช้healthyปิด authorization acceptance

## Academy SEC013 — PASS for CLOSED: ORIGINAL CSP CRITERION VERIFIED
- เกณฑ์เดิม checklist229–240 คือ production script-src unsafe-inline และ inline theme/JSON-LD ที่ไม่มี nonce; ไม่ใช่การรับรองทุก authenticated learner/media journey
- `academy-csp-review-scope-r2.json` ตรง deployed source `fe4220a1850d277d542cd5e30f38360776df4b15` ทั้ง14/14 files โดย `git show` + SHA256; independent source r1 และ duplicate-policy correction r2 PASS
- อ่าน middleware64–87 ของ exact release: crypto random32bytes/response nonce, ทิ้งcaller nonce/CSP, script-src self+nonce+strict-dynamic; อ่าน ThemeBootstrapScriptที่ใช้nonce และ source reviewsที่ผูกJSON-LD/static/error fallback
- `style-src unsafe-inline` ยังอยู่และอยู่นอก original script-src criterion; ไม่ได้อ้างว่าไม่มีunsafe-inlineทุกdirective
- อ่าน actual `2026-09-08-csp-root-acceptance/academy-csp-workerd-render-r10.json`: fresh HTML2responses,22matching-nonce scripts/response, policyCount1, private/no-store, fallback200/404, parser insertion blocked และ4viewport/theme captures pass
- อ่าน actual `2026-09-08-active-user-shape/academy-shape-browser-production-r4.json`: checked04:52:14.218UTC, version_override=false,22/22 host/CSP checks pass และdesktop/mobile sign-in captures pass
- อ่าน separate `academy-shape-production-readback-r1.json`: Worker `3830694b-bca9-4035-8bd0-e853ee6dd1fa`100%, deployment `3ecc5f51-2c30-4ce1-86c9-cdd2fb076b1a`, exit0 ที่04:52:15UTC
- Reviewerดูproduction sign-in PNG desktop1440x900/mobile390x844ทั้ง2ภาพจริง: rendered content/controlsปกติ ไม่มีblank-page regression; ภาพไม่ถูกใช้แทนCSP enforcement proof
- แถว463ปิดเฉพาะ original CSP issue โดยsource→actual Worker→production evidenceครบ; authenticated media/learner journeysยังแยกเปิดไว้ถูกต้อง

## Verification boundary
- `rtk proxy git diff --check -- reports/security/2026-09-05-security-review-checklist.md` exit0ทั้งสองrepo; frozen2file hashesตรวจซ้ำก่อนบันทึก
- ไม่แก้product/checklist files, ไม่เรียกlive/provider, ไม่ทำbroad audit, ไม่รันapp tests/buildซ้ำ; existing full-gate evidenceไม่ได้ถูกขยายเป็นclaimใหม่
