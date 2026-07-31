import { WaitlistForm } from '@/components/WaitlistForm'
import { consentText, CURRENT_CONSENT_VERSION } from '@/lib/consent'

// Landing shell — content-agnostic: ห้ามประกาศ course ใดๆ จนกว่า founder เคาะ catalog
export default function HomePage() {
  // ข้อความ consent ต้องมาจากไฟล์ versioned ฉบับเดียวกับที่ API บันทึกเสมอ
  // (finding review lane: ห้าม hardcode copy แยกจาก v1.md — หลักฐาน consent จะผิดฉบับ)
  const consentLabel = consentText(CURRENT_CONSENT_VERSION).trim()
  return (
    <div className="mx-auto max-w-5xl px-6">
      <section className="pt-24 pb-16 sm:pt-32">
        <p className="font-mono text-sm text-cs-accent mb-4">
          <span aria-hidden="true">$ </span>cyberskills --academy
        </p>
        <h1 className="font-display text-4xl sm:text-6xl font-bold text-cs-text tracking-tight mb-6">
          CyberSkills Academy
        </h1>
        <p className="text-lg sm:text-xl text-cs-body max-w-2xl leading-relaxed">
          แพลตฟอร์มเรียน cybersecurity ที่ปรับเส้นทางตามสิ่งที่คุณรู้อยู่แล้ว —
          ไม่ต้องเรียนซ้ำของที่รู้ พิสูจน์ทักษะด้วยการลงมือทำจริง
          แล้วเดินหน้าสู่เป้าหมายสายอาชีพของคุณอย่างมั่นคง
        </p>
      </section>

      <section className="pb-16 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'เรียนเฉพาะที่ต้องเรียน',
            body: 'ระบบประเมินสิ่งที่คุณรู้แล้ว แนะนำให้ข้ามอย่างมั่นใจพร้อมสรุปสาระสำคัญ',
          },
          {
            title: 'พิสูจน์ด้วยการทำจริง',
            body: 'ฝึกและทดสอบใน lab บนเบราว์เซอร์ — ผลลัพธ์เชื่อถือได้เพราะลงมือทำจริง',
          },
          {
            title: 'พร้อมสอบอย่างมีหลักฐาน',
            body: 'ข้อสอบฝึกพร้อมคำอธิบายทุกข้อ รู้จุดอ่อนชัดเจนก่อนถึงวันสอบจริง',
          },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-cs-border bg-cs-surface p-6">
            <h2 className="font-display font-semibold text-cs-text mb-2">{item.title}</h2>
            <p className="text-sm text-cs-body leading-relaxed">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="pb-24 max-w-2xl" aria-labelledby="waitlist-heading">
        <h2 id="waitlist-heading" className="font-display text-2xl font-bold text-cs-text mb-2">
          เปิดตัวเร็วๆ นี้
        </h2>
        <p className="text-cs-body mb-6">ลงทะเบียนรับข่าวการเปิดตัวก่อนใคร</p>
        <WaitlistForm consentSummary={consentLabel} />
      </section>
    </div>
  )
}
