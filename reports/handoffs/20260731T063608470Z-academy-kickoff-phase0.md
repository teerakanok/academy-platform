# Session Handoff: academy

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260731T063608470Z-academy-kickoff-phase0",
  "created_at": "2026-07-31T06:36:08.470Z",
  "project": "academy",
  "objective": "Kickoff CyberSkills Academy: นิยาม product + pricing + implementation ล็อกครบ, Phase 0 kicked off, repo clean พร้อมเริ่ม build",
  "state": "ready",
  "repo": {
    "remote": "github.com/teerakanok/academy-platform",
    "branch": "main",
    "base_head": "a26e0edb7cc3b00450ac17145b751ec7a34f1925"
  },
  "delivery": "pushed",
  "worktree": {
    "mode": "clean",
    "entries": []
  },
  "scope": {
    "allowed": [
      "Lane A: อ่าน Crucible cas-005 archive แบบ read-only เพื่อ audit disputes",
      "เขียน dispute-audit report + founder decision brief ลง reports/reviews/ ของ repo นี้",
      "อัปเดต plans/active_plan.md และ plans/completed_log.md ของ repo นี้",
      "commit ใน repo นี้เมื่องานมี verification ครบ"
    ],
    "forbidden": [
      "ห้ามแจกจ่าย/publish CAS-005 bank ก่อน disputes ถูกปิดโดย founder",
      "ห้ามแก้ answer key ใดๆ โดยไม่มี founder decision เป็นลายลักษณ์อักษร",
      "ห้ามแก้ไฟล์ใน Crucible repo (read-only สำหรับ audit; การแก้ bank ทำใน Crucible session แยกหลัง founder เคาะ)",
      "ห้าม subscribe paid platform / จ่ายเงิน service ใหม่",
      "ห้ามแตะ dirty files ใน director repo (เป็นของ workstream อื่น) และห้าม push director branch (มี pre-push guard ของ crux lane รออยู่)",
      "ห้ามลบ video/academy-promo-video-short.mp4 โดยไม่มี vault migration + receipt"
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "plans/completed_log.md",
    "README.md"
  ],
  "owner_decisions": [
    "Product = personalized + interactive + lab-gated learning (skip ตาม assessment + prove-it lab, career-goal mapping, cheatsheet ทุกการข้าม)",
    "Fundamentals แจกฟรี (ไม่ขายเป็น SKU เดี่ยว); premium/cert ซื้อขาดต่อ edition",
    "Access = 3 ปีเต็ม เลขเดียวทั้ง catalog (final; เคยพิจารณา 2+auto-extend แล้วเลือกความง่าย)",
    "ระบบแต้ม lab: แถมพอจบ+ซ้ำ 1-2 รอบ, top-up ~ต้นทุน, คืนแต้มเมื่อทำจบ; upgrade = pro-rata + floor ศิษย์เก่า + free window",
    "Currency working name = credit (founder ไม่ชอบ ต้อง rename ก่อน public launch)",
    "Implementation = DIY build-the-core-buy-the-plumbing (ไม่ซื้อ hosted LMS)",
    "Auth = single account ทุก product (Crux/STAR/Academy/Forge) — ต้องยก ADR ระดับ ecosystem ก่อน build auth จริง",
    "Phase 0 kicked off 2026-07-31: Lane A dispute audit เป็น critical path; build จริงเริ่ม session หน้า"
  ],
  "completed": [
    "บันทึกนิยาม product + โมเดลราคา/สิทธิ์เข้าถึง/ระบบแต้ม/upgrade ลง active_plan (draft ล็อก 2026-07-31)",
    "ปิด decision: access 3 ปี, currency working name, DIY implementation, single-account direction — ลง completed_log ครบ",
    "Kickoff Phase 0 พร้อม work order 3 lanes (A=dispute audit, B=channel inventory, C=build slice publish-gated)",
    "Verify + แก้ path CAS-005 evidence ที่ rot (ของจริงอยู่ crucible courses/.../archive/legacy-output; assessments/ ใหม่ยังว่าง)",
    "Repo hygiene: .gitignore golden rule (+.owner-update/), README จริง; push main sync origin",
    "Director repo: bump academy pointer (pathspec commit, ไม่ push ตาม guard ของ lane อื่น)"
  ],
  "changed_files": [
    {
      "path": "plans/active_plan.md",
      "reason": "นิยาม product + pricing + implementation direction + auth + Phase 0 kickoff lanes + แก้ path evidence"
    },
    {
      "path": "plans/completed_log.md",
      "reason": "entry 2026-07-31 สองก้อน: concept/pricing model + implementation/auth direction"
    },
    {
      "path": "AGENTS.md",
      "reason": "แก้ path หลักฐาน CAS-005 ที่ rot ให้ชี้ archive/legacy-output ปัจจุบัน"
    },
    {
      "path": "README.md",
      "reason": "เปลี่ยนจาก placeholder เป็น readme จริง (read order + สถานะ)"
    },
    {
      "path": ".gitignore",
      "reason": "golden rule: .owner-update/, .env, keys, node_modules, generated dirs"
    }
  ],
  "remaining_work": [
    "Lane A (next action): audit disputes → founder decision brief → founder เคาะ → แก้ keys ใน Crucible session",
    "Lane B: channel inventory ให้ founder เลือก distribution channel",
    "Lane C: Phase 0 slice (placement-test framing + free sample + lead capture email-identity) — publish gated ด้วย Lane A",
    "ยก ADR ระดับ ecosystem: single account 4 products",
    "Vault migration สำหรับ video/academy-promo-video-short.mp4 (7.7MB binary tracked ใน git, ไม่พบ receipt)",
    "Rename currency ก่อน public launch; calibrate ตัวเลขแต้ม/ส่วนลดจาก pilot; ตรวจกฎหมาย prepaid credit ไทย; นิยามเส้นแบ่ง Academy/STAR lab"
  ],
  "risks": [
    "สถานะ 11 founder-level disputes ไม่แน่ชัด: v2-build review มี rewrite pipeline (iter1 610 items/75 flagged → batch ท้าย flagged 0) แต่ไม่พบบันทึกปิด disputes — Lane A ต้อง verify ก่อนเชื่อ",
    "CAS-005 bank อยู่ใน crucible archive/legacy-output ขณะที่โครงใหม่ assessments/ ว่าง — source of truth กำกวม ต้อง confirm ใน Lane A",
    "Distribution ยังเป็น binding constraint ที่ unvalidated — vision ห้ามใช้เป็นเหตุผลข้าม Phase 0 gate"
  ],
  "next": {
    "cwd": ".",
    "summary": "Lane A (critical path): audit สถานะ CAS-005 answer-key disputes เทียบ v2-build ทีละข้อ แล้วสร้าง founder decision brief",
    "first_step": "อ่าน review evidence ใน crucible archive: findings-academic-iter1.json (75 flags), rewritten/, qa/practice-review-*.md แล้ว enumerate ว่า flag ไหนถูก rewrite ปิดแล้ว flag ไหนยังเปิด โดยเฉพาะ 11 founder-level disputes (รวม PBQ-010 NIST 800-61 eradication-before-recovery)",
    "commands": [
      "ls ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/review/",
      "ls ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/rewritten/",
      "grep -l PBQ-010 ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/rewritten/pbqs/*.json"
    ],
    "acceptance": [
      "มี audit report + founder decision brief ที่ reports/reviews/cas005-dispute-audit-2026-XX-XX.md",
      "ทุก dispute ที่ยังเปิด: มี id, คำถาม, key ปัจจุบัน, ข้อโต้แย้ง, evidence จาก primary source, และ recommendation ต่อข้อ",
      "จำนวน dispute ที่เหลือถูก verify จากไฟล์จริง ไม่ใช่จาก memory/plan เดิม",
      "ยังไม่มี answer key ใดถูกแก้ (รอ founder เคาะ)"
    ],
    "execution_boundary": "local-reversible"
  },
  "blocker": null,
  "verification": [
    {
      "command": "git status --short --branch (academy)",
      "result": "## main...origin/main — clean, sync origin (observed 2026-07-31)"
    },
    {
      "command": "bash scripts/validate-governance.sh (director)",
      "result": "pass 9 / fail 0 — Governance validation passed"
    },
    {
      "command": "git log origin/main..HEAD -p | grep -inE secrets-pattern",
      "result": "no matches ก่อน push (secret scan ผ่าน)"
    },
    {
      "command": "git diff --check (academy)",
      "result": "ผ่าน ไม่มี whitespace error"
    }
  ],
  "cleanup": {
    "processes": "ไม่มี process ค้าง — session นี้ไม่ได้ start dev server หรือ background lane ใดๆ",
    "artifacts": "ไม่มี temp artifact ใหม่; .owner-update/ เป็น runtime state ของ publish-owner-update (gitignored แล้ว) — คงไว้ตามเดิม ห้ามลบ"
  }
}
-->

