import { z } from 'zod'
import { ContentValidationError } from './loader'
import type { CourseCopy, CourseStructure, LessonContent } from './course-types'

// Validation ของโครงคอร์ส — นอกจากชนิดข้อมูล ต้องกันความพังเชิงความหมายที่ทำให้
// ผู้เรียนติดตาย: prerequisite ชี้ node ที่ไม่มี, กราฟวน (deadlock ถาวร),
// skillWeights ชี้ทักษะที่ไม่ประกาศ, cue เกินความยาววิดีโอ

const cueSchema = z.object({
  id: z.string().min(1),
  atSeconds: z.number().nonnegative(),
})

const localeEnum = z.enum(['en', 'th'])

const audioTrackSchema = z.object({
  locale: localeEnum,
  src: z.string().min(1),
  label: z.string().min(1),
})

const captionTrackSchema = z.object({
  locale: localeEnum,
  src: z.string().min(1),
  label: z.string().min(1),
})

const videoSchema = z
  .object({
    src: z.string().min(1).optional(),
    audio: z.array(audioTrackSchema).min(1).optional(),
    captions: z.array(captionTrackSchema).optional(),
    durationSeconds: z.number().positive(),
    cues: z.array(cueSchema),
  })
  .superRefine((v, ctx) => {
    // ต้องมีเสียงอย่างน้อยทางใดทางหนึ่ง ไม่งั้นเป็นวิดีโอที่เล่นอะไรไม่ได้
    if (!v.src && !v.audio?.length) {
      ctx.addIssue({ code: 'custom', message: 'video ต้องมี src หรือ audio อย่างน้อยหนึ่งแทร็ก' })
    }
    const audioLocales = (v.audio ?? []).map((a) => a.locale)
    if (new Set(audioLocales).size !== audioLocales.length) {
      ctx.addIssue({ code: 'custom', message: 'แทร็กเสียงมีภาษาซ้ำ' })
    }
    const capLocales = (v.captions ?? []).map((c) => c.locale)
    if (new Set(capLocales).size !== capLocales.length) {
      ctx.addIssue({ code: 'custom', message: 'คำบรรยายมีภาษาซ้ำ' })
    }
    const ids = v.cues.map((c) => c.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'cue id ซ้ำ' })
    }
    for (const cue of v.cues) {
      if (cue.atSeconds >= v.durationSeconds) {
        ctx.addIssue({
          code: 'custom',
          message: `cue ${cue.id} อยู่ที่ ${cue.atSeconds}s ซึ่งเกินความยาววิดีโอ (${v.durationSeconds}s) — ผู้เรียนจะไม่มีวันเจอคำถามนี้`,
        })
      }
    }
  })

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['lesson', 'capstone']),
  prerequisites: z.array(z.string()),
  estimatedMinutes: z.number().positive(),
  skillWeights: z.record(z.string(), z.number().positive()),
  video: videoSchema.optional(),
})

const structureSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().min(1),
  defaultLocale: z.enum(['en', 'th']),
  availableLocales: z.array(z.enum(['en', 'th'])).min(1),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  estimatedMinutes: z.number().positive(),
  skills: z.array(z.object({ id: z.string().min(1), maxScore: z.number().positive() })).min(1),
  coverMotif: z.enum(['terminal', 'logs', 'shield', 'cloud', 'probe', 'layers']).optional(),
  globalSkillWeights: z.record(z.string(), z.number().positive()),
  nodes: z.array(nodeSchema).min(1),
})

function fail(file: string, error: z.ZodError): never {
  const first = error.issues[0]
  throw new ContentValidationError(file, `${first.path.join('.') || '(root)'}: ${first.message}`)
}

