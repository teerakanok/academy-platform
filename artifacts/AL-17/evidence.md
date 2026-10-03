# AL-17 Step 2 evidence (2026-10-03)

สถานะ: ภาษาไทยของคอร์ส Linux พื้นฐาน และ Git (38 บท + course.json 2 ไฟล์) เกลาตาม style guide ที่ founder อนุมัติแล้ว
เหลือรีวิวความอ่านง่ายโดย provider อื่น ซึ่ง worker นี้ทำเองไม่ได้

- Founder decision: issue e1439af3 (inbox-2026-10-03T13-36-35-532Z-rlsa) "โอเค เกลาแบบนี้ทั้งสองคอร์ส"; code comments + try.steps untouched.
- Base: 20bf386 (branch merged with main 13fba62, includes AL-16 audience + AL-18 commit-count fixes).
- Scope: 40 files, all under academy-web/content/courses/{basic-os-linux,git-essentials}/locales/th/. No EN file, no code, no src change.
- Guard `artifacts/AL-17/check-th-edit.py 20bf386 <40 files>`: Source PASS — 0 FAIL (checkpoint, videoCueQuestions, code lines, try.steps, kind/tone/src, nodeId, JSON shape byte-identical to base). Output in check-output.txt.
  1 WARN = false positive: init-and-commit blocks[12].expected token "staging" is present as "staging:" (sample-approved text).
- nodeTitles in both TH course.json synced to 4 changed lesson titles (sed-and-awk, rebase-vs-merge, working-with-agents, github-actions-ci).
- Sample lessons (6) + git audience: applied the approved "หลัง" text verbatim; git audience kept AL-16 wording (no hidden-course reference), light polish only.
- Content registry: `node scripts/generate-content-registry.mjs` → no diff in registry.generated.ts. Source PASS.
- Unit suite: `npx vitest run --project unit` → 169 files, 3222 passed, 2 skipped, 0 failed. Native PASS (local, node 25).
- `npm run verify:content-fairness`: basic-os-linux/git-essentials over the 40% longest-answer ceiling in BOTH en and th — pre-existing, checkpoint content is byte-identical to base (out of scope; card forbids checkpoint edits).
- Second-provider Thai readability review: NOT_RUN — needs a non-Claude reviewer; requested from host.

Notes for reviewer/host backlog:
- "สายท่อ" now "pipeline" in prose; remains only in pipes-and-logs checkpoint/video cue text and 2 code comments (frozen by scope).
- pipes-and-logs image alt says "คำสั่งสี่ตัว" but lists five commands (fact issue, EN to compare; left unchanged).
- processes-and-packages nodeTitle vs lesson title differ only by a space (pre-existing).
- Fairness ceiling failures for both launch courses (en+th) are a separate assessment card candidate.

## Revision 2 evidence (2026-10-03)

สถานะ: แก้เฉพาะ two must-fix findings จาก `REV-AL-17-ca5b4679-r1` แล้ว

- `status-diff-log`: objective และ heading เปลี่ยนจาก "ก่อนคุณมาเกิดอะไรขึ้นบ้าง" เป็นภาษาไทยธรรมชาติตามที่ reviewer แนะนำ
- `gitignore`: ตัด connector "เสียอีก" ออกโดยคงความหมายเดิม
- Diff จาก `ca5b4679` เปลี่ยนเฉพาะ 3 editable prose strings ใน 2 ไฟล์นี้; ไม่แตะ optional polish เพื่อไม่ขยายสโคป
- Guard rerun: `artifacts/AL-17/check-th-edit.py 20bf386 <40 Thai files>` — Source PASS, checked 40 files / 0 failures; 1 documented WARN สำหรับ `staging:` (`init-and-commit.blocks[12].expected`)
- Registry rerun: `node scripts/generate-content-registry.mjs` — Source PASS, no diff in `src/lib/content-registry.generated.ts`
- Unit rerun: `npm run test:unit` on Node 25.5.0 — Native PASS, 169 files passed, 3222 passed / 2 skipped / 0 failed (`unit-r2.txt`)
- Updated second-provider Thai readability review: NOT_RUN — awaiting the next independent review after this revision
