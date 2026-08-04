import type { UiLocale } from './ui'

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
  eyebrow: 'PRIVACY NOTICE',
  title: 'นโยบายความเป็นส่วนตัว CYBERSKILLS Academy',
  meta: (v) =>
    `ฉบับ ${v} · ปรับปรุงล่าสุด 4 สิงหาคม 2026 · ใช้กับข้อมูลที่ CYBERSKILLS Academy ประมวลผล`,
  contactEmail: 'contact@cyberskills.co.th',
  sections: [
    {
      heading: '1. ผู้ควบคุมข้อมูลส่วนบุคคล',
      body: ['CYBERSKILLS เป็นผู้ควบคุมข้อมูลส่วนบุคคลสำหรับ Academy ติดต่อได้ที่อีเมล'],
    },
    {
      heading: '2. ข้อมูลที่เราเก็บและเหตุผลที่ใช้',
      body: ['เราเก็บเฉพาะข้อมูลที่จำเป็นต่อการติดต่อ การให้บริการเรียน การตรวจผล และการดูแลความปลอดภัย'],
      bullets: [
        {
          term: 'รายชื่อรอเปิด',
          text: 'อีเมล แหล่งที่เข้ามา วันเวลา และข้อความความยินยอม เพื่อส่งข่าวเปิดตัว คอร์ส และโปรโมชั่นที่คุณเลือกรับ',
        },
        {
          term: 'บัญชี Academy',
          text: 'รหัสตัวตนจากระบบบัญชีกลาง อีเมลที่ยืนยันแล้ว ชื่อที่เลือกใช้ วันสร้างบัญชี และเวลาที่ใช้งานล่าสุด เพื่อเข้าสู่ระบบและเชื่อมประวัติการเรียนกับบัญชีของคุณอย่างถูกต้อง',
        },
        {
          term: 'สิทธิ์เข้าถึง',
          text: 'สถานะเปิดใช้บริการ สิทธิ์เข้าคอร์ส แหล่งที่มาของสิทธิ์ วันให้สิทธิ์ วันหมดอายุ และวันเพิกถอน เพื่อเปิดเฉพาะเนื้อหาที่คุณมีสิทธิ์ใช้',
        },
        {
          term: 'ประวัติการเรียนและผลประเมิน',
          text: 'บทที่เริ่มหรือผ่าน คำตอบ ผลคำถามระหว่างวิดีโอ หลักฐานโจทย์จำลอง ชุดโจทย์ที่ออกให้ ผลผ่านหรือไม่ผ่าน และเวลาที่เกี่ยวข้อง เพื่อให้เรียนต่อข้ามอุปกรณ์ ตรวจผล และแก้ข้อโต้แย้งได้',
        },
        {
          term: 'ประวัติการดำเนินการ',
          text: 'รายการรีเซ็ตความก้าวหน้า การถอนความยินยอม และสถานะคำขอใช้สิทธิ โดยไม่เก็บรายละเอียดคำร้องไว้ในตารางข้อสอบ',
        },
      ],
      after: 'เราไม่เก็บข้อมูลการชำระเงินหรือออกใบรับรองในระบบรุ่นปัจจุบัน ถ้าเริ่มเก็บข้อมูลใหม่ เราจะปรับคำแจ้งก่อนเริ่มเก็บ',
    },
    {
      heading: '3. ฐานทางกฎหมายและข้อมูลที่จำเป็น',
      body: [
        'อีเมลการตลาดใช้ฐานความยินยอม การสร้างบัญชี การให้สิทธิ์เข้าคอร์ส และการบันทึกความก้าวหน้าใช้เพื่อให้บริการที่คุณขอ การรักษาความปลอดภัย ความถูกต้องของผล การช่วยเหลือ และการพิจารณาอุทธรณ์ใช้เท่าที่จำเป็นต่อประโยชน์โดยชอบด้วยกฎหมาย และบางข้อมูลอาจเก็บเพื่อปฏิบัติตามกฎหมายหรือใช้สิทธิเรียกร้องตามกฎหมาย',
        'ถ้าไม่ให้อีเมลสำหรับบัญชีหรือข้อมูลที่จำเป็นต่อการตรวจผล เราจะสร้างบัญชีหรือบันทึกผลการเรียนให้ไม่ได้ แต่การไม่ยินยอมรับการตลาดไม่กระทบสิทธิ์เรียนที่มีอยู่',
      ],
    },
    {
      heading: '4. ระยะเวลาเก็บรักษา',
      body: [],
      bullets: [
        {
          term: 'รายชื่อรอเปิดและหลักฐานการถอน',
          text: '3 ปีนับจากการให้ความยินยอมปัจจุบัน การให้ใหม่หลังหมดอายุ หรือการถอน แล้วลบเมื่อครบกำหนด เว้นแต่มีเหตุจำเป็นตามกฎหมาย',
        },
        {
          term: 'ความพยายามสอบที่ไม่ใช่หลักฐานการผ่าน',
          text: '90 วันหลังออกผล หรือ 90 วันหลัง attempt หมดอายุหากยังทำไม่เสร็จ ผู้สอบยื่นอุทธรณ์ได้ภายใน 30 วันหลังออกผล และถ้ามีเคสเปิด ระบบจะพักการลบจนปิดเคส',
        },
        {
          term: 'บัญชีและประวัติการเรียน',
          text: '2 ปีหลังใช้งาน Academy ครั้งล่าสุด เว้นแต่คุณขอลบก่อน หรือมีการอุทธรณ์ที่ยังไม่ปิดหรือเหตุจำเป็นตามกฎหมาย',
        },
        {
          term: 'หลักฐานความยินยอมและคำขอใช้สิทธิ',
          text: '3 ปีหลังเหตุการณ์ล่าสุด เพื่อพิสูจน์ว่าเราได้รับและดำเนินการตามคำขออย่างไร',
        },
      ],
    },
    {
      heading: '5. ผู้ที่ประมวลผลหรือรับข้อมูล',
      body: [
        'เราไม่ขายหรือให้เช่าข้อมูลส่วนบุคคล ข้อมูลถูกประมวลผลโดยบุคลากรที่ได้รับอนุญาต ระบบบัญชีกลาง โครงสร้างฐานข้อมูลที่ CYBERSKILLS ดูแล และผู้ให้บริการโครงสร้างเว็บที่ทำงานตามคำสั่งของเรา',
        'หากการให้บริการทำให้ข้อมูลถูกประมวลผลนอกประเทศไทย เราจะใช้มาตรการและฐานการโอนข้อมูลที่กฎหมายกำหนด รายชื่อผู้ให้บริการและตำแหน่งประมวลผลต้องผ่านการตรวจอีกครั้งก่อนเปิดรับผู้ใช้จริง',
      ],
    },
    {
      heading: '6. สิทธิ การถอนความยินยอม และการอุทธรณ์ผล',
      body: [
        'คุณขอเข้าถึงหรือรับสำเนา ขอแก้ไข ขอรับหรือโอนข้อมูลเมื่อใช้ได้ ขอระงับหรือคัดค้านการใช้ และขอลบข้อมูลได้ตามเงื่อนไขของกฎหมาย คุณยังถอนความยินยอมและร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้',
        'อีเมลการตลาดทุกฉบับต้องมีลิงก์ยกเลิกเฉพาะผู้รับ การยกเลิกจะหยุดอีเมลการตลาดโดยไม่กระทบบัญชีหรือประวัติการเรียน หรือส่งคำขอมาที่อีเมล',
        'ถ้าต้องการอุทธรณ์ผลสอบ ให้ติดต่อภายใน 30 วันหลังออกผล ระบุบัญชี คอร์ส และเวลาที่ทำรายการ เราจะพักการลบหลักฐานของ attempt นั้นจนกว่าจะปิดเคส',
        'คำขอเข้าถึงหรือรับสำเนาที่เข้าเงื่อนไขตามกฎหมายจะดำเนินการโดยไม่ชักช้าและไม่เกิน 30 วัน คำขอประเภทอื่นจะดำเนินการโดยไม่ชักช้าตามกรอบกฎหมาย หลังยืนยันตัวตนและตรวจว่าสิทธิของบุคคลอื่นไม่เสียหาย ติดต่อได้ที่อีเมล',
      ],
    },
    {
      heading: '7. การรักษาความปลอดภัย',
      body: [
        'Academy จำกัดการเข้าถึงข้อมูลไว้ที่บริการฝั่งเซิร์ฟเวอร์ ใช้การตรวจสิทธิ์ตามบัญชีและคอร์ส แยกข้อมูลเฉลยออกจากหน้าผู้เรียน และบันทึกผลกับหลักฐานในธุรกรรมเดียวกัน มาตรการจะถูกทบทวนตามความเสี่ยงและการเปลี่ยนแปลงของระบบ',
      ],
    },
    {
      heading: '8. การเปลี่ยนแปลงนโยบาย',
      body: [
        'เมื่อการเปลี่ยนแปลงมีผลต่อวัตถุประสงค์ ข้อมูล หรือสิทธิของคุณ เราจะแจ้งผ่านช่องทางที่เหมาะสมและขอความยินยอมใหม่เมื่อกฎหมายกำหนด',
      ],
    },
  ],
  back: 'กลับหน้าแรก',
}

