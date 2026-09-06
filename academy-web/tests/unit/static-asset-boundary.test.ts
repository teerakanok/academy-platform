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
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(wrangler).toContain('"run_worker_first": ["/media/*"]')
    expect(packageJson.scripts['build:cf']).toContain('asset-guard')
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
