'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AttemptSimulation } from '@/lib/content/public-lesson'

/**
 * สถานะ attempt ของบทที่มีด่านจำลอง (W1)
 *
 * ทำไมต้องเป็น state machine ไม่ใช่ `attempt | null`: ตั้งแต่ค่าเป้าหมายถูกสุ่ม
 * ต่อ attempt โจทย์ในไฟล์เนื้อหาเป็น **แม่แบบ** (`{{targetIp}}`) ไม่ใช่โจทย์จริง
 * การเรนเดอร์ของในไฟล์ไปก่อนแล้วค่อยสลับเมื่อ attempt มาถึง ทำให้ผู้เรียนอ่านโจทย์
 * ที่ยังไม่ใช่ของตัวเอง แล้วช่องกรอกถูกแทนที่ใต้มือ — ผิดมาตรฐาน no-surprise UX
 * และถ้าขอ attempt ไม่ผ่าน (โควตาเต็ม) ต้องบอกตรงๆ ไม่ใช่ปล่อยให้กดส่งแล้วเด้ง
 *
 * `reason` เป็นรหัส ไม่ใช่ข้อความจากเซิร์ฟเวอร์ — คำที่ผู้เรียนอ่านเป็นของ UI
 * ฝ่ายเดียว จึงคุมภาษา/น้ำเสียงได้ และข้อความฝั่ง API เปลี่ยนได้โดยไม่กระทบหน้าจอ
 */
export type LessonAttempt =
  | { status: 'not-needed' }
  | { status: 'loading' }
  | { status: 'ready'; id: string; simulations: AttemptSimulation[] }
  | { status: 'failed'; reason: 'quota' | 'error' }

interface AttemptResponse {
  attemptId?: string
  simulations?: AttemptSimulation[]
}

export function useLessonAttempt(options: {
  /** บทนี้ต้องใช้ attempt ไหม (มีด่านจำลอง และยังไม่จบบท) */
  enabled: boolean
  slug: string
  nodeId: string
}): { attempt: LessonAttempt; retry: () => void } {
  const { enabled, slug, nodeId } = options
  const [attempt, setAttempt] = useState<LessonAttempt>(() =>
    enabled ? { status: 'loading' } : { status: 'not-needed' },
  )
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setAttempt({ status: 'not-needed' })
      return
    }
    let alive = true
    setAttempt({ status: 'loading' })
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, nodeId }),
    })
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) {
          setAttempt({ status: 'failed', reason: res.status === 429 ? 'quota' : 'error' })
          return
        }
        const body = (await res.json()) as AttemptResponse
        if (!alive) return
        if (!body.attemptId) {
          setAttempt({ status: 'failed', reason: 'error' })
          return
        }
        setAttempt({ status: 'ready', id: body.attemptId, simulations: body.simulations ?? [] })
      })
      .catch(() => {
        if (alive) setAttempt({ status: 'failed', reason: 'error' })
      })
    return () => {
      alive = false
    }
  }, [enabled, slug, nodeId, round])

  const retry = useCallback(() => setRound((n) => n + 1), [])
  return { attempt, retry }
}
