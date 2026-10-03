# AL-12 — ลิงก์และการอ้างถึงคอร์สที่จะซ่อน (2026-10-03)

คอร์สเปิดตัว: `basic-os-linux`, `git-essentials`. คอร์สที่จะซ่อน (unpublished):
`assembly`, `c-low-level`, `computer-architecture`, `computer-networking`,
`operating-systems`, `setup-and-environment`.

**สรุป:** มีลิงก์ใน UI จุดเดียวที่จะพาไปคอร์สที่ซ่อน คือหน้า Home ซึ่งแก้แล้ว
ในเนื้อหาคอร์สมีข้อความ 4 จุด (2 คอร์ส × 2 ภาษา) ที่พูดถึงคอร์ส "Setting Up /
ตั้งต้นให้พร้อม" เป็นข้อความธรรมดา ไม่ใช่ลิงก์ จึงไม่ทำให้เจอหน้า 404 แต่ผู้เรียน
จะหาคอร์สนั้นไม่เจอ ข้อความเหล่านี้ยังไม่ได้แก้ และรอผู้ก่อตั้งเลือกตามข้อเสนอด้านล่าง

## วิธีค้นหา

- ค้นด้วย slug ทั้ง 6 ตัวใน `academy-web/content/courses/{basic-os-linux,git-essentials}`
  และ `academy-web/src` ไม่นับ `registry.generated.ts` ผล: ไม่มีการอ้างถึงด้วย slug เลย
- ค้นด้วยชื่อคอร์สทั้ง EN/TH ("Setting Up"/"ตั้งต้นให้พร้อม", "Computer Networking",
  "Operating Systems", "Assembly", "C & Low-level", "Computer Architecture" และคำไทย)
  รวมถึงวลีอย่าง "next course"/"คอร์สถัดไป"/"later course" ในเนื้อหาคอร์สเปิดตัว
- `prerequisites` ใน `course.json` ของทั้งสองคอร์สอ้างถึงเฉพาะ node ภายในคอร์สเดียวกัน
  ไม่มีข้อกำหนดข้ามคอร์ส Roadmap (`RoadmapGraph`) และลิงก์บทถัดไป
  (`LessonView`, `CourseOverview`) สร้าง URL จาก slug ของคอร์สตัวเองเท่านั้น
- ไล่ดูทุก `href` ที่ขึ้นต้นด้วย `/courses` ใน `src/`

## ลิงก์ใน UI / การนำทาง

| พื้นผิว | ไฟล์ / route | ก่อนแก้ | สถานะ |
|---|---|---|---|
| Home: ปุ่มหลัก "View …" | `src/app/(site)/page.tsx` → `/` | `getAllPublicCourses()` คืนรายการ static ที่เรียงตามตัวอักษร ทำให้ `courses[0]` เป็น **`assembly`** ปุ่มหลักจึงเป็น "View Assembly: Reading Machine Code" ซึ่งชี้ไปคอร์สที่ซ่อน | **แก้แล้ว** ตอนนี้ใช้ `getVisiblePublicCourses()` ซึ่งเป็นฟังก์ชันเดียวกับที่ `/courses` ใช้ |
| Home: ตาราง "Course previews" | เหมือนข้างบน | แสดงคอร์ส `syllabus-preview` ครบ 8 คอร์ส รวม 6 คอร์สที่ซ่อน | **แก้แล้ว** (ใช้ฟังก์ชันเดียวกัน) |
| แคตตาล็อก `/courses` | `src/app/(site)/courses/page.tsx` | กรองด้วย `getVisiblePublicCourses()` ตามค่า override ขณะรันอยู่แล้ว | กรองคอร์สที่ซ่อนอยู่แล้ว |
| Dashboard / API ความคืบหน้า | `src/app/(site)/api/progress/route.ts` → `getCourseAccess` | งาน AL-03 (`codex/AL-03-antigravity-1-20261003`) เพิ่มการตรวจ visibility ใน `getCourseAccess` แล้ว | คอร์สที่ซ่อนจะหายไปเมื่อ AL-03 รวมเข้า main |
| Sitemap | `src/app/sitemap.ts` | AL-03 แก้แล้ว | อยู่ในขอบเขต AL-03 |
| ลิงก์ในคอร์ส (roadmap, บทถัดไป, ภาพรวม, แบนเนอร์เรียนต่อ) | `RoadmapGraph`, `LessonView`, `CourseOverview`, `CourseDashboard` | ทุกลิงก์อยู่ภายในคอร์สเดียวกัน | ไม่มีลิงก์ข้ามคอร์ส |
| หน้า admin รายการคอร์ส | `src/app/(site)/admin/courses/page.tsx` | ลิงก์ preview สำหรับผู้ดูแล | เป็นหน้าที่ตั้งใจให้ผู้ดูแลใช้ ไม่ต้องแก้ |