/** หา cycle ด้วย DFS — คืน path ที่วนถ้าเจอ (ใช้ในข้อความ error ให้ผู้เขียนคอร์สแก้ถูกจุด) */
function findCycle(nodes: CourseStructure['nodes']): string[] | null {
  const prereqs = new Map(nodes.map((n) => [n.id, n.prerequisites]))
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  function visit(id: string): string[] | null {
    const current = state.get(id)
    if (current === 'done') return null
    if (current === 'visiting') return [...stack.slice(stack.indexOf(id)), id]
    state.set(id, 'visiting')
    stack.push(id)
    for (const prereq of prereqs.get(id) ?? []) {
      const cycle = visit(prereq)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }

  for (const node of nodes) {
    const cycle = visit(node.id)
    if (cycle) return cycle
  }
  return null
}

export function loadCourseStructure(file: string, data: unknown): CourseStructure {
  const parsed = structureSchema.safeParse(data)
  if (!parsed.success) fail(file, parsed.error)
  const structure = parsed.data as CourseStructure

  const ids = new Set<string>()
  for (const node of structure.nodes) {
    if (ids.has(node.id)) throw new ContentValidationError(file, `node id ซ้ำ: ${node.id}`)
    ids.add(node.id)
  }

  const skillIds = new Set(structure.skills.map((s) => s.id))
  for (const node of structure.nodes) {
    for (const prereq of node.prerequisites) {
      if (!ids.has(prereq)) {
        throw new ContentValidationError(file, `node ${node.id}: prerequisite "${prereq}" ไม่มีอยู่จริง`)
      }
      if (prereq === node.id) {
        throw new ContentValidationError(file, `node ${node.id}: ตั้ง prerequisite เป็นตัวเอง`)
      }
    }
    for (const skillId of Object.keys(node.skillWeights)) {
      if (!skillIds.has(skillId)) {
        throw new ContentValidationError(file, `node ${node.id}: skill "${skillId}" ไม่ได้ประกาศใน course.skills`)
      }
    }
  }

  const cycle = findCycle(structure.nodes)
  if (cycle) {
    throw new ContentValidationError(file, `กราฟ prerequisite วนเป็นวง: ${cycle.join(' → ')} — ผู้เรียนจะเปิดบทเหล่านี้ไม่ได้เลย`)
  }

  if (!structure.availableLocales.includes(structure.defaultLocale)) {
    throw new ContentValidationError(file, `defaultLocale "${structure.defaultLocale}" ไม่อยู่ใน availableLocales`)
  }

  // ต้องมีจุดเริ่มอย่างน้อยหนึ่งจุด ไม่งั้นเปิดคอร์สไม่ได้
  if (!structure.nodes.some((n) => n.prerequisites.length === 0)) {
    throw new ContentValidationError(file, 'ไม่มี node ที่เริ่มได้เลย (ทุก node มี prerequisite)')
  }

  return structure
}

const copySchema = z.object({
  locale: z.enum(['en', 'th']),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  audience: z.string().min(1),
  outcomes: z.array(z.string().min(1)).min(1),
  skillLabels: z.record(z.string(), z.string()),
  nodeTitles: z.record(z.string(), z.string()),
})

export function loadCourseCopy(file: string, data: unknown, structure: CourseStructure): CourseCopy {
  const parsed = copySchema.safeParse(data)
  if (!parsed.success) fail(file, parsed.error)
  const copy = parsed.data as CourseCopy

  for (const skill of structure.skills) {
    if (!copy.skillLabels[skill.id]) {
      throw new ContentValidationError(file, `ขาดชื่อทักษะสำหรับ "${skill.id}" (radar จะโชว์คีย์ดิบให้ผู้เรียนเห็น)`)
    }
  }
  for (const node of structure.nodes) {
    if (!copy.nodeTitles[node.id]) {
      throw new ContentValidationError(file, `ขาดชื่อบทสำหรับ node "${node.id}"`)
    }
  }
  return copy
}

/** โจทย์จำลองหนึ่งชิ้น — ใช้ทั้งในบล็อกเนื้อหาและในด่านท้ายบท (W1) */
const simulationChallengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brief: z.string().min(1),
  surface: z.enum(['network-interface']),
  initial: z.record(z.string(), z.union([z.string(), z.boolean()])),
  requirements: z
    .array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1),
          field: z.string().min(1),
          operator: z.enum(['equals', 'notEquals', 'oneOf', 'isTrue', 'isFalse']),
          value: z.union([z.string(), z.array(z.string())]).optional(),
        })
        // operator ที่ต้องเทียบกับค่า ต้องมีค่าให้เทียบ — ไม่งั้นเงื่อนไขนั้นตัดสิน
        // อะไรไม่ได้เลย และเคยเป็นช่องที่ทำให้ "ไม่ทำอะไร" ผ่านด่านได้ (RIL จับ)
        .superRefine((req, ctx) => {
          const needsValue = req.operator === 'equals' || req.operator === 'notEquals' || req.operator === 'oneOf'
          if (needsValue && req.value === undefined) {
            ctx.addIssue({ code: 'custom', message: `requirement ${req.id}: operator ${req.operator} ต้องมี value` })
          }
          if (req.operator === 'oneOf' && !Array.isArray(req.value)) {
            ctx.addIssue({ code: 'custom', message: `requirement ${req.id}: oneOf ต้องมี value เป็นอาร์เรย์` })
          }
        }),
    )
    .min(1),
  hints: z.array(z.string().min(1)).optional(),
  debrief: z.string().min(1).optional(),
})

const blockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ kind: z.literal('heading'), text: z.string().min(1) }),
  z.object({ kind: z.literal('list'), items: z.array(z.string().min(1)).min(1), ordered: z.boolean().optional() }),
  z.object({ kind: z.literal('code'), caption: z.string().optional(), lines: z.array(z.string()).min(1) }),
  z.object({
    kind: z.literal('callout'),
    tone: z.enum(['info', 'warning', 'tip']),
    title: z.string().optional(),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal('try'),
    title: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    expected: z.string().optional(),
  }),
  z.object({
    kind: z.literal('table'),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
  }),
  z.object({
    kind: z.literal('image'),
    src: z.string().min(1),
    // alt บังคับ ไม่ใช่ทางเลือก — ภาพที่อธิบายตัวเองไม่ได้คือเนื้อหาที่หายไป
    // สำหรับคนที่ใช้ screen reader
    alt: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.object({
    kind: z.literal('attachment'),
    title: z.string().min(1),
    description: z.string().optional(),
    href: z.string().min(1),
    fileType: z.enum(['pdf', 'zip', 'other']),
    sizeLabel: z.string().optional(),
  }),
  z.object({
    kind: z.literal('externalLink'),
    title: z.string().min(1),
    description: z.string().optional(),
    href: z.string().url(),
    // ต้องบอกว่าเป็นของใคร ไม่งั้นผู้เรียนไม่รู้ว่ากำลังจะออกไปไหน
    sourceLabel: z.string().min(1),
  }),
  z.object({
    kind: z.literal('simulation'),
    challenge: simulationChallengeSchema,
  }),
  z.object({
    kind: z.literal('lab'),
    title: z.string().min(1),
    description: z.string().min(1),
    scale: z.enum(['inline', 'full']).optional(),
    estimatedMinutes: z.number().positive(),
    status: z.enum(['coming-soon', 'ready']),
  }),
])

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.record(z.string(), z.string()),
  correct: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
})

// ด่านท้ายบทรับได้สองรูป (W1):
//   · รูปเดิม — คำถาม MCQ ล้วน ไม่มี `kind` (ไฟล์เนื้อหาทุกไฟล์วันนี้เป็นแบบนี้)
//   · รูปใหม่ — ระบุ `kind` เป็น 'mcq' หรือ 'simulation'
// ทั้งสองถูกทำให้เป็นรูปเดียวกัน (`kind` ครบเสมอ) ก่อนออกจาก loader
const checkpointItemSchema = z.union([
  questionSchema.extend({ kind: z.literal('mcq').optional() }),
  z.object({
    kind: z.literal('simulation'),
    id: z.string().min(1),
    challenge: simulationChallengeSchema,
  }),
])

const lessonSchema = z.object({
  nodeId: z.string().min(1),
  locale: z.enum(['en', 'th']),
  title: z.string().min(1),
  objective: z.string().min(1),
  blocks: z.array(blockSchema).min(1),
  attribution: z.string().optional(),
  cheatsheet: z.array(z.string().min(1)).min(1),
  checkpoint: z.array(checkpointItemSchema).min(1),
  videoCueQuestions: z.array(questionSchema.extend({ cueId: z.string().min(1) })).optional(),
})