## Objective
Kickoff CyberSkills Academy: นิยาม product + pricing + implementation ล็อกครบ, Phase 0 kicked off, repo clean พร้อมเริ่ม build

## Owner Intent And Decisions
- Decision: Product = personalized + interactive + lab-gated learning (skip ตาม assessment + prove-it lab, career-goal mapping, cheatsheet ทุกการข้าม)
- Decision: Fundamentals แจกฟรี (ไม่ขายเป็น SKU เดี่ยว); premium/cert ซื้อขาดต่อ edition
- Decision: Access = 3 ปีเต็ม เลขเดียวทั้ง catalog (final; เคยพิจารณา 2+auto-extend แล้วเลือกความง่าย)
- Decision: ระบบแต้ม lab: แถมพอจบ+ซ้ำ 1-2 รอบ, top-up ~ต้นทุน, คืนแต้มเมื่อทำจบ; upgrade = pro-rata + floor ศิษย์เก่า + free window
- Decision: Currency working name = credit (founder ไม่ชอบ ต้อง rename ก่อน public launch)
- Decision: Implementation = DIY build-the-core-buy-the-plumbing (ไม่ซื้อ hosted LMS)
- Decision: Auth = single account ทุก product (Crux/STAR/Academy/Forge) — ต้องยก ADR ระดับ ecosystem ก่อน build auth จริง
- Decision: Phase 0 kicked off 2026-07-31: Lane A dispute audit เป็น critical path; build จริงเริ่ม session หน้า
- Allowed scope: Lane A: อ่าน Crucible cas-005 archive แบบ read-only เพื่อ audit disputes
- Allowed scope: เขียน dispute-audit report + founder decision brief ลง reports/reviews/ ของ repo นี้
- Allowed scope: อัปเดต plans/active_plan.md และ plans/completed_log.md ของ repo นี้
- Allowed scope: commit ใน repo นี้เมื่องานมี verification ครบ

