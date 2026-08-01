import type { UiLocale } from './ui'

// นโยบายความเป็นส่วนตัวสองภาษา
//
// ฉบับไทยคือฉบับที่ผูกกับ PDPA และเป็นฉบับที่ใช้อ้างอิงตามกฎหมายไทย
// ฉบับอังกฤษเป็นคำแปลเพื่อความเข้าใจ ไม่ใช่เอกสารกฎหมายคนละฉบับ — ระบุไว้ในหน้าเอง
// เพื่อไม่ให้เข้าใจผิดว่าเป็นสองนโยบายที่ต่างกัน
//
// ที่ต้องมีฉบับอังกฤษ: เมื่อเว็บเป็นภาษาอังกฤษแล้วยังโยนหน้าไทยล้วนให้อ่าน คนที่เปิด
// มาก็ไม่รู้ว่าเรากำลังบอกอะไรเรื่องข้อมูลของเขา ซึ่งเป็นเรื่องที่ต้องเข้าใจได้จริง
// ไม่ใช่แค่มีไว้ให้ครบ

export interface PrivacySection {
  heading: string
  body: string[]
  bullets?: { term: string; text: string }[]
  after?: string
}

export interface PrivacyDoc {
  eyebrow: string
  title: string
  meta: (version: string) => string
  translationNote?: string
  contactEmail: string
  sections: PrivacySection[]
  back: string
}

const th: PrivacyDoc = {
  eyebrow: 'PRIVACY POLICY',
  title: 'นโยบายความเป็นส่วนตัว CYBERSKILLS Academy',
  meta: (v) =>
    `ฉบับ ${v} · ปรับปรุงล่าสุด 31 กรกฎาคม 2026 · เป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)`,
  contactEmail: 'contact@cyberskills.co.th',
  sections: [
    {
      heading: '1. ผู้ควบคุมข้อมูลส่วนบุคคล',
      body: ['CYBERSKILLS (ผู้ให้บริการ CYBERSKILLS Academy) เป็นผู้ควบคุมข้อมูลส่วนบุคคลตามนโยบายนี้ ติดต่อได้ที่อีเมล'],
    },
    {
      heading: '2. ข้อมูลที่เราเก็บและวัตถุประสงค์',
      body: ['เมื่อคุณลงทะเบียนรอเปิดตัว (waitlist) เราเก็บข้อมูลต่อไปนี้'],
      bullets: [
        {
          term: 'อีเมล',
          text: 'ใช้แจ้งข่าวการเปิดตัว ความคืบหน้า และข้อมูลคอร์สของ CYBERSKILLS Academy ตามความยินยอมที่คุณให้ไว้',
        },
        {
          term: 'ข้อมูลที่มาของการเข้าชม',
          text: 'เช่น UTM parameters หรือหน้าอ้างอิง ถ้ามี ใช้ดูว่าคนรู้จักเราจากช่องทางไหน เพื่อปรับการสื่อสารให้ตรงขึ้น',
        },
        {
          term: 'เวลาและเวอร์ชันข้อความความยินยอม',
          text: 'เก็บเป็นหลักฐานว่าคุณให้ความยินยอมกับข้อความฉบับไหน เมื่อไร',
        },
      ],
      after: 'ฐานทางกฎหมาย: ความยินยอม ซึ่งคุณให้ผ่านช่องติ๊กที่ไม่ได้ถูกเลือกไว้ล่วงหน้า',
    },
    {
      heading: '3. ระยะเวลาเก็บรักษา',
      body: [
        'เราเก็บข้อมูลไว้จนกว่าคุณจะถอนความยินยอม หรือไม่เกิน 2 ปีนับจากวันลงทะเบียน แล้วแต่ว่าอย่างไหนถึงก่อน หลังจากนั้นข้อมูลจะถูกลบออกจากระบบ',
      ],
    },
    {
      heading: '4. การเปิดเผยข้อมูลต่อบุคคลที่สาม',
      body: [
        'เราไม่ขาย ไม่ให้เช่า และไม่เปิดเผยอีเมลของคุณให้บุคคลที่สามเอาไปทำการตลาด ข้อมูลอยู่ในฐานข้อมูลที่ CYBERSKILLS ดูแลเอง',
      ],
    },
    {
      heading: '5. สิทธิของคุณและการถอนความยินยอม',
      body: [
        'ตาม PDPA คุณขอเข้าถึงข้อมูล ขอสำเนา ขอแก้ไข ขอลบ และถอนความยินยอมได้ทุกเมื่อ การถอนไม่กระทบความชอบด้วยกฎหมายของสิ่งที่ทำไปก่อนหน้านั้น',
        'ใช้สิทธิได้โดยส่งคำขอมาที่อีเมลด้านล่าง พร้อมระบุอีเมลที่ลงทะเบียนไว้ เราจะดำเนินการภายใน 30 วัน',
      ],
    },
    {
      heading: '6. การเปลี่ยนแปลงนโยบาย',
      body: [
        'ถ้ามีการแก้ไขนโยบายนี้อย่างมีนัยสำคัญ เราจะแจ้งทางอีเมลที่คุณลงทะเบียนไว้ และขอความยินยอมใหม่เมื่อกฎหมายกำหนด',
      ],
    },
  ],
  back: '← กลับหน้าแรก',
}