export function loadLesson(file: string, data: unknown, structure: CourseStructure): LessonContent {
  const parsed = lessonSchema.safeParse(data)
  if (!parsed.success) fail(file, parsed.error)

  // เติม kind ให้รายการรูปเดิม — ตั้งแต่จุดนี้ไปทุกอย่างเป็น discriminated union
  // ที่มี `kind` ครบเสมอ ไม่ต้องมีใครเดาอีก
  const raw = parsed.data as { checkpoint: Record<string, unknown>[] } & Record<string, unknown>
  const lesson = {
    ...raw,
    checkpoint: raw.checkpoint.map((item) => (item.kind ? item : { ...item, kind: 'mcq' })),
  } as unknown as LessonContent

  const node = structure.nodes.find((n) => n.id === lesson.nodeId)
  if (!node) throw new ContentValidationError(file, `nodeId "${lesson.nodeId}" ไม่มีในโครงคอร์ส`)

  const mcqItems = lesson.checkpoint.filter((item) => item.kind === 'mcq')
  const simulationItems = lesson.checkpoint.filter((item) => item.kind === 'simulation')
  const allQuestions = [...mcqItems, ...(lesson.videoCueQuestions ?? [])]
  for (const q of allQuestions) {
    const letters = new Set(Object.keys(q.choices))
    if (letters.size < 2) {
      throw new ContentValidationError(file, `คำถาม ${q.id}: ต้องมีอย่างน้อย 2 ตัวเลือก`)
    }
    const unknown = q.correct.filter((c) => !letters.has(c))
    if (unknown.length > 0) {
      throw new ContentValidationError(file, `คำถาม ${q.id}: เฉลยชี้ตัวเลือกที่ไม่มี (${unknown.join(',')})`)
    }
    if (new Set(q.correct).size !== q.correct.length) {
      throw new ContentValidationError(file, `คำถาม ${q.id}: เฉลยมีตัวซ้ำ`)
    }
  }

  const cueIds = new Set((node.video?.cues ?? []).map((c) => c.id))
  for (const q of lesson.videoCueQuestions ?? []) {
    if (!cueIds.has(q.cueId)) {
      throw new ContentValidationError(file, `คำถามวิดีโอ ${q.id}: cueId "${q.cueId}" ไม่มีในโครงวิดีโอของ node นี้`)
    }
  }
  // ทุก cue ต้องมีคำถาม ไม่งั้นวิดีโอจะหยุดแล้วไม่มีอะไรขึ้น
  const questionCueIds = new Set((lesson.videoCueQuestions ?? []).map((q) => q.cueId))
  for (const cueId of cueIds) {
    if (!questionCueIds.has(cueId)) {
      throw new ContentValidationError(file, `cue "${cueId}" ไม่มีคำถามในภาษานี้ — วิดีโอจะหยุดค้างโดยไม่มีอะไรให้ทำ`)
    }
  }

  // capstone คือด่านบังคับ — ถ้ามีด่านเดียวมันไม่ใช่การพิสูจน์ความสามารถ
  // (นับรวมโจทย์จำลองด้วย เพราะมันคือด่านเหมือนกัน ไม่ใช่ของประกอบ)
  if (node.kind === 'capstone' && lesson.checkpoint.length < 3) {
    throw new ContentValidationError(
      file,
      `node ${node.id} เป็น capstone (ข้ามไม่ได้) แต่มีด่านแค่ ${lesson.checkpoint.length} — ต้องมีอย่างน้อย 3`,
    )
  }

  // id ของด่านต้องไม่ซ้ำกัน — คำตอบที่ส่งกลับมาผูกกับ id นี้
  const ids = lesson.checkpoint.map((item) => item.id)
  if (new Set(ids).size !== ids.length) {
    throw new ContentValidationError(file, `ด่านท้ายบทมี id ซ้ำกัน (${ids.join(',')})`)
  }
  void simulationItems

  return lesson
}
