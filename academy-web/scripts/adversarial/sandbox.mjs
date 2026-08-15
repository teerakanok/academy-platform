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
 * รีวิวรอบเจ็ดเพิ่มรากที่สี่: **snapshot ที่อยู่แต่ในหน่วยความจำหายไปพร้อมโปรเซส**
 * "เก็บไว้ลองซ้ำ" ช่วยได้เฉพาะตอนที่ยังมีใครเรียกซ้ำ ถ้า EACCES นานเกินสองครั้งที่
 * exit handler เรียกติดกัน ไบต์เดิมก็หายถาวรอยู่ดี ตอนนี้ทุกทางที่ปล่อยไบต์เดิมทิ้ง
 * จะเขียนสำเนาลงดิสก์นอกรีโปพร้อม `manifest.json` แล้วพิมพ์คำสั่งกู้ออกมา
 *
 * การคืนสภาพจะไม่โยน error ออกไป เพราะมันถูกเรียกจาก `finally` และจาก handler
 * ของสัญญาณ ปัญหาที่พบจะถูกเก็บไว้ใน `problems()` ให้ผู้เรียกรายงานและออกด้วย
 * รหัสที่ไม่ใช่ 0 — เงียบไม่ได้ แต่ก็ห้ามทำให้ทางออกอื่นพัง
 */
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync,
  writeSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'

const sameNode = (a, b) => a !== null && b !== null && a.dev === b.dev && a.ino === b.ino
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * ปฏิเสธที่จะเริ่ม ถ้าไฟล์ที่กำลังจะถูกแก้ไม่ตรงกับ HEAD อยู่ก่อนแล้ว
 *
 * มีอยู่เพราะสัญญาณที่ **จับไม่ได้** ยังมีจริง: `SIGKILL` และ timeout ของเครื่องมือ
 * ที่ฆ่าทั้ง process group ไม่ผ่าน handler ใดๆ ทั้งสิ้น รอบนั้นไฟล์จะค้างอยู่ในสภาพ
 * ที่ถูกแก้ และรอบถัดไปจะอ่านสภาพนั้นเป็น "ของเดิม" แล้ว **ผูกความเสียหายเข้าเป็น
 * baseline** — คืนกลับไม่ได้อีกเลย พร้อมรายงานผลลวงว่าเลนปกติพัง ทั้งที่ผลิตภัณฑ์
 * ไม่ได้เปลี่ยนอะไร (เกิดจริงในเลนนี้ 2026-08-15)
 *
 * การเช็คนี้ราคาถูกและตัดสินได้เด็ดขาด: สภาพสกปรกที่เราไม่ได้สร้างเอง = หยุด ไม่ใช่เดา
 */
export function assertPristine(root, paths) {
  let status
  try {
    status = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: root, encoding: 'utf8' })
  } catch (error) {
    throw new Error(`ตรวจสภาพไฟล์ก่อนเริ่มไม่ได้ จึงไม่เริ่ม: ${error.message}`)
  }
  const dirty = status.split('\n').map((line) => line.trim()).filter(Boolean)
  if (dirty.length === 0) return
  throw new Error([
    'ไฟล์ที่สคริปต์นี้จะแก้ไม่ตรงกับ HEAD อยู่ก่อนแล้ว จึงไม่เริ่ม',
    ...dirty.map((line) => `  ${line}`),
    'ถ้าเป็นเศษจากรอบก่อนที่ถูกฆ่าด้วยสัญญาณที่จับไม่ได้ ให้คืนด้วย:',
    ...paths.map((path) => `  git checkout -- ${path}`),
    'ถ้าเป็นงานที่ตั้งใจแก้ ให้ commit หรือ stash ก่อน — สคริปต์นี้แก้ไฟล์จริงและ',
    'จะจำสภาพปัจจุบันเป็นของเดิม ซึ่งทำให้ของที่ค้างอยู่กลายเป็น baseline ถาวร',
  ].join('\n'))
}

