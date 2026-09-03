# Academy course content review — ทุกวิชาบน platform (2026-09-02)

**ขอบเขต:** course contents ทั้ง 8 วิชาจริงใน `academy-web/content/courses/`
(setup-and-environment, git-essentials, basic-os-linux, c-low-level, assembly,
computer-architecture, operating-systems, computer-networking) + content-formats-demo
(อ้างอิงเชิง platform) — EN + TH

**วิธีตรวจ:**
1. โครงสร้างทั้งหมดตรวจเชิง programmatic (DAG, parity, block inventory, MCQ
   position/length bias) — ผลใน `/tmp/academy-content-audit.json` (session-local)
2. Deep review รายวิชา: อ่าน lesson EN ทุกไฟล์ ตรวจ answer key MCQ ทุกข้อ
   (593 ข้อ) + recompute ตัวเลขเอง, อ่าน TH ลึก 3 บท/วิชา (setup อ่านครบ)
3. Spot-check ข้อเท็จจริงที่ load-bearing ที่สุดซ้ำด้วย grep ก่อนรายงาน

---

## ภาพรวม

คุณภาพเนื้อหา **สูงจริง** — นี่ไม่ใช่ content ระดับ draft: จาก MCQ 593 ข้อ
พบ answer key ผิดแท้ ~4 ข้อ + คลุมเครือจริง ~5 ข้อ; จาก fact claims/ตัวเลข/โค้ด
ที่ตรวจทั้งหมด พบข้อผิดพลาดเชิงเทคนิค ~30 จุด ส่วนใหญ่ระดับ minor.
สไตล์ "วัดแล้ว/ตรวจแล้วด้วยการรัน" ทำได้จริงเกือบทุกจุดที่ agent ตรวจย้อนได้

ช่องว่างใหญ่จริงอยู่ที่ 3 เรื่องระบบ ไม่ใช่เนื้อหารายบท:
1. **Assessment ถูกเอาชนะด้วย test-wiseness ได้ ~80%** (เฉลย = ตัวเลือกยาวสุด)
2. **Labs/simulations = 0 ในทุกวิชาจริง** ทั้งที่ platform รองรับและ capstone
   ประกาศตัวเป็น "prove-it gate" แต่จริงๆ คือ MCQ ธรรมดา
3. **Authoring อยู่ตรงใน academy-web ไม่ผ่าน Crucible** ขัดสถาปัตยกรรมที่ประกาศ
   (content source of truth = Crucible)

---

## ผลเชิง programmatic (ทุกคอร์ส)

| ตัวชี้วัด | ค่า |
|---|---|
| Nodes รวม (8 วิชา) | 149 (capstone 23) |
| MCQ รวม | 593 (ทุกข้อมี explanation, ไม่มี duplicate prompt, เกือบทั้งหมด 4 choices) |
| EN/TH lesson-file parity | ครบ 100% ยกเว้น image 1 ก้อนใน TH `basic-os-linux/os-what-it-does` (EN มี diagram, TH หาย) |
| DAG | ไม่มี cycle, ไม่มี dangling prereq; แต่พบ ordering ที่ควรแก้ 4 จุด (ดู pedagogy) |
| estimatedMinutes | ตรง sum ทุกคอร์ส ยกเว้น content-formats-demo (24 vs 32) |
| Video | มี node เดียวทั้ง platform (basic-os-linux/os-what-it-does) และเป็น placeholder demo asset 150s |
| **เฉลย = ตัวเลือกยาวสุดแบบชัดเจน** | **assembly 79% · basic-os-linux 79% · c-low-level 79% · CA 80% · networking 82% · git 81% · OS 77% · setup 85%** (เฉลยยาวกว่าค่าเฉลี่ยตัวอื่น +29–45 ตัวอักษร) |
| ตำแหน่งเฉลย | สมดุลพอใช้; เอียงเหลือเล็กน้อยใน networking (C 36%) |

หมายเหตุ: commit `702adb1` (2026-08-19) แก้ position bias เต็ม + length bias
"บางส่วน" — ผลวัดวันนี้ยืนยันว่าด้านความยาวยังไม่ถูกแก้จริง

