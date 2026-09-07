import React from 'react'
import { headers } from 'next/headers'
import { THEME_BOOTSTRAP_SCRIPT } from '@/components/ThemeToggle'

export async function ThemeBootstrapScript() {
  const nonce = (await headers()).get('x-nonce')

  return React.createElement('script', {
    nonce,
    dangerouslySetInnerHTML: { __html: THEME_BOOTSTRAP_SCRIPT },
  })
}
