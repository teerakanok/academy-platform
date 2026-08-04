'use client'

import type { SkillDatum } from '@/lib/course/skills'

// Spider chart ของทักษะ — วาด SVG เอง ไม่พึ่ง library (คุม CSP ได้ + ภาพนิ่งพอให้เทส)
//
// ทางเลือกที่ตั้งใจ:
//   · ซีรีส์เดียว → ไม่ต้องมีกล่อง legend (หัวเรื่องบอกอยู่แล้วว่าคืออะไร)
//   · แกนที่ยังไม่เริ่ม ทำเครื่องหมายไว้ชัดและเขียนกำกับใต้ภาพ — ไม่ปล่อยให้อ่านว่า "ได้ 0"
//   · มีตารางตัวเลขคู่กันเสมอ เพราะรูปหลายเหลี่ยมอ่านค่าที่แน่นอนไม่ได้

const SIZE = 260
const CENTER = SIZE / 2
const RADIUS = 92
const RINGS = [25, 50, 75, 100]

function pointOn(index: number, count: number, value: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  const r = (value / 100) * RADIUS
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) }
}

export function RadarChart({
  data,
  title,
  accent = 'accent',
  testId,
}: {
  data: SkillDatum[]
  title: string
  accent?: 'accent' | 'accent-2'
  testId?: string
}) {
  const count = data.length
  const stroke = accent === 'accent' ? 'rgb(var(--cs-accent))' : 'rgb(var(--cs-accent-2))'
  const fill = accent === 'accent' ? 'var(--cs-accent-dim)' : 'var(--cs-accent-2-dim)'
  const polygon = data.map((d, i) => pointOn(i, count, d.value)).map((p) => `${p.x},${p.y}`).join(' ')
  const untouched = data.filter((d) => d.notStarted)
  // ยังไม่มีอะไรเลย → รูปหลายเหลี่ยมจะยุบเป็นจุดเดียวกลางภาพ ซึ่งอ่านว่า "พัง"
  // มากกว่า "ยังไม่เริ่ม" — กรณีนี้แสดงแค่ตารางเปล่าๆ พร้อมข้อความบอกตรงๆ
  const nothingYet = untouched.length === count

  return (
    <figure className="m-0" data-testid={testId}>
      <figcaption className="mb-3 font-display text-base font-semibold text-cs-text">{title}</figcaption>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          // ยังไม่มีข้อมูล = ใส่ wash อ่อนๆ ไว้ ไม่ปล่อยให้เป็นโครงลวดขาวโล่ง
          // ซึ่งอ่านเหมือน "พัง" มากกว่า "ยังไม่เริ่ม"
          className={`h-[268px] w-[268px] shrink-0 rounded-feature ${nothingYet ? 'cover-wash' : ''}`}
          role="img"
          aria-label={`${title}: ${data.map((d) => `${d.label} ${d.notStarted ? 'not started' : `${d.value} percent`}`).join(', ')}`}
        >
          {RINGS.map((ring) => (
            <polygon
              key={ring}
              points={data.map((_, i) => pointOn(i, count, ring)).map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgb(var(--cs-accent))"
              strokeWidth={1}
              strokeOpacity={0.22}
            />
          ))}
          {data.map((_, i) => {
            const end = pointOn(i, count, 100)
            return (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={end.x}
                y2={end.y}
                stroke="rgb(var(--cs-accent))"
                strokeWidth={1}
                strokeOpacity={0.18}
              />
            )
          })}

          {!nothingYet && (
            <>
              <polygon points={polygon} fill={fill} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
              {data.map((d, i) => {
                const p = pointOn(i, count, d.value)
                return (
                  <circle
                    key={d.id}
                    cx={p.x}
                    cy={p.y}
                    r={d.notStarted ? 3 : 4.5}
                    fill={d.notStarted ? 'rgb(var(--cs-surface))' : stroke}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                )
              })}
            </>
          )}

          {nothingYet && (
            <>
              <circle cx={CENTER} cy={CENTER} r={7} fill="rgb(var(--cs-accent-fill))" fillOpacity={0.9} />
              <text
                x={CENTER}
                y={CENTER + 30}
                textAnchor="middle"
                className="fill-cs-accent"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                you start here
              </text>
            </>
          )}
        </svg>

        <div className="w-full min-w-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{title} — numeric values</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-cs-border/70 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-cs-body">
                    {d.label}
                  </th>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-cs-muted">
                    {d.notStarted ? 'not started' : `${d.value}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {untouched.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-cs-muted">
              {nothingYet
                ? 'Nothing recorded yet. Finish a lesson and this fills in — it is a map of where to go next, not a score.'
                : `${untouched.length} ${untouched.length === 1 ? 'area has' : 'areas have'} nothing recorded yet — that is a map of where to go next, not a score.`}
            </p>
          )}
        </div>
      </div>
    </figure>
  )
}
