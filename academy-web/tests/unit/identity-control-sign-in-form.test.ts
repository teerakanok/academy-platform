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
const renderedForm = renderToStaticMarkup(createElement(IdentityControlSignInForm, { next: '/courses/example' }))

describe('Identity Control sign-in form boundary', () => {
  it('renders the production CTA as a native server form without client handlers', () => {
    expect(componentSource).not.toMatch(/^\s*['"]use client['"]/m)
    expect(componentSource).not.toMatch(/\bonSubmit=|\bonClick=/)
    expect(renderedForm).toContain('action="/api/auth/identity/start"')
    expect(renderedForm).toContain('method="post"')
    expect(renderedForm).toContain('type="hidden" name="next" value="/courses/example"')
    expect(renderedForm).toContain('type="submit"')
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