## Repository State
- State: ready
- Branch: main
- Baseline: a26e0edb7cc3b00450ac17145b751ec7a34f1925
- Delivery: pushed

## Completed This Session
- บันทึกนิยาม product + โมเดลราคา/สิทธิ์เข้าถึง/ระบบแต้ม/upgrade ลง active_plan (draft ล็อก 2026-07-31)
- ปิด decision: access 3 ปี, currency working name, DIY implementation, single-account direction — ลง completed_log ครบ
- Kickoff Phase 0 พร้อม work order 3 lanes (A=dispute audit, B=channel inventory, C=build slice publish-gated)
- Verify + แก้ path CAS-005 evidence ที่ rot (ของจริงอยู่ crucible courses/.../archive/legacy-output; assessments/ ใหม่ยังว่าง)
- Repo hygiene: .gitignore golden rule (+.owner-update/), README จริง; push main sync origin
- Director repo: bump academy pointer (pathspec commit, ไม่ push ตาม guard ของ lane อื่น)

## Changed Files
- plans/active_plan.md: นิยาม product + pricing + implementation direction + auth + Phase 0 kickoff lanes + แก้ path evidence
- plans/completed_log.md: entry 2026-07-31 สองก้อน: concept/pricing model + implementation/auth direction
- AGENTS.md: แก้ path หลักฐาน CAS-005 ที่ rot ให้ชี้ archive/legacy-output ปัจจุบัน
- README.md: เปลี่ยนจาก placeholder เป็น readme จริง (read order + สถานะ)
- .gitignore: golden rule: .owner-update/, .env, keys, node_modules, generated dirs

## Verification
- git status --short --branch (academy): ## main...origin/main — clean, sync origin (observed 2026-07-31)
- bash scripts/validate-governance.sh (director): pass 9 / fail 0 — Governance validation passed
- git log origin/main..HEAD -p | grep -inE secrets-pattern: no matches ก่อน push (secret scan ผ่าน)
- git diff --check (academy): ผ่าน ไม่มี whitespace error

## Dirty State
Expected worktree: clean.

ไม่มี dirty entry ใน academy repo. Dirty ทั้งหมดใน director repo เป็นของ workstream อื่น (user/other-session) — ดู Do Not Touch

## Cleanup State
- Processes: ไม่มี process ค้าง — session นี้ไม่ได้ start dev server หรือ background lane ใดๆ
- Artifacts: ไม่มี temp artifact ใหม่; .owner-update/ เป็น runtime state ของ publish-owner-update (gitignored แล้ว) — คงไว้ตามเดิม ห้ามลบ

