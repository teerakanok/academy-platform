import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAllCourses, getCourse, getCourseStructure, getLesson, listCourseSlugs } from '@/lib/content/course-source'
import { loadLesson } from '@/lib/content/course-loader'
import { courseSkillData, globalSkillData } from '@/lib/course/skills'
import { EMPTY_STATE } from '@/lib/course/roadmap'

// Integrity ของเนื้อหาจริง — กันเคส "คอร์สโหลดได้แต่ผู้เรียนเจอหลุมกลางทาง"

describe('คอร์สที่มีอยู่โหลดได้ทั้งหมด', () => {
  it('มีอย่างน้อยหนึ่งคอร์ส และทุกคอร์สประกอบสำเร็จ', () => {
    const slugs = listCourseSlugs()
    expect(slugs.length).toBeGreaterThan(0)
    expect(getAllCourses()).toHaveLength(slugs.length)
  })

  it('required field ที่ surface ไม่มี control ให้แก้ต้องถูกปฏิเสธตอน authoring', () => {
    const raw = structuredClone(getLesson('content-formats-demo', 'formats-simulation')!.lesson)
    const block = raw.blocks.find((item) => item.kind === 'simulation')
    expect(block?.kind).toBe('simulation')
    if (!block || block.kind !== 'simulation') return
    block.challenge.initial.gateaway = ''
    block.challenge.requiredFields.static = ['gateaway']

    expect(() => loadLesson('invalid-required-field.json', raw, getCourseStructure('content-formats-demo')!))
      .toThrow(/แก้ไม่ได้บน surface/)
  })
})

