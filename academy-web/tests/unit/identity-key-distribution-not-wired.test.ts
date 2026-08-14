import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = realpathSync(join(__dirname, '..', '..'))
const SRC = join(ROOT, 'src')
const IDENTITY_LIB = join(SRC, 'lib', 'identity')

/**
 * โมดูลที่สร้างไว้แล้วแต่ **ยังไม่เปิดใช้** เพราะฝั่ง Identity ยังไม่ published
 * result verification-key set จริง และการเปิดเป็นการตัดสินใจของ founder
 *
 * ข้อความว่า "ยังไม่มีผู้เรียกใน production" เคยเป็นจริงเพราะบังเอิญยังไม่มีใครต่อ
 * ไม่ใช่เพราะมีอะไรห้าม ด่านนี้เปลี่ยนให้เป็นจริงโดยโครงสร้าง — ใครจะต่อจริงต้อง
 * ลบชื่อออกจากรายการนี้ ซึ่งเป็นการกระทำที่ตั้งใจและมีรีวิวของมันเอง
 */
const NOT_YET_ENABLED = [
  'client-assertion-jti-source',
  'client-assertion-provider',
  'client-assertion-webcrypto-signer',
  'result-key-set-cache',
  'result-key-set-importer',
] as const

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '.open-next', '.wrangler', '.git'])
/**
 * ผลลัพธ์ของ build ไม่ใช่ซอร์สที่เรากำกับ การเดินกราฟหยุดที่นี่ ไม่ใช่เพราะมองข้าม
 * แต่เพราะไฟล์พวกนี้ถูกสร้างจาก src ทั้งหมด — ถ้าโมดูลที่ยังไม่เปิดใช้โผล่ในบันเดิล
 * แปลว่ามีอะไรใน src เรียกมัน ซึ่งการเดินฝั่ง src จับได้อยู่แล้ว
 */