---

## Cross-cutting issues (พบซ้ำหลายคอร์ส)

### A. Answer-length bias (ระดับ critical เชิง assessment validity)
ผู้เรียนที่ไม่รู้เนื้อหาเลยแต่เลือก "ข้อที่ยาวและมี qualification มากที่สุด"
จะได้ ~80% ทุกคอร์ส ทุกภาษา (TH บางข้อ แย่กว่า EN เพราะคำแปลย้ายเนื้อหา
explanation เข้าไปในตัวเลือกเฉลย เช่น OS cp หลายข้อ, c-low-level UB cp-2)

**แนวทาง:** (1) normalize ความยาวตัวเลือกทั้ง 1,186 ชุด (EN+TH) — ย้ายรายละเอียด
ที่ discriminate ออกไปอยู่ใน explanation (2) ขยาย regression gate ที่มีให้ check
"เฉลยต้องไม่เป็นตัวยาวสุดแบบ strict เกิน 40% ของข้อในไฟล์"

### B. Labs / simulations / activities = 0
Platform รองรับ block ชนิด `lab` (inline/full), `simulation` (มี assessed mode +
variables สุ่มค่า), checkpoint ชนิด simulation — พิสูจน์แล้วใน content-formats-demo
แต่ไม่มีวิชาจริงใช้เลย engine มี surface เดียว: `network-interface`.
ทุก capstone (23 จุด) เป็น MCQ 4 ข้อ + try block เหมือน lesson ธรรมดา — สัญญา
"ด่านบังคับพิสูจน์ความสามารถ" ไม่ได้เกิดจริง (และชนกับหลักที่ course-types
เขียนไว้เอง: "quiz แสดงว่าจำแนกคำตอบได้ lab แสดงว่าทำได้จริง")

### C. Audience blurb ครอบครัว C-course ถูกวางใน 7/8 คอร์ส
ประโยค "assumes a working Unix-like shell and, from the C course onwards, a C
compiler and make..." อยู่ใน course.json ของ 7 คอร์ส (EN+TH) — ผิดชัดใน
**git-essentials** (ไม่ต้องมี C compiler เลย) และ**ขัดตัวเอง**ใน **basic-os-linux**
(บทที่ 3 สอนติดตั้ง Linux ให้คนไม่เคยแตะ terminal, ขณะที่ blurb บอกว่าต้องมี
shell มาก่อน)

### D. Capstone ไม่ต่างจาก lesson
(c-low-level, computer-networking, git-essentials รายงานตรงกัน) โครงสร้าง
blocks/MCQ/try เหมือนกันเป๊ะ ไม่มีการ synthesized assessment — หรือควร relabel
หรือควรให้ capstone เป็นที่ที่ lab integrative อยู่ (ตรงกับข้อ B)

### E. Cross-course forward references ห้อย
networking/OS/assembly อ้าง "the C course / OS course / pthreads lesson" นอก
prerequisite chain ของตัวเอง — โอเคเมื่อเรียนตามลำดับ family, สับสนเมื่อเข้า
เดี่ยว (ซึ่งเป็น mode ของ public learner)

### F. Try blocks ที่ผู้เรียนคนเดียวทำตามไม่ได้จริง
- networking: `thread-pool` try อ้าง "queue code printed above" แต่ไม่เคยพิมพ์;
  `grpc-and-protobuf` ต้องมี protoc + toolchain ที่ไม่มีใครติดตั้งให้;
  หลาย step ต้อง root/egress (tcpdump, ip neigh flush)
- OS: 2 บท security ต้อง root + user ที่สอง + Docker; async-signal ต้อง gdb attach
- git: capstone สุดท้าย (github-actions-ci) ต้อง repo ที่เป็น admin + branch
  protection — ทำ offline ไม่ได้เลย
- assembly: ไม่ประกาศ environment assumption เลย (เนื้อหา macOS-centric:
  `_printf`, `ulimit -s` 8176) ผู้เรียน Windows ตายตั้งแต่บท 1; registers try
  ผสม `-masm=intel` กับ inline-asm AT&T จนชนกัน
