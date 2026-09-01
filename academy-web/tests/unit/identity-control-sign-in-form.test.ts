import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { IdentityControlSignInForm } from '@/components/auth/IdentityControlSignInForm'

const componentPath = join(process.cwd(), 'src/components/auth/IdentityControlSignInForm.tsx')
const legacyFormPath = join(process.cwd(), 'src/components/auth/SignInForm.tsx')
const componentSource = readFileSync(componentPath, 'utf8')
const legacyFormSource = readFileSync(legacyFormPath, 'utf8')
const renderedForm = renderToStaticMarkup(createElement(IdentityControlSignInForm, {
  next: '/courses/example',
  transport: 'navigation',
}))
const renderedLocalForm = renderToStaticMarkup(createElement(IdentityControlSignInForm, {
  next: '/courses/example',
  transport: 'form',
}))

describe('Identity Control sign-in form boundary', () => {
  it('renders the production CTA as a plain server anchor without client behavior', () => {
    expect(componentSource).not.toMatch(/^\s*['"]use client['"]/m)
    expect(componentSource).not.toContain('next/link')
    expect(componentSource).not.toMatch(/\bonSubmit=|\bonClick=|\bjavascript:/i)
    expect(renderedForm).toContain('<a href="/api/auth/identity/start?next=%2Fcourses%2Fexample"')
    expect(renderedForm).toContain('Continue to CYBERSKILLS Account')
    expect(renderedForm).not.toContain('<form')
    expect(renderedForm).not.toContain('method="post"')
    expect(renderedForm).not.toContain('type="hidden"')
  })

  it('renders the local fixture as a native POST form with one next field', () => {
    expect(renderedLocalForm).toContain('action="/api/auth/identity/start"')
    expect(renderedLocalForm).toContain('method="post"')
    expect(renderedLocalForm).toContain('type="hidden" name="next" value="/courses/example"')
    expect(renderedLocalForm).toContain('type="submit"')
    expect(renderedLocalForm).toContain('Continue to CYBERSKILLS Account')
    expect(componentSource).not.toMatch(/\bonSubmit=|\bonClick=|\bjavascript:/i)
  })

  it('preserves the shared CTA styling and accessible text', () => {
    expect(renderedLocalForm).toContain('class="w-full rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent')
    expect(renderedForm).toContain('class="mt-6 block w-full rounded-control bg-cs-accent-fill px-6 py-3 text-center text-sm font-semibold text-cs-on-accent')
    expect(renderedForm).toContain('Continue to CYBERSKILLS Account')
  })

  it('keeps the legacy OTP flow in its existing client component', () => {
    expect(legacyFormSource).toMatch(/^['"]use client['"]/m)
    expect(legacyFormSource).toContain('requestCode')
    expect(legacyFormSource).toContain('verify(')
    expect(legacyFormSource).not.toContain('/api/auth/identity/start')
    expect(legacyFormSource).not.toContain('IdentityControlSignInForm')
  })
})