const en: PrivacyDoc = {
  eyebrow: 'PRIVACY NOTICE',
  title: 'CYBERSKILLS Academy privacy notice',
  meta: (v) => `Version ${v} · Last updated 4 August 2026 · Covers data processed by CYBERSKILLS Academy`,
  translationNote:
    'This English translation is provided so you can understand how we handle your data. The Thai notice governs legally.',
  contactEmail: 'contact@cyberskills.co.th',
  sections: [
    {
      heading: '1. Who controls your data',
      body: ['CYBERSKILLS is the data controller for Academy. You can reach us at'],
    },
    {
      heading: '2. What we collect, and why',
      body: ['We collect only what is needed to communicate with you, deliver learning, verify results, and protect the service.'],
      bullets: [
        {
          term: 'Launch waitlist',
          text: 'your email, referral source, and the time and wording of your consent, used for the launch, course, and promotional updates you chose to receive.',
        },
        {
          term: 'Academy account',
          text: 'the identifier from our shared account system, verified email, chosen display name, account creation time, and last activity, used to sign you in and attach records to the right person.',
        },
        {
          term: 'Access rights',
          text: 'service activation and course entitlement status, source, grant, expiry, and revocation times, used to open only the content you are entitled to use.',
        },
        {
          term: 'Learning and assessment record',
          text: 'lessons started or passed, answers, video-question results, simulation evidence, issued task sets, pass or fail outcome, and related times, used to resume across devices, verify results, and resolve disputes.',
        },
        {
          term: 'Operational history',
          text: 'progress resets, consent withdrawals, and rights-request status. Complaint text is not stored in assessment rows.',
        },
      ],
      after: 'The current release does not collect payment data or issue certificates. We will update this notice before collecting new categories of data.',
    },
    {
      heading: '3. Legal grounds and required data',
      body: [
        'Marketing email relies on consent. Account creation, course access, and learning progress are used to provide the service you request. Security, result integrity, support, and appeals are processed only as needed for legitimate interests. Some records may also be kept to comply with law or establish, exercise, or defend legal claims.',
        'Without the verified email and assessment data required for the service, we cannot create the account or record learning results. Declining marketing does not affect course access you already hold.',
      ],
    },
    {
      heading: '4. How long we keep it',
      body: [],
      bullets: [
        {
          term: 'Waitlist and withdrawal record',
          text: 'three years from the current grant, a fresh grant after expiry, or withdrawal, then deleted unless the law requires a longer hold.',
        },
        {
          term: 'Exam attempts not used as passing evidence',
          text: '90 days after a result is issued, or 90 days after an unfinished attempt expires. You may appeal within 30 days after a result is issued. An open case pauses deletion until it is resolved.',
        },
        {
          term: 'Account and learning record',
          text: 'two years after your last Academy activity, unless you ask us to delete it earlier or an unresolved appeal or law requires a hold.',
        },
        {
          term: 'Consent and rights-request evidence',
          text: 'three years after the latest event so we can show what was requested and how it was handled.',
        },
      ],
    },
    {
      heading: '5. Who processes or receives it',
      body: [
        'We do not sell or rent personal data. It is processed by authorized personnel, our shared account system, database infrastructure operated by CYBERSKILLS, and web-infrastructure providers acting on our instructions.',
        'If service delivery involves processing outside Thailand, we will use the safeguards and transfer ground required by law. The final processor and location inventory must be verified again before public launch.',
      ],
    },
    {
      heading: '6. Your rights, withdrawal, and result appeals',
      body: [
        'Subject to the law, you may request access or a copy, correction, portability where applicable, restriction, objection, or deletion. You may also withdraw consent and complain to Thailand’s Personal Data Protection Committee.',
        'Every marketing email must include a recipient-specific unsubscribe link. Unsubscribing stops Academy marketing without changing your account or learning record. You can also email us at',
        'To appeal an assessment result, contact us within 30 days after the result is issued and identify the account, course, and approximate time. We will hold that attempt evidence until the case is closed.',
        'A valid access or copy request will be handled without delay and within 30 days. Other requests will be handled without delay under the applicable legal timeframe after we verify identity and protect other people’s rights. Email us at',
      ],
    },
    {
      heading: '7. How we protect it',
      body: [
        'Academy limits data access to server-side services, checks account and course authorization, keeps answer keys away from learner pages, and records results and evidence in one transaction. Controls are reviewed as the system and its risks change.',
      ],
    },
    {
      heading: '8. Changes to this notice',
      body: [
        'If a change affects the purpose, data, or your rights, we will notify you through an appropriate channel and seek fresh consent where the law requires it.',
      ],
    },
  ],
  back: 'Back to home',
}

export const PRIVACY: Record<UiLocale, PrivacyDoc> = { en, th }
