'use client'

import Link from 'next/link'
import type { CourseStructure } from '@/lib/content/course-types'
import {
  layoutRoadmap,
  NODE_BOTTOM_OFFSET,
  NODE_TOP_OFFSET,
  type LearnerCourseState,
  type NodeStatus,
} from '@/lib/course/roadmap'

// แผนที่เส้นทางของคอร์ส — signature ของหน้านี้
//
// วิธีเข้ารหัสข้อมูล (ตั้งใจไม่ใช้สีอย่างเดียว):
//   · รูปทรง = ชนิดของด่าน  วงกลม = บทเรียนปกติ · หกเหลี่ยม = ด่านบังคับ (capstone)
//   · สี + ไอคอน + ข้อความ = สถานะ  ทำให้อ่านได้แม้ตาบอดสี/พิมพ์ขาวดำ
//   · เส้น = ลำดับก่อนหลัง เส้นทึบ = ทางที่เดินผ่านมาแล้ว เส้นจาง = ยังไม่ถึง
//
// วาดเส้นด้วย SVG ชั้นล่าง แล้ววาง node เป็น HTML ทับ — ได้ข้อความตัดบรรทัด,
// โฟกัสคีย์บอร์ด และลิงก์จริงฟรี โดยไม่ต้องดิ้นรนกับ text ใน SVG

// Done กับ Proven ใช้ "สีเดียวกันคนละน้ำหนัก" โดยตั้งใจ — ทั้งคู่แปลว่าปลอดภัยแล้ว
// ต่างกันแค่เส้นทางที่มา (เรียนจบ vs พิสูจน์ผ่าน) การใช้คนละสีจะสื่อผิดว่าเป็นคนละพวก
// และไม่มีสีไหนแยกจากฟ้าได้จริงในสายตา deuteran อยู่ดี — ตัวแยกจริงคือไอคอน + ป้าย
// แม่กุญแจวาดเป็น SVG ไม่ใช้ emoji — emoji มีสีของตัวเอง (ทอง) ซึ่งเป็นสีเดียว
// บนหน้าที่ไม่อยู่ในระบบสี และเด่นผิดที่โดยเฉพาะบนธีมมืด
const LockGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x={5} y={11} width={14} height={9} rx={2} />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
)

const STATUS_META: Record<NodeStatus, { label: string; icon: React.ReactNode; marker: string }> = {
  completed: {
    label: 'Done',
    icon: '✓',
    marker: 'bg-cs-accent-fill text-cs-on-accent border-cs-accent-fill',
  },
  'tested-out': {
    label: 'Proven',
    icon: '★',
    marker: 'bg-cs-surface text-cs-accent border-cs-accent ring-4 ring-cs-accent-dim',
  },
  skipped: {
    label: 'Skipped',
    icon: '↷',
    marker: 'bg-cs-surface-2 text-cs-muted border-cs-border-2 border-dashed',
  },
  'in-progress': {
    label: 'In progress',
    icon: '◐',
    marker: 'bg-cs-accent-dim text-cs-accent border-cs-accent',
  },
  available: {
    label: 'Ready',
    icon: '›',
    marker: 'bg-cs-surface text-cs-text border-cs-border-2',
  },
  locked: {
    label: 'Locked',
    icon: <LockGlyph />,
    marker: 'bg-cs-surface-2 text-cs-faint border-cs-border',
  },
}

const HEX_CLIP = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)'

