import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Sandbox } from '../../scripts/adversarial/sandbox.mjs'

/**
 * สคริปต์ adversarial ต้องแก้ไฟล์จริงเพื่อพิสูจน์ว่าด่านกัดจริง ซึ่งแปลว่ามันถือ
 * อำนาจลบของในรีโปอยู่ในมือ รุ่นแรกใช้อำนาจนั้นผิดจนงานของ reviewer หายไป
 * รุ่นที่สองปิดเคสนั้นแล้วยังพังอีกหกทางที่รีวิวอิสระ reproduce ให้ดู
 *
 * เทสชุดนี้ผูกทั้งกติกาเดิมและ POC ทั้งหกไว้ ไม่ใช่แค่เคสที่นึกออกเอง
 */
describe('ที่กันเปื้อนของสคริปต์ adversarial', () => {
  let root: string
  let outside: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-test-')))
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-outside-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('ลบเฉพาะไฟล์ที่ตัวเองสร้าง ไม่แตะของที่มีอยู่ก่อน', () => {
    mkdirSync(join(root, 'shared'))
    writeFileSync(join(root, 'shared/ของคนอื่น.txt'), 'ห้ามหาย')

    const sandbox = new Sandbox(root)
    sandbox.create('shared/ของฉัน.txt', 'ชั่วคราว')
    sandbox.restore()

    expect(readFileSync(join(root, 'shared/ของคนอื่น.txt'), 'utf8')).toBe('ห้ามหาย')
    expect(existsSync(join(root, 'shared/ของฉัน.txt'))).toBe(false)
    expect(existsSync(join(root, 'shared'))).toBe(true)
    expect(sandbox.problems()).toEqual([])
  })

  it('ปฏิเสธการทับไฟล์ที่มีอยู่แล้ว แทนที่จะเขียนทับเงียบๆ', () => {
    writeFileSync(join(root, 'มีอยู่แล้ว.txt'), 'ของเดิม')
    const sandbox = new Sandbox(root)

    expect(() => sandbox.create('มีอยู่แล้ว.txt', 'ของใหม่')).toThrow(/ปฏิเสธการทับ/)
    expect(readFileSync(join(root, 'มีอยู่แล้ว.txt'), 'utf8')).toBe('ของเดิม')
  })

  it('ปฏิเสธ symlink ที่ห้อยอยู่ แทนที่จะเขียนทะลุออกไปนอกราก', () => {
    // POC ของรีวิว: `existsSync` ตอบ false ให้ลิงก์ที่ชี้ไปที่ที่ยังไม่มี รุ่นก่อนจึง
    // "สร้างใหม่" ทับมัน แล้วไบต์ไปโผล่นอกราก ตอนนี้ O_EXCL ล้มเหลวทันที
    const target = join(outside, 'เหยื่อ.txt')
    symlinkSync(target, join(root, 'ลิงก์ห้อย.txt'))
    const sandbox = new Sandbox(root)

    expect(() => sandbox.create('ลิงก์ห้อย.txt', 'ข้อมูลที่ไม่ควรออกไป')).toThrow(/ปฏิเสธการทับ/)
    expect(existsSync(target)).toBe(false)
    expect(lstatSync(join(root, 'ลิงก์ห้อย.txt')).isSymbolicLink()).toBe(true)
  })

  it('ปฏิเสธเมื่อโฟลเดอร์แม่เป็น symlink ที่พาออกนอกราก', () => {
    // containment ด้วยสตริงมองไม่เห็นเคสนี้ เพราะพาธยังขึ้นต้นด้วย root อยู่
    symlinkSync(outside, join(root, 'ทางลัด'))
    const sandbox = new Sandbox(root)

    expect(() => sandbox.create('ทางลัด/หลุด.txt', 'x')).toThrow(/ปฏิเสธพาธนอกราก/)
    expect(() => sandbox.symlink('ทางลัด/ลิงก์.txt', 'ของจริง.txt')).toThrow(/ปฏิเสธพาธนอกราก/)
    expect(existsSync(join(outside, 'หลุด.txt'))).toBe(false)
  })

  it('ไม่ลบไฟล์ที่ถูกแทนที่ระหว่างทาง แม้จะอยู่ที่พาธเดิม', () => {
    const sandbox = new Sandbox(root)
    sandbox.create('ชั่วคราว.txt', 'ของเรา')
    // มีคนลบของเราแล้ววางของเขาไว้ที่เดิม — ชื่อพาธเหมือนกันแต่คนละก้อน
    unlinkSync(join(root, 'ชั่วคราว.txt'))
    writeFileSync(join(root, 'ชั่วคราว.txt'), 'ของคนอื่น')

    sandbox.restore()
    expect(readFileSync(join(root, 'ชั่วคราว.txt'), 'utf8')).toBe('ของคนอื่น')
    expect(sandbox.problems().join()).toMatch(/ไม่ใช่ก้อนที่เราสร้าง/)
  })

  it('ไม่เขียนทับงานที่มีคนแก้หลังจากเราเขียน', () => {
    writeFileSync(join(root, 'ร่วมกัน.txt'), 'ต้นฉบับ')
    const sandbox = new Sandbox(root)
    sandbox.modify('ร่วมกัน.txt', 'ที่เราเขียน')
    writeFileSync(join(root, 'ร่วมกัน.txt'), 'งานที่คนอื่นเพิ่งแก้')

    sandbox.restore()
    expect(readFileSync(join(root, 'ร่วมกัน.txt'), 'utf8')).toBe('งานที่คนอื่นเพิ่งแก้')
    expect(sandbox.problems().join()).toMatch(/มีคนแก้หลังจากเราเขียน/)
  })

  it('ไม่เขียนทะลุ symlink ที่ถูกสลับมาก่อนคืนสภาพ และรายการที่เหลือยังถูกเก็บ', () => {
    const victim = join(outside, 'เหยื่อ.txt')
    writeFileSync(victim, 'ของนอกราก')
    writeFileSync(join(root, 'จะถูกสลับ.txt'), 'ต้นฉบับ')

    const sandbox = new Sandbox(root)
    sandbox.modify('จะถูกสลับ.txt', 'ที่เราเขียน')
    sandbox.create('อีกไฟล์.txt', 'ของเรา')
    // สลับเป็น symlink ที่ชี้ออกนอกราก การคืนไบต์เดิมจะไปทับไฟล์นั้นถ้าไม่ระวัง
    unlinkSync(join(root, 'จะถูกสลับ.txt'))
    symlinkSync(victim, join(root, 'จะถูกสลับ.txt'))

    sandbox.restore()
    expect(readFileSync(victim, 'utf8')).toBe('ของนอกราก')
    expect(sandbox.problems().join()).toMatch(/ไม่ใช่ไฟล์ธรรมดา/)
    // รายการแรกที่มีปัญหาต้องไม่ทำให้รายการหลังค้าง
    expect(existsSync(join(root, 'อีกไฟล์.txt'))).toBe(false)
  })

  it('คืนไบต์เดิมของไฟล์ที่แก้ ไม่ใช่คืนจาก git', () => {
    writeFileSync(join(root, 'ยังไม่ commit.txt'), 'งานที่ค้างอยู่')
    const sandbox = new Sandbox(root)

    sandbox.modify('ยังไม่ commit.txt', 'ถูกแก้ระหว่างทดสอบ')
    expect(readFileSync(join(root, 'ยังไม่ commit.txt'), 'utf8')).toBe('ถูกแก้ระหว่างทดสอบ')

    sandbox.restore()
    expect(readFileSync(join(root, 'ยังไม่ commit.txt'), 'utf8')).toBe('งานที่ค้างอยู่')
    expect(sandbox.problems()).toEqual([])
  })

  it('ลบโฟลเดอร์ที่ตัวเองสร้างเมื่อว่าง แต่ปล่อยไว้ถ้ามีคนอื่นวางของ', () => {
    const first = new Sandbox(root)
    first.create('ของฉัน/ไฟล์.txt', 'x')
    first.restore()
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

  it('symlink ที่สร้างต้องชี้อยู่ในรากเท่านั้น', () => {
    writeFileSync(join(outside, 'เป้าหมายนอกราก.txt'), 'x')
    const sandbox = new Sandbox(root)
    expect(() => sandbox.symlink('ลิงก์.txt', '../sandbox-outside-x/เป้าหมายนอกราก.txt'))
      .toThrow(/ปฏิเสธพาธนอกราก/)
  })
})
