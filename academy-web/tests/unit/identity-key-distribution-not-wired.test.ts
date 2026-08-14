import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const IDENTITY_LIB = join(SRC, 'lib', 'identity')

/**
 * โมดูลที่สร้างไว้แล้วแต่ **ยังไม่เปิดใช้** เพราะฝั่ง Identity ยังไม่ published
 * result verification-key set จริง และการเปิดเป็นการตัดสินใจของ founder
 *
 * ก่อนหน้านี้ข้อความว่า "ยังไม่มีผู้เรียกใน production" เป็นจริงเพราะบังเอิญยังไม่มีใคร
 * ต่อ ไม่ใช่เพราะมีอะไรห้าม ด่านนี้เปลี่ยนให้เป็นจริงโดยโครงสร้าง — ใครจะต่อจริงต้อง
 * ลบชื่อออกจากรายการนี้ ซึ่งเป็นการกระทำที่ตั้งใจและมีรีวิวของมันเอง ไม่ใช่ import
 * ที่หลุดเข้ามาเงียบๆ ตอน refactor
 */
const NOT_YET_ENABLED = [
  'client-assertion-jti-source',
  'client-assertion-provider',
  'client-assertion-webcrypto-signer',
  'result-key-set-cache',
  'result-key-set-importer',
] as const

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '.open-next', '.wrangler'])
/**
 * ผลลัพธ์ของ build ไม่ใช่ซอร์สที่เรากำกับ การเดินกราฟหยุดที่นี่ ไม่ใช่เพราะมองข้าม
 * แต่เพราะไฟล์พวกนี้ถูกสร้างจาก src ทั้งหมด — ถ้าโมดูลที่ยังไม่เปิดใช้โผล่ในบันเดิล
 * แปลว่ามีอะไรใน src เรียกมัน ซึ่งการเดินฝั่ง src จับได้อยู่แล้ว
 * เทส "ผลลัพธ์ build ถูก ignore จริง" ด้านล่างคือสิ่งที่ทำให้ข้ออ้างนี้ยังจริง
 */