- CA: `cc -march=native -Q --help=target` เป็น GCC-only; try โมดูล memory
  หนักกว่า estimatedMinutes 2–3 เท่า

### G. คุณภาพ TH: ดีมากโดยรวม แต่มี mistranslation จริง 2 จุด + ศัพท์ประดิษฐ์
- **ผิดจริง:** CA/TH `dram-cells-and-timing` แปล memory "bank" เป็น
  **"ธนาคาร"** ตลอดบท (11 จุด) รวมถึงโจทย์ checkpoint; CA/TH `cache-mapping`
  แปล "every access after the first should hit" เป็น "ควร**โดน**หมด" (อ่านไม่
  รู้เรื่อง)
- **ศัพท์ประดิษฐ์ที่ควรคงอังกฤษ** (ธรรมเนียมของคอร์สเองคือทับศัพท์):
  ฟังก์ชันใบไม้ (leaf function), การแปลงชื่อ (name mangling), ตัวปรับแต่ง
  (optimiser), ความสามารถย้ายเครื่อง (portability), ตัวจัดคิว (scheduler),
  ระยะเยื้อง (offset), แฟ้ม register (register file)
- **TH choices ดูด explanation เข้าตัวเลือกเฉลย** (OS/CA หลายข้อ) — ทำให้
  guessable-by-length รุนแรงกว่า EN และ EN/TH ไม่ equivalent
- ประเด็นเล็ก: "ทันสมัย" สำหรับ up-to-date (git), "เพาะ" แทน "พาให้เกิด",
  "เครื่องตั้งโต๊ะ" (desktop), "Chmod" พิมพ์ใหญ่, calque ประโยค elliptical
  EN ("Recovering it is." → "การกู้มันกลับมาต่างหากที่ใช่")

---

## ข้อผิดพลาดเชิงเทคนิคที่ควรแก้ (เรียงตามความสำคัญ)

### P0 — ผิดแน่นอน ผู้เรียนทำตามแล้วพังหรือเรียนผิด
1. **setup / github-account-and-first-push (EN+TH):** สอน `git init → commit →
   git push -u origin main` โดยไม่มี `git branch -M main` และไม่เคยตั้ง
   `init.defaultBranch` — บน Debian 12/Ubuntu/WSL (platform อ้างอิงของคอร์สเอง
   git 2.39.5) `git init` สร้าง branch `master` แล้ว push พังทันที
   ("src refspec main does not match any") — **verified ใน debian:12-slim
   container โดย reviewer; ตัวอย่างยังอยู่บรรทัด 87/117 ของไฟล์** แก้: เพิ่ม
   `git branch -M main` ตาม snippet ที่ GitHub แนะนำเอง
2. **setup / choose-your-environment:** `wsl --install` ระบุเป็น universal แต่ต้อง
   Windows 10 2004+ — บน build เก่าคำสั่งไม่มีอยู่ = ทางตันของผู้เรียนกลุ่มเป้าหมาย
   (non-CS beginner) ณ ก้าวแรก
3. **assembly / recursion capstone:** ตารางบอก tail call ผ่าน function pointer
   "ไม่ได้ถูกกำจัด เพราะไม่รู้ target ตอน compile" — ผิด `return fptr(x);` คอมไพล์
   เป็น `jmp rax` ได้ (สิ่งที่ pointer กันคือ inlining ไม่ใช่ TCO)
4. **assembly / reading-real-disassembly (EN+TH):** บอกทิศ backward jump ผิด
   ("jump backward at .L5 to .L2" จริงๆ .L5→.L2 เป็น forward; backward คือ
   jne/je ใน .L2 ที่ชี้มา .L5) — ในบทที่สอนทักษะนี้โดยเฉพาะ
5. **OS / cpu-scheduling (EN+TH):** (ก) "1.25^19 ≈ 73" จริงๆ = 69.4 (kernel
   weight จริง 1024/15 ≈ 68) (ข) "process with a very low nice value being
   starved" — ทิศผิด nice ต่ำ = priority สูงสุด ไม่มีทางอดตาย (ควรเป็น nice สูง)
