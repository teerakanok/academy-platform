/**
 * ที่กันเปื้อนสำหรับสคริปต์ที่ต้องแก้ไฟล์จริงเพื่อทดสอบว่าด่านกัดจริงไหม
 *
 * มีอยู่เพราะสคริปต์พวกนั้นถืออำนาจลบของในรีโปอยู่ในมือ รุ่นแรกใช้อำนาจนั้นผิด:
 * `rmSync('extra', { recursive: true })` ตอนเก็บกวาดโดยไม่สนว่าใครสร้าง งานของ
 * reviewer หายไปทั้งที่สคริปต์ออก 0 ตามปกติ
 *
 * รุ่นที่สองปิดเคสนั้นแต่ยังพังอีกหกทางที่รีวิวอิสระ reproduce ให้ดู ทั้งหมดมาจาก
 * รากเดียวกันสามอย่าง และรุ่นนี้แก้ที่รากทั้งสาม:
 *
 *   1. **containment ด้วยสตริง** — เทียบว่าพาธขึ้นต้นด้วย root หรือไม่ ซึ่ง symlink
 *      ที่ชั้น parent พาออกนอก root ได้ทั้งที่สตริงยังดูอยู่ข้างใน ตอนนี้ resolve
 *      บรรพบุรุษที่มีอยู่จริงด้วย `realpath` ก่อนเสมอ แล้วค่อยตัดสิน
 *   2. **`existsSync` แล้วค่อยเขียน** — มีช่องว่างระหว่างสองจังหวะ และ `existsSync`
 *      ตอบ false ให้ symlink ที่ชี้ไปที่ที่ไม่มีอยู่ ทำให้เขียนทะลุออกไปได้
 *      ตอนนี้สร้างด้วย `O_CREAT|O_EXCL` ซึ่งล้มเหลวทันทีถ้ามีอะไรอยู่ตรงนั้นแล้ว
 *      รวมทั้ง symlink ที่ห้อยอยู่ และไม่มีช่องว่างให้แทรก
 *   3. **ผูกความเป็นเจ้าของกับชื่อพาธ** — ไฟล์ที่ถูกสลับระหว่างทางยังชื่อเดิม
 *      การคืนสภาพจึงลบของคนอื่นหรือเขียนทับงานที่เพิ่งแก้ ตอนนี้จำ `dev`/`ino`
 *      ของสิ่งที่สร้าง/แก้ไว้ และคืนสภาพเฉพาะเมื่อยังเป็นก้อนเดิมจริงๆ
 *
 * การคืนสภาพจะไม่โยน error ออกไป เพราะมันถูกเรียกจาก `finally` และจาก handler
 * ของสัญญาณ ปัญหาที่พบจะถูกเก็บไว้ใน `problems()` ให้ผู้เรียกรายงานและออกด้วย
 * รหัสที่ไม่ใช่ 0 — เงียบไม่ได้ แต่ก็ห้ามทำให้ทางออกอื่นพัง
 */
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'