เทส: `academy-web/tests/unit/home-page-visibility.test.ts`

- ไม่มีลิงก์ `/courses/<hidden>/…` บนหน้า Home
- ปุ่มหลักชี้ไป Basic OS & Linux
- ถ้าไม่มีคอร์สที่มองเห็นได้ ปุ่มหลักและตารางพรีวิวจะไม่แสดง
- ยืนยันว่าเทสล้มกับ `page.tsx` เดิม: 2 จาก 3 ข้อ fail

## ข้อความในเนื้อหาคอร์สที่ต้องให้ผู้ก่อตั้งเลือก (ยังไม่ได้แก้)

ข้อความทั้งหมดอยู่ในฟิลด์ `audience` ซึ่งแสดงเป็นข้อความธรรมดาใน
`PublicCourseSyllabus` และ `CourseOverview` จึงไม่ใช่ลิงก์และไม่ทำให้เจอหน้า 404

### 1. basic-os-linux — `audience`

- EN `content/courses/basic-os-linux/locales/en/course.json`:
  "…an early lesson sets up a Linux you can safely break. **The Setting Up course helps but is not required,** and no compiler or other toolchain is needed."
- TH `content/courses/basic-os-linux/locales/th/course.json`:
  "…**คอร์ส "ตั้งต้นให้พร้อม" ช่วยได้แต่ไม่ใช่ข้อกำหนด** และไม่ต้องใช้คอมไพเลอร์หรือ toolchain ใดๆ"

ข้อเสนอ:

- **(แนะนำ) A — ลบประโยคนี้** เพราะบท "Get a Linux you can break" ในคอร์สนี้ตั้งเครื่องให้อยู่แล้ว
  - EN: "…an early lesson sets up a Linux you can safely break. No compiler or other toolchain is needed."
  - TH: "…โดยบทต้นๆ จะพาตั้งค่า Linux เครื่องหนึ่งที่พังได้ไม่เป็นไร และไม่ต้องใช้คอมไพเลอร์หรือ toolchain ใดๆ"
- B — คงไว้ตามเดิม แล้วกลับมาแก้ตอนเปิดคอร์ส Setting Up
  - ข้อเสีย: ผู้เรียนจะค้นหาคอร์สที่ไม่มีให้เห็น

### 2. git-essentials — `audience`

- EN `content/courses/git-essentials/locales/en/course.json`:
  "This course assumes only a working Unix-like shell — nothing else. **If you do not have one yet — or have never opened a terminal — the Setting Up course installs and verifies that first, and nothing here repeats that material.**"
- TH `content/courses/git-essentials/locales/th/course.json`:
  "…**ถ้ายังไม่มี — หรือไม่เคยเปิดเทอร์มินัลมาก่อน — คอร์ส "ตั้งต้นให้พร้อม" ติดตั้งและยืนยันให้ก่อน และเนื้อหาตรงนั้นไม่ได้เล่าซ้ำในคอร์สนี้**"

ข้อความนี้สำคัญกว่าข้อ 1 เพราะบอกผู้เรียนที่ยังไม่มี shell ให้ไปเรียนคอร์สที่ถูกซ่อน
ส่วนบทแรก (`why-version-control`) มีเพียงบรรทัด "Run: git --version (install it if this fails)" ไม่มีขั้นตอนติดตั้ง

ข้อเสนอ:

