import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'packages/tokens/**',
      'test-results/**',
      'playwright-report/**',
      // runtime scratch ของ supabase CLI + config CommonJS — ไม่ใช่ code ของ app
      'supabase/.temp/**',
      // ผลลัพธ์ของ adapter Cloudflare (bundle ของ Next + vendor) — ไม่ใช่ code ที่เราเขียน
      '.open-next/**',
      '.wrangler/**',
      'tailwind.config.js',
    ],
  },
]

export default eslintConfig
