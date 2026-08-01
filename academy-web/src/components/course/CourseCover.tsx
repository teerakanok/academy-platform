import type { CourseStructure } from '@/lib/content/course-types'
import { CoverMotif } from './CoverMotif'
import { EMPTY_STATE, layoutRoadmap, type LearnerCourseState } from '@/lib/course/roadmap'

// หน้าปกคอร์ส = แผนที่เส้นทางของคอร์สนั้นเอง
//
// ทำไมไม่ใช่ลายสุ่มหรือไอคอน: มันได้ประโยชน์สามอย่างพร้อมกันโดยไม่ต้องมีคนวาด
//   1. ต่างกันทุกคอร์สโดยอัตโนมัติ เพราะคอร์สคนละรูปกราฟ (ไม่ต้องดูแล asset)
//   2. บอกสิ่งที่ product นี้ต่างจากคนอื่นตั้งแต่ยังไม่คลิก — คอร์สที่นี่เป็น
//      "แผนที่" ไม่ใช่ "คิวรายการวิดีโอ"
//   3. สะท้อนความคืบหน้าจริงของผู้เรียนได้ (โหนดที่พิสูจน์แล้วทึบ)
//
// ใช้ layoutRoadmap ตัวเดียวกับหน้าคอร์สเป๊ะ แล้วพลิกแกน (rank ไหลเป็นแนวนอน)
// เพื่อให้ได้สัดส่วนแบบแถบกว้าง ปกจึงเป็นภาพย่อของแผนที่จริง ไม่ใช่ของตกแต่งที่
// วาดขึ้นต่างหากแล้วหลุดจากกันเมื่อเนื้อหาเปลี่ยน

// สัดส่วนทั้งหมดคิดเทียบกับ "ขนาดจริงของแผนที่" ไม่ใช่ค่าคงที่ — เพราะ SVG ถูกย่อ
// ขยายให้พอดีแถบ คอร์สที่มีไม่กี่บทจะถูกขยายมากกว่า ถ้าใช้รัศมีคงที่ node ของคอร์ส
// สั้นจะใหญ่กว่าคอร์สยาวอย่างเห็นได้ชัด (เจอจริงตอนเทียบสองการ์ดข้างกัน)
const PAD_RATIO = 0.075
const NODE_RATIO = 0.019
const EDGE_RATIO = 0.005

export function CourseCover({
  structure,
  state = EMPTY_STATE,
  className = '',
}: {
  structure: CourseStructure
  state?: LearnerCourseState
  className?: string
}) {
  const layout = layoutRoadmap(structure, state)
  const proven = new Set([...state.completed, ...state.testedOut])

  // พลิกแกน: แผนที่จริงไหลบนลงล่าง ปกไหลซ้ายไปขวา
  const toCover = (x: number, y: number) => ({ cx: y, cy: x })
  const points = layout.nodes.map((n) => toCover(n.x, n.y))
  const minX = Math.min(...points.map((p) => p.cx))
  const maxX = Math.max(...points.map((p) => p.cx))
  const minY = Math.min(...points.map((p) => p.cy))
  const maxY = Math.max(...points.map((p) => p.cy))

  const unit = Math.max(maxX - minX, maxY - minY, 1)
  const PAD = unit * PAD_RATIO
  const nodeR = unit * NODE_RATIO
  const edgeW = unit * EDGE_RATIO

  return (
    <div className={`cover-wash relative overflow-hidden ${className}`} aria-hidden="true">
      {/* สองโซนที่ไม่ทับกัน: ขวา = ลายบอกหัวข้อ (คอร์สนี้เรื่องอะไร) ·
          ซ้าย/กลาง = แผนที่จริง (เส้นทางหน้าตาแบบไหน)
          เคยวางลายทับกลางแผนที่แล้วอ่านไม่ออกทั้งคู่ */}
      <div className="pointer-events-none absolute inset-y-0 -right-3 flex w-[30%] items-center justify-center">
        <CoverMotif motif={structure.coverMotif ?? 'layers'} />
      </div>
      <svg
        viewBox={`${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${maxY - minY + PAD * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative block h-full w-[70%]"
      >
        {layout.edges.map((edge) => {
          const from = toCover(edge.fromX, edge.fromY)
          const to = toCover(edge.toX, edge.toY)
          const mid = (from.cx + to.cx) / 2
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M ${from.cx} ${from.cy} C ${mid} ${from.cy}, ${mid} ${to.cy}, ${to.cx} ${to.cy}`}
              fill="none"
              stroke="rgb(var(--cs-accent))"
              strokeWidth={edgeW}
              strokeOpacity={0.3}
              strokeLinecap="round"
            />
          )
        })}

        {layout.nodes.map((item) => {
          const { cx, cy } = toCover(item.x, item.y)
          const isProven = proven.has(item.node.id)
          const isCapstone = item.node.kind === 'capstone'
          const r = nodeR * (isCapstone ? 1.32 : 1)

          if (isCapstone) {
            // ด่านบังคับใช้รูปทรงต่าง เหมือนบนแผนที่จริง (สี่เหลี่ยมหมุน = อ่านออกที่ขนาดเล็ก)
            return (
              <rect
                key={item.node.id}
                x={cx - r}
                y={cy - r}
                width={r * 2}
                height={r * 2}
                rx={nodeR * 0.3}
                transform={`rotate(45 ${cx} ${cy})`}
                fill={isProven ? 'rgb(var(--cs-accent-fill))' : 'rgb(var(--cs-surface))'}
                fillOpacity={isProven ? 0.95 : 0.75}
                stroke="rgb(var(--cs-accent))"
                strokeWidth={edgeW * 0.8}
                strokeOpacity={0.7}
              />
            )
          }

          return (
            <circle
              key={item.node.id}
              cx={cx}
              cy={cy}
              r={r}
              fill={isProven ? 'rgb(var(--cs-accent-fill))' : 'rgb(var(--cs-surface))'}
              fillOpacity={isProven ? 0.95 : 0.75}
              stroke="rgb(var(--cs-accent))"
              strokeWidth={edgeW * 0.7}
              strokeOpacity={0.55}
            />
          )
        })}
      </svg>
    </div>
  )
}