const en: PrivacyDoc = {
  eyebrow: 'PRIVACY POLICY',
  title: 'CYBERSKILLS Academy privacy notice',
  meta: (v) =>
    `Version ${v} · Last updated 31 July 2026 · Written to meet Thailand's Personal Data Protection Act B.E. 2562 (PDPA)`,
  translationNote:
    'This is a translation of the Thai notice, provided so you can understand what we do with your data. The Thai version is the one that governs legally.',
  contactEmail: 'contact@cyberskills.co.th',
  sections: [
    {
      heading: '1. Who controls your data',
      body: [
        'CYBERSKILLS, which operates CYBERSKILLS Academy, is the data controller for everything described here. You can reach us at',
      ],
    },
    {
      heading: '2. What we collect, and why',
      body: ['When you join the waitlist we store:'],
      bullets: [
        {
          term: 'Your email address',
          text: 'so we can tell you when we launch, how the work is going, and what the courses cover — the things you consented to receive.',
        },
        {
          term: 'How you arrived',
          text: 'UTM parameters or the referring page, when they exist. This tells us which channels people find us through so we can spend our effort where it lands.',
        },
        {
          term: 'When you consented, and to which version of the text',
          text: 'kept as the record of what you agreed to and when.',
        },
      ],
      after: 'Legal basis: your consent, given through a checkbox that is never ticked for you.',
    },
    {
      heading: '3. How long we keep it',
      body: [
        'Until you withdraw consent, or two years from the day you signed up, whichever comes first. After that it is deleted from our systems.',
      ],
    },
    {
      heading: '4. Sharing with anyone else',
      body: [
        'We do not sell your email address, rent it, or hand it to anyone else for their marketing. It sits in a database CYBERSKILLS runs and maintains itself.',
      ],
    },
    {
      heading: '5. Your rights, and how to withdraw',
      body: [
        'Under the PDPA you can ask to see your data, get a copy, correct it, delete it, or withdraw consent at any time. Withdrawing does not make what we did beforehand unlawful.',
        'To exercise any of these, email us at the address below from or naming the address you signed up with. We respond within 30 days.',
      ],
    },
    {
      heading: '6. Changes to this notice',
      body: [
        'If we change anything material, we will tell you at the address you gave us, and ask for consent again where the law requires it.',
      ],
    },
  ],
  back: '← Back to home',
}

export const PRIVACY: Record<UiLocale, PrivacyDoc> = { en, th }
