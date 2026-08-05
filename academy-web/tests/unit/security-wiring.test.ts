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
    'src/app/api/leads/unsubscribe/route.ts',
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

  it('scheduled worker บังคับ retention ที่อนุมัติครบทุกหมวด', () => {
    const worker = source('ops/academy-retention-worker/retention.ts')
    expect(worker).toContain("rpc: 'run_retention_attempts'")
    expect(worker).toContain("rpc: 'run_retention_leads'")
    expect(worker).toContain("rpc: 'run_retention_inactive_users'")
    expect(worker).toContain("rpc: 'run_retention_privacy_requests'")
    expect(worker).toContain("rpc: 'run_retention_staff_authorization_history'")
  })

  it('retention capability แยกจาก Academy web Worker และ shared service role', () => {
    const appWorker = source('worker.ts')
    const retentionWorker = source('ops/academy-retention-worker/retention.ts')
    const appConfig = source('wrangler.jsonc')
    const retentionConfig = source('ops/academy-retention-worker/wrangler.jsonc')

    expect(appWorker).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(appWorker).not.toContain('scheduled(')
    expect(appConfig).not.toContain('"triggers"')
    expect(retentionWorker).toContain('ACADEMY_RETENTION_API_JWT_SECRET')
    expect(retentionWorker).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(retentionConfig).toContain('"triggers": { "crons": ["0 3 * * *"] }')
  })

  it('public mutation rate limit อยู่ก่อน OpenNext และใช้ Durable Object ที่มี migration', () => {
    const worker = source('worker.ts')
    const config = source('wrangler.jsonc')
    const policy = source('src/lib/edge-rate-limit-policy.ts')

    expect(worker).toContain('enforceEdgeRateLimit')
    expect(worker).toContain('EDGE_RATE_LIMITER')
    expect(worker).toContain('RATE_LIMIT_KEY_SECRET')
    expect(config).toContain('"class_name": "EdgeRateLimiter"')
    expect(config).toContain('"new_sqlite_classes": ["EdgeRateLimiter"]')
    expect(policy).toContain("'cf-connecting-ip'")
    expect(policy).not.toContain("get('x-forwarded-for')")
  })

  it.each([
    'src/app/api/leads/route.ts',
    'src/app/api/leads/unsubscribe/route.ts',
    'src/app/api/auth/otp/route.ts',
    'src/app/api/auth/verify/route.ts',
  ])('%s เชื่อใจ edge marker ที่มีค่า exact เท่านั้น', (path) => {
    expect(source(path)).toContain('hasEdgeRateLimitMarker')
  })

  it('unsubscribe bearer token อยู่ใน fragment เท่านั้น ไม่ผ่าน query เข้า server หรือ edge', () => {
    const page = source('src/app/unsubscribe/page.tsx')
    const form = source('src/app/unsubscribe/UnsubscribeForm.tsx')
    const e2e = source('e2e/landing.spec.ts')

    expect(page).not.toContain('token?:')
    expect(form).toContain('unsubscribeTokenFromFragment(window.location.hash)')
    expect(form).toContain('window.history.replaceState')
    expect(e2e).not.toContain('/unsubscribe?token=')
    expect(e2e).toContain('/unsubscribe?lang=th#')
  })
})
