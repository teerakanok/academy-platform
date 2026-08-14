import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Sandbox } from '../../scripts/adversarial/sandbox.mjs'

/**
 * สคริปต์ adversarial ต้องแก้ไฟล์จริงเพื่อพิสูจน์ว่าด่านกัดจริง ซึ่งแปลว่ามันถือ
 * อำนาจลบของในรีโปอยู่ในมือ รุ่นก่อนใช้อำนาจนั้นผิด: มันลบโฟลเดอร์ `extra/`
 * ทั้งอันตอนเก็บกวาด โดยไม่สนว่าใครสร้าง งานของคนอื่นที่วางไว้ในนั้นหายไป
 * ทั้งที่สคริปต์ออก 0 ตามปกติ และเมื่อถูกสัญญาณขัดจังหวะมันทิ้งไฟล์ที่แก้ค้างไว้
 *
 * เทสนี้ผูกกติกาสองข้อที่ทำให้เรื่องนั้นเกิดซ้ำไม่ได้
 */
describe('ที่กันเปื้อนของสคริปต์ adversarial', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('ลบเฉพาะไฟล์ที่ตัวเองสร้าง ไม่แตะของที่มีอยู่ก่อน', () => {
    mkdirSync(join(root, 'shared'))
    writeFileSync(join(root, 'shared/ของคนอื่น.txt'), 'ห้ามหาย')

    const sandbox = new Sandbox(root)
    sandbox.create('shared/ของฉัน.txt', 'ชั่วคราว')
    sandbox.restore()

    expect(readFileSync(join(root, 'shared/ของคนอื่น.txt'), 'utf8')).toBe('ห้ามหาย')
    expect(existsSync(join(root, 'shared/ของฉัน.txt'))).toBe(false)
    // โฟลเดอร์มีอยู่ก่อน จึงไม่ใช่ของที่จะลบได้
    expect(existsSync(join(root, 'shared'))).toBe(true)
  })

  it('ปฏิเสธการทับไฟล์ที่มีอยู่แล้ว แทนที่จะเขียนทับเงียบๆ', () => {
    writeFileSync(join(root, 'มีอยู่แล้ว.txt'), 'ของเดิม')
    const sandbox = new Sandbox(root)

    expect(() => sandbox.create('มีอยู่แล้ว.txt', 'ของใหม่'))
      .toThrow(/ปฏิเสธการทับ/)
    expect(readFileSync(join(root, 'มีอยู่แล้ว.txt'), 'utf8')).toBe('ของเดิม')
  })

  it('คืนไบต์เดิมของไฟล์ที่แก้ ไม่ใช่คืนจาก git', () => {
    // คืนจาก git จะกลืนของที่ยังไม่ commit ไปด้วย ซึ่งเป็นคนละความหมายกับ
    // "คืนสภาพ" และเป็นวิธีที่เคยทำงานที่ยังไม่ commit หายมาแล้ว
    writeFileSync(join(root, 'ยังไม่ commit.txt'), 'งานที่ค้างอยู่')
    const sandbox = new Sandbox(root)

    sandbox.modify('ยังไม่ commit.txt', 'ถูกแก้ระหว่างทดสอบ')
    expect(readFileSync(join(root, 'ยังไม่ commit.txt'), 'utf8')).toBe('ถูกแก้ระหว่างทดสอบ')

    sandbox.restore()
    expect(readFileSync(join(root, 'ยังไม่ commit.txt'), 'utf8')).toBe('งานที่ค้างอยู่')
  })

  it('ลบโฟลเดอร์ที่ตัวเองสร้างเมื่อว่าง แต่ปล่อยไว้ถ้ามีคนอื่นวางของ', () => {
    const sandbox = new Sandbox(root)
    sandbox.create('ของฉัน/ไฟล์.txt', 'x')
    sandbox.restore()
    expect(existsSync(join(root, 'ของฉัน'))).toBe(false)

    const second = new Sandbox(root)
    second.create('ของฉัน/ไฟล์.txt', 'x')
    writeFileSync(join(root, 'ของฉัน/คนอื่นวางไว้.txt'), 'ห้ามหาย')
    second.restore()
    expect(readFileSync(join(root, 'ของฉัน/คนอื่นวางไว้.txt'), 'utf8')).toBe('ห้ามหาย')
  })

  it('คืนสภาพซ้ำได้ และไม่ลบซ้ำสิ่งที่ถูกสร้างใหม่หลังคืนแล้ว', () => {
    const sandbox = new Sandbox(root)
    sandbox.create('ชั่วคราว.txt', 'x')
    sandbox.restore()

    writeFileSync(join(root, 'ชั่วคราว.txt'), 'ของใหม่คนละก้อน')
    sandbox.restore()
    expect(readFileSync(join(root, 'ชั่วคราว.txt'), 'utf8')).toBe('ของใหม่คนละก้อน')
  })

  it('ปฏิเสธพาธที่ออกนอกรากที่ประกาศไว้', () => {
    const sandbox = new Sandbox(root)
    for (const escape of ['../นอกราก.txt', '../../ไกลออกไป.txt', '/etc/hosts']) {
      expect(() => sandbox.create(escape, 'x')).toThrow(/ปฏิเสธพาธนอกราก/)
    }
  })
})