const GENERATED_SEGMENTS = ['/.open-next/', '/.next/', '/.wrangler/', '/node_modules/']
const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']
const INDEX_CANDIDATES = ['index.ts', 'index.tsx', 'index.mts', 'index.js']
// `from '…'` ครอบทั้ง import และ re-export — `export { x } from` คือทางหลบ
// ทางแรกที่รีวิวอิสระใช้ได้จริง
const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g
const BARE_IMPORT = /\bimport\s*['"]([^'"]+)['"]/g
const STATIC_DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_CALL = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
// ทุกตำแหน่งของ `import(` เพื่อตรวจทีละอันว่าเป็น string literal เดี่ยวๆ หรือไม่
// การดูแค่ตัวอักษรถัดไปไม่พอ: `import('a/' + 'b')` ขึ้นต้นด้วย quote เหมือนกัน
// แต่ resolve ไม่ได้ — รีวิวอิสระใช้ช่องนี้หลุดด่านมาแล้ว
const ANY_DYNAMIC_IMPORT = /\bimport\s*\(/g
const LITERAL_DYNAMIC_IMPORT = /^import\s*\(\s*(['"])[^'"]*\1\s*\)/

function filesUnder(path: string, matches: (name: string) => boolean): string[] {
  if (!existsSync(path)) return []
  const entry = statSync(path)
  if (entry.isFile()) return matches(path) ? [path] : []
  if (!entry.isDirectory()) return []
  return readdirSync(path).flatMap((name) => (
    SKIPPED_DIRECTORIES.has(name) ? [] : filesUnder(join(path, name), matches)
  ))
}

const isSource = (path: string): boolean => /\.(?:tsx?|mts|mjs|jsx?)$/.test(path)

/** ตัดคอมเมนต์ทิ้งก่อนหา specifier เพื่อไม่ให้ตัวอย่างในคอมเมนต์นับเป็น import */
function withoutComments(text: string): string {
  let output = ''
  let index = 0
  let quote: string | null = null
  while (index < text.length) {
    const character = text[index]!
    if (quote) {
      output += character
      if (character === '\\') { output += text[index + 1] ?? ''; index += 2; continue }
      if (character === quote) quote = null
      index += 1
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      output += character
      index += 1
      continue
    }
    if (character === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }
    if (character === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    output += character
    index += 1
  }
  return output
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null // แพ็กเกจภายนอก ไม่ใช่ซอร์สของเรา
  if (GENERATED_SEGMENTS.some((segment) => `${base}/`.includes(segment))) return null
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  for (const index of INDEX_CANDIDATES) {
    const candidate = join(base, index)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** ทุก wrangler config ที่ไม่ได้อยู่ใต้ tests/ คือทางเข้า production ตัวจริง */
function wranglerEntrypoints(): string[] {
  const configs = filesUnder(ROOT, (path) => (
    /\/wrangler[^/]*\.(?:jsonc?|toml)$/.test(path) && !path.includes(`${ROOT}/tests/`)
  ))
  return configs.flatMap((config) => {
    const text = readFileSync(config, 'utf8')
    const main = /"main"\s*:\s*"([^"]+)"/.exec(text)?.[1]
      ?? /^\s*main\s*=\s*"([^"]+)"/m.exec(text)?.[1]
    if (!main) return []
    const resolved = join(dirname(config), main)
    return existsSync(resolved) ? [resolved] : []
  })
}

function productionEntrypoints(): string[] {
  return [
    // ทุกไฟล์ใต้ src/app คือ route/page/layout ที่ Next ถือเป็นทางเข้าเอง
    ...filesUnder(join(SRC, 'app'), isSource),
    ...filesUnder(join(SRC, 'middleware.ts'), isSource),
    ...wranglerEntrypoints(),
    ...filesUnder(join(ROOT, 'open-next.config.ts'), isSource),
  ]
}

function reachableFrom(entrypoints: string[]): { files: Set<string>, computed: string[] } {
  const files = new Set<string>()
  const computed: string[] = []
  const queue = [...entrypoints]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (files.has(current)) continue
    files.add(current)
    const text = withoutComments(readFileSync(current, 'utf8'))
    ANY_DYNAMIC_IMPORT.lastIndex = 0
    let dynamic = ANY_DYNAMIC_IMPORT.exec(text)
    while (dynamic !== null) {
      if (!LITERAL_DYNAMIC_IMPORT.test(text.slice(dynamic.index))) {
        computed.push(`${relative(ROOT, current)}: ${text.slice(dynamic.index, dynamic.index + 60).split('\n')[0]!}`)
        break
      }
      dynamic = ANY_DYNAMIC_IMPORT.exec(text)
    }
    for (const pattern of [FROM_SPECIFIER, BARE_IMPORT, STATIC_DYNAMIC_IMPORT, REQUIRE_CALL]) {
      pattern.lastIndex = 0
      let match = pattern.exec(text)
      while (match !== null) {
        const target = resolveSpecifier(current, match[1]!)
        if (target !== null && !files.has(target)) queue.push(target)
        match = pattern.exec(text)
      }
    }
  }
  return { files, computed }
}

describe('การกระจาย verification key ของ Identity ยังไม่ถูกต่อเข้า production', () => {
  const entrypoints = productionEntrypoints()
  const { files: reachable, computed } = reachableFrom(entrypoints)

  // ถ้าไฟล์ถูกเปลี่ยนชื่อ การเดินกราฟจะไม่เจออะไรแล้วผ่านด้วยเหตุผลที่ผิด
  // ด่านนี้จึงต้องยืนยันก่อนว่าสิ่งที่กำลังเฝ้ายังมีตัวตนอยู่จริง
  it.each(NOT_YET_ENABLED)('%s ยังมีอยู่จริง ด่านนี้จึงไม่ได้เฝ้าของที่หายไปแล้ว', (name) => {
    expect(existsSync(join(IDENTITY_LIB, `${name}.ts`))).toBe(true)
  })

  it('การเดินกราฟทำงานจริง ไม่ใช่ผ่านเพราะไม่ได้เดิน', () => {
    // ด่านที่ "ไม่เจออะไรเลย" กับด่านที่ "ไม่ได้ตรวจอะไรเลย" ให้ผลเหมือนกัน
    // สามข้อนี้แยกสองอย่างนั้นออกจากกัน
    expect(entrypoints.length).toBeGreaterThan(20)
    expect(reachable.size).toBeGreaterThan(60)
    // ไฟล์ที่รู้แน่ว่า route เรียกถึง ถ้าเดินไม่ถึงแปลว่า resolver พัง
    expect(reachable.has(join(IDENTITY_LIB, 'local-runtime.ts'))).toBe(true)
    // และต้องเดินข้าม wrangler entry ของแอปได้ด้วย ไม่ใช่เห็นแค่ src/app
    expect(entrypoints.some((path) => path.endsWith('worker.ts'))).toBe(true)
  })

  it('ผลลัพธ์ build ถูก ignore จริง การหยุดเดินที่นั่นจึงไม่ใช่ช่องโหว่', () => {
    // การเดินกราฟหยุดที่ .open-next/.next ได้ก็ต่อเมื่อมันเป็นของที่ build สร้าง
    // ไม่ใช่ซอร์สที่คนเขียนมือ ถ้าวันหนึ่งมีคน commit ไฟล์ในนั้น ข้ออ้างนี้ตาย
    const ignored = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    for (const directory of ['.next/', '.open-next/']) {
      expect(ignored.split('\n')).toContain(directory)
    }
  })

  it('ไม่มี dynamic import ที่ประกอบชื่อเอง ในกราฟของ production', () => {
    // specifier ที่ประกอบจากตัวแปร resolve ไม่ได้ ด่านไหนก็ตามหลังจากนี้จึงมองไม่เห็น
    // ห้ามไปเลยดีกว่าปล่อยให้มีช่องที่ตรวจไม่ได้
    expect(computed, 'ห้าม dynamic import ที่ specifier ไม่ใช่ string literal').toEqual([])
  })

  it('ไม่มีโมดูลที่ยังไม่เปิดใช้ตัวไหนถูกเดินถึงจากทางเข้า production', () => {
    const wired = NOT_YET_ENABLED
      .map((name) => join(IDENTITY_LIB, `${name}.ts`))
      .filter((path) => reachable.has(path))
      .map((path) => relative(ROOT, path))

    expect(wired, [
      'มีทางเข้า production ที่เดินถึงโมดูล identity ที่ยังไม่เปิดใช้',
      'การเดินกราฟตามทั้ง import, re-export, dynamic import ที่เป็น string literal และ require',
      'ถ้าตั้งใจเปิดจริง ให้ลบชื่อออกจาก NOT_YET_ENABLED ในเทสนี้พร้อมกัน',
      'และต้องมีหลักฐานว่า Identity published key set จริงแล้ว',
    ].join(' · ')).toEqual([])
  })

  it('โมดูลเหล่านี้ไม่เปิด route ไม่ยิงเน็ต และไม่อ่าน environment เอง', () => {
    for (const name of NOT_YET_ENABLED) {
      const text = readFileSync(join(IDENTITY_LIB, `${name}.ts`), 'utf8')
      expect(text, `${name} ต้องไม่ยิงเน็ตหรืออ่าน config เอง`)
        .not.toMatch(/process\.env|\bfetch\s*\(|new Request\(|NextResponse/)
    }
  })
})
