# Founder authority and operating contract for Claude continuation

คำสั่งตรงล่าสุดของ founder: “session close แล้วเขียน handoff ให้ละเอียดทุก project ... จะให้ claude inspect + ทำต่อ ... เขียน handoff ให้ครอบคลุมไปจนจบโปรเจค ... permission ต่างๆ กฎเกณฑ์ต่างๆ ก็ให้เหมือนกับที่ผมให้คุณเลย”. การปิด session นี้เป็นการหยุดส่งต่องาน ไม่ใช่การยืนยันว่าโปรเจคเสร็จแล้ว

## Same scope and permission posture

- Claude inspect แล้วทำงานเดิมต่อจนผ่าน full delivery ของ Identity Control, Academy และ Crux; ใช้ทีมขนานตาม ownership และ model routing ที่เหมาะสม พร้อม observer lane ดู lean, freedom, speed และ cost.
- Founder ได้อนุญาตการ deploy และการเปลี่ยน DB อย่างระมัดระวังในขอบเขตโปรแกรมนี้ รวมการกู้ predecessor ที่ตรวจ state แล้ว. ไม่ต้องขอ blanket permission ซ้ำสำหรับสิ่งที่อนุญาตแล้ว; ให้ทำผลลัพธ์ที่ตรวจได้ก่อน technical acceptance.
- เพดานค่าใช้จ่ายภายนอก **USD 50 รวมทั้ง continuation เดิมและใหม่** ไม่ใช่เริ่มงบใหม่. Crux content กันไว้ USD 15; ยอดจ่ายจริงยังไม่ครบและห้ามสมมติว่าเหลือ USD 50. ตรวจ usage ก่อน operation ที่มีค่าใช้จ่าย. ห้ามทิ้ง GCP resources กำพร้า; ทรัพยากรคิดเงินต้องมีขอบเขตและ teardown ที่ platform บังคับได้.
- OTP, CAPTCHA/Turnstile interaction และ macOS admin password เป็น human-driven. ห้ามอ่านหรือเก็บค่าพวกนี้ใน model context. การไม่มี token/session/admin input เป็น access dependency ไม่ใช่เหตุให้ขออนุมัติ scope เดิมซ้ำ.
- ใช้ credentials ที่ runtime inject หรือ host custody ที่มีอยู่; **ห้ามคัดลอก credential files ลง HOME**, ห้ามส่งค่า secrets ผ่าน argv, logs, reports, screenshots หรือ ordinary artifacts. Handoff นี้มีชื่อ/path/hash/metadata เท่านั้น.
- สิทธิ์ของ Claude ต้องอ้างคำสั่งตรงล่าสุดนี้และ scope ข้างต้น; handoff ไม่ใช่ blanket authorization ที่สร้างขึ้นเอง ไม่ย้าย approval ของ packet เก่าไปใช้กับ bytes/state ใหม่. Fresh technical inspection และ independent review ยังจำเป็นที่ security/money/production-data/customer-critical boundary. ผู้เขียนห้ามเป็นผู้อนุมัติคนเดียว.
- ห้ามส่งข้อความหา external recipients/Slack/email/Discord หากไม่มีคำสั่งส่งที่ชัดเจน. ห้าม resend owner TEST mail ที่ยืนยัน mailbox แล้ว. Real paid checkout เป็น owner choice แยกจาก manual entitlement path.

## Rules that remain in force

Read installed `/Users/teerakanok/Dev/cyberskills-director-governance/AGENTS.md`; resolve global skills/scripts from that installed root, never the task worktree. Use `rtk` prefix for shell commands. Use each product AGENTS and cross-product `ecosystem/ECOSYSTEM.md`; before shared Supabase/Pool A/ssh-db, read `ecosystem/SHARED_INFRA_ACCESS.md` and current state record.

One worktree per writer and one writer per mutable checkout. Never switch, stash, reset, clean, or widen commits in foreign checkouts. Preserve dirty/untracked/ignored/stashed/unregistered resources. Product commits/pushes belong inside each product; director gitlink updates have one writer using canonical pointer tool. Authentication-provider settings and database grants are not inferred from browser email values.

Use tracked work-session lifecycle and machine routing before delegation/provider dispatch. Read the actual route result; `max` effort does not imply a deep model. Installed GLM policy at close is Flash first (standard/default `glm-5.3-flash`, deep `glm-5.3`). Claude should resolve its own workflow adapter; do not copy Codex model names blindly. Use deterministic tools for exact hashes/tests; use the capable ops lane for host executors. Do not classify an advisory timeout as capacity exhaustion or authorize a writer change from it.

Preserve an interrupted operation, establish child/backend terminal state and exact effect outcome, then use a separately reviewed recovery or new continuation. Never replay old stage/execute/recover commands just because a chat restarted. No claim of success from HTTP200 alone, a green mocked test, a command launch, missing exit file, or reviewer prose.

## How the next Claude session receives this instruction

Founder can start Claude with: “อ่าน master handoff ที่ระบุด้านล่างและ AGENTS ของทุก repo; inspect สถานะจริงก่อน จากนั้นทำ full program ต่อจนจบตาม scope, permissions และข้อจำกัดที่ผมยืนยันไว้ใน handoff นี้ ใช้ model routing และทีมขนานที่เหมาะสม ไม่ต้องขอ blanket approval ซ้ำสำหรับงานที่อนุญาตแล้ว.” This supplies the founder instruction directly to the new session; historical packet approvals still bind only their exact reviewed bytes/state.

## Fresh-session authority clarification

Installed AGENTS states: “Handoffs never carry authorization for credential, provider, host, database, deploy, restore, or other live operations into a later session.” Therefore this file records historical scope and constraints only. The founder copy-paste kickoff explicitly renews the listed scope directly in the new Claude session. Without that direct instruction, begin read-only/local work and resolve the live boundary when needed; never use the handoff itself as authority. Old packet approval never applies automatically to new bytes or state.
