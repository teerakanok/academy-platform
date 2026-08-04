import type { Metadata } from 'next'
import { UnsubscribeForm } from './UnsubscribeForm'

export const metadata: Metadata = {
  title: 'Email preferences',
  description: 'Manage CyberSkills Academy marketing email preferences.',
  referrer: 'no-referrer',
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; lang?: string | string[] }>
}) {
  const params = await searchParams
  const value = params.token
  const token = typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null
  const requestedLocale = params.lang === 'th' || params.lang === 'en' ? params.lang : null
  return <UnsubscribeForm token={token} requestedLocale={requestedLocale} />
}