export class Sandbox {
  #root
  /** พาธจริง -> { bytes, dev, ino, wroteDigest } ของไฟล์ที่มีอยู่ก่อนและถูกแก้ */
  #saved = new Map()
  /** { path, dev, ino } ของไฟล์ที่รอบนี้สร้างเอง */
  #createdFiles = []
  /** โฟลเดอร์ที่รอบนี้สร้างเอง เรียงลึกสุดก่อน */
  #createdDirectories = []
  #restored = false
  /** พาธจริง -> ข้อความปัญหาของพาธนั้น เก็บแยกรายพาธเพื่อให้ลบทิ้งได้เมื่อพาธนั้นคืน/ลบสำเร็จในรอบถัดไป — ไม่งั้น retry ที่สำเร็จก็ยังถูกรายงานว่าล้ม (debt ที่ handoff ระบุชื่อ) */
  #problems = new Map()
  /**
   * โฟลเดอร์นอกรีโปที่เก็บไบต์เดิมลงดิสก์ สร้างเมื่อจำเป็นเท่านั้น
   * @type {string | null}
   */
  #spillRoot = null
  /** พาธจริง -> { spill, sha256, bytes } ของสำเนาไบต์เดิมบนดิสก์ */
  #spilled = new Map()

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
          this.#abandon(full, saved, 'ไม่ใช่ไฟล์ธรรมดาแล้ว อาจถูกสลับเป็น symlink — ไม่เขียนทับ')
          restoredPaths.push(full)
          continue
        }
        if (!sameNode(meta, saved)) {
          this.#abandon(full, saved, 'ถูกแทนที่ด้วยไฟล์คนละก้อน — ไม่เขียนทับ')
          restoredPaths.push(full)
          continue
        }
        if (saved.wroteDigest !== null && digest(readNoFollow(full)) !== saved.wroteDigest) {
          this.#abandon(full, saved, 'มีคนแก้หลังจากเราเขียน — ไม่เขียนทับงานนั้น')
          restoredPaths.push(full)
          continue
        }
        writeNoFollow(full, saved.bytes)
        restoredPaths.push(full)
        // คืนสำเร็จ: ปัญหาของพาธนี้จากรอบก่อน (เช่น EACCES ชั่วคราว) หมดอายุแล้ว
        this.#problems.delete(full)
      } catch (error) {
        this.#abandon(full, saved, `คืนไม่สำเร็จ: ${error.code ?? error.message} — เก็บไบต์เดิมไว้ให้เรียกซ้ำ`)
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
        // ลบสำเร็จ (หรือไม่มีอยู่แล้ว): ปัญหาเดิมของพาธนี้หมดอายุ
        this.#problems.delete(created.path)
      } catch (error) {
        if (error.code === 'ENOENT') {
          removedFiles.push(created.path)
          this.#problems.delete(created.path)
        } else this.#note(created.path, `ลบไม่สำเร็จ: ${error.code ?? error.message} — เก็บไว้ให้เรียกซ้ำ`)
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

  /**
   * เก็บไบต์เดิมของทุกไฟล์ที่ยังคืนไม่ได้ลงดิสก์ ก่อนโปรเซสจะออก
   *
   * เป็นทางออกสุดท้าย ไม่ใช่ทางปกติ — ทางปกติคือ `restore()` เขียนกลับได้เอง
   */
  spillPending() {
    for (const [full, saved] of this.#saved) this.#spill(full, saved)
  }

  /** คู่ (ไฟล์เป้าหมาย, สำเนาไบต์เดิมบนดิสก์) ที่ผู้ใช้กู้เองได้หลังโปรเซสออกไปแล้ว */
  recovery() {
    return [...this.#spilled].map(([target, entry]) => ({ target, ...entry }))
  }

  /** โฟลเดอร์ที่เก็บสำเนาไบต์เดิม หรือ null ถ้ายังไม่เคยต้องใช้ */
  spillDirectory() {
    return this.#spillRoot
  }

  /**
   * ปล่อยไบต์เดิมของไฟล์หนึ่ง โดยเก็บสำเนาลงดิสก์ก่อนเสมอ
   *
   * รีวิวอิสระรอบเจ็ดพิสูจน์ว่า snapshot ที่อยู่แต่ในหน่วยความจำหายไปพร้อมโปรเซส:
   * ถ้า `restore()` ติด EACCES ที่นานเกินสองครั้งที่ handler เรียกติดกัน ไบต์เดิม
   * จะกู้ไม่ได้อีกแม้ permission คืนมาแล้ว — เป็นการทำข้อมูลหายโดยไม่ต้องมีผู้โจมตี
   *
   * ทางที่ "ตัดสินใจไม่เขียนทับ" (ไฟล์ถูกสลับ / มีคนแก้ทับ) ก็ผ่านที่นี่ด้วย เพราะมัน
   * ทิ้งไบต์เดิมเหมือนกัน ต่างกันแค่เจตนา ผู้ใช้ควรได้ของเดิมกลับไม่ว่าทางไหน
   */
  #abandon(full, saved, reason) {
    const spill = this.#spill(full, saved)
    this.#note(full, spill === null ? reason : `${reason} · ไบต์เดิมอยู่ที่ ${spill}`)
  }

  #spill(full, saved) {
    const already = this.#spilled.get(full)
    if (already !== undefined) return already.spill
    try {
      if (this.#spillRoot === null) {
        this.#spillRoot = mkdtempSync(join(tmpdir(), 'academy-sandbox-recovery-'))
      }
      const target = join(this.#spillRoot, `${digest(Buffer.from(full)).slice(0, 16)}-${basename(full)}`)
      writeFileSync(target, saved.bytes, { mode: 0o600 })
      // จดรายละเอียดไว้ตั้งแต่ตอนนี้ ไม่ใช่ไปอ่านจาก #saved ทีหลัง — ทางที่ตัดสินใจ
      // ไม่เขียนทับจะถูกลบออกจาก #saved ท้าย restore() แล้ว manifest จะกลายเป็นศูนย์ไบต์
      this.#spilled.set(full, { spill: target, sha256: digest(saved.bytes), bytes: saved.bytes.length })
      // เขียน manifest ใหม่ทั้งไฟล์ทุกครั้ง เพื่อให้มันตรงกับสิ่งที่มีอยู่จริงเสมอ
      writeFileSync(
        join(this.#spillRoot, 'manifest.json'),
        `${JSON.stringify(this.recovery(), null, 2)}\n`,
        { mode: 0o600 },
      )
      return target
    } catch (error) {
      this.#note(full, `เก็บไบต์เดิมลงดิสก์ไม่สำเร็จ: ${error.code ?? error.message}`)
      return null
    }
  }

  #note(path, reason) {
    const line = `${relative(this.#root, path)}: ${reason}`
    // การเรียกซ้ำเป็นเรื่องปกติของ restore — ข้อความเดิมของพาธเดียวกันจึงต้องไม่ซ้อนกัน
    // เป็นชั้น แต่ต้องจำแยกรายพาธ เพื่อให้พาธที่คืนสำเร็จภายหลังลบปัญหาของตัวเองได้
    const lines = this.#problems.get(path) ?? []
    if (!lines.includes(line)) lines.push(line)
    this.#problems.set(path, lines)
  }

  /** สิ่งที่ยังคืนสภาพไม่ได้ ณ ตอนนี้ ผู้เรียกต้องรายงานและออกด้วยรหัสที่ไม่ใช่ 0 */
  problems() {
    return [...this.#problems.values()].flat()
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
    // สภาพชั่วคราวที่นานเกินสองครั้งนี้ยังเป็นไปได้ ตอนนั้นห้ามให้ไบต์เดิมหายไป
    // พร้อมโปรเซส — เก็บลงดิสก์แล้วบอกที่อยู่ ผู้ใช้กู้เองได้แม้เรากู้ไม่ได้
    if (sandbox.pending() > 0) sandbox.spillPending()
    const problems = sandbox.problems()
    if (problems.length > 0) {
      console.error('คืนสภาพไม่ครบ:')
      for (const problem of problems) console.error(`  ${problem}`)
    }
    const recovery = sandbox.recovery()
    if (recovery.length > 0) {
      console.error(`ไบต์เดิมถูกเก็บไว้ที่ ${sandbox.spillDirectory()} (พร้อม manifest.json) — กู้ด้วย:`)
      for (const entry of recovery) console.error(`  cp ${entry.spill} ${entry.target}`)
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