const sameNode = (a, b) => a !== null && b !== null && a.dev === b.dev && a.ino === b.ino
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export class Sandbox {
  #root
  /** พาธจริง -> { bytes, dev, ino, wroteDigest } ของไฟล์ที่มีอยู่ก่อนและถูกแก้ */
  #saved = new Map()
  /** { path, dev, ino } ของไฟล์ที่รอบนี้สร้างเอง */
  #createdFiles = []
  /** โฟลเดอร์ที่รอบนี้สร้างเอง เรียงลึกสุดก่อน */
  #createdDirectories = []
  #restored = false
  #problems = []

  constructor(root) {
    this.#root = realOf(resolve(root))
  }

  /**
   * พาธจริงที่อยู่ใน root แน่นอน
   *
   * เดินขึ้นไปหาบรรพบุรุษที่มีอยู่จริง resolve ด้วย realpath แล้วต่อส่วนที่ยังไม่มี
   * กลับเข้าไป — symlink ที่ชั้นใดก็ตามของส่วนที่มีอยู่จริงจะถูกคลี่ออกก่อนตัดสิน
   */
  #contained(path) {
    const lexical = resolve(this.#root, path)
    const missing = []
    let existing = lexical
    while (!existsSync(existing) && dirname(existing) !== existing) {
      missing.unshift(basename(existing))
      existing = dirname(existing)
    }
    const real = realOf(existing)
    const full = missing.length > 0 ? join(real, ...missing) : real
    if (full !== this.#root && !full.startsWith(`${this.#root}/`)) {
      throw new Error(`ปฏิเสธพาธนอกราก: ${path}`)
    }
    return full
  }

  /** สร้างไฟล์ใหม่แบบ atomic ปฏิเสธถ้ามีอะไรอยู่ตรงนั้นแล้ว รวมทั้ง symlink ที่ห้อยอยู่ */
  create(path, content) {
    const full = this.#contained(path)
    this.#makeParents(full)
    let fd
    try {
      // O_EXCL คือด่านเดียวที่ไม่มีช่องว่างให้แทรก — ไม่มีการถามก่อนแล้วค่อยเขียน
      fd = openSync(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`ปฏิเสธการทับ ${relative(this.#root, full)} — สคริปต์นี้ไม่ได้สร้างมัน`)
      }
      throw error
    }
    try {
      writeSync(fd, Buffer.from(content))
      const meta = fstatSync(fd)
      this.#createdFiles.push({ path: full, dev: meta.dev, ino: meta.ino })
    } finally {
      closeSync(fd)
    }
  }

  /** สร้าง symlink ใหม่ ทั้งตัวลิงก์และเป้าหมายต้องอยู่ในราก */
  symlink(path, target) {
    const full = this.#contained(path)
    const destination = this.#contained(target)
    this.#makeParents(full)
    try {
      // `symlinkSync` ล้มเหลวด้วย EEXIST ถ้ามีอะไรอยู่แล้ว จึง atomic เหมือน create
      symlinkSync(destination, full)
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`ปฏิเสธการทับ ${relative(this.#root, full)} — สคริปต์นี้ไม่ได้สร้างมัน`)
      }
      throw error
    }
    const meta = lstatSync(full)
    this.#createdFiles.push({ path: full, dev: meta.dev, ino: meta.ino })
  }

  /** แก้ไฟล์ที่มีอยู่ โดยจำทั้งไบต์เดิมและตัวตนของไฟล์ไว้คืนทีหลัง */
  modify(path, content) {
    const full = this.#contained(path)
    const meta = lstatSync(full)
    if (!meta.isFile()) throw new Error(`แก้ได้เฉพาะไฟล์ธรรมดา: ${relative(this.#root, full)}`)
    if (!this.#saved.has(full)) {
      this.#saved.set(full, { bytes: readNoFollow(full), dev: meta.dev, ino: meta.ino, wroteDigest: null })
    }
    writeNoFollow(full, Buffer.from(content))
    this.#saved.get(full).wroteDigest = digest(Buffer.from(content))
  }

  /** ไบต์เดิมของไฟล์ ใช้ประกอบเนื้อหาที่จะเขียนทับโดยไม่ต้องอ่านซ้ำ */
  original(path) {
    const full = this.#contained(path)
    const saved = this.#saved.get(full)
    return saved ? saved.bytes.toString('utf8') : readNoFollow(full).toString('utf8')
  }

  #makeParents(full) {
    const missing = []
    let directory = dirname(full)
    while (!existsSync(directory) && directory.startsWith(this.#root)) {
      missing.unshift(directory)
      directory = dirname(directory)
    }
    for (const target of missing) {
      mkdirSync(target, { mode: 0o700 })
      this.#createdDirectories.unshift(target)
    }
  }

  /**
   * คืนทุกอย่างที่รอบนี้แตะ เรียกซ้ำได้ และไม่โยน error ออกไป
   *
   * แต่ละรายการอยู่ใน try ของตัวเอง รายการแรกที่พังจึงไม่ทำให้ที่เหลือค้าง และ
   * ธงว่า "คืนแล้ว" ตั้งหลังลูปจบ ไม่ใช่ก่อน — ของเดิมตั้งก่อนแล้วเรียกซ้ำไม่ทำงาน
   */
  restore() {
    if (this.#restored) return
    // สิ่งที่คืนสำเร็จเท่านั้นที่ถูกลบออกจากบัญชี ที่เหลือเก็บไว้ให้เรียกซ้ำได้
    // ของเดิมล้างบัญชีทิ้งทุกกรณี พอ restore ติด EACCES ชั่วคราว ไบต์เดิมก็หายถาวร
    // แม้ permission จะคืนมาแล้วก็กู้ไม่ได้ — เป็นการทำข้อมูลหายโดยไม่ต้องมีผู้โจมตี
    const restoredPaths = []
    const removedFiles = []
    for (const [full, saved] of this.#saved) {
      try {
        const meta = lstatSync(full)
        if (!meta.isFile()) {
          this.#note(full, 'ไม่ใช่ไฟล์ธรรมดาแล้ว อาจถูกสลับเป็น symlink — ไม่เขียนทับ')
          restoredPaths.push(full)
          continue
        }
        if (!sameNode(meta, saved)) {
          this.#note(full, 'ถูกแทนที่ด้วยไฟล์คนละก้อน — ไม่เขียนทับ')
          restoredPaths.push(full)
          continue
        }
        if (saved.wroteDigest !== null && digest(readNoFollow(full)) !== saved.wroteDigest) {
          this.#note(full, 'มีคนแก้หลังจากเราเขียน — ไม่เขียนทับงานนั้น')
          restoredPaths.push(full)
          continue
        }
        writeNoFollow(full, saved.bytes)
        restoredPaths.push(full)
      } catch (error) {
        this.#note(full, `คืนไม่สำเร็จ: ${error.code ?? error.message} — เก็บไบต์เดิมไว้ให้เรียกซ้ำ`)
      }
    }
    for (const created of this.#createdFiles) {
      try {
        const meta = lstatSync(created.path)
        if (!sameNode(meta, created)) {
          this.#note(created.path, 'ไม่ใช่ก้อนที่เราสร้าง — ไม่ลบ')
          removedFiles.push(created.path)
          continue
        }
        unlinkSync(created.path)
        removedFiles.push(created.path)
      } catch (error) {
        if (error.code === 'ENOENT') removedFiles.push(created.path)
        else this.#note(created.path, `ลบไม่สำเร็จ: ${error.code ?? error.message} — เก็บไว้ให้เรียกซ้ำ`)
      }
    }
    for (const directory of this.#createdDirectories) {
      // `rmdirSync` ลบได้เฉพาะโฟลเดอร์ว่าง ถ้ามีคนอื่นวางของไว้ระหว่างทาง ปล่อยไว้
      try {
        rmdirSync(directory)
      } catch {
        // ไม่ว่าง หรือถูกลบไปแล้ว ทั้งสองกรณีไม่ใช่เรื่องที่ต้องบังคับ
      }
    }
    for (const full of restoredPaths) this.#saved.delete(full)
    this.#createdFiles = this.#createdFiles.filter((entry) => !removedFiles.includes(entry.path))
    // ธง "คืนแล้ว" ตั้งได้ก็ต่อเมื่อไม่มีอะไรค้าง ถ้ายังค้าง การเรียกซ้ำต้องได้ลองใหม่จริง
    if (this.#saved.size === 0 && this.#createdFiles.length === 0) {
      this.#createdDirectories = []
      this.#restored = true
    }
  }

  /** ยังมีอะไรค้างที่ต้องคืนอีกไหม — ผู้เรียกใช้ตัดสินว่าจะลองซ้ำหรือหยุด */
  pending() {
    return this.#saved.size + this.#createdFiles.length
  }

  #note(path, reason) {
    this.#problems.push(`${relative(this.#root, path)}: ${reason}`)
  }

  /** สิ่งที่คืนสภาพไม่ได้ ผู้เรียกต้องรายงานและออกด้วยรหัสที่ไม่ใช่ 0 */
  problems() {
    return [...this.#problems]
  }

  /** เริ่มรอบใหม่หลังคืนสภาพแล้ว */
  reopen() {
    this.#restored = false
  }
}

