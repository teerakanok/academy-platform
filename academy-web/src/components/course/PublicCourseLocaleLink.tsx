'use client'

import * as React from 'react'
import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import type { Locale } from '@/lib/content/course-types'

export function PublicCourseLocaleLink({
  slug,
  locale,
  children,
  ...linkProps
}: {
  slug: string
  locale: Locale
  children: ReactNode
} & Omit<ComponentProps<typeof Link>, 'href' | 'children'>) {
  const href = `/courses/${slug}/${locale}`

  return (
    <Link
      {...linkProps}
      href={href}
      onClick={(event) => {
        linkProps.onClick?.(event)
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
        const url = new URL(window.location.href)
        if (!url.search && !url.hash) return
        event.preventDefault()
        window.location.assign(`${href}${url.search}${url.hash}`)
      }}
    >
      {children}
    </Link>
  )
}