6. **networking / arp-and-icmp try step 8:** `ping -M do -s 2000` จะ fail ใน
  เครื่องเอง (EMSGSIZE) ไม่มีทางเห็น ICMP fragmentation-needed จาก router ตาม
   ที่ expected สัญญา
7. **basic-os-linux / permissions try:** ให้ `stat -f '%Sp...'` (macOS syntax)
   เป็นคำสั่งหลักของคอร์ส Linux — บน Linux คำสั่ง error; ควรสลับเป็น
   `stat -c '%A %U %G'` เป็นหลัก

### P1 — ผิด/คลาดเล็กน้อยเชิงข้อเท็จจริง (แก้พร้อมกันเป็นชุด)
- basic-os-linux: `/tmp wiped on reboot` (จริงแค่บาง distro; Ubuntu/Debian
  ที่คอร์สแนะนำอยู่บน disk + systemd-tmpfiles) · Fedora อยู่แถวเดียวกับ
  RHEL "vendor support" (Fedora สั้น/ไม่มี vendor support) · ตาราง signal
  บอก SIGCONT "ignore ได้: Yes" (จริง: resume บังคับเสมอ) · "privilege
  escalation = entering kernel space" (confuse กับ root-in-userspace;
  cheatsheet ของคอร์สเองนิยามถูก) · heading "three streams and two
  operators" แต่ตารางมี 4 operators · `grep '^\s*$'` comment "spaces only"
- assembly: ABI struct return "ตัดสินด้วยขนาดล้วน" (จริง size+class;
  `struct{float,float}` กลับทาง xmm0) · "hardware sets both flags on every
  arithmetic instruction" (จริงเฉพาะตระกูล add/sub; imul ปล่อย ZF/SF ไม่
  กำหนด, inc/dec ไม่แตะ CF) · lldb listing "หกคำสั่ง" แต่พิมพ์สี่
- networking: connect() "three messages cross before it returns" (จริงสอง —
  ACK ออกตอน return) · 59 bytes "on the wire" (Ethernet pad 64 รวม FCS) ·
  "/30 smallest subnet that can carry a link" ควรมี note /31 (RFC 3021) ·
  ตาราง retry มีแถว EACCES ซ้ำสองแถว · ip-addressing "three ranges" แต่
  ตารางมี 4 แถว (loopback)
- git: worktree "Git refuses" เขียนเป็น absolute (จริง `--force`/
  `--ignore-other-worktrees` override ได้ — และ distractor cp-3 ก็พูดถูก) ·
  `actions/checkout@v4`+`setup-node@v4` จะแก่หนักใน shelf-life ของคอร์ส
  (node20 runtime ถูกถอนก.ย. 2026; v5 เป็น current ตั้งแต่ ส.ค. 2025) ·
  reflog paragraph run-on อ่านว่า unstaged edits กู้ได้ด้วย fsck (จริงเฉพาะ
  staged — ตารางถัดไปถูก, TH แก้ไว้แล้ว) · `**/temp` "directory" (จริง
  file หรือ directory)
- c-low-level: `1.0/0.0 /* not a crash */` ควรมี caveat Annex F/IEEE-754 ·
  `char small = 300` "the low 8 bits" (signed narrowing = implementation-
  defined — คอร์สเองระบุถูกที่อื่น) · goto-cleanup example return 0 บน
  fail path (ขัดหลัก fail-loud ของคอร์สเอง) · cheatsheet "-S stops after
  assembly" ควรเป็น "after producing assembly" · why-c table "exactly the
  bytes you declared" (ขัดบท padding ของคอร์สเอง) · strtol check set ขาด
  no-digits-consumed
- CA: single-cycle "+4 is why branch format could drop its lowest offset bit"
  (B-type ตัดแค่ bit 0; offset 2 ชัดๆ เป็นได้)

