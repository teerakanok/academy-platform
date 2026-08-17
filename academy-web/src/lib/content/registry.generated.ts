// ⚠️ ไฟล์นี้ถูก generate — ห้ามแก้ด้วยมือ
// สร้างด้วย: node scripts/generate-content-registry.mjs
// รันใหม่ทุกครั้งที่เพิ่ม/ลบ/เปลี่ยนชื่อไฟล์เนื้อหา (มี test คุมว่าไม่ล้าสมัย)
/* eslint-disable */

import c0 from '../../../content/courses/basic-os-linux/locales/en/lessons/files-and-safety.json'
import c1 from '../../../content/courses/basic-os-linux/locales/en/lessons/filesystem-tree.json'
import c2 from '../../../content/courses/basic-os-linux/locales/en/lessons/get-a-linux.json'
import c3 from '../../../content/courses/basic-os-linux/locales/en/lessons/linux-and-distros.json'
import c4 from '../../../content/courses/basic-os-linux/locales/en/lessons/navigate-and-look.json'
import c5 from '../../../content/courses/basic-os-linux/locales/en/lessons/os-what-it-does.json'
import c6 from '../../../content/courses/basic-os-linux/locales/en/lessons/permissions.json'
import c7 from '../../../content/courses/basic-os-linux/locales/en/lessons/pipes-and-logs.json'
import c8 from '../../../content/courses/basic-os-linux/locales/en/lessons/processes-and-packages.json'
import c9 from '../../../content/courses/basic-os-linux/locales/en/lessons/sed-and-awk.json'
import c10 from '../../../content/courses/basic-os-linux/locales/en/lessons/signals-and-jobs.json'
import c11 from '../../../content/courses/basic-os-linux/locales/en/lessons/text-and-regex.json'
import c12 from '../../../content/courses/basic-os-linux/locales/en/lessons/users-and-root.json'
import c13 from '../../../content/courses/basic-os-linux/locales/en/course.json'
import c14 from '../../../content/courses/basic-os-linux/locales/th/lessons/files-and-safety.json'
import c15 from '../../../content/courses/basic-os-linux/locales/th/lessons/filesystem-tree.json'
import c16 from '../../../content/courses/basic-os-linux/locales/th/lessons/get-a-linux.json'
import c17 from '../../../content/courses/basic-os-linux/locales/th/lessons/linux-and-distros.json'
import c18 from '../../../content/courses/basic-os-linux/locales/th/lessons/navigate-and-look.json'
import c19 from '../../../content/courses/basic-os-linux/locales/th/lessons/os-what-it-does.json'
import c20 from '../../../content/courses/basic-os-linux/locales/th/lessons/permissions.json'
import c21 from '../../../content/courses/basic-os-linux/locales/th/lessons/pipes-and-logs.json'
import c22 from '../../../content/courses/basic-os-linux/locales/th/lessons/processes-and-packages.json'
import c23 from '../../../content/courses/basic-os-linux/locales/th/lessons/sed-and-awk.json'
import c24 from '../../../content/courses/basic-os-linux/locales/th/lessons/signals-and-jobs.json'
import c25 from '../../../content/courses/basic-os-linux/locales/th/lessons/text-and-regex.json'
import c26 from '../../../content/courses/basic-os-linux/locales/th/lessons/users-and-root.json'
import c27 from '../../../content/courses/basic-os-linux/locales/th/course.json'
import c28 from '../../../content/courses/basic-os-linux/course.json'
import c29 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-hands-on.json'
import c30 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-reading.json'
import c31 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-references.json'
import c32 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-simulation.json'
import c33 from '../../../content/courses/content-formats-demo/locales/en/course.json'
import c34 from '../../../content/courses/content-formats-demo/course.json'

/** โครง + ข้อความของทุกคอร์ส ผูกเข้ามาตอน build ไม่ใช่ตอน request */
export const COURSE_REGISTRY: Record<
  string,
  { __structure: unknown } & Record<string, { __copy: unknown } & Record<string, unknown>>
> = {
  "basic-os-linux": {
    __structure: c28,
    "en": {
      __copy: c13,
      "files-and-safety": c0,
      "filesystem-tree": c1,
      "get-a-linux": c2,
      "linux-and-distros": c3,
      "navigate-and-look": c4,
      "os-what-it-does": c5,
      "permissions": c6,
      "pipes-and-logs": c7,
      "processes-and-packages": c8,
      "sed-and-awk": c9,
      "signals-and-jobs": c10,
      "text-and-regex": c11,
      "users-and-root": c12,
    },
    "th": {
      __copy: c27,
      "files-and-safety": c14,
      "filesystem-tree": c15,
      "get-a-linux": c16,
      "linux-and-distros": c17,
      "navigate-and-look": c18,
      "os-what-it-does": c19,
      "permissions": c20,
      "pipes-and-logs": c21,
      "processes-and-packages": c22,
      "sed-and-awk": c23,
      "signals-and-jobs": c24,
      "text-and-regex": c25,
      "users-and-root": c26,
    },
  },
  "content-formats-demo": {
    __structure: c34,
    "en": {
      __copy: c33,
      "formats-hands-on": c29,
      "formats-reading": c30,
      "formats-references": c31,
      "formats-simulation": c32,
    },
  },
} as never

/** ข้อความ consent ต่อเวอร์ชัน — ต้องตรงกับ CONSENT_VERSIONS ใน src/lib/consent.ts */
export const CONSENT_TEXTS: Record<string, string> = {
  "v1": "ข้าพเจ้ายินยอมให้ CYBERSKILLS เก็บและใช้อีเมลของข้าพเจ้าเพื่อแจ้งข่าวการเปิดตัวและความคืบหน้าของ CyberSkills Academy ตามที่ระบุในนโยบายความเป็นส่วนตัว และทราบว่าสามารถถอนความยินยอมได้ทุกเมื่อตามช่องทางในนโยบายดังกล่าว\n",
  "v2": "I consent to CYBERSKILLS collecting and using my email to send launch and progress updates about CyberSkills Academy, as described in the privacy notice. I understand that I can withdraw consent at any time using the contact details in that notice.\n\nภาษาไทย: ข้าพเจ้ายินยอมให้ CYBERSKILLS เก็บและใช้อีเมลของข้าพเจ้าเพื่อแจ้งข่าวการเปิดตัวและความคืบหน้าของ CyberSkills Academy ตามที่ระบุในนโยบายความเป็นส่วนตัว และทราบว่าสามารถถอนความยินยอมได้ทุกเมื่อตามช่องทางในนโยบายดังกล่าว\n",
  "v3": "I consent to CYBERSKILLS using my email for CyberSkills Academy launch, course, and promotional updates for up to three years, as described in the privacy notice. I can unsubscribe at any time through the link in each marketing email or by contacting CYBERSKILLS.\n\nภาษาไทย: ข้าพเจ้ายินยอมให้ CYBERSKILLS ใช้อีเมลของข้าพเจ้าเพื่อส่งข่าวการเปิดตัว คอร์ส และโปรโมชั่นของ CyberSkills Academy เป็นเวลาไม่เกินสามปีตามนโยบายความเป็นส่วนตัว และสามารถยกเลิกรับอีเมลได้ทุกเมื่อผ่านลิงก์ในอีเมลการตลาดแต่ละฉบับหรือติดต่อ CYBERSKILLS\n",
}
