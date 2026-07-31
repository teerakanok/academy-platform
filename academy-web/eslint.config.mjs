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
      'tailwind.config.js',
    ],
  },
]

export default eslintConfig