export function RoadmapGraph({
  structure,
  state,
  nodeTitles,
  courseSlug,
}: {
  structure: CourseStructure
  state: LearnerCourseState
  nodeTitles: Record<string, string>
  courseSlug: string
}) {
  const layout = layoutRoadmap(structure, state)
  const satisfied = new Set([...state.completed, ...state.testedOut, ...state.skipped])

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <div
          className="relative mx-auto"
          style={{ width: layout.width, height: layout.height }}
          data-testid="roadmap-graph"
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            {layout.edges.map((edge) => {
              const traversed = satisfied.has(edge.from)
              // เส้นไหลลงตรงๆ: จุดควบคุมอยู่แนวตั้งเดียวกับปลายทั้งสองข้าง ทำให้ได้
              // S-curve ที่ลงเสมอ ไม่เหวี่ยงออกด้านข้างเวลาสองปลายอยู่คนละคอลัมน์
              const startY = edge.fromY + NODE_BOTTOM_OFFSET
              const endY = edge.toY - NODE_TOP_OFFSET
              // จำกัดความโค้ง ไม่ให้เส้นเหวี่ยงออกด้านข้างเวลาปลายสองข้างคนละคอลัมน์
              const bend = Math.min(46, Math.max(18, (endY - startY) * 0.55))
              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={`M ${edge.fromX} ${startY} C ${edge.fromX} ${startY + bend}, ${edge.toX} ${endY - bend}, ${edge.toX} ${endY}`}
                  fill="none"
                  stroke={traversed ? 'rgb(var(--cs-accent))' : 'rgb(var(--cs-border-2))'}
                  strokeWidth={traversed ? 2 : 1.5}
                  strokeOpacity={traversed ? 0.75 : 0.5}
                  strokeDasharray={traversed ? undefined : '4 5'}
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {layout.nodes.map((item) => {
            const meta = STATUS_META[item.status]
            const isCapstone = item.node.kind === 'capstone'
            const title = nodeTitles[item.node.id] ?? item.node.id
            const locked = item.status === 'locked'

            const marker = (
              <>
                <span
                  className={`flex h-[52px] w-[52px] items-center justify-center border-2 text-lg font-semibold shadow-card transition-transform duration-200 group-hover:scale-105 ${meta.marker} ${isCapstone ? '' : 'rounded-full'}`}
                  style={isCapstone ? { clipPath: HEX_CLIP, borderRadius: 6 } : undefined}
                  aria-hidden="true"
                >
                  {meta.icon}
                </span>
                <span className="mt-2.5 block max-w-[180px] text-center text-[13px] font-medium leading-snug text-cs-text">
                  {title}
                </span>
                <span className="mt-0.5 block text-center font-mono text-[10px] uppercase tracking-wide text-cs-muted">
                  {meta.label}
                  {isCapstone ? ' · required' : ''}
                </span>
              </>
            )

            const accessibleLabel = `${title} — ${meta.label}${isCapstone ? ', required checkpoint' : ''}, ${item.node.estimatedMinutes} minutes`
            const inner = 'group flex flex-col items-center rise-in'
            const animation = { animationDelay: `${item.rank * 60}ms` } as const

            // ชั้นนอกทำหน้าที่จัดตำแหน่ง (translate กึ่งกลาง) ชั้นในทำ animation
            // แยกกันเพราะ keyframes ที่ใช้ transform จะเขียนทับ transform ของ utility
            // class ทำให้ node หลุดจากตำแหน่งที่เส้นโยงเล็งไว้ (เจอจริงตอนวัดพิกัด)
            return (
              <div
                key={item.node.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: item.x, top: item.y }}
                data-testid={`node-${item.node.id}`}
                data-status={item.status}
              >
                {locked ? (
                  <div
                    className={`${inner} cursor-not-allowed opacity-60`}
                    style={animation}
                    title={`Locked until you clear: ${item.node.prerequisites.map((p) => nodeTitles[p] ?? p).join(', ')}`}
                    aria-label={accessibleLabel}
                  >
                    {marker}
                  </div>
                ) : (
                  <Link
                    href={`/courses/${courseSlug}/lessons/${item.node.id}`}
                    className={`${inner} rounded-xl focus-visible:outline-2`}
                    style={animation}
                    aria-label={accessibleLabel}
                  >
                    {marker}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <figcaption className="mt-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-cs-muted">
          <LegendItem swatch="bg-cs-accent-fill text-cs-on-accent" label="Done, you worked through it" icon="✓" />
          <LegendItem
            swatch="bg-cs-surface border-2 border-cs-accent text-cs-accent"
            label="Proven, you tested out of it"
            icon="★"
          />
          <LegendItem swatch="bg-cs-surface-2 border border-dashed border-cs-border-2" label="Skipped, still unproven" icon="↷" />
          <LegendItem swatch="bg-cs-surface border border-cs-border-2" label="Ready to start" icon="›" />
          <li className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 border border-cs-border-2 bg-cs-surface"
              style={{ clipPath: HEX_CLIP }}
              aria-hidden="true"
            />
            <span>Hexagon = required checkpoint, cannot be skipped</span>
          </li>
        </ul>
      </figcaption>
    </figure>
  )
}

function LegendItem({ swatch, label, icon }: { swatch: string; label: string; icon: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] ${swatch}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span>{label}</span>
    </li>
  )
}
