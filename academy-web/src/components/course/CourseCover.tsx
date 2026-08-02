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

// ปกต้องเป็นกล่องขนาดคงที่ทุกคอร์ส
//
// เดิม viewBox ถูกคำนวณจากกรอบของกราฟตรงๆ ความสูงของปกจึงมาจาก "รูปร่างของกราฟ":
// คอร์สที่แตกกิ่ง (กระจายสองมิติ) ได้ปกสูง ส่วนคอร์สที่เป็นเส้นตรงสามบทได้ปกแบนเตี้ย
// วางข้างกันแล้วการ์ดสูงไม่เท่ากันทันที
//
// วิธีแก้: ล็อกสัดส่วนของปก แล้ว "ขยาย viewBox ออกรอบจุดกึ่งกลางของแผนที่" ให้ได้
// สัดส่วนนั้น — ไม่ใช่ยืดภาพ แผนที่จึงยังไม่บิดและอยู่กลางกล่องเสมอ
const COVER_ASPECT = 16 / 5
// พื้นที่ของ SVG คือ 70% ของความกว้างปก (อีก 30% เป็นลายบอกหัวข้อ)
const SVG_WIDTH_FRACTION = 0.7
const SVG_ASPECT = COVER_ASPECT * SVG_WIDTH_FRACTION

// ขนาด node/เส้นคิดเทียบกับ "ความกว้างของ viewBox สุดท้าย" ไม่ใช่ขนาดของกราฟ
// เพราะ viewBox สุดท้ายคือสิ่งที่ถูกย่อขยายไปเป็นพิกเซลจริง — คิดจากตรงนี้แล้ว node
// ของทุกคอร์สจะออกมาเท่ากันบนหน้าจอ ไม่ว่ากราฟจะยาวหรือสั้น
const PAD_RATIO = 0.05
const NODE_RATIO = 0.014
const EDGE_RATIO = 0.0038

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
  // บทที่ทำจบแล้ว — คำว่า "proven" สงวนให้ด่านวัดผลตั้งแต่ W0-3
  const finished = new Set([...state.completed, ...state.testedOut])

  // พลิกแกน: แผนที่จริงไหลบนลงล่าง ปกไหลซ้ายไปขวา
  const toCover = (x: number, y: number) => ({ cx: y, cy: x })
  const points = layout.nodes.map((n) => toCover(n.x, n.y))
  const minX = Math.min(...points.map((p) => p.cx))
  const maxX = Math.max(...points.map((p) => p.cx))
  const minY = Math.min(...points.map((p) => p.cy))
  const maxY = Math.max(...points.map((p) => p.cy))

  // กรอบของแผนที่ + ระยะขอบ แล้วขยายด้านที่สั้นไปจนได้สัดส่วนของปก
  const extent = Math.max(maxX - minX, maxY - minY, 1)
  const PAD = extent * PAD_RATIO
  const boxW = maxX - minX + PAD * 2
  const boxH = maxY - minY + PAD * 2
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const viewW = boxW / boxH < SVG_ASPECT ? boxH * SVG_ASPECT : boxW
  const viewH = viewW / SVG_ASPECT
  const viewX = centerX - viewW / 2
  const viewY = centerY - viewH / 2

  const nodeR = viewW * NODE_RATIO
  const edgeW = viewW * EDGE_RATIO

  return (
    <div
      // ไม่ใส่ flex ตรงนี้: flex item มี min-width:auto เป็นค่าตั้งต้น SVG จึงไม่ยอมหด
      // ต่ำกว่าขนาดเนื้อหาตัวเอง แล้วดันการ์ดกว้างเกินจอมือถือ (gate จับได้)
      className={`cover-wash relative aspect-[16/5] overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* สองโซนที่ไม่ทับกัน: ขวา = ลายบอกหัวข้อ (คอร์สนี้เรื่องอะไร) ·
          ซ้าย/กลาง = แผนที่จริง (เส้นทางหน้าตาแบบไหน)
          เคยวางลายทับกลางแผนที่แล้วอ่านไม่ออกทั้งคู่ */}
      <div className="pointer-events-none absolute inset-y-0 -right-3 flex w-[30%] items-center justify-center">
        <CoverMotif motif={structure.coverMotif ?? 'layers'} />
      </div>
      <svg
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative block h-full w-[70%] min-w-0"
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
          const isFinished = finished.has(item.node.id)
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
                fill={isFinished ? 'rgb(var(--cs-accent-fill))' : 'rgb(var(--cs-surface))'}
                fillOpacity={isFinished ? 0.95 : 0.75}
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
              fill={isFinished ? 'rgb(var(--cs-accent-fill))' : 'rgb(var(--cs-surface))'}
              fillOpacity={isFinished ? 0.95 : 0.75}
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