const GENERATED_SEGMENTS = ['/.open-next/', '/.next/', '/.wrangler/', '/node_modules/']
const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']
const INDEX_CANDIDATES = ['index.ts', 'index.tsx', 'index.mts', 'index.js']
// `from '…'` ครอบทั้ง import และ re-export — `export { x } from` และ
// `export * as ns from` คือทางหลบทางแรกที่รีวิวอิสระใช้ได้จริง
const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g
const BARE_IMPORT = /\bimport\s*['"]([^'"]+)['"]/g
const STATIC_DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_CALL = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
// ทุกตำแหน่งของ `import(` เพื่อตรวจทีละอันว่าเป็น string literal เดี่ยวๆ หรือไม่
// การดูแค่ตัวอักษรถัดไปไม่พอ: `import('a/' + 'b')` ขึ้นต้นด้วย quote เหมือนกัน
// แต่ resolve ไม่ได้ — รีวิวอิสระใช้ช่องนี้หลุดด่านมาแล้ว
const ANY_DYNAMIC_IMPORT = /\bimport\s*\(/g
const LITERAL_DYNAMIC_IMPORT = /^import\s*\(\s*(['"])[^'"]*\1\s*\)/

const isSource = (path: string): boolean => /\.(?:tsx?|mts|mjs|jsx?)$/.test(path)

function filesUnder(path: string, matches: (name: string) => boolean): string[] {
  if (!existsSync(path)) return []
  const entry = statSync(path)
  if (entry.isFile()) return matches(path) ? [path] : []
  if (!entry.isDirectory()) return []
  return readdirSync(path).flatMap((name) => (
    SKIPPED_DIRECTORIES.has(name) ? [] : filesUnder(join(path, name), matches)
  ))
}

/**
 * ตัดคอมเมนต์ออกจาก JSONC ด้วยการเดินทีละตัวอักษร ไม่ใช่ regex
 *
 * คอมเมนต์บรรทัดจบที่ `\n` **และ `\r`** — Wrangler จบที่ `\r` ด้วย และรีวิวอิสระ
 * ใช้ช่องนั้นซ่อนค่าจริงไว้หลัง `\r` ในคอมเมนต์จนตัวอ่านที่จบเฉพาะ `\n` อ่านผิดค่า
 */
function stripJsonComments(text: string): string {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  let output = ''
  let index = 0
  let inString = false
  while (index < source.length) {
    const character = source[index]!
    if (inString) {
      output += character
      if (character === '\\') { output += source[index + 1] ?? ''; index += 2; continue }
      if (character === '"') inString = false
      index += 1
      continue
    }
    if (character === '"') { inString = true; output += character; index += 1; continue }
    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const closed = source.indexOf('*/', index + 2)
      if (closed === -1) throw new Error('คอมเมนต์บล็อกไม่ถูกปิด')
      index = closed + 2
      continue
    }
    output += character
    index += 1
  }
  return output
}

function readJsonc(path: string): Record<string, unknown> {
  const stripped = stripJsonComments(readFileSync(path, 'utf8'))
  // `,` ที่ตามด้วยช่องว่างแล้วปิดวงเล็บ — Wrangler ยอม, JSON.parse ไม่ยอม
  return JSON.parse(stripped.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>
}

/** alias ทุกตัวที่ประกาศไว้จริง ไม่ใช่ `@/` ที่ hardcode ไว้ตัวเดียว */
function aliasRules(): { prefix: string, suffix: string, targets: string[] }[] {
  const config = readJsonc(join(ROOT, 'tsconfig.json'))
  const compiler = (config.compilerOptions ?? {}) as Record<string, unknown>
  const base = join(ROOT, typeof compiler.baseUrl === 'string' ? compiler.baseUrl : '.')
  const paths = (compiler.paths ?? {}) as Record<string, string[]>
  return Object.entries(paths).map(([pattern, targets]) => {
    const [prefix, suffix = ''] = pattern.split('*')
    return { prefix: prefix!, suffix, targets: targets.map((target) => join(base, target)) }
  })
}

/**
 * import ด้วยชื่อแพ็กเกจตัวเอง — Node รองรับผ่าน `exports` และมันเดินทางถึง
 * production ได้เหมือน import ธรรมดา แต่ resolver ที่รู้จักแค่ `@/` กับ relative
 * จะมองไม่เห็นเลย
 */
function selfImportRules(): { name: string, exportsMap: Record<string, unknown> | null } {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    name?: string
    exports?: Record<string, unknown> | string
  }
  const exportsField = manifest.exports
  return {
    name: typeof manifest.name === 'string' ? manifest.name : '',
    exportsMap: exportsField !== null && typeof exportsField === 'object'
      ? exportsField as Record<string, unknown>
      : null,
  }
}

const ALIASES = aliasRules()
const SELF = selfImportRules()

function candidatesFor(fromFile: string, specifier: string): string[] {
  if (specifier.startsWith('.')) return [resolve(dirname(fromFile), specifier)]

  const aliased = ALIASES.flatMap(({ prefix, suffix, targets }) => {
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return []
    const middle = specifier.slice(prefix.length, specifier.length - suffix.length)
    return targets.map((target) => target.replace('*', middle))
  })
  if (aliased.length > 0) return aliased

  if (SELF.name !== '' && (specifier === SELF.name || specifier.startsWith(`${SELF.name}/`))) {
    const rest = specifier === SELF.name ? '.' : `./${specifier.slice(SELF.name.length + 1)}`
    if (SELF.exportsMap) {
      const mapped = SELF.exportsMap[rest] ?? SELF.exportsMap[specifier]
      if (typeof mapped === 'string') return [join(ROOT, mapped)]
      return Object.entries(SELF.exportsMap).flatMap(([pattern, target]) => {
        if (typeof target !== 'string' || !pattern.includes('*')) return []
        const [prefix, suffix = ''] = pattern.split('*')
        if (!rest.startsWith(prefix!) || !rest.endsWith(suffix)) return []
        const middle = rest.slice(prefix!.length, rest.length - suffix.length)
        return [join(ROOT, target.replace('*', middle))]
      })
    }
    return [join(ROOT, rest)]
  }
  return [] // แพ็กเกจภายนอกจริงๆ ไม่ใช่ซอร์สของเรา
}

/**
 * เทียบด้วยพาธจริงเสมอ — symlink ที่ชี้ไปโมดูลต้องห้ามเป็นคนละสตริงแต่เป็นไฟล์
 * เดียวกัน การเทียบสตริงตรงๆ จึงหลบได้
 */
function canonical(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  for (const base of candidatesFor(fromFile, specifier)) {
    if (GENERATED_SEGMENTS.some((segment) => `${base}/`.includes(segment))) continue
    for (const extension of SOURCE_EXTENSIONS) {
      const candidate = `${base}${extension}`
      if (existsSync(candidate) && statSync(candidate).isFile()) return canonical(candidate)
    }
    for (const index of INDEX_CANDIDATES) {
      const candidate = join(base, index)
      if (existsSync(candidate)) return canonical(candidate)
    }
  }
  return null
}

/** ทุก wrangler config ที่ไม่ได้อยู่ใต้ tests/ คือทางเข้า production ตัวจริง */
function wranglerEntrypoints(): string[] {
  const configs = filesUnder(ROOT, (path) => (
    /\/wrangler[^/]*\.(?:jsonc?|toml)$/.test(path) && !path.startsWith(`${ROOT}/tests/`)
  ))
  return configs.flatMap((config) => {
    let main: unknown
    if (config.endsWith('.toml')) {
      main = /^\s*main\s*=\s*"([^"]+)"/m.exec(readFileSync(config, 'utf8'))?.[1]
    } else {
      // อ่านหลังตัดคอมเมนต์เท่านั้น — `"main"` ที่ถูกคอมเมนต์ทิ้งไว้ไม่ใช่ค่าจริง
      // และรีวิวอิสระใช้ comment ลวงตัวนี้หลบด่านมาแล้ว
      try {
        main = readJsonc(config).main
      } catch {
        main = undefined
      }
    }
    if (typeof main !== 'string') return []
    const resolved = join(dirname(config), main)
    return existsSync(resolved) ? [canonical(resolved)] : []
  })
}

/**
 * ทางเข้าที่ Next ถือเป็น entry โดย convention ไม่ใช่แค่ `src/app`
 *
 * `src/instrumentation.ts` เป็นตัวที่อันตรายที่สุด: รีวิวอิสระ build จริงแล้วโค้ด
 * จากโมดูลต้องห้ามไปโผล่ใน `.open-next/middleware/handler.mjs` ขณะที่ด่านยังเขียว
 */
function productionEntrypoints(): string[] {
  return [...new Set([
    ...filesUnder(join(SRC, 'app'), isSource),
    ...filesUnder(join(SRC, 'pages'), isSource),
    ...filesUnder(join(SRC, 'middleware.ts'), isSource),
    ...filesUnder(join(SRC, 'instrumentation.ts'), isSource),
    ...filesUnder(join(SRC, 'instrumentation-client.ts'), isSource),
    ...filesUnder(join(ROOT, 'instrumentation.ts'), isSource),
    ...filesUnder(join(ROOT, 'next.config.ts'), isSource),
    ...filesUnder(join(ROOT, 'open-next.config.ts'), isSource),
    ...wranglerEntrypoints(),
  ].map(canonical))]
}

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
  const gatedPaths = NOT_YET_ENABLED.map((name) => canonical(join(IDENTITY_LIB, `${name}.ts`)))

  it.each(NOT_YET_ENABLED)('%s ยังมีอยู่จริง ด่านนี้จึงไม่ได้เฝ้าของที่หายไปแล้ว', (name) => {
    expect(existsSync(join(IDENTITY_LIB, `${name}.ts`))).toBe(true)
  })

  it('การเดินกราฟทำงานจริง ไม่ใช่ผ่านเพราะไม่ได้เดิน', () => {
    expect(entrypoints.length).toBeGreaterThan(20)
    expect(reachable.size).toBeGreaterThan(60)
    // ไฟล์ที่รู้แน่ว่า route เรียกถึง ถ้าเดินไม่ถึงแปลว่า resolver พัง
    expect(reachable.has(canonical(join(IDENTITY_LIB, 'local-runtime.ts')))).toBe(true)
  })

  it('ทางเข้าครอบทุก wrangler worker ที่ deploy จริง ไม่ใช่แค่ตัวหลัก', () => {
    // มี worker มากกว่าหนึ่งตัวในรีโปนี้ (หน้าร้าน + retention scheduler)
    // การ hardcode รายการทางเข้าเคยทำให้ worker ตัวใหม่หลุดจากด่านทั้งตัว
    const workers = wranglerEntrypoints()
    expect(workers.length).toBeGreaterThanOrEqual(2)
    expect(workers.every((path) => reachable.has(path))).toBe(true)
  })

  it('alias ทุกตัวที่ประกาศไว้ถูกอ่านมาครบและ resolve ได้จริง', () => {
    // ถ้ามีคนเพิ่ม alias ใหม่ใน tsconfig แล้ว resolver ตามไม่ทัน ด่านจะมองไม่เห็น
    // การ import ผ่าน alias นั้นทั้งหมด
    expect(ALIASES.length).toBeGreaterThan(0)
    for (const alias of ALIASES) {
      expect(alias.targets.length).toBeGreaterThan(0)
      expect(alias.targets.every((target) => target.startsWith(ROOT))).toBe(true)
    }
    const probe = resolveSpecifier(join(SRC, 'app', 'probe.ts'), '@/lib/identity/local-runtime')
    expect(probe).toBe(canonical(join(IDENTITY_LIB, 'local-runtime.ts')))
  })

  it('ผลลัพธ์ build ถูก ignore จริง การหยุดเดินที่นั่นจึงไม่ใช่ช่องโหว่', () => {
    const ignored = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    for (const directory of ['.next/', '.open-next/']) {
      expect(ignored.split('\n')).toContain(directory)
    }
  })

  it('ไม่มี dynamic import ที่ประกอบชื่อเอง ในกราฟของ production', () => {
    expect(computed, 'ห้าม dynamic import ที่ specifier ไม่ใช่ string literal').toEqual([])
  })

  it('ไม่มีโมดูลที่ยังไม่เปิดใช้ตัวไหนถูกเดินถึงจากทางเข้า production', () => {
    const wired = gatedPaths
      .filter((path) => reachable.has(path))
      .map((path) => relative(ROOT, path))

    expect(wired, [
      'มีทางเข้า production ที่เดินถึงโมดูล identity ที่ยังไม่เปิดใช้',
      'การเดินกราฟตาม import, re-export, dynamic import ที่เป็น string literal, require,',
      'ทุก alias ใน tsconfig, self-import ผ่านชื่อแพ็กเกจ และพาธจริงหลัง realpath',
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