### MCQ answer keys ที่ต้องแก้/เขียนใหม (~9 ข้อจาก 593)
- **ผิด/คลุมเครือจริง:** assembly abi cp-2 (memcpy distractor แยกจากคำตอบ
  ไม่ได้ — option D ที่พูดถูกถูก mark ผิด) · networking how-machines-talk cp-4
  (B กับ D ไม่ plausible เท่ากัน) · git worktree cp-3 (distractor C จริง) ·
  CA addressing-modes cp-1 (distractor "offsets are smaller" จริง)
- **Explanation อ้างตัวเลือกผิด/เพี้ยน:** basic-os-linux text-and-regex cp-1
  (พูดถึง option 3 แต่ควรเป็น 2) · networking ipv6 cp-1 (double-colon ผิด
  ตัว — B ไม่มี ::) · OS kernel-vs-user cp-3 (อ้าง D แต่ควร C) ·
  basic-os-linux sed cp-1 (leftover ประโยคซ้ำ) · OS syscall-lifecycle cp-1 +
  semaphore cp-3 (ประโยคขาดประธาน — ตระกูลเดียวกับที่ commit 77ec9b5 เคยแก้)
- **โครงคำถาม:** assembly recursion cp-2 ถาม 2 ค่า (predict + measured) แต่
  ตัวเลือกมีค่าเดียว · c-low-level function-pointers cp-3 choice D เป็น
  fragment · CA what-is-an-isa cp-4 "Several operations" ไม่สมบูรณ์

### DAG / sequencing ที่ควรแก้
- OS: `zombie-and-orphan` ใช้ signal(SIGCHLD) ก่อนบท signals → เพิ่ม prereq
  หรือย้าย; `deadlock` อ้าง condvar ก่อนบท condvar; security lane อ้าง
  race-conditions/fork-exec-wait นอก chain
- c-low-level: **สลับ bitwise-ops ↔ integer-representation** (bitwise ใช้
  representation facts ของบทถัดไป); UB บทที่ 4 ใช้ arrays/functions ก่อนสอน
- networking: `http-basics` (ทฤษฎี) ถูก gate หลัง `client-and-server`
  (capstone เขียน C) — แยก path คน concepts ออกจาก systems
- git: merging/rebase-vs-merge ใช้ `git pull`/`origin/main` ก่อนบท remotes
- setup: capstone prereq ไม่ครอบ github lesson (ควรปิดท้าย full chain)

### อื่นๆ
- setup: ไม่มีคำแนะนำ 2FA/passkey ใน GitHub flow (interstitial ที่คน beginner
  ติดจริง) · 78 นาที optimistic สำหรับ Windows path (~2x จริง)
- basic-os-linux: ssh try 9 steps มี `ss -tlnp`/`lsof` ที่ไม่เคยสอน ·
  forward-ref awk ใน pipes capstone · video placeholder
- c-low-level: level "intermediate" ขัด audience "No C experience needed" ·
  คู่บท merge ได้: integer-representation+bitwise, memory-bug-patterns+
  finding-memory-bugs (24→22 โหนด)

---

## แนวทางปรับปรุง — roadmap

### Wave 1 — แก้ correctness ที่เป็นไฟล์ content ล้วน (effort รวม ~S–M ต่อคอร์ส)
P0 ทั้ง 7 ข้อ + audience blurb 7 คอร์ส + explanation ที่อ้างตัวเลือกผิด +
MCQ ~9 ข้อ + TH mistranslation 2 จุด + ศัพท์ประดิษฐ์ → แก้พร้อมกันเป็น
commit ต่อคอร์ส พร้อม TH คู่กัน EN ทุกจุด (ข้อผิด EN ที่ TH แปลตาม ต้องแก้
สองภาษา — เกิดแล้ว 2 กรณี: assembly backward-jump, OS nice)

### Wave 2 — ปิดช่อง test-wiseness (prerequisite ของความน่าเชื่อถือ assessment)
normalize choice lengths EN+TH + ขยาย regression gate เป็นตัวตรวจ length
parity อัตโนมัติใน CI ของ content (สคริปต์วัดของ review นี้เอาไปใช้ต่อได้เลย)

### Wave 3 — Activities/labs แบบไล่ระดับตามความพร้อม platform
จากข้อเสนอรวม 40 กิจกรรมของ reviewers จัดเป็น 3 tier:

