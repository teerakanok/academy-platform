import { z } from 'zod'
import type { CourseContent, FullLengthTest, McqItem, ModuleBank, PbqItem } from './types'

// Loader: แปลง Crucible portable JSON → CourseContent พร้อม validation ที่บอก
// ไฟล์/field ที่พังชัดเจน — ห้ามล้มเงียบ (กติกาแผน §3)

export class ContentValidationError extends Error {
  constructor(
    public readonly file: string,
    detail: string,
  ) {
    super(`เนื้อหาไม่ผ่าน validation: ${file} — ${detail}`)
    this.name = 'ContentValidationError'
  }
}

const keywordSchema = z.object({ text: z.string(), tier: z.string() })

const visualSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  src: z.string(),
  title: z.string().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
})

const mcqSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  moduleTitle: z.string().min(1),
  objective: z.string().min(1),
  learningObjective: z.string().optional(),
  lesson: z.string().optional(),
  bloom: z.string().optional(),
  difficulty: z.string().optional(),
  type: z.enum(['single', 'multi']),
  topic: z.string().optional(),
  stem: z.string().min(1),
  choices: z.record(z.string(), z.string()).refine((c) => Object.keys(c).length >= 2, {
    message: 'choices ต้องมีอย่างน้อย 2 ตัวเลือก',
  }),
  correct: z.array(z.string().min(1)).min(1),
  explanation: z.string().optional(),
  whyCorrect: z.record(z.string(), z.string()).optional(),
  whyWrong: z.record(z.string(), z.string()).optional(),
  sources: z.array(z.string()).optional(),
  keywords: z.array(keywordSchema).optional(),
  visual: visualSchema.optional(),
}).superRefine((q, ctx) => {
  // semantic invariants ที่ scoring/UI พึ่ง (finding review lane) — type ผ่าน
  // อย่างเดียวไม่พอ: ข้อที่ correct ชี้ตัวเลือกที่ไม่มีอยู่ = ข้อที่ตอบถูกไม่ได้เลย
  const letters = new Set(Object.keys(q.choices))
  const unknown = q.correct.filter((c) => !letters.has(c))
  if (unknown.length > 0) {
    ctx.addIssue({ code: 'custom', message: `${q.id}: correct มีตัวเลือกที่ไม่มีใน choices: ${unknown.join(',')}` })
  }
  if (new Set(q.correct).size !== q.correct.length) {
    ctx.addIssue({ code: 'custom', message: `${q.id}: correct มีตัวซ้ำ` })
  }
  if (q.type === 'single' && q.correct.length !== 1) {
    ctx.addIssue({ code: 'custom', message: `${q.id}: type=single ต้องมี correct 1 ตัว (พบ ${q.correct.length})` })
  }
})

// field.kind เป็น discriminator (ไม่ใช่ field.type — บทเรียน RIL r1)
const pbqFieldSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['checks', 'select', 'order', 'text']),
    options: z.array(z.string()).optional(),
    correct: z.union([z.string(), z.array(z.string())]),
    explanation: z.string().optional(),
    aliases: z.array(z.string()).optional(),
  })
  .superRefine((f, ctx) => {
    if ((f.kind === 'checks' || f.kind === 'order') && !Array.isArray(f.correct)) {
      ctx.addIssue({ code: 'custom', message: `field ${f.id}: kind=${f.kind} ต้องมี correct เป็น array` })
    }
    if (f.kind === 'select' && typeof f.correct !== 'string') {
      ctx.addIssue({ code: 'custom', message: `field ${f.id}: kind=select ต้องมี correct เป็น string` })
    }
    if ((f.kind === 'checks' || f.kind === 'select' || f.kind === 'order') && !f.options?.length) {
      ctx.addIssue({ code: 'custom', message: `field ${f.id}: kind=${f.kind} ต้องมี options` })
    }
    if (f.options) {
      if (new Set(f.options).size !== f.options.length) {
        ctx.addIssue({ code: 'custom', message: `field ${f.id}: options มีค่าซ้ำ` })
      }
      const opts = new Set(f.options)
      const correctValues = Array.isArray(f.correct) ? f.correct : [f.correct]
      const missing = correctValues.filter((c) => !opts.has(c))
      if ((f.kind === 'checks' || f.kind === 'select' || f.kind === 'order') && missing.length > 0) {
        ctx.addIssue({ code: 'custom', message: `field ${f.id}: correct มีค่าที่ไม่อยู่ใน options` })
      }
    }
  })

const pbqSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  scenario: z.string().min(1),
  exhibit: z.array(z.string()).optional(),
  fields: z.array(pbqFieldSchema).min(1),
  sources: z.array(z.string()).optional(),
  keywords: z.array(keywordSchema).optional(),
}).superRefine((p, ctx) => {
  const ids = p.fields.map((f) => f.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: `${p.id}: field id ซ้ำภายใน PBQ` })
  }
})

const modulePartFileSchema = z.object({
  id: z.string(),
  sourceModuleId: z.string(),
  sourceSlug: z.string(),
  title: z.string(),
  moduleTitle: z.string(),
  part: z.number().int().positive(),
  questions: z.array(mcqSchema).min(1),
})

const fullLengthFileSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  timeLimitMinutes: z.number().positive(),
  normalQuestions: z.array(mcqSchema).min(1),
  pbqs: z.array(pbqSchema),
})

function fail(file: string, error: z.ZodError): never {
  const first = error.issues[0]
  const path = first.path.join('.') || '(root)'
  throw new ContentValidationError(file, `${path}: ${first.message}`)
}

export interface ModulePartInput {
  /** ชื่อไฟล์สำหรับ error message เช่น part-01.json */
  file: string
  data: unknown
}

/** รวม part files ของ module เดียว → ModuleBank (เรียงตาม part, กัน id ซ้ำ) */
export function loadModuleBank(slug: string, parts: ModulePartInput[]): ModuleBank {
  if (parts.length === 0) throw new ContentValidationError(slug, 'ไม่มี part file ให้โหลด')
  const parsedParts = parts.map(({ file, data }) => {
    const result = modulePartFileSchema.safeParse(data)
    if (!result.success) fail(file, result.error)
    return { file, part: result.data }
  })
  parsedParts.sort((a, b) => a.part.part - b.part.part)

  const first = parsedParts[0].part
  const questions: McqItem[] = []
  const seen = new Set<string>()
  for (const { file, part } of parsedParts) {
    if (part.sourceSlug !== first.sourceSlug) {
      throw new ContentValidationError(file, `sourceSlug ไม่ตรงกัน (${part.sourceSlug} ≠ ${first.sourceSlug})`)
    }
    for (const q of part.questions) {
      if (seen.has(q.id)) throw new ContentValidationError(file, `คำถาม id ซ้ำ: ${q.id}`)
      seen.add(q.id)
      questions.push(q as McqItem)
    }
  }
  return {
    slug,
    moduleId: first.sourceModuleId,
    title: first.moduleTitle,
    questions,
  }
}

export function loadFullLength(file: string, data: unknown): FullLengthTest {
  const result = fullLengthFileSchema.safeParse(data)
  if (!result.success) fail(file, result.error)
  const { id, title, timeLimitMinutes, normalQuestions, pbqs } = result.data
  const seen = new Set<string>()
  for (const q of [...normalQuestions, ...pbqs]) {
    if (seen.has(q.id)) throw new ContentValidationError(file, `id ซ้ำ: ${q.id}`)
    seen.add(q.id)
  }
  return {
    id,
    title,
    timeLimitMinutes,
    questions: normalQuestions as McqItem[],
    pbqs: pbqs as PbqItem[],
  }
}

export function buildCourseContent(
  modules: ModuleBank[],
  fullLength: FullLengthTest[],
): CourseContent {
  // media slot ตั้งใจว่างไว้ — ห้าม map จาก manifest.services (marketing metadata)
  return { modules, fullLength }
}

const manifestContractSchema = z.object({
  modules: z
    .array(
      z.object({
        slug: z.string(),
        questionCount: z.number().int().nonnegative(),
        parts: z.array(z.object({ slug: z.string(), count: z.number().int().nonnegative() })),
      }),
    )
    .optional(),
  fullLength: z
    .array(
      z.object({
        id: z.string(),
        normalQuestions: z.number().int().nonnegative(),
        pbqs: z.number().int().nonnegative(),
      }),
    )
    .optional(),
})

/**
 * ตรวจ content ที่โหลดได้กับ manifest ของชุดเนื้อหา — กันเคส "ไฟล์หายบางส่วน
 * แล้วระบบเสิร์ฟ bank สั้นลงแบบเงียบ" (finding review lane): manifest คือ
 * contract ว่าชุดนี้ควรมีอะไรครบเท่าไร
 */
export function assertManifestContract(
  content: CourseContent,
  manifestData: unknown,
  file: string,
): void {
  const parsed = manifestContractSchema.safeParse(manifestData)
  if (!parsed.success) fail(file, parsed.error)
  const manifest = parsed.data

  for (const expected of manifest.modules ?? []) {
    const loaded = content.modules.find((m) => m.slug === expected.slug)
    if (!loaded) {
      throw new ContentValidationError(file, `module ${expected.slug} อยู่ใน manifest แต่โหลดไม่พบ`)
    }
    if (loaded.questions.length !== expected.questionCount) {
      throw new ContentValidationError(
        file,
        `module ${expected.slug}: โหลดได้ ${loaded.questions.length} ข้อ แต่ manifest ระบุ ${expected.questionCount} (ไฟล์ part หาย/เกิน?)`,
      )
    }
  }
  for (const expected of manifest.fullLength ?? []) {
    const loaded = content.fullLength.find((t) => t.id === expected.id)
    if (!loaded) {
      throw new ContentValidationError(file, `full-length ${expected.id} อยู่ใน manifest แต่โหลดไม่พบ`)
    }
    if (loaded.questions.length !== expected.normalQuestions || loaded.pbqs.length !== expected.pbqs) {
      throw new ContentValidationError(
        file,
        `full-length ${expected.id}: โหลดได้ ${loaded.questions.length}+${loaded.pbqs.length} แต่ manifest ระบุ ${expected.normalQuestions}+${expected.pbqs}`,
      )
    }
  }
}