## Remaining Work And Risks
- Remaining: Lane A (next action): audit disputes → founder decision brief → founder เคาะ → แก้ keys ใน Crucible session
- Remaining: Lane B: channel inventory ให้ founder เลือก distribution channel
- Remaining: Lane C: Phase 0 slice (placement-test framing + free sample + lead capture email-identity) — publish gated ด้วย Lane A
- Remaining: ยก ADR ระดับ ecosystem: single account 4 products
- Remaining: Vault migration สำหรับ video/academy-promo-video-short.mp4 (7.7MB binary tracked ใน git, ไม่พบ receipt)
- Remaining: Rename currency ก่อน public launch; calibrate ตัวเลขแต้ม/ส่วนลดจาก pilot; ตรวจกฎหมาย prepaid credit ไทย; นิยามเส้นแบ่ง Academy/STAR lab
- Risk: สถานะ 11 founder-level disputes ไม่แน่ชัด: v2-build review มี rewrite pipeline (iter1 610 items/75 flagged → batch ท้าย flagged 0) แต่ไม่พบบันทึกปิด disputes — Lane A ต้อง verify ก่อนเชื่อ
- Risk: CAS-005 bank อยู่ใน crucible archive/legacy-output ขณะที่โครงใหม่ assessments/ ว่าง — source of truth กำกวม ต้อง confirm ใน Lane A
- Risk: Distribution ยังเป็น binding constraint ที่ unvalidated — vision ห้ามใช้เป็นเหตุผลข้าม Phase 0 gate

No blocker.

## Exact Next Action
Working directory: .

Lane A (critical path): audit สถานะ CAS-005 answer-key disputes เทียบ v2-build ทีละข้อ แล้วสร้าง founder decision brief

First step: อ่าน review evidence ใน crucible archive: findings-academic-iter1.json (75 flags), rewritten/, qa/practice-review-*.md แล้ว enumerate ว่า flag ไหนถูก rewrite ปิดแล้ว flag ไหนยังเปิด โดยเฉพาะ 11 founder-level disputes (รวม PBQ-010 NIST 800-61 eradication-before-recovery)

Commands:
- ls ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/review/
- ls ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/rewritten/
- grep -l PBQ-010 ../../personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests/v2-build/rewritten/pbqs/*.json

Acceptance:
- มี audit report + founder decision brief ที่ reports/reviews/cas005-dispute-audit-2026-XX-XX.md
- ทุก dispute ที่ยังเปิด: มี id, คำถาม, key ปัจจุบัน, ข้อโต้แย้ง, evidence จาก primary source, และ recommendation ต่อข้อ
- จำนวน dispute ที่เหลือถูก verify จากไฟล์จริง ไม่ใช่จาก memory/plan เดิม
- ยังไม่มี answer key ใดถูกแก้ (รอ founder เคาะ)

## Done Definition
Lane A ถือว่าเสร็จเมื่อครบทุกข้อ:
- มี audit report + founder decision brief ที่ reports/reviews/cas005-dispute-audit-2026-XX-XX.md
- ทุก dispute ที่ยังเปิด: มี id, คำถาม, key ปัจจุบัน, ข้อโต้แย้ง, evidence จาก primary source, และ recommendation ต่อข้อ
- จำนวน dispute ที่เหลือถูก verify จากไฟล์จริง ไม่ใช่จาก memory/plan เดิม
- ยังไม่มี answer key ใดถูกแก้ (รอ founder เคาะ)
- plans อัปเดตและ commit แล้วใน repo นี้ โดย founder เคาะได้ทีละข้อโดยไม่ต้องเปิดไฟล์เอง

## Do Not Touch
- ห้ามแจกจ่าย/publish CAS-005 bank ก่อน disputes ถูกปิดโดย founder
- ห้ามแก้ answer key ใดๆ โดยไม่มี founder decision เป็นลายลักษณ์อักษร
- ห้ามแก้ไฟล์ใน Crucible repo (read-only สำหรับ audit; การแก้ bank ทำใน Crucible session แยกหลัง founder เคาะ)
- ห้าม subscribe paid platform / จ่ายเงิน service ใหม่
- ห้ามแตะ dirty files ใน director repo (เป็นของ workstream อื่น) และห้าม push director branch (มี pre-push guard ของ crux lane รออยู่)
- ห้ามลบ video/academy-promo-video-short.mp4 โดยไม่มี vault migration + receipt