function realOf(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** อ่านโดยไม่ตาม symlink ที่ชั้นสุดท้าย */
function readNoFollow(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const size = fstatSync(fd).size
    const buffer = Buffer.alloc(size)
    let read = 0
    while (read < size) {
      const count = readSync(fd, buffer, read, size - read, read)
      if (count === 0) break
      read += count
    }
    return buffer.subarray(0, read)
  } finally {
    closeSync(fd)
  }
}

/** เขียนโดยไม่ตาม symlink — ถ้าถูกสลับเป็นลิงก์ระหว่างทาง จะล้มเหลวแทนที่จะเขียนทะลุ */
function writeNoFollow(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW)
  try {
    writeSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}

/**
 * ผูกการคืนสภาพเข้ากับทุกทางออกของโปรเซส รวมทั้งสัญญาณ
 *
 * `process.on('exit')` อย่างเดียวไม่พอ: SIGTERM ฆ่าโปรเซสโดยไม่ผ่าน exit handler
 * ซึ่งเป็นเหตุผลที่รุ่นแรกทิ้งไฟล์ค้างไว้ตอนถูกขัดจังหวะ
 */
export function restoreOnExit(sandbox) {
  const restore = () => {
    // ลองซ้ำหนึ่งครั้ง เผื่อรอบแรกติดสภาพชั่วคราว (permission, ไฟล์ถูกล็อกอยู่)
    sandbox.restore()
    if (sandbox.pending() > 0) sandbox.restore()
    const problems = sandbox.problems()
    if (problems.length > 0) {
      console.error('คืนสภาพไม่ครบ:')
      for (const problem of problems) console.error(`  ${problem}`)
    }
  }
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
