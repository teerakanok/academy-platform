import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('security boundary wiring', () => {
  const mutationRoutes = [
    'src/app/api/leads/route.ts',
    'src/app/api/auth/otp/route.ts',
    'src/app/api/auth/verify/route.ts',
    'src/app/api/auth/sign-out/route.ts',
    'src/app/api/attempts/route.ts',
    'src/app/api/progress/route.ts',
    'src/app/api/progress/reset/route.ts',
    'src/app/api/practice/simulation/route.ts',
  ]

  it.each(mutationRoutes)('%s ใช้ same-origin guard กลาง', (path) => {
    expect(source(path)).toContain('validateMutationRequest')
  })

  const jsonRoutes = mutationRoutes.filter(
    (path) => !path.endsWith('sign-out/route.ts') && !path.endsWith('reset/route.ts'),
  )

  it.each(jsonRoutes)('%s ใช้ bounded JSON parser กลาง', (path) => {
    expect(source(path)).toContain('readBoundedJson')
  })

  const nodePaths = [
    'src/app/courses/[slug]/lessons/[nodeId]/page.tsx',
    'src/app/api/attempts/route.ts',
    'src/app/api/progress/route.ts',
    'src/app/api/explanations/route.ts',
    'src/app/api/practice/simulation/route.ts',
  ]

  it.each(nodePaths)('%s บังคับ resource access ถึงระดับ prerequisite', (path) => {
    expect(source(path)).toContain('authorizeCourseResource')
  })

  it('course reset บังคับ course access กลาง', () => {
    const path = 'src/app/api/progress/reset/route.ts'
    expect(source(path)).toContain('getCourseAccess')
  })

  it('progress ที่ส่ง attempt มาแล้วยังใช้ attempt contract แม้ current deploy ไม่บังคับแล้ว', () => {
    expect(source('src/app/api/progress/route.ts')).toContain(
      'requiresAttempt(node, sims.length > 0) || input.attemptId !== undefined',
    )
  })

  it('progress ใช้ assessed policy จาก attempt snapshot ไม่ใช่ node หลัง deploy', () => {
    expect(source('src/app/api/progress/route.ts')).toContain('consumed.params.assessment.assessed')
  })
})
