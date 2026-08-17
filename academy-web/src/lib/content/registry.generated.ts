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
import c9 from '../../../content/courses/basic-os-linux/locales/en/lessons/users-and-root.json'
import c10 from '../../../content/courses/basic-os-linux/locales/en/course.json'
import c11 from '../../../content/courses/basic-os-linux/locales/th/lessons/filesystem-tree.json'
import c12 from '../../../content/courses/basic-os-linux/locales/th/lessons/get-a-linux.json'
import c13 from '../../../content/courses/basic-os-linux/locales/th/lessons/linux-and-distros.json'
import c14 from '../../../content/courses/basic-os-linux/locales/th/lessons/os-what-it-does.json'
import c15 from '../../../content/courses/basic-os-linux/locales/th/course.json'
import c16 from '../../../content/courses/basic-os-linux/course.json'
import c17 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-hands-on.json'
import c18 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-reading.json'
import c19 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-references.json'
import c20 from '../../../content/courses/content-formats-demo/locales/en/lessons/formats-simulation.json'
import c21 from '../../../content/courses/content-formats-demo/locales/en/course.json'
import c22 from '../../../content/courses/content-formats-demo/course.json'

/** โครง + ข้อความของทุกคอร์ส ผูกเข้ามาตอน build ไม่ใช่ตอน request */
export const COURSE_REGISTRY: Record<
  string,
  { __structure: unknown } & Record<string, { __copy: unknown } & Record<string, unknown>>
> = {
  "basic-os-linux": {
    __structure: c16,
    "en": {
      __copy: c10,
      "files-and-safety": c0,
      "filesystem-tree": c1,
      "get-a-linux": c2,
      "linux-and-distros": c3,
      "navigate-and-look": c4,
      "os-what-it-does": c5,
      "permissions": c6,
      "pipes-and-logs": c7,
      "processes-and-packages": c8,
      "users-and-root": c9,
    },
    "th": {
      __copy: c15,
      "filesystem-tree": c11,
      "get-a-linux": c12,
      "linux-and-distros": c13,
      "os-what-it-does": c14,
    },
  },
  "content-formats-demo": {
    __structure: c22,
    "en": {
      __copy: c21,
      "formats-hands-on": c17,
      "formats-reading": c18,
      "formats-references": c19,
      "formats-simulation": c20,
    },
  },
} as never

/** ข้อความ consent ต่อเวอร์ชัน — ต้องตรงกับ CONSENT_VERSIONS ใน src/lib/consent.ts */
export const CONSENT_TEXTS: Record<string, string> = {
  "v1": "ข้าพเจ้ายินยอมให้ CYBERSKILLS เก็บและใช้อีเมลของข้าพเจ้าเพื่อแจ้งข่าวการเปิดตัวและความคืบหน้าของ CyberSkills Academy ตามที่ระบุในนโยบายความเป็นส่วนตัว และทราบว่าสามารถถอนความยินยอมได้ทุกเมื่อตามช่องทางในนโยบายดังกล่าว\n",
  "v2": "I consent to CYBERSKILLS collecting and using my email to send launch and progress updates about CyberSkills Academy, as described in the privacy notice. I understand that I can withdraw consent at any time using the contact details in that notice.\n\nภาษาไทย: ข้าพเจ้ายินยอมให้ CYBERSKILLS เก็บและใช้อีเมลของข้าพเจ้าเพื่อแจ้งข่าวการเปิดตัวและความคืบหน้าของ CyberSkills Academy ตามที่ระบุในนโยบายความเป็นส่วนตัว และทราบว่าสามารถถอนความยินยอมได้ทุกเมื่อตามช่องทางในนโยบายดังกล่าว\n",
  "v3": "I consent to CYBERSKILLS using my email for CyberSkills Academy launch, course, and promotional updates for up to three years, as described in the privacy notice. I can unsubscribe at any time through the link in each marketing email or by contacting CYBERSKILLS.\n\nภาษาไทย: ข้าพเจ้ายินยอมให้ CYBERSKILLS ใช้อีเมลของข้าพเจ้าเพื่อส่งข่าวการเปิดตัว คอร์ส และโปรโมชั่นของ CyberSkills Academy เป็นเวลาไม่เกินสามปีตามนโยบายความเป็นส่วนตัว และสามารถยกเลิกรับอีเมลได้ทุกเมื่อผ่านลิงก์ในอีเมลการตลาดแต่ละฉบับหรือติดต่อ CYBERSKILLS\n",
}
