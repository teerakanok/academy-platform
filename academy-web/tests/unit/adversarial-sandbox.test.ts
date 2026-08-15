import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assertPristine, Sandbox } from '../../scripts/adversarial/sandbox.mjs'

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
  /** โฟลเดอร์กู้คืนที่เทสทำให้เกิด — เทสเองก็ต้องไม่ทิ้งขยะไว้ในเครื่อง */
  let spills: (string | null)[]

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-test-')))
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-outside-')))
    spills = []
  })

  afterEach(() => {
    try { chmodSync(root, 0o700) } catch { /* โฟลเดอร์อาจถูกลบไปแล้ว */ }
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
    for (const directory of spills) {
      if (directory !== null) rmSync(directory, { recursive: true, force: true })
    }
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
    spills.push(sandbox.spillDirectory())
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
    spills.push(sandbox.spillDirectory())
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

  it('เก็บไบต์เดิมไว้เมื่อคืนไม่สำเร็จ แล้วเรียกซ้ำต้องกู้ได้', () => {
    // ของเดิมล้างบัญชีทิ้งทุกกรณี พอ restore ติด EACCES ชั่วคราว ไบต์เดิมก็หายถาวร
    // แม้ permission จะคืนมาแล้ว — เป็นการทำข้อมูลหายโดยไม่ต้องมีผู้โจมตี
    const path = join(root, 'ยังไม่ commit.txt')
    writeFileSync(path, 'งานของเจ้าของที่ยังไม่ commit')
    const sandbox = new Sandbox(root)
    sandbox.modify('ยังไม่ commit.txt', 'ที่ harness เขียน')

    chmodSync(path, 0o444)
    sandbox.restore()
    expect(readFileSync(path, 'utf8')).toBe('ที่ harness เขียน')
    expect(sandbox.pending()).toBe(1)
    expect(sandbox.problems().join()).toMatch(/EACCES/)

    chmodSync(path, 0o644)
    sandbox.restore()
    expect(readFileSync(path, 'utf8')).toBe('งานของเจ้าของที่ยังไม่ commit')
    expect(sandbox.pending()).toBe(0)
    // คืนสำเร็จแล้วปัญหาเดิมต้องหายไปด้วย ไม่ใช่ค้างทำให้ gate รายงานล้ม
    // ทั้งที่ทุกอย่างกลับมาเรียบร้อย (debt: problems() เก็บ error เก่า)
    expect(sandbox.problems()).toEqual([])
    spills.push(sandbox.spillDirectory())
  })

  it('ลบไม่สำเร็จก็ต้องเก็บไว้ลองซ้ำ ไม่ใช่ลืมไปเฉยๆ', () => {
    const sandbox = new Sandbox(root)
    sandbox.create('ในโฟลเดอร์/ชั่วคราว.txt', 'x')
    chmodSync(join(root, 'ในโฟลเดอร์'), 0o500)

    sandbox.restore()
    expect(existsSync(join(root, 'ในโฟลเดอร์/ชั่วคราว.txt'))).toBe(true)
    expect(sandbox.pending()).toBe(1)

    chmodSync(join(root, 'ในโฟลเดอร์'), 0o700)
    sandbox.restore()
    expect(existsSync(join(root, 'ในโฟลเดอร์/ชั่วคราว.txt'))).toBe(false)
    expect(sandbox.pending()).toBe(0)
    // เช่นเดียวกันฝั่งลบ: ลบสำเร็จรอบสองแล้วปัญหารอบแรกต้องถูกลบทิ้ง
    expect(sandbox.problems()).toEqual([])
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

  /**
   * รีวิวอิสระรอบเจ็ดพิสูจน์ว่าการ "เก็บไว้ลองซ้ำ" ยังทำข้อมูลหายได้ เพราะ snapshot
   * อยู่แต่ในหน่วยความจำ ถ้า EACCES นานเกินสองครั้งที่ exit handler เรียกติดกัน
   * ไบต์เดิมจะหายไปพร้อมโปรเซส แม้ permission จะคืนมาแล้วก็กู้ไม่ได้อีก
   */
  it('เก็บไบต์เดิมลงดิสก์เมื่อคืนไม่ได้ ให้กู้ได้แม้โปรเซสตายไปแล้ว', () => {
    const path = join(root, 'งานที่ยังไม่ commit.txt')
    writeFileSync(path, 'ORIGINAL-UNCOMMITTED')

    const sandbox = new Sandbox(root)
    sandbox.modify('งานที่ยังไม่ commit.txt', 'HARNESS-BYTES')
    chmodSync(path, 0o444)

    sandbox.restore()
    sandbox.restore()
    expect(sandbox.pending()).toBe(1)

    // ทางออกสุดท้ายก่อนโปรเซสออก
    sandbox.spillPending()
    const recovery = sandbox.recovery()
    expect(recovery).toHaveLength(1)
    expect(recovery[0].target).toBe(path)
    expect(readFileSync(recovery[0].spill, 'utf8')).toBe('ORIGINAL-UNCOMMITTED')
    spills.push(sandbox.spillDirectory())

    // เลียนแบบการกู้หลังโปรเซสตาย: Sandbox เดิมหายไปแล้ว เหลือแต่ไฟล์บนดิสก์
    chmodSync(path, 0o644)
    writeFileSync(path, readFileSync(recovery[0].spill))
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL-UNCOMMITTED')
  })

  it('ทางที่ตัดสินใจไม่เขียนทับ ก็ต้องเก็บไบต์เดิมลงดิสก์ก่อนปล่อยมือ', () => {
    const path = join(root, 'ถูกแก้ทับ.txt')
    writeFileSync(path, 'ORIGINAL-UNCOMMITTED')

    const sandbox = new Sandbox(root)
    sandbox.modify('ถูกแก้ทับ.txt', 'HARNESS-BYTES')
    writeFileSync(path, 'งานใหม่ของคนอื่น')

    sandbox.restore()
    // conflict จบแล้วในสายตาของ restore แต่ไบต์เดิมต้องยังกู้ได้
    expect(sandbox.pending()).toBe(0)
    expect(sandbox.problems().join()).toMatch(/มีคนแก้หลังจากเราเขียน/)

    const recovery = sandbox.recovery()
    expect(recovery).toHaveLength(1)
    expect(readFileSync(recovery[0].spill, 'utf8')).toBe('ORIGINAL-UNCOMMITTED')
    expect(readFileSync(path, 'utf8')).toBe('งานใหม่ของคนอื่น')
    spills.push(sandbox.spillDirectory())
  })

  it('manifest บอกที่อยู่ ขนาด และ sha256 ของไบต์เดิมได้ตรงกับไฟล์จริง', () => {
    writeFileSync(join(root, 'ก.txt'), 'ของเดิม ก')
    writeFileSync(join(root, 'ข.txt'), 'ของเดิม ข')

    const sandbox = new Sandbox(root)
    sandbox.modify('ก.txt', 'x')
    sandbox.modify('ข.txt', 'y')
    chmodSync(join(root, 'ก.txt'), 0o444)
    chmodSync(join(root, 'ข.txt'), 0o444)
    sandbox.restore()
    sandbox.spillPending()

    const directory = sandbox.spillDirectory() as string
    spills.push(directory)
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
    expect(manifest).toHaveLength(2)
    for (const entry of manifest) {
      const bytes = readFileSync(entry.spill)
      expect(bytes.length).toBe(entry.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
    }

    chmodSync(join(root, 'ก.txt'), 0o644)
    chmodSync(join(root, 'ข.txt'), 0o644)
  })

  /**
   * สัญญาณที่จับไม่ได้ (`SIGKILL`, timeout ที่ฆ่าทั้ง process group) ทำให้ไฟล์ค้างอยู่
   * ในสภาพที่ถูกแก้ รอบถัดไปจะอ่านสภาพนั้นเป็น "ของเดิม" แล้วผูกความเสียหายเข้าเป็น
   * baseline ถาวร พร้อมรายงานผลลวงว่าเลนปกติพัง — เกิดจริงในเลนนี้ 2026-08-15
   */
  it('ปฏิเสธที่จะเริ่ม เมื่อไฟล์ที่จะแก้ไม่ตรงกับ HEAD อยู่ก่อนแล้ว', () => {
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
    writeFileSync(join(root, 'ของจริง.txt'), 'baseline\n')
    execFileSync('git', ['add', 'ของจริง.txt'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: root })

    expect(() => assertPristine(root, ['ของจริง.txt'])).not.toThrow()

    writeFileSync(join(root, 'ของจริง.txt'), 'เศษจากรอบก่อนที่ถูกฆ่า\n')
    expect(() => assertPristine(root, ['ของจริง.txt']))
      .toThrow(/ไม่ตรงกับ HEAD อยู่ก่อนแล้ว จึงไม่เริ่ม/)
    expect(() => assertPristine(root, ['ของจริง.txt'])).toThrow(/git checkout -- ของจริง\.txt/)
  })

  it('ข้อความปัญหาไม่ซ้อนกันเป็นชั้นเมื่อ restore ถูกเรียกซ้ำ', () => {
    const path = join(root, 'ล็อกอยู่.txt')
    writeFileSync(path, 'ของเดิม')

    const sandbox = new Sandbox(root)
    sandbox.modify('ล็อกอยู่.txt', 'x')
    chmodSync(path, 0o444)

    sandbox.restore()
    const first = sandbox.problems().length
    sandbox.restore()
    sandbox.restore()
    expect(sandbox.problems().length).toBe(first)
    spills.push(sandbox.spillDirectory())

    chmodSync(path, 0o644)
  })
})
