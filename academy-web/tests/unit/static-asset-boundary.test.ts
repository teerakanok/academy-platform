import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('deployed static-asset boundary', () => {
  it('applies the Next.js security-header baseline to static assets', () => {
    const headers = readFileSync('public/_headers', 'utf8')

    for (const value of [
      '/*',
      'Content-Security-Policy: default-src \'self\'',
      'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options: nosniff',
      'X-Frame-Options: DENY',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      'X-DNS-Prefetch-Control: off',
    ]) {
      expect(headers, value).toContain(value)
    }
  })

  it('runs the protected-media path through the Worker and wires the final-asset gate', () => {
    const wrangler = readFileSync('wrangler.jsonc', 'utf8')
    const buildScript = readFileSync('scripts/build-cloudflare.sh', 'utf8')

    expect(wrangler).toContain('"run_worker_first": ["/media/*"]')
    expect(buildScript).toContain('asset-guard')
  })

  it('refuses font mocks before any production build command runs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'academy-build-contract-'))
    try {
      const marker = path.join(root, 'called')
      for (const command of ['node', 'npm', 'npx']) {
        writeFileSync(path.join(root, command), '#!/bin/sh\nprintf called >> "$BUILD_CONTRACT_MARKER"\n', { mode: 0o700 })
      }
      const result = spawnSync('/bin/bash', [path.resolve('scripts/build-cloudflare.sh')], {
        cwd: root,
        env: { NODE_ENV: 'production', PATH: `${root}:/usr/bin:/bin`, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: 'synthetic-fixture', BUILD_CONTRACT_MARKER: marker },
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Production build refuses mocked font responses')
      expect(() => readFileSync(marker)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('executes the existing workerd gate before compilation and the final bundle gate afterwards', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'academy-build-contract-'))
    try {
      const marker = path.join(root, 'called')
      for (const command of ['node', 'npm', 'npx']) {
        writeFileSync(path.join(root, command), `#!/bin/sh\nprintf '%s\\n' "${command} $*" >> "$BUILD_CONTRACT_MARKER"\n`, { mode: 0o700 })
      }
      const result = spawnSync('/bin/bash', [path.resolve('scripts/build-cloudflare.sh')], {
        cwd: root,
        env: { NODE_ENV: 'production', PATH: `${root}:/usr/bin:/bin`, BUILD_CONTRACT_MARKER: marker },
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual([
        'npm run verify:workerd',
        'npx opennextjs-cloudflare build',
        'npm run asset-guard',
        'node scripts/check-final-worker-startup.mjs',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})


describe('final asset filesystem guard', () => {
  it.each(['file', 'directory', 'cycle'])('refuses a safe-named %s symlink instead of hiding protected media', (kind) => {
    const root = mkdtempSync(path.join(tmpdir(), 'academy-asset-link-'))
    try {
      const assets = path.join(root, '.open-next/assets')
      mkdirSync(assets, { recursive: true })
      const outside = path.join(root, 'private-media')
      mkdirSync(outside)
      writeFileSync(path.join(outside, 'lesson.pdf'), 'protected fixture')
      const target = kind === 'file' ? path.join(outside, 'lesson.pdf') : kind === 'directory' ? outside : assets
      symlinkSync(target, path.join(assets, 'innocent-name'))
      const result = spawnSync(process.execPath, [path.resolve('scripts/check-open-next-assets.mjs')], { cwd: root, encoding: 'utf8' })
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/symlink/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