**Tier A — ใช้ surface ที่มีอยู่วันนี้ (`network-interface` + variables):**
1. fix-the-host troubleshooting (networking — สุ่ม fault: netmask/gateway/
   DNS ผิด) · 2. subnetting host-config drill (networking) ·
   3. cron builder + reverse mode (basic-os-linux) — ทั้งหมด S ต่อชิ้น

**Tier B — simulation surface ใหม่ที่เป็น JS ล้วน auto-graded:**
register/stack state tracer + ATT↔Intel translator (assembly, S–M) ·
page-table walk + scheduling predictor + race interleave (OS, S–M) ·
cache decompose drill + RISC-V encode/decode + CPI calculator + pipeline
timing builder (CA, S→M/L — คุ้มที่สุดต่อบาทเพราะคอร์ส calculation-heavy
ที่สุด) · permission repair + log interrogation (basic-os-linux, M) ·
packet builder + TCP state tracer (networking, M) · UB spotting drill +
pointer tracer MCQ-fallback (c-low-level, S–M) · simulated-repo terminal:
conflict resolve/reflog rescue/bisect/gitignore-secrets (git, M — วิชาที่
fit lab ที่สุดบน platform)

**Tier C — real browser-Linux lab (ขึ้นกับ M4 Crux lab plane ตาม roadmap):**
sanitizer hunt + build-pipeline puzzle + binary round-trip (c-low-level) ·
first-script real execution + binary analysis (basic-os-linux, assembly) ·
producer-consumer + TSan (OS) · เรียงตาม free-tier strategy: basic-os-linux
ก่อน (คอร์สเรือธงของแผน "ค่อยๆเรียกแขก")

**หลักการจัดลำดับที่แนะนำ:** Tier A ทำได้ทันทีไม่ต้องรอ platform → Tier B
เลือก 4–5 surface แรกตามวิชาที่ launch ก่อน → capstone ของวิชาไหนมี lab
จริงแล้ว ให้เปลี่ยน capstone เป็น "lab + MCQ ลดลง" ให้ label capstone มีความ
หมายจริง (ปิด issue D ไปพร้อมกัน)

### Wave 4 — โครงสร้าง/กระบวนการ
- แก้ DAG ordering ตามรายการข้างบน
- ตัดสินใจเรื่อง authoring: ย้าย source-of-truth ไป Crucible ตามสถาปัตยกรรม
  หรือแก้สถาปัตยกรรมให้ตรงความจริง (แนะนำตัวหลัง — การย้าย 149 บทตอนนี้
  ไม่ตอบโจทย์ผู้เรียน แต่ควรบันทึก decision ให้ตรงกัน)
- estimatedMinutes ของ setup (Windows path) และ CA (memory module) ปรับ
  ตามข้อเท็จจริง
- Video: ตัดสินใจว่า placeholder บน node เดียวควรถอดออกจนกว่าจะมี asset จริง
  (เสี่ยงต่อความน่าเชื่อถือตอน public)

---

## จุดแข็งที่ควรรักษาไว้ (สรุปจาก 8 รายงาน)
- วัฒนธรรม "measured/verified ไม่ใช่ recalled" — ตัวเลขที่ติดป้ายวัดแล้ว
  ผ่านการ recompute เกือบทั้งหมด (RISC-V/aarch64 encoding ระดับบิต, DRAM
  timing, VLSM, syscall tables, reflog expiry, ABI เกิน level คอร์สทั่วไป)
- Try blocks สอนแบบ "ทำให้พังก่อนแล้วแก้" (deliberate failure injection)
  อย่างเป็นระบบ — pattern เด่นที่สุดของทั้ง catalog
- Security framing ถูกทอลงในเนื้อหาจริง ไม่ใช่บทเสริม (rotate-not-rewrite,
  CLOSE_WAIT-is-your-bug, setuid จริง vs สคริปต์, TOCTOU)
- คำอธิบาย MCQ สอนกลไก ไม่ใช่ทวนคำตอบ; distractor มาจาก misconception จริง
- TH เป็นงานแปลระดับ production โดยรวม — code/ตัวเลข/answer keys ตรง EN ครบ

