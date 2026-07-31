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
