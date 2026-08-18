# Session Handoff: academy-platform

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260818T020235760Z-edge-security-closed",
  "created_at": "2026-08-18T02:02:35.760Z",
  "project": "academy-platform",
  "objective": "เดินหน้า Academy หลังปิด edge-security-hardening: งาน identity-adapter ถัดไปรอ Identity Control ไป live (key custody + distribution + endpoints); ลาน content เป็นของ session อื่นที่กำลังทำอยู่",
  "state": "blocked",
  "repo": {
    "remote": "github.com/teerakanok/academy-platform",
    "branch": "main",
    "base_head": "66449adb36cd26c0643c54df704a4c354666f255"
  },
  "delivery": "local",
  "worktree": {
    "mode": "clean",
    "entries": []
  },
  "scope": {
    "allowed": [
      "งาน local reversible: test, เอกสาร, harness ที่ไม่แตะลาน content",
      "รัน unit suite และ focused security suites"
    ],
    "forbidden": [
      "ลาน content คอร์ส (c-low-level ฯลฯ) — session อื่นกำลังทำอยู่ ห้ามแตะ",
      "เลื่อน identityContractDigests โดยไม่มีรอบรีวิวข้าม repo",
      "production, Cloudflare, DNS, credential, deploy, release โดยไม่มี authorization เฉพาะ"
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "reports/reviews/academy-edge-security-hardening-local-checkpoint-20260817.md"
  ],
  "owner_decisions": [
    "Academy จะมี real-route/browser evidence ไม่ได้จนกว่า Identity key custody + distribution + endpoints จะ live จริง",
    "Adversarial harness debt สองข้อปิดแล้วที่ c22a823 และ run-all lock ที่ cd83b20 — handoff เดิม (20260815) ล้าสมัยแล้ว"
  ],
  "completed": [
    "Commit edge-security-hardening slice ที่ค้างจาก session ก่อน (19 ไฟล์ตาม freeze manifest + report) หลังตรวจซ้ำ: manifest VERIFIED (19 ไฟล์), focused test 15/15; review closure PASS C0/H0/M0/L0",
    "Verification battery: full unit suite 1561/1561 ผ่าน (121 ไฟล์)"
  ],
  "changed_files": [
    {
      "path": "academy-web/src/lib/edge-rate-limit-policy.ts",
      "reason": "HMAC-signed rate-limit marker ผูก method/path/เวลา"
    },
    {
      "path": "academy-web/src/lib/request-ip.ts",
      "reason": "production IP fail closed เมื่อไม่มี Cloudflare IP"
    },
    {
      "path": "academy-web/src/lib/safe-log.ts",
      "reason": "safeErrorMessage สำหรับ log ทุก route ที่แตะ"
    },
    {
      "path": "academy-web/next.config.ts",
      "reason": "CSP enforced + HSTS subdomain/preload"
    },
    {
      "path": "reports/reviews/academy-edge-security-hardening-local-checkpoint-20260817.md",
      "reason": "checkpoint report + review verdict (รายชื่อไฟล์เต็มใน freeze manifest)"
    }
  ],
  "remaining_work": [
    "Identity-adapter real-route/browser evidence — รอ Identity Control live",
    "ลาน content ของ session อื่นยังเดินต่อเนื่อง (ห้ามแตะจาก handoff นี้)"
  ],
  "risks": [
    "สอง session เขียน repo เดียวกัน: ก่อนแก้ไฟล์ใดต้องดู git status เต็มและหลีกเลี่ยงไฟล์ของ session อื่น",
    "Full unit suite อาจแดงชั่วคราวจาก content-registry drift ระหว่างที่ลาน content กำลังเขียน — regenerate โดยเจ้าของลานนั้น ไม่ใช่ลานนี้"
  ],
  "next": {
    "cwd": "academy-web",
    "summary": "รอ Identity live แล้วจึงทำ real-route/browser evidence; ระหว่างนี้ห้ามแตะลาน content ของ session อื่น",
    "first_step": "ตรวจ reports/handoffs/current.json ของ identity-control ว่าลาน operational ได้ authorization และ endpoints live แล้วหรือยัง ก่อนเริ่ม adapter evidence ใดๆ",
    "commands": [
      "rtk git -C ../identity-control log -3 --oneline",
      "rtk npm run test:unit -- --run tests/unit/edge-rate-limit-policy.test.ts tests/unit/security-headers.test.ts tests/unit/request-ip.test.ts tests/unit/safe-log.test.ts"
    ],
    "acceptance": [
      "ไม่มีการแตะไฟล์ลาน content ของ session อื่น",
      "Adapter evidence เริ่มได้ก็ต่อเมื่อ Identity live พร้อมหลักฐาน"
    ],
    "execution_boundary": "blocked-external-or-sensitive"
  },
  "blocker": {
    "reason": "งาน identity-adapter ถัดไปต้องมี Identity Control endpoints live จริง (key custody + distribution) ซึ่งยังเป็น NO-GO ฝั่ง identity-control",
    "required_input": "Identity Control operational lanes ได้ authorization และ live พร้อมหลักฐาน"
  },
  "verification": [
    {
      "command": "node ../../../scripts/checkpoint-freeze-manifest.mjs verify --root . --manifest reports/reviews/academy-edge-security-hardening-freeze-20260817.json",
      "result": "CHECKPOINT_FREEZE_MANIFEST=VERIFIED FILE_COUNT=19"
    },
    {
      "command": "npm run test:unit -- --run tests/unit/edge-rate-limit-policy.test.ts tests/unit/security-headers.test.ts tests/unit/request-ip.test.ts tests/unit/safe-log.test.ts",
      "result": "15 passed (15)"
    },
    {
      "command": "npm run test:unit -- --run",
      "result": "Test Files 121 passed (121); Tests 1561 passed (1561)"
    }
  ],
  "cleanup": {
    "processes": "ไม่มี process ค้างของ session นี้",
    "artifacts": "ไม่มี artifact ชั่วคราวใน repo; log อยู่ใน session scratchpad นอก repo"
  }
}
-->

