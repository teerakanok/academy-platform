import type { CoverMotif as MotifName } from '@/lib/content/course-types'

// ลายพื้นหลังประจำคอร์ส — งานของมันคือตอบคำถาม "คอร์สนี้เรื่องอะไร" ตั้งแต่ยังไม่อ่านชื่อ
//
// ทำไมต้องมี: ปกที่เป็นกราฟโหนดอย่างเดียวบอกได้แค่ "เส้นทางหน้าตาแบบไหน" — คอร์ส
// SOC L1 กับ Linux ที่บังเอิญมีจำนวนบทใกล้กันจะดูเหมือนกัน ลายนี้เป็นชั้นที่แยก
// "หัวข้อ" ออกจาก "รูปร่างเส้นทาง" โดยยังไม่ต้องมีคนวาดภาพต่อคอร์ส
//
// กติกา: อยู่คนละโซนกับแผนที่ (ขวาสุด) ความทึบพอให้อ่านออกว่าเป็นอะไร แต่ยัง
// เบากว่าแผนที่ซึ่งเป็นข้อมูลจริง — เคยลองวางทับกลางแล้วเสียทั้งคู่

const STROKE = 'rgb(var(--cs-accent))'

function Terminal() {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
      <rect x={12} y={14} width={168} height={124} rx={14} strokeWidth={6} />
      <path d="M40 58 L60 74 L40 90" />
      <path d="M74 92 H118" />
      <path d="M40 114 H150" strokeOpacity={0.55} />
    </g>
  )
}

function Logs() {
  // เส้น log ยาวไม่เท่ากัน + จุดเน้นหนึ่งจุด = ภาพของการไล่อ่าน log หาสิ่งผิดปกติ
  const lines = [
    [16, 150],
    [16, 108],
    [16, 168],
    [16, 92],
    [16, 138],
    [16, 120],
  ]
  return (
    <g stroke={STROKE} strokeWidth={9} strokeLinecap="round">
      {lines.map(([x, w], i) => (
        <path key={i} d={`M${x} ${26 + i * 20} H${x + w}`} strokeOpacity={i === 3 ? 1 : 0.45} />
      ))}
      <circle cx={172} cy={86} r={9} fill={STROKE} stroke="none" />
    </g>
  )
}

function Shield() {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={6} strokeLinejoin="round">
      <path d="M96 14 L166 42 V92 C166 128 132 150 96 162 C60 150 26 128 26 92 V42 Z" />
      <path d="M68 88 L88 108 L128 66" strokeWidth={8} strokeLinecap="round" />
    </g>
  )
}

function Cloud() {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round">
      <path d="M52 118 A30 30 0 0 1 58 60 A40 40 0 0 1 132 54 A28 28 0 0 1 144 118 Z" />
      <path d="M74 138 H126" strokeOpacity={0.5} />
    </g>
  )
}

function Probe() {
  // แว่นขยายทาบบนโครงสร้าง = การตรวจสอบ/ทดสอบเจาะระบบ
  return (
    <g fill="none" stroke={STROKE} strokeWidth={6} strokeLinecap="round">
      <path d="M24 40 H150 M24 74 H120 M24 108 H96" strokeOpacity={0.4} />
      <circle cx={128} cy={104} r={38} strokeWidth={7} />
      <path d="M156 132 L182 158" strokeWidth={9} />
    </g>
  )
}

function Layers() {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={6} strokeLinejoin="round">
      <path d="M96 22 L168 58 L96 94 L24 58 Z" />
      <path d="M24 92 L96 128 L168 92" strokeOpacity={0.6} />
      <path d="M24 124 L96 160 L168 124" strokeOpacity={0.35} />
    </g>
  )
}

// กรอบจริงที่แต่ละลายวาดกินในผืน 192×176 — วัดจากพิกัดในฟังก์ชันข้างบน
//
// ทำไมต้องมี: ลายทุกอันอยู่ในผืนเท่ากันก็จริง แต่วาดกินพื้นที่ไม่เท่ากัน
// (terminal สูง 124 · layers 138 · shield 148) วางข้างกันแล้วเห็นชัดว่าอันหนึ่ง
// ใหญ่กว่าอีกอัน ทั้งที่กล่องเท่ากันเป๊ะ — ต้องปรับที่ "ขนาดของสิ่งที่วาด" ไม่ใช่
// ขนาดของกล่อง
//
// ⚠️ แก้พิกัดในลายไหน ต้องอัปเดตกรอบของลายนั้นด้วย มีเทสคุมว่าค่าที่ประกาศตรงกับ
// พิกัดจริง
type Box = readonly [minX: number, minY: number, maxX: number, maxY: number]

const MOTIFS: Record<MotifName, { Shape: () => React.JSX.Element; box: Box }> = {
  terminal: { Shape: Terminal, box: [12, 14, 180, 138] },
  logs: { Shape: Logs, box: [16, 26, 184, 126] },
  shield: { Shape: Shield, box: [26, 14, 166, 162] },
  cloud: { Shape: Cloud, box: [30, 28, 170, 138] },
  probe: { Shape: Probe, box: [24, 40, 182, 158] },
  layers: { Shape: Layers, box: [24, 22, 168, 160] },
}

// กล่องเป้าหมายที่ทุกลายต้องพอดี — เลือกให้เล็กกว่าผืนเล็กน้อยเพื่อให้มีระยะหายใจ
const TARGET_W = 150
const TARGET_H = 116
const CENTER_X = 96
const CENTER_Y = 88

/** ย่อ/ขยายลายให้พอดีกล่องเป้าหมายโดยไม่บิดสัดส่วน แล้วจัดกึ่งกลาง */
function fitTransform(box: Box): string {
  const [minX, minY, maxX, maxY] = box
  const w = maxX - minX
  const h = maxY - minY
  const scale = Math.min(TARGET_W / w, TARGET_H / h)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  // เลื่อนจุดกึ่งกลางของลายไปทับจุดกึ่งกลางของผืน แล้วค่อยย่อขยายรอบจุดนั้น
  const tx = CENTER_X - cx * scale
  const ty = CENTER_Y - cy * scale
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`
}

export function CoverMotif({ motif }: { motif: MotifName }) {
  const entry = MOTIFS[motif] ?? MOTIFS.layers
  const { Shape, box } = entry
  return (
    <svg
      viewBox="0 0 192 176"
      aria-hidden="true"
      className="pointer-events-none h-[76%] w-[76%] opacity-[0.3]"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={fitTransform(box)}>
        <Shape />
      </g>
    </svg>
  )
}