- **(แนะนำ) A — ชี้ไปคอร์สเปิดตัวอีกคอร์ส** ซึ่งมีบท "Get a Linux you can break" ที่ตั้งเครื่องให้
  - EN: "If you do not have one yet — or have never opened a terminal — start with the first lessons of Basic OS & Linux, which set one up, and nothing here repeats that material."
  - TH: "ถ้ายังไม่มี — หรือไม่เคยเปิดเทอร์มินัลมาก่อน — ให้เริ่มจากบทแรกๆ ของคอร์ส Basic OS & Linux ซึ่งพาตั้งเครื่องให้ และเนื้อหาตรงนั้นไม่ได้เล่าซ้ำในคอร์สนี้"
- B — เขียนขั้นตอนติดตั้งไว้ในบท `why-version-control` เลย เช่น ติดตั้ง git บน macOS/WSL/Linux และตรวจด้วย `git --version`
  - ใช้แรงเขียนเนื้อหาสองภาษามากกว่า
- C — ลบประโยคนี้ เหลือแค่ "assumes only a working Unix-like shell"
  - ผู้เรียนที่ยังไม่มี shell จะไม่มีทางไปต่อ

### 3. ข้อความที่ตรวจแล้วไม่ต้องแก้

- `basic-os-linux/locales/en/lessons/ssh-and-remote.json` กล่อง callout "What to build next"
  เขียนว่า "Everything after this course — networking, hardening, incident response, cloud — …"
  เป็นการพูดถึงหัวข้อทั่วไป ไม่ได้ระบุชื่อคอร์สและไม่มีลิงก์ จึงไม่ต้องแก้
- `git-essentials/locales/th/lessons/rebase-vs-merge.json` "(จะสอนทีหลังในคอร์ส)"
  หมายถึงบทที่อยู่ในคอร์สเดียวกัน
- คำว่า "ค่าตั้งต้น" (default) ใน TH หลายบทเป็นคำทั่วไป ไม่ได้หมายถึงคอร์ส "ตั้งต้นให้พร้อม"

## สิ่งที่ยังไม่ได้ตรวจ (นอกขอบเขต AL-12)

- `src/app/(localized)/courses/[slug]/[locale]/page.tsx` (หน้า syllabus สาธารณะ) และ
  `src/app/courses/[slug]/opengraph-image.tsx` ยังเลือกคอร์สจาก `publicAvailability` แบบ static
  เท่านั้น หากซ่อนคอร์สด้วย `course_settings` เพียงอย่างเดียว หน้า `/courses/assembly/en`
  จะยังเปิดได้ถ้ารู้ URL ตรง เรื่องนี้เป็นของ AL-03 ("ซ่อนให้เข้าไม่ได้ทุกทาง")
  และได้ส่งเข้า backlog ของ host แล้ว (issue `50492330bae742f4831cb9075d734639`)
- `getVisiblePublicCourses()` จะแสดงทุกคอร์สถ้าอ่าน `course_settings` ไม่สำเร็จ
  (`loadAllCourseOverrides` คืน Map ว่าง) ซึ่งเป็นพฤติกรรมเดียวกับ `/courses` อยู่แล้ว
  วิธีที่ปลอดภัยกว่าคือเปลี่ยน `course.json` ของ 6 คอร์สเป็น
  `"publicAvailability": "internal"` ด้วย เพื่อให้คอร์สถูกซ่อนตั้งแต่ตอน build
  แต่นั่นคือการตัดสินใจเรื่องวิธีซ่อน ซึ่งเป็นของ AL-03/AL-10

## หลักฐาน

- Unit suite: 3149 passed / 13 failed / 2 skipped
  - 13 ข้อที่ fail เป็นของเดิมที่อยู่ในงาน AL-06: `identity-client-assertion-registration-rehearsal` (10),
    `identity-client-assertion-conformance` (1), `public-lesson` (1), `sign-out-route` (1)
  - ไม่มีข้อที่ fail เพิ่มจากงานนี้
- `tsc --noEmit` และ `eslint` ของไฟล์ที่แก้: ผ่าน