## สิ่งที่รีวิวนี้ไม่ได้ตรวจ
- การ render จริงบน browser / UX ของหน้าบทเรียน (เป็น platform surface
  ไม่ใช่ content)
- content-formats-demo เชิงลึก (เป็น internal demo)
- ความถูกต้องเชิงจิตวิทยาการสอนของลำดับ family ข้ามคอร์ส (เช็คระดับ DAG
  ภายในคอร์สเท่านั้น)

*รายงานโดย session ws-05d7e99d (director review lane) — ผลรวมจาก reviewer
ย่อย 8 วิชา + การตรวจเชิงโปรแกรม; หลักฐานรายข้อ (quote ตรงไฟล์) อยู่ใน
บันทึก session*

---

## บันทึกการลงมือ (Wave 1+2) — จบวันเดียวกัน

**Wave 1 (correctness): ลงครบทุกวิชา** — 266 ไฟล์ content เปลี่ยน
(+2,110/−1,906 บรรทัด) ครอบคลุม P0 ทั้ง 7 ข้อ, MCQ/explanation ~20 จุด,
audience blurb, DAG ordering (zombie+signals, deadlock+condvar,
http-basics หลุดจาก C capstone, สลับ bitwise↔integer-representation,
setup capstone ปิด full chain), TH mistranslation (ธนาคาร→bank,
"โดน"→cache hit) + ศัพท์ประดิษฐ์คืนอังกฤษ + คำแปล EN/TH parity
(รวม image ที่ TH หาย) — spot-check หลักฐาน 11/11 จุดผ่าน

**Wave 2 (assessment fairness): เกตผ่าน 16/16 เซลล์** —
อัตรา "เฉลยเป็นตัวยาวสุดแบบชัดเจน" จาก 77–92% ลดเหลือ 0–40% ทุกคอร์ส
ทุกภาษา (setup 0%, networking-th 0%, ส่วนใหญ่ 19–38%) โดย trim เฉลย
ย้ายเหตุผลเข้า explanation + เสริม distractor ด้วย misconception ที่ผิดชัด
agents ทุกตัวยืนยันไม่แตะ `correct`/prompt/ลำดับตัวเลือก

**เครื่องมือใหม่ถาวร:** `npm run verify:content-fairness`
(`scripts/check-mcq-fairness.mjs` — เกต CI กัน regression ทั้งความยาว,
explanation, จำนวน choices, prompt ซ้ำ, TH-drift) + `dump-biased-mcqs.mjs`
(worklist) + `apply-mcq-patch.mjs` (batch applier)

**การตรวจรับ:** JSON valid ทุกไฟล์ที่แก้ · registry regen ผ่าน loader จริง
(9 คอร์ส / 328 ไฟล์) · gate PASS · คงเหลือ TH-drift warnings 4 จุด
(non-blocking — assembly stack-frames cp-4, OS race-conditions cp-1,
thread-vs-process cp-1, zombie cp-3) ไว้เก็บในรอบ TH polish ถัดไป

**เหตุการณ์ระหว่างทาง:** (1) agents รอบแรกตายด้วย usage limit 5 ชม.
กลางทาง — Phase 1 ลงครบก่อนตาย, Phase 2 เก็บต่อรอบสอง (2) ดิสก์เครื่อง
เต็ม (ENOSPC, เหลือ 117MB) — ปลดบล็อกด้วยการลบ `.next` build output
(687MB, regenerate ได้) — **เครื่องยังเหลือพื้นที่ ~1.6GB เท่านั้น ควร
เคลียร์เพิ่ม**

**Wave 3 (labs/activities): ออกแบบพร้อม mockups แยกต่างหาก** —
ดู `plans/labs-activities-design-2026-09-02.md` +
`artifacts/labs-wave3-mockups/` (mockup 6 แบบ render จาก design tokens
จริง) — รอ founder เคาะทิศทางก่อนลงมือ

*ทุกอย่างยังไม่ commit — รอ owner review*
