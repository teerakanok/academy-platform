import type { Metadata } from 'next'
import Link from 'next/link'
import { CURRENT_CONSENT_VERSION } from '@/lib/consent'

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว',
  description: 'นโยบายความเป็นส่วนตัวของ CYBERSKILLS Academy (PDPA)',
}

// PDPA notice สำหรับ waitlist lead capture — ช่องทางติดต่อใช้ค่าเดียวกับ
// privacy page ของ cyberskills.co.th (contact@cyberskills.co.th)
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-sm text-cs-accent mb-3">PRIVACY POLICY</p>
      <h1 className="font-display text-3xl font-bold text-cs-text mb-2">
        นโยบายความเป็นส่วนตัว CYBERSKILLS Academy
      </h1>
      <p className="text-cs-muted text-sm mb-10">
        ฉบับ {CURRENT_CONSENT_VERSION} · ปรับปรุงล่าสุด 31 กรกฎาคม 2026 ·
        เป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
      </p>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">
            1. ผู้ควบคุมข้อมูลส่วนบุคคล
          </h2>
          <p>
            CYBERSKILLS (ผู้ให้บริการ CYBERSKILLS Academy) เป็นผู้ควบคุมข้อมูลส่วนบุคคลตามนโยบายนี้
            ติดต่อได้ที่อีเมล{' '}
            <a href="mailto:contact@cyberskills.co.th" className="text-cs-accent underline underline-offset-4">
              contact@cyberskills.co.th
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">
            2. ข้อมูลที่เราเก็บและวัตถุประสงค์
          </h2>
          <p className="mb-3">เมื่อคุณลงทะเบียนรอเปิดตัว (waitlist) เราเก็บข้อมูลต่อไปนี้:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="text-cs-text">อีเมล</span> — เพื่อแจ้งข่าวการเปิดตัว ความคืบหน้า
              และข้อมูลคอร์สของ CYBERSKILLS Academy ตามความยินยอมที่คุณให้ไว้
            </li>
            <li>
              <span className="text-cs-text">ข้อมูลที่มาของการเข้าชม</span> (เช่น UTM parameters,
              หน้าอ้างอิง — ถ้ามี) — เพื่อวิเคราะห์ช่องทางการรับรู้ ปรับปรุงการสื่อสาร
            </li>
            <li>
              <span className="text-cs-text">เวลาและเวอร์ชันข้อความความยินยอม</span> —
              เพื่อเป็นหลักฐานการให้ความยินยอมตามกฎหมาย
            </li>
          </ul>
          <p className="mt-3">
            ฐานทางกฎหมาย: <span className="text-cs-text">ความยินยอม (consent)</span> — คุณให้ผ่าน
            checkbox ที่ไม่ได้ถูกเลือกไว้ล่วงหน้า
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">3. ระยะเวลาเก็บรักษา</h2>
          <p>
            เราเก็บข้อมูลของคุณไว้จนกว่าคุณถอนความยินยอม หรือสูงสุด 2 ปีนับจากวันลงทะเบียน
            แล้วแต่เหตุใดถึงก่อน หลังจากนั้นข้อมูลจะถูกลบออกจากระบบ
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">
            4. การเปิดเผยข้อมูลต่อบุคคลที่สาม
          </h2>
          <p>
            เราไม่ขาย ไม่ให้เช่า และไม่เปิดเผยอีเมลของคุณต่อบุคคลที่สามเพื่อการตลาดของผู้อื่น
            ข้อมูลเก็บอยู่ในระบบฐานข้อมูลที่ CYBERSKILLS ดูแลเอง
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">
            5. สิทธิของคุณและการถอนความยินยอม
          </h2>
          <p className="mb-3">
            คุณมีสิทธิตาม PDPA ในการขอเข้าถึง ขอสำเนา ขอแก้ไข ขอลบข้อมูล และถอนความยินยอมได้ทุกเมื่อ
            โดยไม่กระทบความชอบด้วยกฎหมายของการประมวลผลก่อนการถอน
          </p>
          <p>
            ช่องทางใช้สิทธิ: ส่งคำขอมาที่{' '}
            <a href="mailto:contact@cyberskills.co.th" className="text-cs-accent underline underline-offset-4">
              contact@cyberskills.co.th
            </a>{' '}
            ระบุอีเมลที่ลงทะเบียนไว้ เราจะดำเนินการภายใน 30 วัน
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-cs-text mb-3">6. การเปลี่ยนแปลงนโยบาย</h2>
          <p>
            หากมีการแก้ไขนโยบายนี้อย่างมีนัยสำคัญ เราจะแจ้งผ่านอีเมลที่คุณลงทะเบียนไว้
            พร้อมขอความยินยอมใหม่เมื่อกฎหมายกำหนด
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-cs-border">
        <Link href="/" className="font-mono text-sm text-cs-accent hover:underline underline-offset-4">
          ← กลับหน้าแรก
        </Link>
      </div>
    </article>
  )
}