## Objective
เดินหน้า Academy หลังปิด edge-security-hardening: งาน identity-adapter ถัดไปรอ Identity Control ไป live (key custody + distribution + endpoints); ลาน content เป็นของ session อื่นที่กำลังทำอยู่

## Owner Intent And Decisions
- Decision: Academy จะมี real-route/browser evidence ไม่ได้จนกว่า Identity key custody + distribution + endpoints จะ live จริง
- Decision: Adversarial harness debt สองข้อปิดแล้วที่ c22a823 และ run-all lock ที่ cd83b20 — handoff เดิม (20260815) ล้าสมัยแล้ว
- Allowed scope: งาน local reversible: test, เอกสาร, harness ที่ไม่แตะลาน content · รัน unit suite และ focused security suites

## Repository State
- State: blocked
- Branch: main
- Baseline: 66449adb36cd26c0643c54df704a4c354666f255 (refresh 2026-08-18: HEAD เดินหน้าด้วย commit สาย content ของ session อื่น 4 ตัว — e335fec..66449ad ล้วนเป็น feat(academy) คอร์ส OS; เนื้อ packet เดิมยังถูกต้อง, identity ยัง blocked จึงยัง blocked ต่อ)
- Delivery: local

## Completed This Session
- Commit edge-security-hardening slice ที่ค้างจาก session ก่อน (19 ไฟล์ตาม freeze manifest + report) หลังตรวจซ้ำ: manifest VERIFIED (19 ไฟล์), focused test 15/15; review closure PASS C0/H0/M0/L0
- Verification battery: full unit suite 1561/1561 ผ่าน (121 ไฟล์)

## Changed Files
- academy-web/src/lib/edge-rate-limit-policy.ts: HMAC-signed rate-limit marker ผูก method/path/เวลา
- academy-web/src/lib/request-ip.ts: production IP fail closed เมื่อไม่มี Cloudflare IP
- academy-web/src/lib/safe-log.ts: safeErrorMessage สำหรับ log ทุก route ที่แตะ
- academy-web/next.config.ts: CSP enforced + HSTS subdomain/preload
- reports/reviews/academy-edge-security-hardening-local-checkpoint-20260817.md: checkpoint report + review verdict (รายชื่อไฟล์เต็มใน freeze manifest)

## Verification
- `node ../../../scripts/checkpoint-freeze-manifest.mjs verify --root . --manifest reports/reviews/academy-edge-security-hardening-freeze-20260817.json`: CHECKPOINT_FREEZE_MANIFEST=VERIFIED FILE_COUNT=19
- `npm run test:unit -- --run tests/unit/edge-rate-limit-policy.test.ts tests/unit/security-headers.test.ts tests/unit/request-ip.test.ts tests/unit/safe-log.test.ts`: 15 passed (15)
- `npm run test:unit -- --run`: Test Files 121 passed (121); Tests 1561 passed (1561)

## Dirty State
Expected worktree: clean.

ลาน content ของ session อื่นอาจสร้างไฟล์ใหม่ต่อเนื่อง — ดู git status เต็มก่อนแตะไฟล์ใดๆ

## Cleanup State
- Processes: ไม่มี process ค้างของ session นี้
- Artifacts: ไม่มี artifact ชั่วคราวใน repo; log อยู่ใน session scratchpad นอก repo

## Remaining Work And Risks
- Remaining: Identity-adapter real-route/browser evidence — รอ Identity Control live
- Remaining: ลาน content ของ session อื่นยังเดินต่อเนื่อง (ห้ามแตะจาก handoff นี้)
- Risk: สอง session เขียน repo เดียวกัน: ก่อนแก้ไฟล์ใดต้องดู git status เต็มและหลีกเลี่ยงไฟล์ของ session อื่น
- Risk: Full unit suite อาจแดงชั่วคราวจาก content-registry drift ระหว่างที่ลาน content กำลังเขียน — regenerate โดยเจ้าของลานนั้น ไม่ใช่ลานนี้

Blocked on: งาน identity-adapter ถัดไปต้องมี Identity Control endpoints live จริง (key custody + distribution) ซึ่งยังเป็น NO-GO ฝั่ง identity-control

Required input: Identity Control operational lanes ได้ authorization และ live พร้อมหลักฐาน

## Exact Next Action
Working directory: academy-web

รอ Identity live แล้วจึงทำ real-route/browser evidence; ระหว่างนี้ห้ามแตะลาน content ของ session อื่น

First step: ตรวจ reports/handoffs/current.json ของ identity-control ว่าลาน operational ได้ authorization และ endpoints live แล้วหรือยัง ก่อนเริ่ม adapter evidence ใดๆ

Commands:
- `rtk git -C ../identity-control log -3 --oneline`
- `rtk npm run test:unit -- --run tests/unit/edge-rate-limit-policy.test.ts tests/unit/security-headers.test.ts tests/unit/request-ip.test.ts tests/unit/safe-log.test.ts`

## Done Definition
- ไม่มีการแตะไฟล์ลาน content ของ session อื่น
- Adapter evidence เริ่มได้ก็ต่อเมื่อ Identity live พร้อมหลักฐาน

## Do Not Touch
- ลาน content คอร์ส (c-low-level ฯลฯ) — session อื่นกำลังทำอยู่ ห้ามแตะ
- เลื่อน identityContractDigests โดยไม่มีรอบรีวิวข้าม repo
- production, Cloudflare, DNS, credential, deploy, release โดยไม่มี authorization เฉพาะ
