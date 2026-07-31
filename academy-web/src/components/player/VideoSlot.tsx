import type { MediaRef } from '@/lib/content/types'

// Video slot — รับ normalized media ref จาก CourseContent เท่านั้น (optional);
// ห้ามอ่าน manifest.services (marketing metadata — กติกาแผน §3/§4-M2-7)
// ตอนนี้ render placeholder จนกว่าจะ commit vendor streaming (M5)
export function VideoSlot({ media }: { media?: MediaRef }) {
  if (!media) {
    return (
      <div
        data-testid="video-slot-placeholder"
        className="rounded-lg border border-dashed border-cs-border bg-cs-surface/50 px-4 py-6 text-center text-sm text-cs-faint"
      >
        วิดีโอบทเรียนจะพร้อมใช้งานในรุ่นถัดไป
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-cs-border bg-cs-surface px-4 py-6 text-center text-sm text-cs-body">
      <span className="font-mono text-cs-accent">[video]</span> {media.title ?? media.uri}
    </div>
  )
}
