import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCourse, getCourseStructure, listCourseSlugs } from '@/lib/content/course-source'
import { toPublicCourse } from '@/lib/content/public-course'

// หน้าเว็บบอกว่า "ฟรี" จาก course.json แต่คนตัดสินจริงคือ academy.course_offer ใน DB
// สองที่นี้ต้องตรงกันเสมอ: ถ้า course.json บอกฟรีแต่ DB ไม่มี offer ผู้เรียนจะกด
// "เริ่มเรียนฟรี" แล้วโดนปฏิเสธ · ถ้า DB มี offer แต่ course.json ไม่บอก คอร์สนั้นเปิดให้
// ลงเรียนเองได้โดยไม่มีใครเห็น

const root = join(__dirname, '..', '..')
const coursesDir = join(root, 'content', 'courses')
const migrationsDir = join(root, 'supabase', 'migrations')
const OFFER_MIGRATION = '0040_free_course_self_enrolment.sql'
const migration = readFileSync(join(migrationsDir, OFFER_MIGRATION), 'utf8')
const rollbackPath = join(root, 'supabase', 'rollbacks', '0040_free_course_self_enrolment.rollback.sql')

function freeCoursesInContent(): string[] {
  return readdirSync(coursesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => {
      const raw = JSON.parse(readFileSync(join(coursesDir, slug, 'course.json'), 'utf8')) as { offer?: { model?: string } }
      return raw.offer?.model === 'free'
    })
    .sort()
}

/** slug ทุกตัวที่ migration ใดๆ seed เป็น free — นับทุก migration ไม่ใช่แค่ 0040 */
function freeCoursesInMigrations(): string[] {
  const slugs = new Set<string>()
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const insert of sql.matchAll(/insert\s+into\s+academy\.course_offer\s*\(\s*course_slug\s*,\s*model\s*\)\s*values([\s\S]*?);/gi)) {
      for (const row of insert[1].matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'([a-z]+)'\s*\)/g)) {
        if (row[2] === 'free') slugs.add(row[1])
      }
    }
    if (/delete\s+from\s+academy\.course_offer|update\s+academy\.course_offer/i.test(sql)) {
      throw new Error(`${file} changes course_offer; extend this test to model it before relying on the seed`)
    }
  }
  return [...slugs].sort()
}

describe('free course offer: course.json and the database seed agree', () => {
  it('declares exactly the same free courses in content and in the migration seed', () => {
    const content = freeCoursesInContent()
    expect(content.length).toBeGreaterThan(0)
    expect(freeCoursesInMigrations()).toEqual(content)
  })

  it('seeds the eight published fundamentals and no internal or certification course', () => {
    expect(freeCoursesInContent()).toEqual([
      'assembly',
      'basic-os-linux',
      'c-low-level',
      'computer-architecture',
      'computer-networking',
      'git-essentials',
      'operating-systems',
      'setup-and-environment',
    ])
    for (const slug of freeCoursesInContent()) {
      expect(getCourseStructure(slug)?.publicAvailability).toBe('syllabus-preview')
    }
  })

  it('carries the offer through the validated loader and the public projection', () => {
    expect(getCourseStructure('git-essentials')?.offer).toEqual({ model: 'free' })
    expect(toPublicCourse(getCourse('git-essentials')!).offer).toEqual({ model: 'free' })
    for (const slug of listCourseSlugs().filter((candidate) => !freeCoursesInContent().includes(candidate))) {
      expect(getCourseStructure(slug)?.offer).toBeUndefined()
      expect(toPublicCourse(getCourse(slug)!).offer).toBeNull()
    }
  })
})

describe('migration 0040 authority contract', () => {
  const fn = migration.match(/create or replace function academy\.enrol_free_course[\s\S]*?\$\$;/)?.[0] ?? ''

  it('defines a security definer RPC with a pinned search path and the 0030 scope lock', () => {
    expect(fn).toMatch(/security definer\s+set search_path = pg_catalog, academy/)
    expect(fn).toContain(
      "hashtextextended('academy.course_entitlement:' || p_user_id::text || ':' || p_course_slug, 0)",
    )
  })

  it('refuses a course without a free offer, an inactive account, and an owner revocation', () => {
    expect(fn).toMatch(/from academy\.course_offer\s+where course_slug = p_course_slug and model = 'free'[\s\S]*?errcode = '42501'/)
    expect(fn).toMatch(/v_activation_status is distinct from 'active'[\s\S]*?errcode = '55000'/)
    expect(fn).toMatch(/revoked_at is not null[\s\S]*?errcode = '42501'/)
    expect(fn).toMatch(/errcode = '22023'/)
  })

  it('writes only source=free and an append-only audit row', () => {
    expect(fn).toMatch(/values \(p_user_id, p_course_slug, 'free', now\(\), null, null\)/)
    expect(fn).toMatch(/insert into academy\.course_entitlement_audit/)
    expect(fn).not.toMatch(/'purchase'|'grant'|'invitation'/)
    expect(migration).not.toMatch(/model in \([^)]*'paid'/)
  })

  it('grants execution to the runtime only and gives nobody the offer table', () => {
    expect(migration).toMatch(
      /revoke all on function academy\.enrol_free_course\(uuid, text\)\s+from public, anon, authenticated, service_role,/,
    )
    const grants = [...migration.matchAll(/grant\s+([^;]+?)\s+on\s+(?:function\s+)?([^;]+?)\s+to\s+([^;]+);/gi)]
    expect(grants.map((grant) => `${grant[2].trim()} -> ${grant[3].trim()}`)).toEqual([
      'academy.enrol_free_course(uuid, text) -> academy_runtime',
    ])
    expect(migration).toMatch(/revoke all on academy\.course_offer\s+from public, anon, authenticated, service_role, academy_runtime,/)
  })

  it('ships a rollback that removes the authority and keeps evidence', () => {
    expect(existsSync(rollbackPath)).toBe(true)
    const rollback = readFileSync(rollbackPath, 'utf8')
    expect(rollback).toMatch(/drop function academy\.enrol_free_course\(uuid, text\);/)
    expect(rollback).toMatch(/drop table academy\.course_offer;/)
    expect(rollback).not.toMatch(/delete from academy\.course_entitlement/i)
  })
})