describe('Basic OS & Linux — ครบถ้วนพร้อมสอน', () => {
  const course = getCourse('basic-os-linux')!

  it('โหลดได้และเป็นภาษาเริ่มต้น en', () => {
    expect(course).not.toBeNull()
    expect(course.locale).toBe('en')
  })

  it('ความยาวรวมอยู่ในช่วงที่ประกาศไว้ 2–3 ชั่วโมง', () => {
    const summed = course.structure.nodes.reduce((total, n) => total + n.estimatedMinutes, 0)
    expect(summed).toBe(course.structure.estimatedMinutes)
    expect(summed).toBeGreaterThanOrEqual(120)
    expect(summed).toBeLessThanOrEqual(180)
  })

  it('ทุก node มีบทเรียนจริงในภาษาเริ่มต้น — ไม่มีหลุมกลางเส้นทาง', () => {
    for (const node of course.structure.nodes) {
      const resolved = getLesson('basic-os-linux', node.id)
      expect(resolved, `ขาดบทเรียนของ node ${node.id}`).not.toBeNull()
      expect(resolved!.lesson.blocks.length).toBeGreaterThan(3)
      expect(resolved!.lesson.cheatsheet.length).toBeGreaterThan(2)
      expect(resolved!.lesson.checkpoint.length).toBeGreaterThan(0)
    }
  })

  it('capstone ทุกตัวมีคำถามอย่างน้อย 3 ข้อ (ไม่งั้นคำว่า "พิสูจน์" ไม่มีความหมาย)', () => {
    const capstones = course.structure.nodes.filter((n) => n.kind === 'capstone')
    expect(capstones.length).toBeGreaterThan(0)
    for (const node of capstones) {
      const lesson = getLesson('basic-os-linux', node.id)!.lesson
      expect(lesson.checkpoint.length, `capstone ${node.id}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('บทที่มีวิดีโอ ต้องมีคำถามครบทุก cue และไฟล์วิดีโอมีอยู่จริง', () => {
    const withVideo = course.structure.nodes.filter((n) => n.video)
    expect(withVideo.length).toBeGreaterThan(0)
    for (const node of withVideo) {
      const lesson = getLesson('basic-os-linux', node.id)!.lesson
      const cueIds = node.video!.cues.map((c) => c.id).sort()
      const questionCues = (lesson.videoCueQuestions ?? []).map((q) => q.cueId).sort()
      expect(questionCues).toEqual(cueIds)
      for (const cue of node.video!.cues) {
        expect(cue.atSeconds).toBeLessThan(node.video!.durationSeconds)
      }
      // ทุกแทร็กเสียงต้องมีไฟล์จริง ไม่ใช่แค่แทร็กแรก — ผู้เรียนที่สลับไปภาษาที่สอง
      // แล้วเจอวิดีโอเล่นไม่ได้คือความผิดพลาดที่เห็นเฉพาะคนที่กดสลับ
      const tracks = node.video!.audio ?? (node.video!.src ? [{ locale: 'en' as const, src: node.video!.src, label: 'default' }] : [])
      expect(tracks.length, 'วิดีโอต้องมีเสียงอย่างน้อยหนึ่งแทร็ก').toBeGreaterThan(0)
      for (const track of tracks) {
        const file = join(process.cwd(), 'public', track.src.replace(/^\//, ''))
        expect(existsSync(file), `ไม่พบไฟล์วิดีโอ ${track.src} (เสียง ${track.locale}) — รัน scripts/make-dummy-video-tracks.sh`).toBe(true)
      }
      for (const cap of node.video!.captions ?? []) {
        const file = join(process.cwd(), 'public', cap.src.replace(/^\//, ''))
        expect(existsSync(file), `ไม่พบไฟล์คำบรรยาย ${cap.src} (${cap.locale})`).toBe(true)
        // WebVTT ที่ไม่ขึ้นต้นด้วย WEBVTT เบราว์เซอร์จะเมินเงียบๆ ไม่มี error ให้เห็น
        expect(readFileSync(file, 'utf8').startsWith('WEBVTT'), `${cap.src} ไม่ใช่ WebVTT ที่ถูกต้อง`).toBe(true)
      }
    }
  })
})

describe('ระบบสองภาษา', () => {
  it('ขอภาษาไทยแล้วได้ไทยเมื่อมีคำแปล', () => {
    const resolved = getLesson('basic-os-linux', 'os-what-it-does', 'th')!
    expect(resolved.servedLocale).toBe('th')
    expect(resolved.lesson.title).toContain('ระบบปฏิบัติการ')
  })

  it('บทที่ยังไม่แปล → คืนภาษาเริ่มต้นพร้อมบอกว่าไม่ใช่ภาษาที่ขอ (ไม่สลับเงียบ)', () => {
    const resolved = getLesson('basic-os-linux', 'permissions', 'th')!
    expect(resolved.requestedLocale).toBe('th')
    expect(resolved.servedLocale).toBe('en')
  })

  it('checkpoint id ตรงกันข้ามภาษา — ความคืบหน้าจึงย้ายภาษาได้โดยไม่หาย', () => {
    const en = getLesson('basic-os-linux', 'os-what-it-does', 'en')!.lesson
    const th = getLesson('basic-os-linux', 'os-what-it-does', 'th')!.lesson
    expect(th.checkpoint.map((q) => q.id)).toEqual(en.checkpoint.map((q) => q.id))
    expect((th.videoCueQuestions ?? []).map((q) => q.cueId)).toEqual(
      (en.videoCueQuestions ?? []).map((q) => q.cueId),
    )
  })
})

describe('การคำนวณทักษะ', () => {
  const course = getCourse('basic-os-linux')!

  it('ยังไม่เริ่ม = ทุกแกน notStarted (ไม่ใช่ได้ 0 คะแนน)', () => {
    const data = courseSkillData(course.structure, course.copy.skillLabels, EMPTY_STATE)
    expect(data).toHaveLength(course.structure.skills.length)
    expect(data.every((d) => d.notStarted)).toBe(true)
  })

  it('การข้ามไม่นับเป็นความครอบคลุม — แผนภูมิต้องไม่โกหกเจ้าของ', () => {
    const skipped = courseSkillData(course.structure, course.copy.skillLabels, {
      ...EMPTY_STATE,
      skipped: course.structure.nodes.map((n) => n.id),
    })
    expect(skipped.every((d) => d.notStarted)).toBe(true)

    const done = courseSkillData(course.structure, course.copy.skillLabels, {
      ...EMPTY_STATE,
      completed: course.structure.nodes.map((n) => n.id),
    })
    expect(done.every((d) => d.value === 100)).toBe(true)
  })

  it('แผนที่ภาพรวม: แกนที่ยังไม่มีคอร์สรองรับถูกทำเครื่องหมายว่ายังไม่เริ่ม', () => {
    const data = globalSkillData([{ structure: course.structure, state: EMPTY_STATE }])
    const foundations = data.find((d) => d.id === 'foundations')!
    const ai = data.find((d) => d.id === 'ai-security')!
    expect(foundations.notStarted).toBe(true)
    expect(ai.notStarted).toBe(true)

    const progressed = globalSkillData([
      { structure: course.structure, state: { ...EMPTY_STATE, completed: course.structure.nodes.map((n) => n.id) } },
    ])
    expect(progressed.find((d) => d.id === 'foundations')!.value).toBe(100)
    expect(progressed.find((d) => d.id === 'ai-security')!.notStarted).toBe(true)
  })
})
