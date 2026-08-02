'use client'

import type { SimulationSurface as SurfaceKind, SimulationState } from '@/lib/simulation/types'
import { NetworkInterfaceSim } from './NetworkInterfaceSim'

// ตัวเลือกหน้าจอจำลอง — **จุดเดียว** ที่รู้ว่า surface ชนิดไหนใช้ component ไหน
//
// เดิมตารางนี้อยู่ใน `SimulationBlock` ซึ่งเป็นบล็อกเนื้อหา · พอ W1 ต้องใช้หน้าจอ
// เดียวกันในด่านท้ายบทด้วย การคัดลอกตารางไปอีกที่แปลว่าเพิ่ม surface ใหม่แล้วต้อง
// ไปแก้สองแห่ง แล้ววันหนึ่งจะลืมแห่งหนึ่ง — แยกออกมาให้ทั้งสองที่ใช้ร่วมกัน

const SURFACES = {
  'network-interface': NetworkInterfaceSim,
} as const

export function SimulationSurface({
  surface,
  state,
  onChange,
  readOnly = false,
}: {
  surface: SurfaceKind
  state: SimulationState
  onChange: (next: SimulationState) => void
  readOnly?: boolean
}) {
  const Surface = SURFACES[surface]
  return <Surface state={state} onChange={onChange} readOnly={readOnly} />
}
