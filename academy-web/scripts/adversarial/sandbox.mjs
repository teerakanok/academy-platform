/**
 * ที่กันเปื้อนสำหรับสคริปต์ที่ต้องแก้ไฟล์จริงเพื่อทดสอบว่าด่านกัดจริงไหม
 *
 * มีอยู่เพราะรุ่นก่อนของสคริปต์พวกนั้น **ลบงานที่ไม่ใช่ของตัวเอง** — มันเรียก
 * `rmSync('extra', { recursive: true })` ตอนเก็บกวาด โดยไม่สนว่าใครสร้างโฟลเดอร์นั้น
 * รีวิวอิสระวางไฟล์ไว้ในนั้นแล้วมันหายไปทั้งที่สคริปต์ออก 0 ตามปกติ และเมื่อถูก
 * SIGTERM กลางทาง มันทิ้งไฟล์ที่แก้ค้างไว้ทั้งอย่างนั้น
 *
 * กติกาสองข้อที่โมดูลนี้บังคับ:
 *
 *   1. **ลบได้เฉพาะสิ่งที่รอบนี้สร้างเอง** ถ้าพาธมีอยู่ก่อนแล้ว `create` จะปฏิเสธ
 *      ทันทีแทนที่จะทับ และ `restore` จะไม่แตะอะไรที่ไม่ได้อยู่ในบัญชี
 *   2. **คืนสภาพเสมอ** ไม่ว่าจบปกติ, โยน error, หรือโดนสัญญาณ
 *
 * ไฟล์ที่จะถูกแก้ต้องถูก `modify` ซึ่งเก็บไบต์เดิมไว้ก่อน การคืนสภาพเขียนไบต์ชุดเดิม
 * กลับ ไม่ใช่ `git checkout` เพราะของที่ยังไม่ commit จะหายไปด้วย
 */
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

export class Sandbox {
  #root
  /** พาธ -> ไบต์เดิม สำหรับไฟล์ที่มีอยู่ก่อนและถูกแก้ */
  #saved = new Map()
  /** ไฟล์ที่รอบนี้สร้างเอง ลบได้ */
  #createdFiles = []
  /** โฟลเดอร์ที่รอบนี้สร้างเอง ลบได้เมื่อว่าง เรียงลึกสุดก่อน */
  #createdDirectories = []
  #restored = false

  constructor(root) {
    this.#root = resolve(root)
  }

  #absolute(path) {
    const full = resolve(this.#root, path)
    if (full !== this.#root && !full.startsWith(`${this.#root}/`)) {
      throw new Error(`ปฏิเสธพาธนอกราก: ${path}`)
    }
    return full
  }

  /** สร้างไฟล์ใหม่ ปฏิเสธถ้ามีอยู่แล้ว — ของที่มีอยู่ก่อนไม่ใช่ของเรา */
  create(path, content) {
    const full = this.#absolute(path)
    if (existsSync(full)) {
      throw new Error(`ปฏิเสธการทับ ${relative(this.#root, full)} — สคริปต์นี้ไม่ได้สร้างมัน`)
    }
    for (const directory of this.#missingParents(full)) {
      mkdirSync(directory)
      this.#createdDirectories.unshift(directory)
    }
    writeFileSync(full, content)
    this.#createdFiles.push(full)
  }

  /** สร้าง symlink ใหม่ ปฏิเสธถ้ามีอยู่แล้ว เหมือน create ทุกประการ */
  symlink(path, target) {
    const full = this.#absolute(path)
    if (existsSync(full)) {
      throw new Error(`ปฏิเสธการทับ ${relative(this.#root, full)} — สคริปต์นี้ไม่ได้สร้างมัน`)
    }
    for (const directory of this.#missingParents(full)) {
      mkdirSync(directory)
      this.#createdDirectories.unshift(directory)
    }
    symlinkSync(this.#absolute(target), full)
    this.#createdFiles.push(full)
  }

  /** แก้ไฟล์ที่มีอยู่ โดยจำไบต์เดิมไว้คืนทีหลัง */
  modify(path, content) {
    const full = this.#absolute(path)
    if (!existsSync(full)) throw new Error(`ไม่มีไฟล์ให้แก้: ${relative(this.#root, full)}`)
    if (!this.#saved.has(full)) this.#saved.set(full, readFileSync(full))
    writeFileSync(full, content)
  }

  /** ไบต์เดิมของไฟล์ ใช้ประกอบเนื้อหาที่จะเขียนทับโดยไม่ต้องอ่านซ้ำ */
  original(path) {
    const full = this.#absolute(path)
    if (this.#saved.has(full)) return this.#saved.get(full).toString('utf8')
    return readFileSync(full, 'utf8')
  }

  #missingParents(full) {
    const missing = []
    let directory = dirname(full)
    while (!existsSync(directory) && directory.startsWith(this.#root)) {
      missing.unshift(directory)
      directory = dirname(directory)
    }
    return missing
  }

  /** คืนทุกอย่างที่รอบนี้แตะ เรียกซ้ำได้ */
  restore() {
    if (this.#restored) return
    this.#restored = true
    for (const [full, bytes] of this.#saved) writeFileSync(full, bytes)
    for (const full of this.#createdFiles) rmSync(full, { force: true })
    for (const directory of this.#createdDirectories) {
      // `rmdirSync` ลบได้เฉพาะโฟลเดอร์ว่าง และโยน ENOTEMPTY ถ้าไม่ว่าง ซึ่งตรงกับ
      // กติกาพอดี: ถ้ามีคนอื่นวางของไว้ระหว่างทาง ปล่อยทั้งโฟลเดอร์ไว้
      // (`rmSync(dir, { recursive: false })` โยน EISDIR เสมอ แล้ว catch จะกลืน
      //  ไว้เงียบๆ จนโฟลเดอร์ค้าง — เทสจับได้ตอนเขียนโมดูลนี้)
      try {
        rmdirSync(directory)
      } catch {
        // ไม่ว่าง หรือถูกลบไปแล้ว — ทั้งสองกรณีไม่ใช่เรื่องที่ต้องบังคับ
      }
    }
    this.#saved.clear()
    this.#createdFiles = []
    this.#createdDirectories = []
  }

  /** เริ่มรอบใหม่หลังคืนสภาพแล้ว */
  reopen() {
    this.#restored = false
  }
}

/**
 * ผูกการคืนสภาพเข้ากับทุกทางออกของโปรเซส รวมทั้งสัญญาณ
 *
 * `process.on('exit')` อย่างเดียวไม่พอ: SIGTERM ฆ่าโปรเซสโดยไม่ผ่าน exit handler
 * ซึ่งเป็นเหตุผลที่รุ่นก่อนทิ้งไฟล์ค้างไว้ตอนถูกขัดจังหวะ
 */
export function restoreOnExit(sandbox) {
  const restore = () => sandbox.restore()
  process.on('exit', restore)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      restore()
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
  process.on('uncaughtException', (error) => {
    restore()
    console.error(error)
    process.exit(1)
  })
  return restore
}
