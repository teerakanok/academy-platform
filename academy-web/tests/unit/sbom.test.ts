import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// SBOM.md ต้องสอดคล้อง package.json + lockfile เสมอ (แผน §4-M1 acceptance)
// — ทุก direct dependency ต้องปรากฏใน SBOM พร้อมเวอร์ชัน resolved ตรงกับ lockfile

const root = join(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const sbom = readFileSync(join(root, 'SBOM.md'), 'utf8')

function resolvedVersion(name: string): string | undefined {
  return lock.packages?.[`node_modules/${name}`]?.version
}

describe('SBOM สอดคล้อง lockfile', () => {
  const allDirect: Array<[string, string]> = [
    ...Object.entries(pkg.dependencies as Record<string, string>),
    ...Object.entries(pkg.devDependencies as Record<string, string>),
  ]

  it('ทุก direct dependency อยู่ใน SBOM พร้อมเวอร์ชัน resolved ตรง lockfile', () => {
    for (const [name, range] of allDirect) {
      expect(sbom, `SBOM ขาด ${name}`).toContain(`| ${name} |`)
      if (!range.startsWith('file:')) {
        const version = resolvedVersion(name)
        expect(version, `lockfile ไม่มี ${name}`).toBeTruthy()
        expect(sbom, `SBOM เวอร์ชัน ${name} ไม่ตรง lockfile (${version})`).toContain(
          `| ${name} | \`${range}\` | ${version} |`,
        )
      }
    }
  })

  it('SBOM ไม่มี dependency ผี (แถวที่ไม่อยู่ใน package.json แล้ว)', () => {
    const names = new Set(allDirect.map(([n]) => n))
    const rows = [...sbom.matchAll(/^\| ([@a-z0-9/._-]+) \| `/gm)].map((m) => m[1])
    for (const row of rows) {
      expect(names.has(row), `SBOM มีแถว ${row} ที่ไม่อยู่ใน package.json`).toBe(true)
    }
  })
})
